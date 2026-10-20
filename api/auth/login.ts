/**
 * POST /api/auth/login — login dengan NIP, username pegawai, atau nama akun.
 *
 * Alur:
 *   1. Pembatasan laju (identitas + IP) sebelum kredensial diperiksa.
 *   2. Pemetaan identitas → akun Supabase Auth (service role, server-side).
 *   3. Sign-in password grant; token dikembalikan ke klien untuk `setSession`.
 *
 * Yang TIDAK dilakukan: mengembalikan email internal Auth, membocorkan apakah
 * identitas ada/tidak, atau mencatat password ke log.
 */
import {
  attemptKey,
  clearLoginFailures,
  lockRemainingSeconds,
  recordLoginFailure,
  resolveIdentity,
  signInWithPassword,
} from '../_lib/accounts.js';
import { getEnv, supabaseConfigured } from '../_lib/env.js';
import { fail, json } from '../_lib/http.js';
import { dbClient, writeAudit } from '../_lib/supabase.js';

/** Pesan tunggal untuk seluruh kegagalan kredensial (anti-enumerasi). */
const GENERIC_ERROR = 'NIP/username atau password salah. Periksa kembali.';

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Server belum dikonfigurasi.', 503);

  let body: { identifier?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('Permintaan tidak valid.', 400);
  }

  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!identifier || !password) {
    return fail('Masukkan NIP/username dan password Anda.', 400);
  }

  const key = attemptKey(identifier, request);
  const locked = await lockRemainingSeconds(env, key);
  if (locked > 0) {
    return json(
      {
        error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(locked / 60)} menit.`,
      },
      429,
    );
  }

  const identity = await resolveIdentity(env, identifier);

  // Identitas tidak dikenal ATAU akun dinonaktifkan → pesan & perlakuan sama.
  if (!identity || !identity.isActive) {
    await recordLoginFailure(env, key);
    await writeAudit(env, {
      actorRole: 'DEMO',
      actorAccount: identifier.slice(0, 60),
      action: 'LOGIN_FAILED',
      entityType: 'AUTH',
      entityLabel: 'Login gagal',
      success: false,
      errorMessage: identity ? 'Akun nonaktif' : 'Identitas tidak dikenal',
    });
    return fail(GENERIC_ERROR, 401);
  }

  const tokens = await signInWithPassword(env, identity.email, password);
  if (!tokens) {
    await recordLoginFailure(env, key);
    await writeAudit(env, {
      actorRole: identity.accountType,
      actorAccount: identifier.slice(0, 60),
      employeeId: identity.employeeId,
      action: 'LOGIN_FAILED',
      entityType: 'AUTH',
      entityLabel: 'Login gagal',
      success: false,
      errorMessage: 'Password salah',
    });
    return fail(GENERIC_ERROR, 401);
  }

  await clearLoginFailures(env, key);

  const db = dbClient(env);
  const accounts = await db.update<{ must_change_password: boolean; account_label: string }>(
    'account_roles',
    `user_id=eq.${identity.userId}`,
    { last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  );
  const account = accounts[0];

  await writeAudit(env, {
    actorRole: identity.accountType,
    actorAccount: account?.account_label ?? identity.accountType.toLowerCase(),
    employeeId: identity.employeeId,
    action: 'LOGIN',
    entityType: 'AUTH',
    entityLabel: `Login ${identity.accountType}`,
  });

  return json({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accountType: identity.accountType,
    employeeId: identity.employeeId,
    mustChangePassword: account?.must_change_password ?? false,
  });
}
