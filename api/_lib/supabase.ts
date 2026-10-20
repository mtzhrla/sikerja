/**
 * Akses Supabase dari server (service role) via PostgREST — tanpa SDK agar
 * ringan di Vercel Function. SERVICE ROLE HANYA di server; tidak pernah
 * dikirim ke frontend.
 */
import type { ServerEnv } from './env.js';

export interface DbClient {
  select<T>(table: string, query: string): Promise<T[]>;
  insert<T>(table: string, rows: unknown, opts?: { upsertOn?: string }): Promise<T[]>;
  update<T>(table: string, query: string, patch: unknown): Promise<T[]>;
  delete(table: string, query: string): Promise<void>;
}

export function dbClient(env: ServerEnv): DbClient {
  const base = `${env.supabaseUrl}/rest/v1`;
  const headers: Record<string, string> = {
    apikey: env.serviceRoleKey,
    Authorization: `Bearer ${env.serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  async function run<T>(url: string, init: RequestInit): Promise<T[]> {
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
    }
    if (res.status === 204) return [];
    const text = await res.text();
    return text ? (JSON.parse(text) as T[]) : [];
  }

  return {
    select: <T>(table: string, query: string) =>
      run<T>(`${base}/${table}?${query}`, { headers }),
    insert: <T>(table: string, rows: unknown, opts?: { upsertOn?: string }) =>
      run<T>(
        `${base}/${table}${opts?.upsertOn ? `?on_conflict=${opts.upsertOn}` : ''}`,
        {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: `return=representation${opts?.upsertOn ? ',resolution=merge-duplicates' : ''}`,
          },
          body: JSON.stringify(rows),
        },
      ),
    update: <T>(table: string, query: string, patch: unknown) =>
      run<T>(`${base}/${table}?${query}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      }),
    delete: async (table: string, query: string) => {
      await run(`${base}/${table}?${query}`, { method: 'DELETE', headers });
    },
  };
}

/** Jenis akun sistem — sinkron dengan check constraint account_roles.role. */
export type AccountType = 'ADMIN' | 'EMPLOYEE' | 'DEMO';

export interface AccountInfo {
  userId: string;
  role: AccountType;
  accountLabel: string;
  employeeId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

/**
 * Verifikasi JWT Supabase dari header Authorization dan pastikan pemiliknya
 * terdaftar & aktif di account_roles. Jenis akun TIDAK PERNAH dipercaya dari
 * client — selalu dibaca ulang dari database dengan service role.
 */
export async function verifyRole(
  env: ServerEnv,
  request: Request,
): Promise<AccountInfo | null> {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const res = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  if (!user.id) return null;
  const db = dbClient(env);
  const rows = await db.select<{
    role: AccountType;
    account_label: string;
    employee_id: string | null;
    is_active: boolean;
    must_change_password: boolean;
  }>(
    'account_roles',
    `select=role,account_label,employee_id,is_active,must_change_password&user_id=eq.${user.id}`,
  );
  const row = rows[0];
  if (!row || !row.is_active) return null;
  return {
    userId: user.id,
    role: row.role,
    accountLabel: row.account_label,
    employeeId: row.employee_id,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
  };
}

export async function requireAdmin(env: ServerEnv, request: Request): Promise<boolean> {
  const info = await verifyRole(env, request);
  return info?.role === 'ADMIN';
}

/** Catat kejadian ke audit_log (best-effort — kegagalan tidak menggagalkan aksi). */
export async function writeAudit(
  env: ServerEnv,
  entry: {
    actorRole: string;
    actorAccount: string;
    employeeId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    before?: unknown;
    after?: unknown;
    success?: boolean;
    errorMessage?: string | null;
  },
): Promise<void> {
  try {
    await dbClient(env).insert('audit_log', {
      actor_role: entry.actorRole,
      actor_account: entry.actorAccount,
      employee_id: entry.employeeId ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      success: entry.success ?? true,
      error_message: entry.errorMessage ?? null,
    });
  } catch {
    // audit tidak boleh menggagalkan operasi utama
  }
}
