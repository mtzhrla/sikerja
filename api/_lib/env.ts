/**
 * Environment server (Vercel Functions) — SELURUH nilai di sini rahasia server;
 * tidak pernah dikirim ke frontend dan tidak pernah dicatat ke log.
 */

export type SheetsAccessMode = 'service_account' | 'oauth' | 'none';

export interface ServerEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  tokenEncryptionKey: string;
  webhookSecret: string;
  appUrl: string;
  /** Mode akses Google Sheets yang diminta operator (default service_account). */
  sheetsAccessMode: 'service_account' | 'oauth';
  /** Email Service Account — dibagikan ke spreadsheet (Viewer). Bukan rahasia. */
  serviceAccountEmail: string;
  /** Private key Service Account — RAHASIA server; hanya untuk minting token. */
  serviceAccountPrivateKey: string;
}

function read(...names: string[]): string {
  for (const name of names) {
    const v = process.env[name];
    if (v) return v;
  }
  return '';
}

export function getEnv(): ServerEnv {
  const requestedMode = read('GOOGLE_SHEETS_ACCESS_MODE').toLowerCase();
  return {
    // Dukung kedua konvensi nama (NEXT_PUBLIC_* dari Docs/09 & SUPABASE_URL polos).
    supabaseUrl: read('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL'),
    serviceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),
    googleClientId: read('GOOGLE_CLIENT_ID'),
    googleClientSecret: read('GOOGLE_CLIENT_SECRET'),
    googleRedirectUri: read('GOOGLE_REDIRECT_URI'),
    tokenEncryptionKey: read('GOOGLE_TOKEN_ENCRYPTION_KEY'),
    webhookSecret: read('GOOGLE_WEBHOOK_SECRET'),
    appUrl: read('NEXT_PUBLIC_APP_URL', 'APP_URL'),
    // Default: Service Account sebagai mode utama (§1).
    sheetsAccessMode: requestedMode === 'oauth' ? 'oauth' : 'service_account',
    serviceAccountEmail: read('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    // Vercel menyimpan newline sebagai "\n" literal — normalkan ke newline asli.
    serviceAccountPrivateKey: read('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
  };
}

/** Supabase server siap dipakai? */
export function supabaseConfigured(env: ServerEnv): boolean {
  return Boolean(env.supabaseUrl && env.serviceRoleKey);
}

/** Google OAuth siap dipakai? */
export function googleConfigured(env: ServerEnv): boolean {
  return Boolean(
    env.googleClientId && env.googleClientSecret && env.googleRedirectUri && env.tokenEncryptionKey,
  );
}

/** Service Account siap dipakai (email + private key)? */
export function serviceAccountConfigured(env: ServerEnv): boolean {
  return Boolean(env.serviceAccountEmail && env.serviceAccountPrivateKey);
}

/**
 * Mode akses efektif untuk membaca Google Sheets (§1):
 * Service Account sebagai utama, OAuth sebagai alternatif. 'none' bila keduanya
 * belum dikonfigurasi — aplikasi tetap berjalan memakai snapshot valid terakhir.
 */
export function sheetsAccessMode(env: ServerEnv): SheetsAccessMode {
  const sa = serviceAccountConfigured(env);
  const oauth = googleConfigured(env);
  if (env.sheetsAccessMode === 'oauth') {
    if (oauth) return 'oauth';
    if (sa) return 'service_account';
  } else {
    if (sa) return 'service_account';
    if (oauth) return 'oauth';
  }
  return 'none';
}
