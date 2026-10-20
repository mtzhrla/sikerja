import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function publicEnv(name: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'AUTH_EMAIL_DOMAIN'): string {
  const viteValue = import.meta.env[`VITE_${name}`];
  const nextValue = import.meta.env[`NEXT_PUBLIC_${name}`];
  const value = typeof viteValue === 'string' && viteValue ? viteValue : nextValue;
  return typeof value === 'string' ? value.trim() : '';
}

function hasUsableValue(value: string): boolean {
  return Boolean(value && !value.includes('<') && !value.includes('>') && !value.includes('yang baru'));
}

export function isSupabaseConfigured(): boolean {
  return hasUsableValue(publicEnv('SUPABASE_URL')) && hasUsableValue(publicEnv('SUPABASE_ANON_KEY'));
}

/** Klien Supabase (singleton). Panggil hanya bila isSupabaseConfigured(). */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = publicEnv('SUPABASE_URL');
    const key = publicEnv('SUPABASE_ANON_KEY');
    if (!hasUsableValue(url) || !hasUsableValue(key)) {
      throw new Error(
        'Supabase belum dikonfigurasi: isi VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY atau NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      );
    }
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/** Domain email akun (user tim & admin dibuat dengan email pada domain ini). */
export function authEmailDomain(): string {
  return publicEnv('AUTH_EMAIL_DOMAIN') || 'pip.local';
}

/** Email akun bersama Tim PIP. */
export function userAccountEmail(): string {
  return import.meta.env.VITE_AUTH_USER_EMAIL ?? `tim@${authEmailDomain()}`;
}
