/**
 * Util akun & password — HANYA server.
 *
 * Aturan keamanan yang ditegakkan di sini:
 *  - Email internal Supabase Auth bersifat buram (`emp-<uuid>@domain`) dan
 *    TIDAK PERNAH dikembalikan ke frontend.
 *  - Pesan kegagalan login selalu generik (anti-enumerasi akun).
 *  - Password tidak pernah dicatat, dikembalikan, atau disimpan di tabel aplikasi.
 */
import type { ServerEnv } from './env.js';
import { dbClient } from './supabase.js';

/** Password sementara untuk akun baru & reset oleh Admin. */
export const TEMP_PASSWORD = '12345678';

/** Batas percobaan login gagal sebelum akun dikunci sementara. */
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60_000;
const LOCK_MS = 5 * 60_000;

export function authEmailDomain(): string {
  return (process.env.AUTH_EMAIL_DOMAIN || process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || 'pip.local')
    .trim()
    .toLowerCase();
}

/** Email internal buram untuk akun pegawai (tidak memuat NIP/username). */
export function employeeAuthEmail(employeeId: string): string {
  return `emp-${employeeId}@${authEmailDomain()}`;
}

/** Validasi username: huruf kecil/angka/titik/garis bawah/strip, 2–32, tanpa spasi. */
export function normalizeUsername(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{1,31}$/.test(value) ? value : null;
}

/** Kebijakan password baru: minimal 8 karakter & bukan password sementara. */
export function validateNewPassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password baru minimal 8 karakter.';
  }
  if (password === TEMP_PASSWORD) {
    return 'Password baru tidak boleh sama dengan password sementara.';
  }
  if (password.length > 72) return 'Password terlalu panjang (maksimal 72 karakter).';
  return null;
}

// ---------------------------------------------------------------------------
// Pembatasan laju percobaan login
// ---------------------------------------------------------------------------

interface AttemptRow {
  identifier: string;
  fail_count: number;
  first_failed_at: string;
  locked_until: string | null;
}

/** Kunci pembatas laju: identitas + alamat IP (tanpa menyimpan IP mentah lain). */
export function attemptKey(identifier: string, request: Request): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return `${identifier.toLowerCase()}|${ip}`.slice(0, 200);
}

/** Sisa detik penguncian; 0 bila tidak terkunci. */
export async function lockRemainingSeconds(env: ServerEnv, key: string): Promise<number> {
  const rows = await dbClient(env).select<AttemptRow>(
    'auth_login_attempts',
    `select=*&identifier=eq.${encodeURIComponent(key)}`,
  );
  const locked = rows[0]?.locked_until;
  if (!locked) return 0;
  const remaining = Date.parse(locked) - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export async function recordLoginFailure(env: ServerEnv, key: string): Promise<void> {
  const db = dbClient(env);
  const rows = await db.select<AttemptRow>(
    'auth_login_attempts',
    `select=*&identifier=eq.${encodeURIComponent(key)}`,
  );
  const prev = rows[0];
  const withinWindow = prev && Date.now() - Date.parse(prev.first_failed_at) < FAIL_WINDOW_MS;
  const failCount = withinWindow ? prev.fail_count + 1 : 1;
  const locked = failCount >= MAX_FAILS ? new Date(Date.now() + LOCK_MS).toISOString() : null;
  await db.insert(
    'auth_login_attempts',
    {
      identifier: key,
      fail_count: locked ? 0 : failCount,
      first_failed_at: withinWindow && !locked ? prev.first_failed_at : new Date().toISOString(),
      locked_until: locked,
      updated_at: new Date().toISOString(),
    },
    { upsertOn: 'identifier' },
  );
}

export async function clearLoginFailures(env: ServerEnv, key: string): Promise<void> {
  try {
    await dbClient(env).delete(
      'auth_login_attempts',
      `identifier=eq.${encodeURIComponent(key)}`,
    );
  } catch {
    // pembersihan bersifat opsional
  }
}

// ---------------------------------------------------------------------------
// Pemetaan identitas login → akun Supabase Auth
// ---------------------------------------------------------------------------

export interface ResolvedIdentity {
  userId: string;
  email: string;
  accountType: 'ADMIN' | 'EMPLOYEE' | 'DEMO';
  employeeId: string | null;
  isActive: boolean;
}

/**
 * Petakan NIP / username pegawai / nama akun sistem → akun Auth.
 * Berjalan dengan service role; hasil tidak pernah dibocorkan ke pemanggil
 * yang gagal login (pesan tetap generik).
 */
export async function resolveIdentity(
  env: ServerEnv,
  identifier: string,
): Promise<ResolvedIdentity | null> {
  const db = dbClient(env);
  const raw = identifier.trim();
  if (!raw) return null;

  const username = raw.toLowerCase();
  const nip = raw.replace(/[^0-9]/g, '');

  // 1. Pegawai — username atau NIP.
  const filter = nip
    ? `or=(username.eq.${encodeURIComponent(username)},nip_normalized.eq.${encodeURIComponent(nip)})`
    : `username=eq.${encodeURIComponent(username)}`;
  const employees = await db.select<{ id: string; active: boolean }>(
    'employees',
    `select=id,active&${filter}&limit=1`,
  );
  const employee = employees[0];
  if (employee) {
    const accounts = await db.select<{
      user_id: string;
      role: ResolvedIdentity['accountType'];
      is_active: boolean;
    }>('account_roles', `select=user_id,role,is_active&employee_id=eq.${employee.id}&limit=1`);
    const account = accounts[0];
    if (!account) return null;
    return {
      userId: account.user_id,
      email: employeeAuthEmail(employee.id),
      accountType: account.role,
      employeeId: employee.id,
      isActive: account.is_active && employee.active,
    };
  }

  // 2. Akun sistem (ADMIN / DEMO) — dikenali lewat account_label.
  const systemAccounts = await db.select<{
    user_id: string;
    role: ResolvedIdentity['accountType'];
    is_active: boolean;
  }>(
    'account_roles',
    `select=user_id,role,is_active&account_label=eq.${encodeURIComponent(username)}` +
      `&employee_id=is.null&limit=1`,
  );
  const system = systemAccounts[0];
  if (!system) return null;
  return {
    userId: system.user_id,
    email: `${username}@${authEmailDomain()}`,
    accountType: system.role,
    employeeId: null,
    isActive: system.is_active,
  };
}

// ---------------------------------------------------------------------------
// Supabase Auth Admin API (service role)
// ---------------------------------------------------------------------------

const adminHeaders = (env: ServerEnv) => ({
  apikey: env.serviceRoleKey,
  Authorization: `Bearer ${env.serviceRoleKey}`,
  'Content-Type': 'application/json',
});

/** Buat pengguna Auth baru; mengembalikan id. Melempar bila gagal. */
export async function createAuthUser(
  env: ServerEnv,
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${env.supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(env),
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = (await res.json()) as { id?: string; msg?: string; message?: string };
  if (!res.ok || !body.id) {
    throw new Error(body.msg ?? body.message ?? `Gagal membuat akun (${res.status}).`);
  }
  return body.id;
}

export async function updateAuthPassword(
  env: ServerEnv,
  userId: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${env.supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: adminHeaders(env),
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { msg?: string };
    throw new Error(body.msg ?? `Gagal memperbarui password (${res.status}).`);
  }
}

/** Verifikasi password (untuk konfirmasi ganti password sendiri). */
export async function verifyPassword(
  env: ServerEnv,
  email: string,
  password: string,
): Promise<boolean> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
  const key = anonKey || env.serviceRoleKey;
  const res = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.ok;
}

export interface AuthSessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
}

/** Sign-in password grant — dijalankan server-side agar email internal tak bocor. */
export async function signInWithPassword(
  env: ServerEnv,
  email: string,
  password: string,
): Promise<AuthSessionTokens | null> {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
  const key = anonKey || env.serviceRoleKey;
  const res = await fetch(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  return (await res.json()) as AuthSessionTokens;
}
