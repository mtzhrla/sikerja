/**
 * Penyimpanan berkas lampiran (server-only).
 *
 * Backend UTAMA: Google Drive akun aplikasi (scope drive.file).
 * Backend CADANGAN: Supabase Storage bucket `lampiran` — dipakai selama akun
 * Google belum terhubung, agar fitur lampiran tetap berjalan. Backend dicatat
 * per versi sehingga keduanya dapat hidup berdampingan tanpa migrasi paksa.
 */
import type { ServerEnv } from './env.js';
import {
  deleteDriveFile,
  downloadDriveFile,
  ensureTaskFolder,
  getDriveAccessToken,
  setDriveTrashed,
  uploadDriveFile,
} from './google.js';

export type StorageBackend = 'drive' | 'supabase';

export interface StoredFile {
  backend: StorageBackend;
  driveFileId: string | null;
  driveWebViewLink: string | null;
  storagePath: string | null;
  /** Folder Drive pekerjaan (bila backend drive) untuk disimpan di tasks. */
  driveFolderId: string | null;
}

const BUCKET = 'lampiran';

/** SHA-256 heksadesimal — dipakai sebagai checksum integritas versi. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function uploadToSupabase(
  env: ServerEnv,
  path: string,
  mimeType: string,
  bytes: ArrayBuffer,
): Promise<void> {
  const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: env.serviceRoleKey,
      Authorization: `Bearer ${env.serviceRoleKey}`,
      'Content-Type': mimeType || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`Unggah berkas gagal (${res.status}).`);
  }
}

async function removeFromSupabase(env: ServerEnv, path: string): Promise<void> {
  await fetch(`${env.supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` },
  }).catch(() => undefined);
}

/**
 * Simpan berkas. Mengembalikan lokasi berkas beserta backend yang dipakai.
 * Bila Drive tersedia, berkas disimpan di folder pekerjaan pada Drive aplikasi.
 */
export async function storeFile(
  env: ServerEnv,
  input: {
    taskId: string;
    taskTitle: string;
    existingFolderId: string | null;
    fileName: string;
    mimeType: string;
    bytes: ArrayBuffer;
  },
): Promise<StoredFile> {
  const driveToken = await getDriveAccessToken(env);
  if (driveToken) {
    const folderId =
      input.existingFolderId ??
      (await ensureTaskFolder(driveToken, input.taskId, input.taskTitle));
    const uploaded = await uploadDriveFile(
      driveToken,
      folderId,
      input.fileName,
      input.mimeType,
      input.bytes,
    );
    return {
      backend: 'drive',
      driveFileId: uploaded.id,
      driveWebViewLink: uploaded.webViewLink,
      storagePath: null,
      driveFolderId: folderId,
    };
  }

  const path = `${input.taskId}/${crypto.randomUUID()}-${input.fileName}`;
  await uploadToSupabase(env, path, input.mimeType, input.bytes);
  return {
    backend: 'supabase',
    driveFileId: null,
    driveWebViewLink: null,
    storagePath: path,
    driveFolderId: null,
  };
}

/** Kompensasi bila transaksi database gagal setelah berkas terunggah. */
export async function rollbackFile(env: ServerEnv, file: StoredFile): Promise<void> {
  try {
    if (file.backend === 'drive' && file.driveFileId) {
      const token = await getDriveAccessToken(env);
      if (token) await deleteDriveFile(token, file.driveFileId);
    } else if (file.storagePath) {
      await removeFromSupabase(env, file.storagePath);
    }
  } catch {
    // Kompensasi bersifat best-effort; kegagalan tidak boleh menutupi error asli.
  }
}

/** Tandai berkas terhapus/dipulihkan pada penyimpanan (Drive: Trash). */
export async function setFileTrashed(
  env: ServerEnv,
  file: { backend: StorageBackend; driveFileId: string | null },
  trashed: boolean,
): Promise<void> {
  if (file.backend !== 'drive' || !file.driveFileId) return;
  const token = await getDriveAccessToken(env);
  if (!token) return;
  await setDriveTrashed(token, file.driveFileId, trashed);
}

/** Hapus permanen berkas dari penyimpanan (khusus Admin). */
export async function destroyFile(
  env: ServerEnv,
  file: { backend: StorageBackend; driveFileId: string | null; storagePath: string | null },
): Promise<void> {
  if (file.backend === 'drive' && file.driveFileId) {
    const token = await getDriveAccessToken(env);
    if (token) await deleteDriveFile(token, file.driveFileId);
    return;
  }
  if (file.storagePath) await removeFromSupabase(env, file.storagePath);
}

/** Aliran unduhan terkontrol (proxy) — URL berkas asli tidak pernah dibagikan. */
export async function openFileStream(
  env: ServerEnv,
  file: { backend: StorageBackend; driveFileId: string | null; storagePath: string | null },
): Promise<Response | null> {
  if (file.backend === 'drive' && file.driveFileId) {
    const token = await getDriveAccessToken(env);
    if (!token) return null;
    return downloadDriveFile(token, file.driveFileId);
  }
  if (!file.storagePath) return null;
  return fetch(`${env.supabaseUrl}/storage/v1/object/${BUCKET}/${file.storagePath}`, {
    headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` },
  });
}
