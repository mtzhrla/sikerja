/**
 * GET /api/integrations/google/start (Admin, Bearer token Supabase)
 * Mengembalikan URL consent Google (access_type=offline&prompt=consent).
 * Admin cukup menghubungkan satu akun sekali; akun itu dipakai membaca
 * seluruh spreadsheet (scope spreadsheets.readonly + email akun).
 */
import { hmacSha256Hex } from '../../_lib/crypto.js';
import { getEnv, googleConfigured, supabaseConfigured } from '../../_lib/env.js';
import { fail, json } from '../../_lib/http.js';
import { requireAdmin } from '../../_lib/supabase.js';
import { DRIVE_SCOPE, SHEETS_SCOPE } from '../../_lib/google.js';

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Supabase belum dikonfigurasi di server.', 503);
  if (!googleConfigured(env)) return fail('Integrasi Google belum dikonfigurasi.', 503);
  if (!(await requireAdmin(env, request))) {
    return fail('Hanya Admin yang dapat menghubungkan Google.', 403);
  }

  // State anti-CSRF: nonce + timestamp, ditandatangani HMAC kunci server.
  const nonce = crypto.randomUUID();
  const ts = Date.now().toString();
  const sig = await hmacSha256Hex(`${nonce}.${ts}`, env.tokenEncryptionKey);
  const state = `${nonce}.${ts}.${sig}`;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.googleClientId);
  url.searchParams.set('redirect_uri', env.googleRedirectUri);
  url.searchParams.set('response_type', 'code');
  // Scope paling sempit yang dibutuhkan: baca spreadsheet + berkas yang DIBUAT
  // aplikasi ini di Drive (drive.file, bukan akses penuh Drive).
  url.searchParams.set('scope', `${SHEETS_SCOPE} ${DRIVE_SCOPE} openid email`);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return json({ url: url.toString() });
}
