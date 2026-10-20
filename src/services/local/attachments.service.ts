import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { fileExtension, sanitizeFileName, uid } from '@/lib/utils';
import { NotFoundError, StorageError, ValidationError } from '@/services/errors';
import type {
  Attachment,
  AttachmentGroup,
  AttachmentService,
  AttachmentVersion,
} from '@/services/types';
import { localBus } from './bus';
import { COL, db, ensureSeeded, nowISO, writeAudit } from './db';
import {
  pushNotifications,
  requireActor,
  requireAdmin,
  requireSession,
  requireTaskEdit,
} from './guard-util';

/** Ekstensi executable yang selalu ditolak. */
const BLOCKED_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif', 'sh', 'ps1', 'psm1',
  'js', 'mjs', 'vbs', 'vbe', 'wsf', 'jar', 'apk', 'app', 'dll', 'so', 'dylib',
]);

const idbKey = (id: string) => `att-blob:${id}`;

function auditBase(employeeId: string) {
  const session = requireSession();
  return {
    actorRole: session.role,
    actorAccount: session.account,
    employeeId,
    sessionId: session.id,
    deviceLabel: session.deviceLabel,
  } as const;
}

/** Validasi berkas bersama (tipe & ukuran) untuk lampiran lama & versi baru. */
function assertUploadable(file: File): string {
  const settings = db.settings();
  const maxBytes = (settings?.attachmentMaxMB ?? 10) * 1024 * 1024;
  const allowed = settings?.attachmentAllowedExt ?? [];
  const name = sanitizeFileName(file.name);
  const ext = fileExtension(name);
  if (BLOCKED_EXT.has(ext)) throw new ValidationError('Berkas executable tidak diizinkan.');
  if (!ext || !allowed.includes(ext)) {
    throw new ValidationError(
      `Tipe berkas .${ext || '?'} tidak diizinkan. Tipe yang diperbolehkan: ${allowed.map((e) => `.${e}`).join(', ')}.`,
    );
  }
  if (file.size <= 0) throw new ValidationError('Berkas kosong tidak dapat diunggah.');
  if (file.size > maxBytes) {
    throw new ValidationError(`Ukuran berkas melebihi batas ${settings?.attachmentMaxMB ?? 10} MB.`);
  }
  return name;
}

function saveGroups(groups: AttachmentGroup[], taskId: string): void {
  db.write(COL.attachmentGroups, groups);
  localBus.emit({ topic: 'attachments', entityId: taskId });
}

function findGroup(groupId: string): AttachmentGroup {
  const group = db.attachmentGroups().find((g) => g.id === groupId);
  if (!group) throw new NotFoundError('Lampiran tidak ditemukan.');
  return group;
}

export const localAttachments: AttachmentService = {
  async list(taskId): Promise<Attachment[]> {
    await ensureSeeded();
    requireSession();
    return db
      .attachments()
      .filter((a) => a.taskId === taskId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  },

  async upload(taskId, file, ctx): Promise<Attachment> {
    await ensureSeeded();
    requireSession();
    const employeeId = requireActor(ctx);
    const task = db.tasks().find((t) => t.id === taskId);
    if (!task) throw new NotFoundError('Pekerjaan tidak ditemukan.');

    const settings = db.settings();
    const maxBytes = (settings?.attachmentMaxMB ?? 10) * 1024 * 1024;
    const allowed = settings?.attachmentAllowedExt ?? [];
    const name = sanitizeFileName(file.name);
    const ext = fileExtension(name);

    if (BLOCKED_EXT.has(ext)) {
      throw new ValidationError('Berkas executable tidak diizinkan.');
    }
    if (!ext || !allowed.includes(ext)) {
      throw new ValidationError(
        `Tipe berkas .${ext || '?'} tidak diizinkan. Tipe yang diperbolehkan: ${allowed.map((e) => `.${e}`).join(', ')}.`,
      );
    }
    if (file.size <= 0) throw new ValidationError('Berkas kosong tidak dapat diunggah.');
    if (file.size > maxBytes) {
      throw new ValidationError(
        `Ukuran berkas melebihi batas ${settings?.attachmentMaxMB ?? 10} MB.`,
      );
    }

    const attachment: Attachment = {
      id: uid('att'),
      taskId,
      fileName: name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      uploadedByEmployeeId: employeeId,
      createdAt: nowISO(),
    };
    try {
      await idbSet(idbKey(attachment.id), file);
    } catch {
      throw new StorageError('Gagal menyimpan berkas di penyimpanan lokal.');
    }
    db.write(COL.attachments, [...db.attachments(), attachment]);
    localBus.emit({ topic: 'attachments', entityId: taskId });
    writeAudit({
      ...auditBase(employeeId),
      action: 'CREATE',
      entityType: 'ATTACHMENT',
      entityId: taskId,
      entityLabel: `Lampiran "${name}" pada "${task.title}"`,
      after: { fileName: name, size: file.size, mimeType: attachment.mimeType },
    });
    return attachment;
  },

  async getDownloadUrl(id): Promise<string> {
    await ensureSeeded();
    requireSession();
    const meta = db.attachments().find((a) => a.id === id);
    if (!meta) throw new NotFoundError('Lampiran tidak ditemukan.');
    const blob = await idbGet<Blob>(idbKey(id));
    if (!blob) throw new NotFoundError('Berkas lampiran tidak ditemukan di perangkat ini.');
    return URL.createObjectURL(blob);
  },

  async remove(id, ctx): Promise<void> {
    await ensureSeeded();
    requireSession();
    const employeeId = requireActor(ctx);
    const meta = db.attachments().find((a) => a.id === id);
    if (!meta) return;
    await idbDel(idbKey(id)).catch(() => undefined);
    db.write(
      COL.attachments,
      db.attachments().filter((a) => a.id !== id),
    );
    localBus.emit({ topic: 'attachments', entityId: meta.taskId });
    writeAudit({
      ...auditBase(employeeId),
      action: 'PERMANENT_DELETE',
      entityType: 'ATTACHMENT',
      entityId: meta.taskId,
      entityLabel: `Lampiran "${meta.fileName}" dihapus`,
      before: { fileName: meta.fileName },
    });
  },

  // ---- Kelompok lampiran + riwayat versi (paritas dengan mode produksi) ----

  async listGroups(taskId, opts): Promise<AttachmentGroup[]> {
    await ensureSeeded();
    requireSession();
    return db
      .attachmentGroups()
      .filter((g) => g.taskId === taskId)
      .filter((g) => (opts?.includeDeleted ? true : !g.deletedAt))
      .map((g) => ({
        ...g,
        versions: [...g.versions]
          .filter((v) => (opts?.includeDeleted ? true : !v.deletedAt))
          .sort((a, b) => b.version - a.version),
      }))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  },

  async countsByTask(): Promise<Record<string, number>> {
    await ensureSeeded();
    requireSession();
    const counts: Record<string, number> = {};
    for (const group of db.attachmentGroups()) {
      if (group.deletedAt) continue;
      counts[group.taskId] = (counts[group.taskId] ?? 0) + 1;
    }
    return counts;
  },

  async createGroup(taskId, input, ctx): Promise<AttachmentGroup> {
    await ensureSeeded();
    const task = requireTaskEdit(taskId);
    const employeeId = requireActor(ctx);
    const title = input.title.trim();
    if (!title) throw new ValidationError('Judul lampiran wajib diisi.');
    const fileName = assertUploadable(input.file);

    const groupId = uid('grp');
    const version: AttachmentVersion = {
      id: uid('ver'),
      groupId,
      version: 1,
      fileName,
      size: input.file.size,
      mimeType: input.file.type || 'application/octet-stream',
      storageBackend: 'supabase',
      driveFileId: null,
      driveWebViewLink: null,
      checksum: null,
      changeNote: input.changeNote ?? '',
      uploadedByEmployeeId: employeeId,
      createdAt: nowISO(),
      deletedAt: null,
      deletedByEmployeeId: null,
    };
    const group: AttachmentGroup = {
      id: groupId,
      taskId,
      title,
      driveFolderId: null,
      createdByEmployeeId: employeeId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      deletedAt: null,
      deletedByEmployeeId: null,
      versions: [version],
    };

    try {
      await idbSet(idbKey(version.id), input.file);
    } catch {
      throw new StorageError('Gagal menyimpan berkas di penyimpanan lokal.');
    }
    saveGroups([...db.attachmentGroups(), group], taskId);
    pushNotifications({
      recipients: [
        task.ownerEmployeeId,
        task.createdByEmployeeId,
        ...task.picMainIds,
        ...task.picIds,
      ],
      type: 'ATTACHMENT_ADDED',
      title: 'Lampiran baru diunggah',
      body: task.title,
      taskId,
      actorEmployeeId: employeeId,
      metadata: { group: title, version: 1, fileName },
    });
    writeAudit({
      ...auditBase(employeeId),
      action: 'CREATE',
      entityType: 'ATTACHMENT',
      entityId: taskId,
      entityLabel: `Lampiran "${title}" v1`,
      after: { fileName, size: input.file.size },
    });
    return group;
  },

  async addVersion(groupId, input, ctx): Promise<AttachmentGroup> {
    await ensureSeeded();
    const group = findGroup(groupId);
    const task = requireTaskEdit(group.taskId);
    const employeeId = requireActor(ctx);
    const fileName = assertUploadable(input.file);
    const nextVersion = Math.max(0, ...group.versions.map((v) => v.version)) + 1;

    const version: AttachmentVersion = {
      id: uid('ver'),
      groupId,
      version: nextVersion,
      fileName,
      size: input.file.size,
      mimeType: input.file.type || 'application/octet-stream',
      storageBackend: 'supabase',
      driveFileId: null,
      driveWebViewLink: null,
      checksum: null,
      changeNote: input.changeNote ?? '',
      uploadedByEmployeeId: employeeId,
      createdAt: nowISO(),
      deletedAt: null,
      deletedByEmployeeId: null,
    };
    try {
      await idbSet(idbKey(version.id), input.file);
    } catch {
      // Kegagalan penyimpanan TIDAK boleh merusak versi lama.
      throw new StorageError('Gagal menyimpan berkas di penyimpanan lokal.');
    }
    const updated: AttachmentGroup = {
      ...group,
      updatedAt: nowISO(),
      versions: [version, ...group.versions],
    };
    saveGroups(
      db.attachmentGroups().map((g) => (g.id === groupId ? updated : g)),
      group.taskId,
    );
    pushNotifications({
      recipients: [
        task.ownerEmployeeId,
        task.createdByEmployeeId,
        ...task.picMainIds,
        ...task.picIds,
      ],
      type: 'ATTACHMENT_VERSION',
      title: 'Versi baru lampiran diunggah',
      body: task.title,
      taskId: group.taskId,
      actorEmployeeId: employeeId,
      metadata: { group: group.title, version: nextVersion, fileName },
    });
    writeAudit({
      ...auditBase(employeeId),
      action: 'UPDATE',
      entityType: 'ATTACHMENT',
      entityId: group.taskId,
      entityLabel: `Lampiran "${group.title}" versi ${nextVersion}`,
      after: { fileName, version: nextVersion },
    });
    return updated;
  },

  async versionDownloadUrl(versionId): Promise<string> {
    await ensureSeeded();
    requireSession();
    const blob = await idbGet<Blob>(idbKey(versionId));
    if (!blob) throw new NotFoundError('Berkas versi ini tidak ditemukan di perangkat ini.');
    return URL.createObjectURL(blob);
  },

  async softDeleteVersion(versionId, ctx): Promise<void> {
    await ensureSeeded();
    const groups = db.attachmentGroups();
    const group = groups.find((g) => g.versions.some((v) => v.id === versionId));
    if (!group) throw new NotFoundError('Versi lampiran tidak ditemukan.');
    requireTaskEdit(group.taskId);
    const employeeId = requireActor(ctx);
    const version = group.versions.find((v) => v.id === versionId);
    if (!version) throw new NotFoundError('Versi lampiran tidak ditemukan.');
    const updated: AttachmentGroup = {
      ...group,
      updatedAt: nowISO(),
      versions: group.versions.map((v) =>
        v.id === versionId ? { ...v, deletedAt: nowISO(), deletedByEmployeeId: employeeId } : v,
      ),
    };
    saveGroups(
      groups.map((g) => (g.id === group.id ? updated : g)),
      group.taskId,
    );
    writeAudit({
      ...auditBase(employeeId),
      action: 'SOFT_DELETE',
      entityType: 'ATTACHMENT',
      entityId: group.taskId,
      entityLabel: `Lampiran "${group.title}" versi ${version.version}`,
      before: { fileName: version.fileName },
    });
  },

  async restoreVersion(versionId, ctx): Promise<void> {
    await ensureSeeded();
    const groups = db.attachmentGroups();
    const group = groups.find((g) => g.versions.some((v) => v.id === versionId));
    if (!group) throw new NotFoundError('Versi lampiran tidak ditemukan.');
    requireTaskEdit(group.taskId);
    const employeeId = requireActor(ctx);
    const updated: AttachmentGroup = {
      ...group,
      updatedAt: nowISO(),
      versions: group.versions.map((v) =>
        v.id === versionId ? { ...v, deletedAt: null, deletedByEmployeeId: null } : v,
      ),
    };
    saveGroups(
      groups.map((g) => (g.id === group.id ? updated : g)),
      group.taskId,
    );
    writeAudit({
      ...auditBase(employeeId),
      action: 'RESTORE',
      entityType: 'ATTACHMENT',
      entityId: group.taskId,
      entityLabel: `Lampiran "${group.title}" dipulihkan`,
    });
  },

  async softDeleteGroup(groupId, ctx): Promise<void> {
    await ensureSeeded();
    const group = findGroup(groupId);
    requireTaskEdit(group.taskId);
    const employeeId = requireActor(ctx);
    saveGroups(
      db
        .attachmentGroups()
        .map((g) =>
          g.id === groupId
            ? { ...g, deletedAt: nowISO(), deletedByEmployeeId: employeeId, updatedAt: nowISO() }
            : g,
        ),
      group.taskId,
    );
    writeAudit({
      ...auditBase(employeeId),
      action: 'SOFT_DELETE',
      entityType: 'ATTACHMENT',
      entityId: group.taskId,
      entityLabel: `Lampiran "${group.title}"`,
    });
  },

  async restoreGroup(groupId, ctx): Promise<void> {
    await ensureSeeded();
    const group = findGroup(groupId);
    requireTaskEdit(group.taskId);
    const employeeId = requireActor(ctx);
    saveGroups(
      db
        .attachmentGroups()
        .map((g) =>
          g.id === groupId
            ? { ...g, deletedAt: null, deletedByEmployeeId: null, updatedAt: nowISO() }
            : g,
        ),
      group.taskId,
    );
    writeAudit({
      ...auditBase(employeeId),
      action: 'RESTORE',
      entityType: 'ATTACHMENT',
      entityId: group.taskId,
      entityLabel: `Lampiran "${group.title}" dipulihkan`,
    });
  },

  async permanentDeleteGroup(groupId, ctx): Promise<void> {
    await ensureSeeded();
    requireAdmin();
    const group = findGroup(groupId);
    const employeeId = requireActor(ctx);
    for (const version of group.versions) {
      await idbDel(idbKey(version.id)).catch(() => undefined);
    }
    saveGroups(
      db.attachmentGroups().filter((g) => g.id !== groupId),
      group.taskId,
    );
    writeAudit({
      ...auditBase(employeeId),
      action: 'PERMANENT_DELETE',
      entityType: 'ATTACHMENT',
      entityId: group.taskId,
      entityLabel: `Lampiran "${group.title}" dihapus permanen`,
      before: { versions: group.versions.length },
    });
  },
};
