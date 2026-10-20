/**
 * POST /api/auth/password — pengguna mengganti password SENDIRI.
 *
 * - Wajib membawa Bearer token Supabase yang sah.
 * - `currentPassword` wajib KECUALI pada alur "wajib ganti password"
 *   (login pertama / setelah reset Admin), karena pengguna baru saja
 *   membuktikan kepemilikan password sementara ketika login.
 * - Password baru minimal 8 karakter dan tidak boleh sama dengan password
 *   sementara. Password tidak pernah dicatat maupun dikembalikan.
 */
import {
  employeeAuthEmail,
  authEmailDomain,
  signInWithPassword,
  updateAuthPassword,
  validateNewPassword,
  verifyPassword,
} from '../_lib/accounts.js';
import { getEnv, supabaseConfigured } from '../_lib/env.js';
import { fail, json } from '../_lib/http.js';
import { dbClient, verifyRole, writeAudit } from '../_lib/supabase.js';

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Server belum dikonfigurasi.', 503);

  const account = await verifyRole(env, request);
  if (!account) return fail('Sesi Anda berakhir. Silakan masuk kembali.', 401);

  let body: { newPassword?: unknown; currentPassword?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('Permintaan tidak valid.', 400);
  }

  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  const currentPassword =
    typeof body.currentPassword === 'string' ? body.currentPassword : '';

  const policyError = validateNewPassword(newPassword);
  if (policyError) return fail(policyError, 400);

  const email = account.employeeId
    ? employeeAuthEmail(account.employeeId)
    : `${account.accountLabel}@${authEmailDomain()}`;

  // Di luar alur wajib-ganti, password lama harus dibuktikan.
  if (!account.mustChangePassword) {
    if (!currentPassword) return fail('Masukkan password Anda saat ini.', 400);
    const ok = await verifyPassword(env, email, currentPassword);
    if (!ok) return fail('Password saat ini salah.', 401);
  }

  try {
    await updateAuthPassword(env, account.userId, newPassword);
  } catch {
    return fail('Gagal memperbarui password. Coba lagi.', 500);
  }

  const now = new Date().toISOString();
  await dbClient(env).update('account_roles', `user_id=eq.${account.userId}`, {
    must_change_password: false,
    password_changed_at: now,
    updated_at: now,
  });

  await writeAudit(env, {
    actorRole: account.role,
    actorAccount: account.accountLabel,
    employeeId: account.employeeId,
    action: 'PASSWORD_CHANGE',
    entityType: 'AUTH',
    entityLabel: 'Password diganti sendiri',
  });

  // Mengganti password mencabut refresh token lama (perilaku Supabase Auth).
  // Kembalikan sesi baru agar pengguna tidak terlempar ke halaman login pada
  // muat ulang berikutnya — sesi lain pada perangkat lain tetap tercabut.
  const session = await signInWithPassword(env, email, newPassword);

  return json({
    ok: true,
    accessToken: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null,
  });
}
