/**
 * Klien Google OAuth + Sheets API (server-only, scope read-only).
 * Refresh token disimpan TERENKRIPSI di google_oauth_tokens dan tidak pernah
 * meninggalkan server.
 */
import { decryptSecret, encryptSecret } from './crypto.js';
import { serviceAccountConfigured, sheetsAccessMode, type ServerEnv } from './env.js';
import { dbClient } from './supabase.js';

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface TokenRow {
  id: number;
  refresh_token_ciphertext: string | null;
  access_token_ciphertext: string | null;
  access_token_expires_at: string | null;
  scope: string | null;
}

export class GoogleNotConnectedError extends Error {
  constructor() {
    super('Integrasi Google belum dikonfigurasi atau akun belum terhubung.');
  }
}

/** Tukar authorization code menjadi token (dipanggil callback OAuth). */
export async function exchangeCode(
  env: ServerEnv,
  code: string,
): Promise<{ refreshToken: string | null; accessToken: string; expiresIn: number; scope: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Pertukaran token Google gagal (${res.status}).`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    refreshToken: data.refresh_token ?? null,
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
}

/** Info akun (email) dari access token. */
export async function fetchUserInfo(accessToken: string): Promise<{ email: string | null }> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { email: null };
  const data = (await res.json()) as { email?: string };
  return { email: data.email ?? null };
}

/** Simpan token (refresh + access) terenkripsi. */
export async function storeTokens(
  env: ServerEnv,
  tokens: { refreshToken: string | null; accessToken: string; expiresIn: number; scope: string },
): Promise<void> {
  const db = dbClient(env);
  const patch: Record<string, unknown> = {
    access_token_ciphertext: await encryptSecret(tokens.accessToken, env.tokenEncryptionKey),
    access_token_expires_at: new Date(Date.now() + (tokens.expiresIn - 60) * 1000).toISOString(),
    scope: tokens.scope,
  };
  if (tokens.refreshToken) {
    patch.refresh_token_ciphertext = await encryptSecret(
      tokens.refreshToken,
      env.tokenEncryptionKey,
    );
  }
  await db.update('google_oauth_tokens', 'id=eq.1', patch);
}

/**
 * Access token untuk membaca Sheets — memilih mode akses efektif (§1):
 * Service Account (utama) atau OAuth (alternatif). Tidak pernah membocorkan
 * credential; hanya mengembalikan bearer token berumur pendek.
 */
export async function getAccessToken(env: ServerEnv): Promise<string> {
  const mode = sheetsAccessMode(env);
  if (mode === 'service_account') return getServiceAccountAccessToken(env);
  if (mode === 'oauth') return getOAuthAccessToken(env);
  throw new GoogleNotConnectedError();
}

/** Access token OAuth valid — pakai cache atau refresh dengan refresh token. */
async function getOAuthAccessToken(env: ServerEnv): Promise<string> {
  const db = dbClient(env);
  const rows = await db.select<TokenRow>('google_oauth_tokens', 'select=*&id=eq.1');
  const row = rows[0];
  if (!row?.refresh_token_ciphertext) throw new GoogleNotConnectedError();

  if (
    row.access_token_ciphertext &&
    row.access_token_expires_at &&
    Date.parse(row.access_token_expires_at) > Date.now()
  ) {
    return decryptSecret(row.access_token_ciphertext, env.tokenEncryptionKey);
  }

  const refreshToken = await decryptSecret(row.refresh_token_ciphertext, env.tokenEncryptionKey);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    // Token dicabut/kedaluwarsa — tandai status agar Admin menghubungkan ulang.
    await db.update('google_oauth_connections', 'id=eq.1', { token_status: 'KEDALUWARSA' });
    throw new GoogleNotConnectedError();
  }
  const data = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  await storeTokens(env, {
    refreshToken: null,
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    scope: data.scope ?? SHEETS_SCOPE,
  });
  await db.update('google_oauth_connections', 'id=eq.1', {
    token_status: 'AKTIF',
    last_used_at: new Date().toISOString(),
  });
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Service Account (JWT bearer, read-only) — mode akses utama (§1, §5).
// Private key TIDAK PERNAH dikirim ke frontend, dicatat ke log, atau disimpan
// di database; hanya dipakai menandatangani JWT di server.
// ---------------------------------------------------------------------------

/** Cache token per-proses (warm instance) agar tidak minting JWT tiap panggilan. */
let saTokenCache: { token: string; expiresAt: number } | null = null;

function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(str: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(str));
}

/** PEM PKCS#8 → CryptoKey RSASSA-PKCS1-v1_5 (RS256) untuk menandatangani JWT. */
async function importServiceAccountKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) der[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/** Access token Service Account (scope read-only) — dari cache atau JWT baru. */
async function getServiceAccountAccessToken(env: ServerEnv): Promise<string> {
  if (!serviceAccountConfigured(env)) throw new GoogleNotConnectedError();
  if (saTokenCache && saTokenCache.expiresAt > Date.now()) return saTokenCache.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlFromString(
    JSON.stringify({
      iss: env.serviceAccountEmail,
      scope: SHEETS_SCOPE,
      aud: GOOGLE_TOKEN_ENDPOINT,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  let key: CryptoKey;
  try {
    key = await importServiceAccountKey(env.serviceAccountPrivateKey);
  } catch {
    // Format private key tidak sah — jangan bocorkan isinya ke pesan/log.
    throw new Error('Private key Service Account tidak valid.');
  }
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  const assertion = `${signingInput}.${base64UrlFromBytes(signature)}`;

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    // Pesan Google bisa memuat detail — jangan diteruskan mentah ke pengguna.
    throw new Error(`Otorisasi Service Account gagal (${res.status}).`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  saTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

/** Putuskan koneksi: revoke di Google (best-effort) + hapus token tersimpan. */
export async function disconnectGoogle(env: ServerEnv): Promise<void> {
  const db = dbClient(env);
  const rows = await db.select<TokenRow>('google_oauth_tokens', 'select=*&id=eq.1');
  const row = rows[0];
  if (row?.refresh_token_ciphertext) {
    try {
      const refreshToken = await decryptSecret(
        row.refresh_token_ciphertext,
        env.tokenEncryptionKey,
      );
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
    } catch {
      // best-effort — token tetap dihapus dari penyimpanan
    }
  }
  await db.update('google_oauth_tokens', 'id=eq.1', {
    refresh_token_ciphertext: null,
    access_token_ciphertext: null,
    access_token_expires_at: null,
    scope: null,
  });
  await db.update('google_oauth_connections', 'id=eq.1', {
    email: null,
    connected_at: null,
    token_status: 'DICABUT',
  });
}

// ---------------------------------------------------------------------------
// Google Sheets API (read-only)
// ---------------------------------------------------------------------------

export interface SheetMeta {
  title: string;
}

export async function fetchSpreadsheetMeta(
  accessToken: string,
  spreadsheetId: string,
): Promise<{ title: string; sheets: SheetMeta[] }> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(
      res.status === 403 || res.status === 404
        ? 'Spreadsheet tidak dapat diakses. Pastikan file dibagikan ke email koneksi (akses Viewer).'
        : `Google Sheets API gagal (${res.status}).`,
    );
  }
  const data = (await res.json()) as {
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  return {
    title: data.properties?.title ?? '',
    sheets: (data.sheets ?? []).map((s) => ({ title: s.properties?.title ?? '' })),
  };
}

/** Ambil nilai sheet (formatted string) — merge cell/formula sudah dievaluasi Google. */
export async function fetchSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Gagal membaca range "${range}" (${res.status}).`);
  const data = (await res.json()) as { values?: unknown[][] };
  return (data.values ?? []).map((row) => row.map((cell) => String(cell ?? '')));
}

// ---------------------------------------------------------------------------
// Google Drive (lampiran pekerjaan) — scope PALING SEMPIT: drive.file.
// drive.file hanya memberi akses ke berkas/folder yang DIBUAT aplikasi ini,
// bukan seluruh Drive pengguna.
// ---------------------------------------------------------------------------

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Nama folder akar aplikasi di Drive. */
export const DRIVE_ROOT_FOLDER = 'Dashboard Pekerjaan PIP';
export const DRIVE_ATTACHMENT_FOLDER = 'Lampiran Pekerjaan';

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Drive memakai OAuth akun aplikasi (bukan Service Account) karena Service
 * Account tidak memiliki kuota penyimpanan Drive pribadi.
 * Mengembalikan null bila akun Google belum terhubung / belum memberi izin Drive.
 */
export async function getDriveAccessToken(env: ServerEnv): Promise<string | null> {
  const db = dbClient(env);
  const rows = await db.select<TokenRow>('google_oauth_tokens', 'select=*&id=eq.1');
  const row = rows[0];
  if (!row?.refresh_token_ciphertext) return null;
  if (!(row.scope ?? '').includes(DRIVE_SCOPE)) return null;
  try {
    return await getOAuthAccessToken(env);
  } catch {
    return null;
  }
}

/** Apakah lampiran dapat disimpan ke Google Drive saat ini? */
export async function driveAvailable(env: ServerEnv): Promise<boolean> {
  return (await getDriveAccessToken(env)) !== null;
}

async function driveRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`Google Drive API gagal (${res.status}).`);
  }
  return (await res.json()) as T;
}

/** Cari folder milik aplikasi berdasarkan nama; buat bila belum ada. */
export async function ensureDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string,
): Promise<string> {
  // Kutip tunggal harus di-escape pada query Drive (files.list `q`).
  const safeName = name.split("'").join("\\'");
  const query = [
    `mimeType='${DRIVE_FOLDER_MIME}'`,
    `name='${safeName}'`,
    'trashed=false',
    parentId ? `'${parentId}' in parents` : null,
  ]
    .filter(Boolean)
    .join(' and ');
  const found = await driveRequest<{ files?: { id: string }[] }>(
    accessToken,
    `files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`,
  );
  const existing = found.files?.[0]?.id;
  if (existing) return existing;

  const created = await driveRequest<{ id: string }>(accessToken, 'files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: DRIVE_FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return created.id;
}

/** Folder lampiran sebuah pekerjaan: "[ID Tugas] - [Judul Singkat]". */
export async function ensureTaskFolder(
  accessToken: string,
  taskId: string,
  taskTitle: string,
): Promise<string> {
  const root = await ensureDriveFolder(accessToken, DRIVE_ROOT_FOLDER);
  const parent = await ensureDriveFolder(accessToken, DRIVE_ATTACHMENT_FOLDER, root);
  const shortTitle = taskTitle.trim().slice(0, 60) || 'Pekerjaan';
  return ensureDriveFolder(accessToken, `${taskId.slice(0, 8)} - ${shortTitle}`, parent);
}

export interface DriveUploadResult {
  id: string;
  webViewLink: string | null;
}

/** Unggah satu berkas (multipart) ke folder Drive tertentu. */
export async function uploadDriveFile(
  accessToken: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  bytes: ArrayBuffer,
): Promise<DriveUploadResult> {
  const boundary = `pip${crypto.randomUUID().replace(/-/g, '')}`;
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.byteLength + tail.length);
  body.set(head, 0);
  body.set(new Uint8Array(bytes), head.length);
  body.set(tail, head.length + bytes.byteLength);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Unggah ke Google Drive gagal (${res.status}).`);
  const data = (await res.json()) as { id: string; webViewLink?: string };
  return { id: data.id, webViewLink: data.webViewLink ?? null };
}

/** Unduh isi berkas Drive (dipakai proxy unduhan terkontrol). */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Pindahkan ke Trash Drive (soft delete) atau pulihkan. */
export async function setDriveTrashed(
  accessToken: string,
  fileId: string,
  trashed: boolean,
): Promise<void> {
  await driveRequest(accessToken, `files/${fileId}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed }),
  });
}

/** Hapus permanen dari Drive (khusus Admin). */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Hapus berkas Drive gagal (${res.status}).`);
  }
}
