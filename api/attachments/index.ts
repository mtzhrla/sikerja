/**
 * POST /api/attachments — lampiran pekerjaan (unggah versi & pengelolaan).
 *
 * Seluruh unggahan melewati endpoint ini agar:
 *  - token Google & service role TIDAK PERNAH sampai ke frontend;
 *  - hak akses pekerjaan diperiksa server-side (bukan hanya RLS);
 *  - kegagalan database dikompensasi dengan menghapus berkas yang terlanjur
 *    terunggah (versi lama tidak pernah rusak).
 *
 * Aksi (field `action` pada FormData atau JSON):
 *   createGroup | addVersion | softDeleteVersion | restoreVersion
 *   softDeleteGroup | restoreGroup | permanentDeleteGroup
 */
import { canEditTask, getTask } from '../_lib/access.js';
import { getEnv, supabaseConfigured } from '../_lib/env.js';
import { fail, json } from '../_lib/http.js';
import { destroyFile, rollbackFile, setFileTrashed, sha256Hex, storeFile } from '../_lib/storage.js';
import { dbClient, verifyRole, writeAudit, type AccountInfo } from '../_lib/supabase.js';
import type { ServerEnv } from '../_lib/env.js';

/** Batas ukuran unggahan per berkas (batas body Vercel Function ≈ 4,5 MB). */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const BLOCKED_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif', 'sh', 'ps1', 'psm1',
  'js', 'mjs', 'vbs', 'vbe', 'wsf', 'jar', 'apk', 'app', 'dll', 'so', 'dylib',
]);

interface GroupRow {
  id: string;
  task_id: string;
  title: string;
  drive_folder_id: string | null;
  deleted_at: string | null;
}

interface VersionRow {
  id: string;
  group_id: string;
  version: number;
  storage_backend: 'drive' | 'supabase';
  drive_file_id: string | null;
  storage_path: string | null;
  file_name: string;
  deleted_at: string | null;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > -1 ? name.slice(idx + 1).toLowerCase() : '';
}

async function readUpload(
  form: FormData,
): Promise<{ fileName: string; mimeType: string; bytes: ArrayBuffer } | { error: string }> {
  const file = form.get('file');
  if (!(file instanceof File)) return { error: 'Berkas tidak ditemukan pada permintaan.' };
  if (file.size <= 0) return { error: 'Berkas kosong.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `Ukuran berkas melebihi batas ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }
  const fileName = sanitizeFileName(file.name || 'lampiran');
  const ext = extensionOf(fileName);
  if (!ext) return { error: 'Berkas harus memiliki ekstensi.' };
  if (BLOCKED_EXT.has(ext)) return { error: 'Berkas executable tidak diizinkan.' };
  return {
    fileName,
    mimeType: file.type || 'application/octet-stream',
    bytes: await file.arrayBuffer(),
  };
}

async function auditAttachment(
  env: ServerEnv,
  account: AccountInfo,
  action: string,
  taskId: string,
  label: string,
  after?: unknown,
): Promise<void> {
  await writeAudit(env, {
    actorRole: account.role,
    actorAccount: account.accountLabel,
    employeeId: account.employeeId,
    action,
    entityType: 'ATTACHMENT',
    entityId: taskId,
    entityLabel: label,
    after,
  });
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Server belum dikonfigurasi.', 503);

  const account = await verifyRole(env, request);
  if (!account) return fail('Sesi Anda berakhir. Silakan masuk kembali.', 401);
  if (account.role === 'DEMO') return fail('Akun demo hanya dapat melihat data.', 403);

  const contentType = request.headers.get('content-type') ?? '';
  const isMultipart = contentType.includes('multipart/form-data');
  const form = isMultipart ? await request.formData() : null;
  const body = isMultipart
    ? null
    : ((await request.json().catch(() => ({}))) as Record<string, unknown>);

  const field = (name: string): string => {
    const value = form ? form.get(name) : body?.[name];
    return typeof value === 'string' ? value : '';
  };

  const action = field('action');
  const db = dbClient(env);
  const now = new Date().toISOString();

  try {
    switch (action) {
      // -------------------------------------------------- kelompok + versi 1
      case 'createGroup': {
        const taskId = field('taskId');
        const title = field('title').trim().slice(0, 160);
        if (!taskId || !title) return fail('Judul lampiran wajib diisi.', 400);
        const task = await getTask(env, taskId);
        if (!task || task.deleted_at) return fail('Pekerjaan tidak ditemukan.', 404);
        if (!canEditTask(account, task)) {
          return fail('Anda tidak berhak menambah lampiran pada pekerjaan ini.', 403);
        }
        if (!form) return fail('Unggahan harus berupa multipart/form-data.', 400);
        const upload = await readUpload(form);
        if ('error' in upload) return fail(upload.error, 400);

        const stored = await storeFile(env, {
          taskId,
          taskTitle: task.title,
          existingFolderId: task.drive_folder_id,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          bytes: upload.bytes,
        });

        let groupId: string | null = null;
        try {
          const groups = await db.insert<GroupRow>('attachment_groups', {
            task_id: taskId,
            title,
            drive_folder_id: stored.driveFolderId,
            created_by_employee_id: account.employeeId,
          });
          groupId = groups[0]?.id ?? null;
          if (!groupId) throw new Error('Gagal menyimpan kelompok lampiran.');
          await db.insert('attachment_versions', {
            group_id: groupId,
            version: 1,
            file_name: upload.fileName,
            size: upload.bytes.byteLength,
            mime_type: upload.mimeType,
            storage_backend: stored.backend,
            drive_file_id: stored.driveFileId,
            drive_web_view_link: stored.driveWebViewLink,
            storage_path: stored.storagePath,
            checksum: await sha256Hex(upload.bytes),
            change_note: field('changeNote').slice(0, 500),
            uploaded_by_employee_id: account.employeeId,
          });
          if (stored.driveFolderId && !task.drive_folder_id) {
            await db.update('tasks', `id=eq.${taskId}`, {
              drive_folder_id: stored.driveFolderId,
            });
          }
        } catch (err) {
          await rollbackFile(env, stored);
          if (groupId) await db.delete('attachment_groups', `id=eq.${groupId}`).catch(() => undefined);
          throw err;
        }

        await auditAttachment(env, account, 'CREATE', taskId, `Lampiran "${title}" v1`, {
          fileName: upload.fileName,
          backend: stored.backend,
        });
        return json({ ok: true, groupId, backend: stored.backend });
      }

      // ------------------------------------------------------- versi berikut
      case 'addVersion': {
        const groupId = field('groupId');
        if (!groupId) return fail('Kelompok lampiran tidak dipilih.', 400);
        const groups = await db.select<GroupRow>(
          'attachment_groups',
          `select=id,task_id,title,drive_folder_id,deleted_at&id=eq.${groupId}&limit=1`,
        );
        const group = groups[0];
        if (!group || group.deleted_at) return fail('Lampiran tidak ditemukan.', 404);
        const task = await getTask(env, group.task_id);
        if (!task || task.deleted_at) return fail('Pekerjaan tidak ditemukan.', 404);
        if (!canEditTask(account, task)) {
          return fail('Anda tidak berhak mengunggah versi pada pekerjaan ini.', 403);
        }
        if (!form) return fail('Unggahan harus berupa multipart/form-data.', 400);
        const upload = await readUpload(form);
        if ('error' in upload) return fail(upload.error, 400);

        const existing = await db.select<VersionRow>(
          'attachment_versions',
          `select=version&group_id=eq.${groupId}&order=version.desc&limit=1`,
        );
        const nextVersion = (existing[0]?.version ?? 0) + 1;

        const stored = await storeFile(env, {
          taskId: group.task_id,
          taskTitle: task.title,
          existingFolderId: group.drive_folder_id ?? task.drive_folder_id,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          bytes: upload.bytes,
        });

        try {
          await db.insert('attachment_versions', {
            group_id: groupId,
            version: nextVersion,
            file_name: upload.fileName,
            size: upload.bytes.byteLength,
            mime_type: upload.mimeType,
            storage_backend: stored.backend,
            drive_file_id: stored.driveFileId,
            drive_web_view_link: stored.driveWebViewLink,
            storage_path: stored.storagePath,
            checksum: await sha256Hex(upload.bytes),
            change_note: field('changeNote').slice(0, 500),
            uploaded_by_employee_id: account.employeeId,
          });
          await db.update('attachment_groups', `id=eq.${groupId}`, {
            updated_at: now,
            ...(stored.driveFolderId && !group.drive_folder_id
              ? { drive_folder_id: stored.driveFolderId }
              : {}),
          });
        } catch (err) {
          // Versi lama TIDAK tersentuh; hanya berkas baru yang dibatalkan.
          await rollbackFile(env, stored);
          throw err;
        }

        await auditAttachment(
          env,
          account,
          'UPDATE',
          group.task_id,
          `Lampiran "${group.title}" versi ${nextVersion}`,
          { fileName: upload.fileName, version: nextVersion, backend: stored.backend },
        );
        return json({ ok: true, version: nextVersion, backend: stored.backend });
      }

      // -------------------------------------------------- hapus / pulihkan
      case 'softDeleteVersion':
      case 'restoreVersion': {
        const versionId = field('versionId');
        if (!versionId) return fail('Versi tidak dipilih.', 400);
        const versions = await db.select<VersionRow>(
          'attachment_versions',
          `select=*&id=eq.${versionId}&limit=1`,
        );
        const version = versions[0];
        if (!version) return fail('Versi lampiran tidak ditemukan.', 404);
        const groups = await db.select<GroupRow>(
          'attachment_groups',
          `select=id,task_id,title,drive_folder_id,deleted_at&id=eq.${version.group_id}&limit=1`,
        );
        const group = groups[0];
        if (!group) return fail('Lampiran tidak ditemukan.', 404);
        const task = await getTask(env, group.task_id);
        if (!task || !canEditTask(account, task)) {
          return fail('Anda tidak berhak mengubah lampiran pekerjaan ini.', 403);
        }

        const deleting = action === 'softDeleteVersion';
        if (deleting) {
          const active = await db.select<VersionRow>(
            'attachment_versions',
            `select=id&group_id=eq.${group.id}&deleted_at=is.null`,
          );
          if (active.length <= 1 && field('confirmLast') !== 'true') {
            return fail(
              'Ini versi aktif terakhir. Konfirmasi diperlukan untuk menghapusnya.',
              409,
            );
          }
        }

        await setFileTrashed(
          env,
          { backend: version.storage_backend, driveFileId: version.drive_file_id },
          deleting,
        );
        await db.update('attachment_versions', `id=eq.${versionId}`, {
          deleted_at: deleting ? now : null,
          deleted_by_employee_id: deleting ? account.employeeId : null,
        });
        await auditAttachment(
          env,
          account,
          deleting ? 'SOFT_DELETE' : 'RESTORE',
          group.task_id,
          `Lampiran "${group.title}" versi ${version.version}`,
          { fileName: version.file_name },
        );
        return json({ ok: true });
      }

      case 'softDeleteGroup':
      case 'restoreGroup': {
        const groupId = field('groupId');
        if (!groupId) return fail('Lampiran tidak dipilih.', 400);
        const groups = await db.select<GroupRow>(
          'attachment_groups',
          `select=id,task_id,title,drive_folder_id,deleted_at&id=eq.${groupId}&limit=1`,
        );
        const group = groups[0];
        if (!group) return fail('Lampiran tidak ditemukan.', 404);
        const task = await getTask(env, group.task_id);
        if (!task || !canEditTask(account, task)) {
          return fail('Anda tidak berhak mengubah lampiran pekerjaan ini.', 403);
        }
        const deleting = action === 'softDeleteGroup';
        await db.update('attachment_groups', `id=eq.${groupId}`, {
          deleted_at: deleting ? now : null,
          deleted_by_employee_id: deleting ? account.employeeId : null,
          updated_at: now,
        });
        await auditAttachment(
          env,
          account,
          deleting ? 'SOFT_DELETE' : 'RESTORE',
          group.task_id,
          `Lampiran "${group.title}"`,
        );
        return json({ ok: true });
      }

      case 'permanentDeleteGroup': {
        if (account.role !== 'ADMIN') {
          return fail('Hapus permanen hanya dapat dilakukan Admin.', 403);
        }
        const groupId = field('groupId');
        if (!groupId) return fail('Lampiran tidak dipilih.', 400);
        const groups = await db.select<GroupRow>(
          'attachment_groups',
          `select=id,task_id,title,drive_folder_id,deleted_at&id=eq.${groupId}&limit=1`,
        );
        const group = groups[0];
        if (!group) return fail('Lampiran tidak ditemukan.', 404);
        const versions = await db.select<VersionRow>(
          'attachment_versions',
          `select=*&group_id=eq.${groupId}`,
        );
        for (const version of versions) {
          await destroyFile(env, {
            backend: version.storage_backend,
            driveFileId: version.drive_file_id,
            storagePath: version.storage_path,
          });
        }
        await db.delete('attachment_groups', `id=eq.${groupId}`);
        await auditAttachment(
          env,
          account,
          'PERMANENT_DELETE',
          group.task_id,
          `Lampiran "${group.title}" dihapus permanen`,
          { versions: versions.length },
        );
        return json({ ok: true });
      }

      default:
        return fail('Aksi tidak dikenal.', 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Kesalahan tidak diketahui';
    return fail(`Gagal memproses lampiran: ${message.slice(0, 200)}`, 500);
  }
}
