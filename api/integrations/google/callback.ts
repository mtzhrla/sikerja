/**
 * GET /api/integrations/google/callback — redirect balik dari Google.
 * Memvalidasi state, menukar code menjadi token, menyimpan refresh token
 * TERENKRIPSI (server-only), lalu kembali ke halaman Admin Integrasi.
 * Tidak pernah menampilkan stack trace atau nilai token.
 */
import { hmacSha256Hex, timingSafeEqual } from '../../_lib/crypto.js';
import { getEnv, googleConfigured, supabaseConfigured } from '../../_lib/env.js';
import { redirect } from '../../_lib/http.js';
import { exchangeCode, fetchUserInfo, storeTokens } from '../../_lib/google.js';
import { dbClient } from '../../_lib/supabase.js';

const STATE_TTL_MS = 10 * 60_000;

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const back = (q: string) => redirect(`${env.appUrl || ''}/admin/integrasi?google=${q}`);
  if (!supabaseConfigured(env) || !googleConfigured(env)) return back('belum-dikonfigurasi');

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  if (url.searchParams.get('error') || !code) return back('ditolak');

  // Verifikasi state (nonce.timestamp.signature)
  const [nonce, ts, sig] = state.split('.');
  if (!nonce || !ts || !sig) return back('state-tidak-sah');
  const expected = await hmacSha256Hex(`${nonce}.${ts}`, env.tokenEncryptionKey);
  if (!timingSafeEqual(expected, sig)) return back('state-tidak-sah');
  if (Date.now() - Number(ts) > STATE_TTL_MS) return back('state-kedaluwarsa');

  try {
    const tokens = await exchangeCode(env, code);
    if (!tokens.refreshToken) {
      // Tanpa refresh token akses akan putus — minta consent ulang.
      return back('tanpa-refresh-token');
    }
    await storeTokens(env, tokens);
    const info = await fetchUserInfo(tokens.accessToken);
    const db = dbClient(env);
    await db.update('google_oauth_connections', 'id=eq.1', {
      email: info.email,
      connected_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      token_status: 'AKTIF',
    });
    return back('terhubung');
  } catch {
    return back('gagal');
  }
}
