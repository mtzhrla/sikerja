/**
 * POST /api/admin/accounts — pengelolaan akun pegawai (KHUSUS ADMIN).
 *
 * Aksi:
 *   list         → daftar akun pegawai (tanpa email internal & tanpa password)
 *   provision    → buat akun untuk satu pegawai (password sementara)
 *   provisionAll → buat akun untuk seluruh pegawai aktif (IDEMPOTENT)
 *   resetPassword→ kembalikan ke password sementara + wajib ganti password
 *   setActive    → aktifkan / nonaktifkan akun
 *
 * Idempotensi: pegawai yang sudah punya akun TIDAK PERNAH dibuatkan akun kedua.
 */
import {
  TEMP_PASSWORD,
  createAuthUser,
  employeeAuthEmail,
  updateAuthPassword,
} from '../_lib/accounts.js';
import { getEnv, supabaseConfigured } from '../_lib/env.js';
import { fail, json } from '../_lib/http.js';
import { dbClient, verifyRole, writeAudit } from '../_lib/supabase.js';
import type { ServerEnv } from '../_lib/env.js';

interface AccountRow {
  user_id: string;
  role: string;
  employee_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  password_changed_at: string | null;
  created_at: string | null;
}

interface EmployeeRow {
  id: string;
  full_name: string;
  active: boolean;
}

async function listAccounts(env: ServerEnv) {
  const db = dbClient(env);
  const [employees, accounts] = await Promise.all([
    db.select<EmployeeRow>('employees', 'select=id,full_name,active&order=sort_order.asc'),
    db.select<AccountRow>(
      'account_roles',
      'select=user_id,role,employee_id,is_active,must_change_password,last_login_at,' +
        'password_changed_at,created_at&employee_id=not.is.null',
    ),
  ]);
  const byEmployee = new Map(accounts.map((a) => [a.employee_id as string, a]));
  return employees.map((e) => {
    const account = byEmployee.get(e.id);
    return {
      employeeId: e.id,
      hasAccount: Boolean(account),
      accountType: account?.role ?? null,
      isActive: account?.is_active ?? false,
      mustChangePassword: account?.must_change_password ?? false,
      lastLoginAt: account?.last_login_at ?? null,
      passwordChangedAt: account?.password_changed_at ?? null,
      createdAt: account?.created_at ?? null,
    };
  });
}

/** Buat akun untuk satu pegawai. Mengembalikan 'created' | 'exists'. */
async function provisionOne(env: ServerEnv, employeeId: string): Promise<'created' | 'exists'> {
  const db = dbClient(env);
  const existing = await db.select<{ user_id: string }>(
    'account_roles',
    `select=user_id&employee_id=eq.${employeeId}&limit=1`,
  );
  if (existing.length > 0) return 'exists';

  const email = employeeAuthEmail(employeeId);
  let userId: string;
  try {
    userId = await createAuthUser(env, email, TEMP_PASSWORD);
  } catch (err) {
    // Pengguna Auth mungkin sudah ada dari percobaan sebelumnya — pakai ulang.
    const message = err instanceof Error ? err.message : '';
    if (!/already|registered|exists/i.test(message)) throw err;
    const res = await fetch(
      `${env.supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      {
        headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` },
      },
    );
    const found = (await res.json()) as { users?: { id: string; email: string }[] };
    const match = found.users?.find((u) => u.email?.toLowerCase() === email);
    if (!match) throw err;
    userId = match.id;
    await updateAuthPassword(env, userId, TEMP_PASSWORD);
  }

  await db.insert(
    'account_roles',
    {
      user_id: userId,
      role: 'EMPLOYEE',
      account_label: 'pegawai',
      employee_id: employeeId,
      is_active: true,
      must_change_password: false,
      updated_at: new Date().toISOString(),
    },
    { upsertOn: 'user_id' },
  );
  return 'created';
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Server belum dikonfigurasi.', 503);

  const account = await verifyRole(env, request);
  if (!account) return fail('Sesi Anda berakhir. Silakan masuk kembali.', 401);
  if (account.role !== 'ADMIN') {
    return fail('Hanya Admin yang dapat mengelola akun pegawai.', 403);
  }

  let body: { action?: unknown; employeeId?: unknown; active?: unknown; role?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('Permintaan tidak valid.', 400);
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : '';
  const db = dbClient(env);
  const audit = (action: string, entityId: string | null, label: string, after?: unknown) =>
    writeAudit(env, {
      actorRole: account.role,
      actorAccount: account.accountLabel,
      action,
      entityType: 'ACCOUNT',
      entityId,
      entityLabel: label,
      after,
    });

  try {
    switch (action) {
      case 'list':
        return json({ accounts: await listAccounts(env) });

      case 'provision': {
        if (!employeeId) return fail('Pegawai tidak dipilih.', 400);
        const employees = await db.select<EmployeeRow>(
          'employees',
          `select=id,full_name,active&id=eq.${employeeId}&limit=1`,
        );
        const employee = employees[0];
        if (!employee) return fail('Pegawai tidak ditemukan.', 404);
        if (!employee.active) return fail('Pegawai nonaktif tidak dapat dibuatkan akun.', 400);
        const result = await provisionOne(env, employeeId);
        if (result === 'created') {
          await audit('ACCOUNT_CREATE', employeeId, `Akun dibuat untuk ${employee.full_name}`);
        }
        const accounts = await listAccounts(env);
        return json({ account: accounts.find((a) => a.employeeId === employeeId) ?? null });
      }

      case 'provisionAll': {
        const employees = await db.select<EmployeeRow>(
          'employees',
          'select=id,full_name,active&active=is.true&order=sort_order.asc',
        );
        let created = 0;
        let skipped = 0;
        const failed: string[] = [];
        for (const employee of employees) {
          try {
            const result = await provisionOne(env, employee.id);
            if (result === 'created') {
              created += 1;
              await audit('ACCOUNT_CREATE', employee.id, `Akun dibuat untuk ${employee.full_name}`);
            } else {
              skipped += 1;
            }
          } catch {
            failed.push(employee.full_name);
          }
        }
        return json({ created, skipped, failed });
      }

      case 'resetPassword': {
        if (!employeeId) return fail('Pegawai tidak dipilih.', 400);
        const rows = await db.select<AccountRow>(
          'account_roles',
          `select=user_id,employee_id&employee_id=eq.${employeeId}&limit=1`,
        );
        const target = rows[0];
        if (!target) return fail('Pegawai ini belum memiliki akun.', 404);
        await updateAuthPassword(env, target.user_id, TEMP_PASSWORD);
        const now = new Date().toISOString();
        await db.update('account_roles', `user_id=eq.${target.user_id}`, {
          must_change_password: false,
          password_changed_at: null,
          updated_at: now,
        });
        // Cabut sesi perangkat lama agar pengguna masuk ulang.
        await db.update('device_sessions', `user_id=eq.${target.user_id}&revoked_at=is.null`, {
          revoked_at: now,
        });
        await db.insert('notifications', {
          recipient_employee_id: employeeId,
          type: 'PASSWORD_RESET',
          title: 'Password Anda direset Admin',
          body: 'Password Anda dikembalikan ke default 12345678. Masuk kembali memakai password tersebut.',
        });
        await audit('PASSWORD_RESET', employeeId, 'Password pegawai direset Admin');
        return json({ ok: true });
      }

      case 'setActive': {
        if (!employeeId) return fail('Pegawai tidak dipilih.', 400);
        const active = body.active === true;
        const rows = await db.select<AccountRow>(
          'account_roles',
          `select=user_id&employee_id=eq.${employeeId}&limit=1`,
        );
        const target = rows[0];
        if (!target) return fail('Pegawai ini belum memiliki akun.', 404);
        const now = new Date().toISOString();
        await db.update('account_roles', `user_id=eq.${target.user_id}`, {
          is_active: active,
          updated_at: now,
        });
        if (!active) {
          await db.update('device_sessions', `user_id=eq.${target.user_id}&revoked_at=is.null`, {
            revoked_at: now,
          });
        }
        await audit(
          active ? 'ACCOUNT_ACTIVATE' : 'ACCOUNT_DEACTIVATE',
          employeeId,
          active ? 'Akun pegawai diaktifkan' : 'Akun pegawai dinonaktifkan',
        );
        return json({ ok: true });
      }

      case 'setRole': {
        if (!employeeId) return fail('Pegawai tidak dipilih.', 400);
        if (body.role !== 'ADMIN' && body.role !== 'EMPLOYEE') {
          return fail('Status akun tidak valid.', 400);
        }
        const rows = await db.select<AccountRow>(
          'account_roles',
          `select=user_id,role,employee_id&employee_id=eq.${employeeId}&limit=1`,
        );
        const target = rows[0];
        if (!target) return fail('Pegawai ini belum memiliki akun.', 404);
        if (target.role === 'ADMIN' && body.role !== 'ADMIN') {
          const admins = await db.select<{ user_id: string }>(
            'account_roles',
            'select=user_id&role=eq.ADMIN&is_active=is.true&limit=2',
          );
          if (admins.length <= 1)
            return fail('Admin aktif terakhir tidak dapat diubah menjadi User.', 409);
        }
        const now = new Date().toISOString();
        await db.update('account_roles', `user_id=eq.${target.user_id}`, {
          role: body.role,
          updated_at: now,
        });
        await db.update('device_sessions', `user_id=eq.${target.user_id}&revoked_at=is.null`, {
          revoked_at: now,
        });
        await audit(
          'ACCOUNT_ROLE_CHANGE',
          employeeId,
          `Role akun diubah menjadi ${body.role === 'ADMIN' ? 'Admin' : 'User'}`,
        );
        return json({ ok: true });
      }

      default:
        return fail('Aksi tidak dikenal.', 400);
    }
  } catch (err) {
    // Pesan aman untuk pengguna; detail tidak pernah memuat kredensial.
    const message = err instanceof Error ? err.message : 'Kesalahan tidak diketahui';
    return fail(`Gagal memproses akun: ${message.slice(0, 200)}`, 500);
  }
}
