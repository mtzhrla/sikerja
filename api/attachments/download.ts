/**
 * GET /api/attachments/download?versionId=… — proxy unduhan terkontrol.
 *
 * URL berkas asli (Drive/Storage) tidak pernah dibagikan ke klien: berkas
 * dialirkan ulang oleh server setelah hak akses pekerjaan diperiksa.
 * Versi lama tetap dapat diunduh selama belum dihapus permanen.
 */
import { canEditTask, getTask } from '../_lib/access.js';
import { getEnv, supabaseConfigured } from '../_lib/env.js';
import { fail } from '../_lib/http.js';
import { openFileStream } from '../_lib/storage.js';
import { dbClient, verifyRole } from '../_lib/supabase.js';

interface VersionRow {
  id: string;
  group_id: string;
  version: number;
  file_name: string;
  mime_type: string;
  storage_backend: 'drive' | 'supabase';
  drive_file_id: string | null;
  storage_path: string | null;
  deleted_at: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Server belum dikonfigurasi.', 503);

  const account = await verifyRole(env, request);
  if (!account) return fail('Sesi Anda berakhir. Silakan masuk kembali.', 401);

  const versionId = new URL(request.url).searchParams.get('versionId') ?? '';
  if (!versionId) return fail('Versi lampiran tidak dipilih.', 400);

  const db = dbClient(env);
  const versions = await db.select<VersionRow>(
    'attachment_versions',
    `select=*&id=eq.${versionId}&limit=1`,
  );
  const version = versions[0];
  if (!version) return fail('Versi lampiran tidak ditemukan.', 404);

  const groups = await db.select<{ task_id: string; deleted_at: string | null }>(
    'attachment_groups',
    `select=task_id,deleted_at&id=eq.${version.group_id}&limit=1`,
  );
  const group = groups[0];
  if (!group) return fail('Lampiran tidak ditemukan.', 404);

  const task = await getTask(env, group.task_id);
  if (!task) return fail('Pekerjaan tidak ditemukan.', 404);

  // Berkas yang sudah dihapus hanya dapat diunduh oleh pihak berizin (audit).
  if ((version.deleted_at || group.deleted_at) && !canEditTask(account, task)) {
    return fail('Lampiran tidak tersedia.', 404);
  }

  const upstream = await openFileStream(env, {
    backend: version.storage_backend,
    driveFileId: version.drive_file_id,
    storagePath: version.storage_path,
  });
  if (!upstream || !upstream.ok) {
    return fail('Berkas tidak dapat diambil dari penyimpanan.', 502);
  }

  const fileName = version.file_name.replace(/["\\]/g, '');
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': version.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
