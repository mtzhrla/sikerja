/**
 * GET /api/integrations/google/status (akun terautentikasi)
 * Status koneksi Google TANPA nilai rahasia apa pun.
 * Mode utama = Service Account ("Koneksi Sistem"); OAuth sebagai alternatif.
 * Email Service Account BOLEH ditampilkan (untuk dibagikan Viewer);
 * private key TIDAK PERNAH dikirim ke frontend.
 */
import { getEnv, sheetsAccessMode, supabaseConfigured } from '../../_lib/env.js';
import { fail, json } from '../../_lib/http.js';
import { dbClient, verifyRole } from '../../_lib/supabase.js';

interface ConnRow {
  email: string | null;
  connected_at: string | null;
  last_used_at: string | null;
  token_status: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  const mode = sheetsAccessMode(env);
  if (!supabaseConfigured(env)) {
    return json({
      configured: false,
      accessMode: mode,
      serviceAccountEmail: null,
      connected: false,
      email: null,
      connectedAt: null,
      lastUsedAt: null,
      tokenStatus: null,
    });
  }
  const info = await verifyRole(env, request);
  if (!info) return fail('Sesi tidak valid.', 401);

  const db = dbClient(env);
  const rows = await db.select<ConnRow>(
    'google_oauth_connections',
    'select=email,connected_at,last_used_at,token_status&id=eq.1',
  );
  const row = rows[0];

  // Mode Service Account: koneksi sistem selalu aktif begitu env terpasang;
  // tidak perlu login Google. Email SA ditampilkan agar bisa dibagikan Viewer.
  if (mode === 'service_account') {
    return json({
      configured: true,
      accessMode: mode,
      serviceAccountEmail: env.serviceAccountEmail,
      connected: true,
      email: env.serviceAccountEmail,
      connectedAt: null,
      lastUsedAt: row?.last_used_at ?? null,
      tokenStatus: 'AKTIF',
    });
  }

  // Mode OAuth (alternatif) atau belum dikonfigurasi.
  return json({
    configured: mode === 'oauth',
    accessMode: mode,
    serviceAccountEmail: null,
    connected: Boolean(row?.email && row.token_status === 'AKTIF'),
    email: row?.email ?? null,
    connectedAt: row?.connected_at ?? null,
    lastUsedAt: row?.last_used_at ?? null,
    tokenStatus: row?.token_status ?? null,
  });
}
