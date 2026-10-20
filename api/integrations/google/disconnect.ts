/**
 * POST /api/integrations/google/disconnect (Admin)
 * Mencabut token di Google (best-effort) dan menghapus token tersimpan.
 */
import { getEnv, supabaseConfigured } from '../../_lib/env.js';
import { fail, json } from '../../_lib/http.js';
import { disconnectGoogle } from '../../_lib/google.js';
import { requireAdmin } from '../../_lib/supabase.js';

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Supabase belum dikonfigurasi di server.', 503);
  if (!(await requireAdmin(env, request))) {
    return fail('Hanya Admin yang dapat memutuskan koneksi Google.', 403);
  }
  try {
    await disconnectGoogle(env);
    return json({ ok: true });
  } catch {
    return fail('Gagal memutuskan koneksi Google.', 500);
  }
}
