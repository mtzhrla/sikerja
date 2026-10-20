/**
 * Adapter PRODUKSI — Supabase (Postgres + RLS + Realtime + Storage + Auth).
 *
 * Kontrak identik dengan adapter lokal (DataService). Role & izin ditegakkan
 * server-side lewat RLS (lihat supabase/migrations); pemeriksaan role di file
 * ini hanya untuk umpan balik cepat di UI.
 *
 * CATATAN: adapter ini lengkap tetapi BELUM TERUJI terhadap project Supabase
 * nyata karena kredensial belum tersedia — lihat DEPLOYMENT.md.
 */
import { normalizeTeam } from '@/lib/org';
import { fileExtension, sanitizeFileName, uid } from '@/lib/utils';
import {
  AppError,
  AuthError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  StorageError,
  ValidationError,
} from '@/services/errors';
import { validateRows, validateScope } from '@/services/distribution-validation';
import { readCollection, writeCollection } from '@/services/local/storage';
import type {
  AccountType,
  ActorContext,
  AppSettings,
  AttachmentGroup,
  AuditEntry,
  AuthState,
  BackupPayload,
  ChangeEvent,
  ChangeTopic,
  DataService,
  EmployeeAccount,
  GoogleConnectionStatus,
  NotificationItem,
  PipSkRecord,
  SessionInfo,
  Step,
  Task,
  TaskPatch,
} from '@/services/types';
import { toActivityEvent } from '@/services/local/audit.service';
import { authEmailDomain, getSupabase } from './client';
import {
  toActivity,
  toAttachment,
  toAttachmentGroup,
  toNotification,
  toAudit,
  toBinding,
  toBoard,
  toComment,
  toEmployee,
  toMapping,
  toSession,
  toSettings,
  toSnapshot,
  toSource,
  toStep,
  toSyncRun,
  toTask,
  toTaxonomy,
  toTemplate,
  type ActivityRow,
  type AttachmentGroupRow,
  type AttachmentRow,
  type AuditRow,
  type NotificationRow,
  type BindingRow,
  type BoardRow,
  type CommentRow,
  type EmployeeRow,
  type GoogleConnRow,
  type MappingRow,
  type SessionRow,
  type SettingsRow,
  type SnapshotRow,
  type SourceRow,
  type StepRow,
  type SyncRunRow,
  type TaskRow,
  type TaxonomyRow,
  type TemplateRow,
} from './rows';

// ---------------------------------------------------------------------------
// Util umum
// ---------------------------------------------------------------------------

const SESSION_KEY = 'supabaseDeviceSessionId';
const nowISO = () => new Date().toISOString();

interface PgError {
  message?: string;
  code?: string;
}

interface ProfileTaskRpcResult {
  items: TaskRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
  summary: {
    active: number;
    done: number;
    overdue: number;
    blocked: number;
    completionPercent: number;
    total: number;
  };
}

/** Petakan error Supabase/Postgres ke AppError berpesan Indonesia. */
function wrap(err: PgError | null, fallback: string): never {
  const msg = err?.message ?? fallback;
  if (msg.includes('FORBIDDEN')) throw new ForbiddenError();
  if (msg.includes('NOT_FOUND')) throw new NotFoundError();
  if (msg.includes('VALIDATION:')) {
    throw new ValidationError(msg.split('VALIDATION:')[1]?.trim() ?? fallback);
  }
  if (err?.code === '23505') {
    throw new ValidationError('Data duplikat — periksa kembali isian Anda.');
  }
  if (err?.code === '42501') throw new ForbiddenError();
  throw new AppError('UNAVAILABLE', `${fallback}: ${msg}`);
}

interface AccountInfo {
  userId: string;
  role: AccountType;
  account: string;
  /** Pegawai yang terhubung ke akun (hanya akun EMPLOYEE). */
  employeeId: string | null;
  mustChangePassword: boolean;
}

let cachedRole: AccountInfo | null = null;

async function fetchRole(): Promise<AccountInfo | null> {
  const sb = getSupabase();
  const { data: authData } = await sb.auth.getUser();
  const user = authData.user;
  if (!user) return null;
  if (cachedRole && cachedRole.userId === user.id) {
    return cachedRole;
  }
  const { data, error } = await sb
    .from('account_roles')
    .select('role, account_label, employee_id, is_active, must_change_password')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    role: AccountType;
    account_label: string;
    employee_id: string | null;
    is_active: boolean;
    must_change_password: boolean;
  };
  if (!row.is_active) return null;
  cachedRole = {
    userId: user.id,
    role: row.role,
    account: row.account_label,
    employeeId: row.employee_id,
    mustChangePassword: row.must_change_password,
  };
  return cachedRole;
}

/** Akun DEMO tidak boleh melakukan perubahan apa pun. */
async function requireWrite(): Promise<AccountInfo> {
  const info = await requireRole();
  if (info.role === 'DEMO') {
    throw new ForbiddenError('Akun demo hanya dapat melihat data (read-only).');
  }
  return info;
}

async function requireRole(): Promise<AccountInfo> {
  const info = await fetchRole();
  if (!info) throw new AuthError('Sesi Anda berakhir. Silakan masuk kembali.');
  return info;
}

async function requireAdmin(): Promise<AccountInfo> {
  const info = await requireRole();
  if (info.role !== 'ADMIN') {
    throw new ForbiddenError('Tindakan ini hanya dapat dilakukan Admin.');
  }
  return info;
}

function deviceLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Perangkat';
  return `${browser} · ${os}`;
}

function withAuditActor(
  value: unknown,
  actor: { accountUserId: string; employeeActorId: string | null },
): Record<string, unknown> {
  const meta = {
    account_user_id: actor.accountUserId,
    employee_actor_id: actor.employeeActorId,
  };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>), ...meta };
  }
  return { value: value ?? null, ...meta };
}

/** Tulis audit (best-effort; kegagalan audit tidak menggagalkan operasi utama). */
async function auditWrite(entry: {
  action: AuditEntry['action'];
  entityType: AuditEntry['entityType'];
  entityId?: string | null;
  entityLabel?: string | null;
  before?: unknown;
  after?: unknown;
  employeeId?: string | null;
  success?: boolean;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    const info = await fetchRole();
    if (!info) return;
    await getSupabase()
      .from('audit_log')
      .insert({
        actor_role: info.role,
        actor_account: info.account,
        employee_id: entry.employeeId ?? null,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        entity_label: entry.entityLabel ?? null,
        before: entry.before ?? null,
        after: withAuditActor(entry.after ?? null, {
          accountUserId: info.userId,
          employeeActorId: entry.employeeId ?? null,
        }),
        success: entry.success ?? true,
        error_message: entry.errorMessage ?? null,
        session_id: readCollection<string | null>(SESSION_KEY, null),
        device_label: deviceLabel(),
      });
  } catch {
    // audit best-effort
  }
}

/** Pegawai pelaku wajib valid & aktif. */
async function assertActor(ctx: ActorContext): Promise<string> {
  const { data, error } = await getSupabase()
    .from('employees')
    .select('id, active')
    .eq('id', ctx.employeeId)
    .maybeSingle();
  if (error) wrap(error, 'Gagal memeriksa pegawai pelaku');
  if (!data)
    throw new ValidationError('Pegawai pelaku tidak ditemukan. Pilih pegawai pelaku Anda.');
  if (!data.active)
    throw new ValidationError('Pegawai pelaku nonaktif tidak dapat melakukan perubahan.');
  return ctx.employeeId;
}

/** Ekstrak Spreadsheet ID dari URL Google Sheets (atau kembalikan apa adanya). */
function extractSheetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (m?.[1]) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Panggil endpoint server aplikasi (Vercel Function) dengan token sesi
 * Supabase. Kegagalan jaringan/404 TIDAK melempar — dikembalikan sebagai
 * { ok: false } agar UI dapat menampilkan status "belum dikonfigurasi".
 */
async function callServerApi<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; data: T | null; message: string | null }> {
  try {
    const { data: sess } = await getSupabase().auth.getSession();
    const token = sess.session?.access_token;
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? ((await res.json()) as Record<string, unknown>) : null;
    if (!res.ok) {
      return {
        ok: false,
        data: null,
        message:
          (payload?.error as string | undefined) ??
          (res.status === 404
            ? 'Endpoint integrasi tidak tersedia — deploy Vercel Function terlebih dahulu.'
            : `Permintaan gagal (${res.status}).`),
      };
    }
    return { ok: true, data: (payload as T) ?? null, message: null };
  } catch {
    return {
      ok: false,
      data: null,
      message: 'Server integrasi tidak dapat dihubungi. Integrasi Google belum dikonfigurasi.',
    };
  }
}

/**
 * Kirim FormData lampiran ke endpoint server dengan token sesi Supabase.
 * Endpoint memeriksa ulang hak akses pekerjaan (tidak hanya mengandalkan RLS).
 */
async function postAttachmentForm(form: FormData): Promise<void> {
  const { data: sess } = await getSupabase().auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch('/api/attachments', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  }).catch(() => null);
  if (!res) throw new StorageError('Server lampiran tidak dapat dihubungi.');
  const payload = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 403) throw new ForbiddenError(payload.error);
    throw new StorageError(payload.error ?? 'Gagal memproses lampiran.');
  }
}

async function postAttachmentJson(body: Record<string, unknown>): Promise<void> {
  const res = await callServerApi('POST', '/api/attachments', body);
  if (!res.ok) throw new StorageError(res.message ?? 'Gagal memproses lampiran.');
}

async function createDeviceSession(role: AccountType, account: string): Promise<SessionInfo> {
  const sb = getSupabase();
  const { data: authData } = await sb.auth.getUser();
  const { data, error } = await sb
    .from('device_sessions')
    .insert({
      user_id: authData.user!.id,
      role,
      account,
      device_label: deviceLabel(),
    })
    .select()
    .single();
  if (error || !data) wrap(error, 'Gagal mencatat sesi perangkat');
  writeCollection(SESSION_KEY, (data as SessionRow).id);
  return toSession(data as SessionRow);
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const supabaseAdapter: DataService = {
  mode: 'supabase',

  // ------------------------------------------------------------------ auth
  auth: {
    async getState(): Promise<AuthState> {
      const sb = getSupabase();
      const empty: AuthState = {
        session: null,
        role: null,
        employeeId: null,
        mustChangePassword: false,
      };
      const { data } = await sb.auth.getSession();
      if (!data.session) return empty;
      cachedRole = null;
      const info = await fetchRole();
      if (!info) {
        await sb.auth.signOut();
        return empty;
      }
      const sessionId = readCollection<string | null>(SESSION_KEY, null);
      let session: SessionInfo | null = null;
      if (sessionId) {
        const { data: row } = await sb
          .from('device_sessions')
          .select()
          .eq('id', sessionId)
          .maybeSingle();
        if (row) session = toSession(row as SessionRow);
      }
      if (!session) {
        session = await createDeviceSession(info.role, info.account);
      }
      if (session.revokedAt) {
        writeCollection(SESSION_KEY, null);
        await sb.auth.signOut();
        cachedRole = null;
        return empty;
      }
      // Heartbeat (throttle 5 menit)
      if (Date.now() - Date.parse(session.lastActiveAt) > 5 * 60_000) {
        await sb.from('device_sessions').update({ last_active_at: nowISO() }).eq('id', session.id);
      }
      return {
        session,
        role: info.role,
        employeeId: info.employeeId,
        mustChangePassword: info.mustChangePassword,
      };
    },

    /**
     * Login dengan NIP, username pegawai, atau nama akun sistem.
     *
     * Pemetaan identitas → akun Supabase Auth dilakukan SERVER-SIDE
     * (`/api/auth/login`) sehingga email internal Auth dan service role key
     * tidak pernah sampai ke frontend. Jenis akun dibaca dari database setelah
     * kredensial terverifikasi — tidak pernah dipercaya dari frontend.
     */
    async login(identifier: string, password: string): Promise<SessionInfo> {
      const sb = getSupabase();
      const raw = identifier.trim();
      if (!raw) throw new AuthError('Masukkan NIP atau username Anda.');

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: raw, password }),
      }).catch(() => null);

      if (res && res.status !== 404) {
        const payload = (await res.json().catch(() => ({}))) as {
          accessToken?: string;
          refreshToken?: string;
          error?: string;
        };
        if (!res.ok || !payload.accessToken || !payload.refreshToken) {
          throw new AuthError(payload.error ?? 'NIP/username atau password salah.');
        }
        const { error } = await sb.auth.setSession({
          access_token: payload.accessToken,
          refresh_token: payload.refreshToken,
        });
        if (error) throw new AuthError('Gagal memulai sesi. Coba lagi.');
      } else {
        // Cadangan (mis. pengembangan tanpa endpoint server): login akun sistem
        // memakai domain email internal. Login NIP/username butuh endpoint.
        const email = raw.includes('@') ? raw : `${raw}@${authEmailDomain()}`;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new AuthError('NIP/username atau password salah. Periksa kembali.');
      }

      cachedRole = null;
      const info = await fetchRole();
      if (!info) {
        await sb.auth.signOut();
        throw new AuthError('Akun Anda belum aktif pada aplikasi. Hubungi Admin.');
      }
      const session = await createDeviceSession(info.role, info.account);
      await auditWrite({
        action: 'LOGIN',
        entityType: 'AUTH',
        entityLabel: `Login ${info.role}`,
        employeeId: info.employeeId,
      });
      return session;
    },

    /** Ganti password sendiri lewat endpoint server (Supabase Auth). */
    async changeOwnPassword(newPassword: string, currentPassword?: string): Promise<void> {
      await requireRole();
      const { data: sess } = await getSupabase().auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ newPassword, currentPassword }),
      }).catch(() => null);
      if (!res) throw new AppError('UNAVAILABLE', 'Server tidak dapat dihubungi.');
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        accessToken?: string | null;
        refreshToken?: string | null;
      };
      if (!res.ok) throw new ValidationError(payload.error ?? 'Gagal mengganti password.');
      // Supabase mencabut refresh token lama saat password berubah — pasang
      // sesi baru agar pengguna tetap masuk setelah muat ulang halaman.
      if (payload.accessToken && payload.refreshToken) {
        await getSupabase().auth.setSession({
          access_token: payload.accessToken,
          refresh_token: payload.refreshToken,
        });
      }
      cachedRole = null;
    },

    async logout(): Promise<void> {
      const sb = getSupabase();
      const sessionId = readCollection<string | null>(SESSION_KEY, null);
      await auditWrite({ action: 'LOGOUT', entityType: 'AUTH', entityLabel: 'Logout' });
      if (sessionId) {
        await sb.from('device_sessions').update({ revoked_at: nowISO() }).eq('id', sessionId);
        writeCollection(SESSION_KEY, null);
      }
      await sb.auth.signOut();
      cachedRole = null;
    },

    async listSessions(): Promise<SessionInfo[]> {
      await requireAdmin();
      const { data, error } = await getSupabase()
        .from('device_sessions')
        .select()
        .order('last_active_at', { ascending: false })
        .limit(100);
      if (error) wrap(error, 'Gagal memuat sesi');
      return ((data ?? []) as SessionRow[]).map(toSession);
    },

    async revokeSession(sessionId: string): Promise<void> {
      await requireAdmin();
      const { error } = await getSupabase()
        .from('device_sessions')
        .update({ revoked_at: nowISO() })
        .eq('id', sessionId);
      if (error) wrap(error, 'Gagal mencabut sesi');
      await auditWrite({
        action: 'REVOKE_SESSION',
        entityType: 'SESSION',
        entityId: sessionId,
        entityLabel: 'Sesi dicabut Admin',
      });
    },
  },

  // -------------------------------------------------------------- accounts
  // Seluruh operasi berjalan lewat endpoint server (service role); frontend
  // tidak pernah menyentuh Auth Admin API maupun email internal.
  accounts: {
    async list(): Promise<EmployeeAccount[]> {
      await requireAdmin();
      const res = await callServerApi<{ accounts: EmployeeAccount[] }>(
        'POST',
        '/api/admin/accounts',
        { action: 'list' },
      );
      if (!res.ok) throw new AppError('UNAVAILABLE', res.message ?? 'Gagal memuat daftar akun.');
      return res.data?.accounts ?? [];
    },

    async provision(employeeId): Promise<EmployeeAccount> {
      await requireAdmin();
      const res = await callServerApi<{ account: EmployeeAccount | null }>(
        'POST',
        '/api/admin/accounts',
        { action: 'provision', employeeId },
      );
      if (!res.ok) throw new ValidationError(res.message ?? 'Gagal membuat akun pegawai.');
      await auditWrite({
        action: 'ACCOUNT_CREATE',
        entityType: 'ACCOUNT',
        entityId: employeeId,
        entityLabel: 'Akun pegawai dibuat',
      });
      return (
        res.data?.account ?? {
          employeeId,
          hasAccount: true,
          accountType: 'EMPLOYEE',
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: null,
          passwordChangedAt: null,
          createdAt: nowISO(),
        }
      );
    },

    async provisionAll() {
      await requireAdmin();
      const res = await callServerApi<{ created: number; skipped: number; failed: string[] }>(
        'POST',
        '/api/admin/accounts',
        { action: 'provisionAll' },
      );
      if (!res.ok) throw new ValidationError(res.message ?? 'Gagal membuat akun pegawai.');
      return res.data ?? { created: 0, skipped: 0, failed: [] };
    },

    async resetPassword(employeeId) {
      await requireAdmin();
      const res = await callServerApi('POST', '/api/admin/accounts', {
        action: 'resetPassword',
        employeeId,
      });
      if (!res.ok) throw new ValidationError(res.message ?? 'Gagal mereset password.');
    },

    async setActive(employeeId, active) {
      await requireAdmin();
      const res = await callServerApi('POST', '/api/admin/accounts', {
        action: 'setActive',
        employeeId,
        active,
      });
      if (!res.ok) throw new ValidationError(res.message ?? 'Gagal mengubah status akun.');
    },

    async setRole(employeeId, role) {
      await requireAdmin();
      const res = await callServerApi('POST', '/api/admin/accounts', {
        action: 'setRole',
        employeeId,
        role,
      });
      if (!res.ok) throw new ValidationError(res.message ?? 'Gagal mengubah akses akun.');
    },
  },

  // ---------------------------------------------------------- notifications
  // RLS memastikan pengguna hanya membaca & menandai notifikasi MILIKNYA.
  notifications: {
    async list(opts): Promise<NotificationItem[]> {
      const info = await requireRole();
      if (!info.employeeId) return [];
      let q = getSupabase()
        .from('notifications')
        .select()
        .eq('recipient_employee_id', info.employeeId)
        .order('created_at', { ascending: false })
        .limit(opts?.limit ?? 30);
      if (opts?.unreadOnly) q = q.is('read_at', null);
      const { data, error } = await q;
      if (error) return [];
      return ((data ?? []) as NotificationRow[]).map(toNotification);
    },

    async unreadCount(): Promise<number> {
      const info = await requireRole();
      if (!info.employeeId) return 0;
      const { count, error } = await getSupabase()
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_employee_id', info.employeeId)
        .is('read_at', null);
      if (error) return 0;
      return count ?? 0;
    },

    async markRead(id) {
      const info = await requireRole();
      if (!info.employeeId) return;
      const { error } = await getSupabase()
        .from('notifications')
        .update({ read_at: nowISO() })
        .eq('id', id)
        .eq('recipient_employee_id', info.employeeId);
      if (error) wrap(error, 'Gagal menandai notifikasi');
    },

    async markAllRead() {
      const info = await requireRole();
      if (!info.employeeId) return;
      const { error } = await getSupabase()
        .from('notifications')
        .update({ read_at: nowISO() })
        .eq('recipient_employee_id', info.employeeId)
        .is('read_at', null);
      if (error) wrap(error, 'Gagal menandai notifikasi');
    },
  },

  // ------------------------------------------------------------- employees
  employees: {
    async list(opts) {
      await requireRole();
      let q = getSupabase().from('employees').select().order('sort_order');
      if (!opts?.includeInactive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat pegawai');
      return ((data ?? []) as EmployeeRow[]).map(toEmployee);
    },
    async create(input, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const { data, error } = await getSupabase()
        .from('employees')
        .insert({
          full_name: input.fullName.trim(),
          display_name: input.displayName.trim(),
          initials: input.initials.trim().toUpperCase(),
          color: input.color,
          nip: input.nip?.trim() || null,
          username: input.username?.trim().toLowerCase() || null,
          position: input.position.trim(),
          team: normalizeTeam(input.team),
          level: input.level ?? 'STAFF',
          supervisor_id: input.supervisorId ?? null,
          sort_order: input.sortOrder ?? 999,
          active: input.active ?? true,
        })
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal menambah pegawai');
      const emp = toEmployee(data as EmployeeRow);
      await auditWrite({
        action: 'CREATE',
        entityType: 'EMPLOYEE',
        entityId: emp.id,
        entityLabel: emp.fullName,
        employeeId,
        after: { fullName: emp.fullName, position: emp.position },
      });
      return emp;
    },
    async update(id, patch, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const row: Record<string, unknown> = { updated_at: nowISO() };
      if (patch.fullName !== undefined) row.full_name = patch.fullName.trim();
      if (patch.displayName !== undefined) row.display_name = patch.displayName.trim();
      if (patch.initials !== undefined) row.initials = patch.initials.trim().toUpperCase();
      if (patch.color !== undefined) row.color = patch.color;
      if (patch.nip !== undefined) row.nip = patch.nip?.trim() || null;
      if (patch.username !== undefined) {
        row.username = patch.username?.trim().toLowerCase() || null;
      }
      if (patch.position !== undefined) row.position = patch.position.trim();
      if (patch.team !== undefined) row.team = normalizeTeam(patch.team);
      if (patch.level !== undefined) row.level = patch.level;
      if (patch.supervisorId !== undefined) row.supervisor_id = patch.supervisorId || null;
      if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
      if (patch.active !== undefined) row.active = patch.active;
      const { data, error } = await getSupabase()
        .from('employees')
        .update(row)
        .eq('id', id)
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal memperbarui pegawai');
      const emp = toEmployee(data as EmployeeRow);
      await auditWrite({
        action: 'UPDATE',
        entityType: 'EMPLOYEE',
        entityId: id,
        entityLabel: emp.fullName,
        employeeId,
        after: patch,
      });
      return emp;
    },
    async setActive(id, active, ctx) {
      return supabaseAdapter.employees.update(id, { active }, ctx);
    },
    async reorder(orderedIds, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const sb = getSupabase();
      await Promise.all(
        orderedIds.map((id, i) => sb.from('employees').update({ sort_order: i }).eq('id', id)),
      );
      await auditWrite({
        action: 'UPDATE',
        entityType: 'EMPLOYEE',
        entityLabel: 'Urutan pegawai diubah',
        employeeId,
        after: { orderedIds },
      });
    },
    async setPhoto(id, photo, ctx) {
      // Admin bebas; pegawai hanya boleh mengganti fotonya sendiri (RLS + trigger
      // employees_guard_self_update menegakkan hal yang sama di server).
      const info = await requireWrite();
      if (info.role !== 'ADMIN' && info.employeeId !== id) {
        throw new ForbiddenError('Anda hanya dapat mengganti foto profil Anda sendiri.');
      }
      const employeeId = await assertActor(ctx);
      if (photo.size <= 0) throw new ValidationError('Berkas foto kosong.');
      if (photo.size > 300 * 1024) {
        throw new ValidationError('Ukuran foto maksimal 300 KB setelah kompresi.');
      }
      const sb = getSupabase();
      const { data: prevRow, error: prevErr } = await sb
        .from('employees')
        .select()
        .eq('id', id)
        .single();
      if (prevErr || !prevRow) wrap(prevErr, 'Pegawai tidak ditemukan');
      const prev = toEmployee(prevRow as EmployeeRow);
      const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/jpeg' ? 'jpg' : 'webp';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await sb.storage.from('employee-photos').upload(path, photo, {
        contentType: photo.type || 'image/webp',
        upsert: false,
      });
      if (upErr) throw new StorageError(`Gagal mengunggah foto: ${upErr.message}`);
      const { data, error } = await sb
        .from('employees')
        .update({ avatar_path: path, avatar_updated_at: nowISO(), updated_at: nowISO() })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) {
        await sb.storage
          .from('employee-photos')
          .remove([path])
          .catch(() => undefined);
        wrap(error, 'Gagal menyimpan foto pegawai');
      }
      // Hapus foto lama setelah foto baru tersimpan (aman bila gagal).
      if (prev.avatarPath && prev.avatarPath !== path) {
        await sb.storage
          .from('employee-photos')
          .remove([prev.avatarPath])
          .catch(() => undefined);
      }
      const emp = toEmployee(data as EmployeeRow);
      await auditWrite({
        action: 'UPDATE',
        entityType: 'EMPLOYEE',
        entityId: id,
        entityLabel: `Foto profil ${emp.fullName} diperbarui`,
        employeeId,
        after: { avatarPath: path },
      });
      return emp;
    },
    async removePhoto(id, ctx) {
      const info = await requireWrite();
      if (info.role !== 'ADMIN' && info.employeeId !== id) {
        throw new ForbiddenError('Anda hanya dapat menghapus foto profil Anda sendiri.');
      }
      const employeeId = await assertActor(ctx);
      const sb = getSupabase();
      const { data: prevRow, error: prevErr } = await sb
        .from('employees')
        .select()
        .eq('id', id)
        .single();
      if (prevErr || !prevRow) wrap(prevErr, 'Pegawai tidak ditemukan');
      const prev = toEmployee(prevRow as EmployeeRow);
      const { data, error } = await sb
        .from('employees')
        .update({ avatar_path: null, avatar_updated_at: nowISO(), updated_at: nowISO() })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal menghapus foto pegawai');
      if (prev.avatarPath) {
        await sb.storage
          .from('employee-photos')
          .remove([prev.avatarPath])
          .catch(() => undefined);
      }
      const emp = toEmployee(data as EmployeeRow);
      await auditWrite({
        action: 'UPDATE',
        entityType: 'EMPLOYEE',
        entityId: id,
        entityLabel: `Foto profil ${emp.fullName} dihapus`,
        employeeId,
        before: { avatarPath: prev.avatarPath },
      });
      return emp;
    },
    async photoUrls(paths) {
      await requireRole();
      const unique = [...new Set(paths.filter(Boolean))];
      if (unique.length === 0) return {};
      const { data, error } = await getSupabase()
        .storage.from('employee-photos')
        .createSignedUrls(unique, 3600);
      if (error) return {};
      const map: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl && !item.error) map[item.path] = item.signedUrl;
      }
      return map;
    },
  },

  // ----------------------------------------------------------------- board
  board: {
    async get() {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('board')
        .select()
        .eq('id', 'board-utama')
        .single();
      if (error || !data) wrap(error, 'Gagal memuat board');
      return toBoard(data as BoardRow);
    },
    async rename(title, expectedVersion, ctx) {
      await requireRole();
      const employeeId = await assertActor(ctx);
      const trimmed = title.trim();
      if (!trimmed) throw new ValidationError('Judul board tidak boleh kosong.');
      const { data, error } = await getSupabase()
        .from('board')
        .update({ title: trimmed, updated_at: nowISO(), version: expectedVersion + 1 })
        .eq('id', 'board-utama')
        .eq('version', expectedVersion)
        .select();
      if (error) wrap(error, 'Gagal mengubah judul board');
      const row = (data as BoardRow[] | null)?.[0];
      if (!row) throw new ConflictError();
      await auditWrite({
        action: 'UPDATE',
        entityType: 'BOARD',
        entityId: 'board-utama',
        entityLabel: trimmed,
        employeeId,
        after: { title: trimmed },
      });
      return toBoard(row);
    },
    async listSteps(opts) {
      await requireRole();
      let q = getSupabase().from('steps').select().order('sort_order');
      if (!opts?.includeDeleted) q = q.is('deleted_at', null);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat step');
      return ((data ?? []) as StepRow[]).map(toStep);
    },
    async createStep(input, ctx) {
      await requireRole();
      const employeeId = await assertActor(ctx);
      const name = input.name.trim();
      if (!name) throw new ValidationError('Nama step tidak boleh kosong.');
      const { data, error } = await getSupabase()
        .from('steps')
        .insert({
          board_id: 'board-utama',
          name,
          kind: input.kind ?? 'NORMAL',
          color: input.color ?? '#94a3b8',
          sort_order: 999,
        })
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal menambah step');
      const step = toStep(data as StepRow);
      await auditWrite({
        action: 'CREATE',
        entityType: 'STEP',
        entityId: step.id,
        entityLabel: name,
        employeeId,
      });
      return step;
    },
    async updateStep(id, patch, expectedVersion, ctx) {
      await requireRole();
      const employeeId = await assertActor(ctx);
      const row: Record<string, unknown> = { version: expectedVersion + 1 };
      if (patch.name !== undefined) row.name = patch.name.trim();
      if (patch.kind !== undefined) row.kind = patch.kind;
      if (patch.color !== undefined) row.color = patch.color;
      const { data, error } = await getSupabase()
        .from('steps')
        .update(row)
        .eq('id', id)
        .eq('version', expectedVersion)
        .select();
      if (error) wrap(error, 'Gagal memperbarui step');
      const updated = (data as StepRow[] | null)?.[0];
      if (!updated) throw new ConflictError();
      const step = toStep(updated);
      await auditWrite({
        action: 'UPDATE',
        entityType: 'STEP',
        entityId: id,
        entityLabel: step.name,
        employeeId,
        after: patch,
      });
      return step;
    },
    async reorderSteps(orderedIds, ctx) {
      await requireRole();
      const employeeId = await assertActor(ctx);
      const sb = getSupabase();
      await Promise.all(
        orderedIds.map((id, i) => sb.from('steps').update({ sort_order: i }).eq('id', id)),
      );
      await auditWrite({
        action: 'UPDATE',
        entityType: 'STEP',
        entityLabel: 'Urutan step diubah',
        employeeId,
        after: { orderedIds },
      });
    },
    async deleteStep(id, opts, ctx) {
      await requireRole();
      const employeeId = await assertActor(ctx);
      const { error } = await getSupabase().rpc('delete_step_safe', {
        p_step_id: id,
        p_move_to: opts.moveCardsToStepId ?? null,
      });
      if (error) wrap(error, 'Gagal menghapus step');
      await auditWrite({
        action: 'SOFT_DELETE',
        entityType: 'STEP',
        entityId: id,
        entityLabel: 'Step dihapus (soft delete)',
        employeeId,
        after: opts.moveCardsToStepId ? { moveCardsTo: opts.moveCardsToStepId } : null,
      });
    },
    async restoreStep(id, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const { data, error } = await getSupabase()
        .from('steps')
        .update({ deleted_at: null, sort_order: 999 })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal memulihkan step');
      const step = toStep(data as StepRow);
      await auditWrite({
        action: 'RESTORE',
        entityType: 'STEP',
        entityId: id,
        entityLabel: step.name,
        employeeId,
      });
      return step;
    },
  },

  // ----------------------------------------------------------------- tasks
  tasks: {
    async list(opts) {
      await requireRole();
      let q = getSupabase().from('tasks').select().order('sort_order');
      if (!opts?.includeDeleted) q = q.is('deleted_at', null);
      if (!opts?.includeArchived) q = q.is('archived_at', null);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat pekerjaan');
      return ((data ?? []) as TaskRow[]).map(toTask);
    },
    async listForEmployeeProfile(employeeId, opts) {
      await requireRole();
      const { data, error } = await getSupabase().rpc('employee_profile_tasks', {
        p_employee_id: employeeId,
        p_filter: opts.filter,
        p_page: opts.page,
        p_today: opts.today,
      });
      if (error) wrap(error, 'Gagal memuat pekerjaan profil');
      const result = data as ProfileTaskRpcResult | null;
      if (!result) throw new NotFoundError('Data pekerjaan profil tidak ditemukan.');
      return {
        ...result,
        pageSize: 10 as const,
        items: (result.items ?? []).map(toTask),
      };
    },
    async get(id) {
      await requireRole();
      const { data, error } = await getSupabase().from('tasks').select().eq('id', id).maybeSingle();
      if (error) wrap(error, 'Gagal memuat pekerjaan');
      if (!data) throw new NotFoundError();
      return toTask(data as TaskRow);
    },
    async create(input, ctx) {
      const info = await requireWrite();
      const employeeId = await assertActor(ctx);
      const title = input.title.trim();
      if (!title) throw new ValidationError('Judul pekerjaan tidak boleh kosong.');
      // Pemilik pekerjaan = pembuat. Staf hanya boleh membuat pekerjaan mandiri
      // untuk dirinya; aturan ini ditegakkan ulang oleh RLS (policy tasks insert).
      const taskType = input.taskType ?? 'MANDIRI';
      const { data, error } = await getSupabase()
        .from('tasks')
        .insert({
          board_id: 'board-utama',
          step_id: input.stepId,
          title,
          activity_plan: input.activityPlan ?? '',
          description: input.description ?? '',
          duration_type: input.durationType,
          category_id: input.categoryId ?? null,
          label_ids: input.labelIds ?? [],
          priority: input.priority,
          start_date: input.startDate ?? null,
          due_date: input.dueDate ?? null,
          progress_mode: input.progressMode ?? 'MANUAL',
          manual_progress: input.manualProgress ?? 0,
          ...(() => {
            const mains = input.picMainIds ?? (input.picMainId ? [input.picMainId] : []);
            return {
              pic_main_ids: mains,
              pic_main_id: mains[0] ?? null,
              pic_ids: (input.picIds ?? []).filter((p) => !mains.includes(p)),
            };
          })(),
          checklist: input.checklist ?? [],
          is_focus: input.isFocus ?? false,
          sort_order: 9999,
          created_by_employee_id: employeeId,
          updated_by_employee_id: employeeId,
          owner_employee_id: employeeId,
          task_type: taskType,
          disposed_by_employee_id: taskType === 'DISPOSISI' ? employeeId : null,
        })
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal membuat pekerjaan');
      const task = toTask(data as TaskRow);
      await auditWrite({
        action: taskType === 'DISPOSISI' ? 'DISPOSE' : 'CREATE',
        entityType: 'TASK',
        entityId: task.id,
        entityLabel: title,
        employeeId,
        after: {
          stepId: task.stepId,
          priority: task.priority,
          taskType,
          picMainIds: task.picMainIds,
          memberIds: task.picIds,
          accountType: info.role,
        },
      });
      return task;
    },
    async update(id, patch: TaskPatch, expectedVersion, ctx) {
      await requireWrite();
      const employeeId = await assertActor(ctx);
      const row: Record<string, unknown> = {
        updated_at: nowISO(),
        updated_by_employee_id: employeeId,
        version: expectedVersion + 1,
      };
      if (patch.title !== undefined) row.title = patch.title.trim();
      if (patch.description !== undefined) row.description = patch.description;
      if (patch.activityPlan !== undefined) row.activity_plan = patch.activityPlan;
      if (patch.durationType !== undefined) row.duration_type = patch.durationType;
      if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
      if (patch.labelIds !== undefined) row.label_ids = patch.labelIds;
      if (patch.priority !== undefined) row.priority = patch.priority;
      if (patch.startDate !== undefined) row.start_date = patch.startDate;
      if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
      if (patch.progressMode !== undefined) row.progress_mode = patch.progressMode;
      if (patch.manualProgress !== undefined) row.manual_progress = patch.manualProgress;
      if (patch.picMainIds !== undefined || patch.picMainId !== undefined) {
        const mains = patch.picMainIds ?? (patch.picMainId ? [patch.picMainId] : []);
        row.pic_main_ids = mains;
        row.pic_main_id = mains[0] ?? null;
      }
      if (patch.picIds !== undefined) {
        const mains = (row.pic_main_ids as string[] | undefined) ?? null;
        row.pic_ids = mains ? patch.picIds.filter((p) => !mains.includes(p)) : patch.picIds;
      }
      if (patch.checklist !== undefined) row.checklist = patch.checklist;
      if (patch.isFocus !== undefined) row.is_focus = patch.isFocus;
      if (patch.ownerEmployeeId !== undefined) row.owner_employee_id = patch.ownerEmployeeId;
      if (patch.taskType !== undefined) row.task_type = patch.taskType;
      const { data, error } = await getSupabase()
        .from('tasks')
        .update(row)
        .eq('id', id)
        .eq('version', expectedVersion)
        .select();
      if (error) wrap(error, 'Gagal memperbarui pekerjaan');
      const updated = (data as TaskRow[] | null)?.[0];
      if (!updated) throw new ConflictError();
      const task = toTask(updated);
      await auditWrite({
        action: 'UPDATE',
        entityType: 'TASK',
        entityId: id,
        entityLabel: task.title,
        employeeId,
        after: patch,
      });
      return task;
    },
    async move(id, to, ctx) {
      await requireRole();
      const employeeId = await assertActor(ctx);
      const before = await supabaseAdapter.tasks.get(id);
      const { data, error } = await getSupabase().rpc('move_task', {
        p_task_id: id,
        p_step_id: to.stepId,
        p_index: to.index,
      });
      if (error) wrap(error, 'Gagal memindahkan kartu');
      const task = toTask(data as TaskRow);
      if (before.stepId !== to.stepId) {
        const steps = await supabaseAdapter.board.listSteps({ includeDeleted: true });
        const fromStep = steps.find((s: Step) => s.id === before.stepId);
        const toStepRow = steps.find((s: Step) => s.id === to.stepId);
        await auditWrite({
          action: 'MOVE',
          entityType: 'TASK',
          entityId: id,
          entityLabel: task.title,
          employeeId,
          before: { step: fromStep?.name ?? '?' },
          after: { step: toStepRow?.name ?? '?', stepKind: toStepRow?.kind },
        });
      }
      return task;
    },
    async archive(id, ctx) {
      return setTaskFlag(id, { archived_at: nowISO() }, 'ARCHIVE', ctx);
    },
    async unarchive(id, ctx) {
      return setTaskFlag(id, { archived_at: null }, 'UNARCHIVE', ctx);
    },
    async softDelete(id, reason, ctx) {
      const trimmed = reason.trim();
      if (!trimmed) throw new ValidationError('Alasan penghapusan wajib diisi.');
      await setTaskFlag(id, { deleted_at: nowISO(), delete_reason: trimmed }, 'SOFT_DELETE', ctx);
    },
    async restore(id, ctx) {
      await requireAdmin();
      return setTaskFlag(id, { deleted_at: null, delete_reason: null }, 'RESTORE', ctx);
    },
    async permanentDelete(id, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const task = await supabaseAdapter.tasks.get(id);
      // Hapus berkas lampiran di storage lebih dulu.
      const attachments = await supabaseAdapter.attachments.list(id);
      const sb = getSupabase();
      if (attachments.length > 0) {
        const { data: rows } = await sb
          .from('attachments')
          .select('storage_path')
          .eq('task_id', id);
        const paths = ((rows ?? []) as Array<{ storage_path: string }>).map((r) => r.storage_path);
        if (paths.length > 0) await sb.storage.from('lampiran').remove(paths);
      }
      const { error } = await sb.from('tasks').delete().eq('id', id);
      if (error) wrap(error, 'Gagal menghapus permanen');
      await auditWrite({
        action: 'PERMANENT_DELETE',
        entityType: 'TASK',
        entityId: id,
        entityLabel: task.title,
        employeeId,
      });
    },
    async listComments(taskId) {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('task_comments')
        .select()
        .eq('task_id', taskId)
        .order('created_at');
      if (error) wrap(error, 'Gagal memuat catatan');
      return ((data ?? []) as CommentRow[]).map(toComment);
    },
    async listAllComments() {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('task_comments')
        .select()
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) wrap(error, 'Gagal memuat catatan');
      return ((data ?? []) as CommentRow[]).map(toComment);
    },
    async addComment(taskId, type, text, ctx) {
      await requireRole();
      const employeeId = await assertActor(ctx);
      const trimmed = text.trim();
      if (!trimmed) throw new ValidationError('Isi catatan tidak boleh kosong.');
      const { data, error } = await getSupabase()
        .from('task_comments')
        .insert({ task_id: taskId, type, text: trimmed, employee_id: employeeId })
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal menambah catatan');
      await auditWrite({
        action: 'CREATE',
        entityType: 'COMMENT',
        entityId: taskId,
        entityLabel: `Catatan (${type}) ditambahkan`,
        employeeId,
        after: { type, text: trimmed.slice(0, 200) },
      });
      return toComment(data as CommentRow);
    },
    async history(taskId) {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('audit_log')
        .select()
        .eq('entity_id', taskId)
        .order('at', { ascending: false })
        .limit(200);
      // Catatan: RLS membatasi baca audit ke Admin; untuk riwayat per-kartu,
      // policy tambahan dapat dibuka bila dibutuhkan User (lihat DEPLOYMENT.md).
      if (error) return [];
      return ((data ?? []) as AuditRow[]).map(toAudit);
    },
  },

  // ----------------------------------------------------------- attachments
  attachments: {
    async list(taskId) {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('attachments')
        .select()
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) wrap(error, 'Gagal memuat lampiran');
      return ((data ?? []) as AttachmentRow[]).map(toAttachment);
    },
    async upload(taskId, file, ctx) {
      await requireRole();
      const employeeId = await assertActor(ctx);
      const settings = await supabaseAdapter.settings.get();
      const name = sanitizeFileName(file.name);
      const ext = fileExtension(name);
      const BLOCKED = new Set([
        'exe',
        'bat',
        'cmd',
        'com',
        'msi',
        'scr',
        'pif',
        'sh',
        'ps1',
        'psm1',
        'js',
        'mjs',
        'vbs',
        'vbe',
        'wsf',
        'jar',
        'apk',
        'app',
        'dll',
        'so',
        'dylib',
      ]);
      if (BLOCKED.has(ext)) throw new ValidationError('Berkas executable tidak diizinkan.');
      if (!ext || !settings.attachmentAllowedExt.includes(ext)) {
        throw new ValidationError(`Tipe berkas .${ext || '?'} tidak diizinkan.`);
      }
      if (file.size <= 0 || file.size > settings.attachmentMaxMB * 1024 * 1024) {
        throw new ValidationError(`Ukuran berkas melebihi batas ${settings.attachmentMaxMB} MB.`);
      }
      const id = uid('att');
      const path = `${taskId}/${id}-${name}`;
      const sb = getSupabase();
      const { error: upErr } = await sb.storage.from('lampiran').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (upErr) throw new StorageError(`Unggah gagal: ${upErr.message}`);
      const { data, error } = await sb
        .from('attachments')
        .insert({
          task_id: taskId,
          file_name: name,
          size: file.size,
          mime_type: file.type || 'application/octet-stream',
          storage_path: path,
          uploaded_by_employee_id: employeeId,
        })
        .select()
        .single();
      if (error || !data) {
        await sb.storage.from('lampiran').remove([path]);
        wrap(error, 'Gagal menyimpan metadata lampiran');
      }
      await auditWrite({
        action: 'CREATE',
        entityType: 'ATTACHMENT',
        entityId: taskId,
        entityLabel: `Lampiran "${name}"`,
        employeeId,
        after: { fileName: name, size: file.size },
      });
      return toAttachment(data as AttachmentRow);
    },
    async getDownloadUrl(id) {
      await requireRole();
      const sb = getSupabase();
      const { data, error } = await sb
        .from('attachments')
        .select('storage_path')
        .eq('id', id)
        .maybeSingle();
      if (error || !data) throw new NotFoundError('Lampiran tidak ditemukan.');
      const { data: signed, error: signErr } = await sb.storage
        .from('lampiran')
        .createSignedUrl((data as { storage_path: string }).storage_path, 120);
      if (signErr || !signed) throw new StorageError('Gagal membuat tautan unduhan.');
      return signed.signedUrl;
    },
    async remove(id, ctx) {
      await requireRole();
      const employeeId = await assertActor(ctx);
      const sb = getSupabase();
      const { data } = await sb.from('attachments').select().eq('id', id).maybeSingle();
      if (!data) return;
      const row = data as AttachmentRow;
      await sb.storage.from('lampiran').remove([row.storage_path]);
      const { error } = await sb.from('attachments').delete().eq('id', id);
      if (error) wrap(error, 'Gagal menghapus lampiran');
      await auditWrite({
        action: 'PERMANENT_DELETE',
        entityType: 'ATTACHMENT',
        entityId: row.task_id,
        entityLabel: `Lampiran "${row.file_name}" dihapus`,
        employeeId,
      });
    },

    // ------- Lampiran berkelompok + riwayat versi (Drive / Supabase Storage) --
    // Unggah & penghapusan berkas SELALU lewat endpoint server: token Google
    // dan service role tidak pernah tersedia di frontend.
    async listGroups(taskId, opts) {
      await requireRole();
      let q = getSupabase()
        .from('attachment_groups')
        .select('*, attachment_versions(*)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (!opts?.includeDeleted) q = q.is('deleted_at', null);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat lampiran');
      const groups = ((data ?? []) as AttachmentGroupRow[]).map(toAttachmentGroup);
      return opts?.includeDeleted
        ? groups
        : groups.map((g) => ({ ...g, versions: g.versions.filter((v) => !v.deletedAt) }));
    },

    async countsByTask(): Promise<Record<string, number>> {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('attachment_groups')
        .select('task_id')
        .is('deleted_at', null);
      if (error) return {};
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { task_id: string }[]) {
        counts[row.task_id] = (counts[row.task_id] ?? 0) + 1;
      }
      return counts;
    },

    async createGroup(taskId, input, ctx): Promise<AttachmentGroup> {
      await requireWrite();
      await assertActor(ctx);
      const title = input.title.trim();
      if (!title) throw new ValidationError('Judul lampiran wajib diisi.');
      const form = new FormData();
      form.set('action', 'createGroup');
      form.set('taskId', taskId);
      form.set('title', title);
      form.set('changeNote', input.changeNote ?? '');
      form.set('file', input.file, input.file.name);
      await postAttachmentForm(form);
      const groups = await supabaseAdapter.attachments.listGroups(taskId);
      const created = groups.find((g) => g.title === title) ?? groups[groups.length - 1];
      if (!created) throw new StorageError('Lampiran tersimpan tetapi gagal dimuat ulang.');
      return created;
    },

    async addVersion(groupId, input, ctx): Promise<AttachmentGroup> {
      await requireWrite();
      await assertActor(ctx);
      const form = new FormData();
      form.set('action', 'addVersion');
      form.set('groupId', groupId);
      form.set('changeNote', input.changeNote ?? '');
      form.set('file', input.file, input.file.name);
      await postAttachmentForm(form);
      const { data } = await getSupabase()
        .from('attachment_groups')
        .select('*, attachment_versions(*)')
        .eq('id', groupId)
        .maybeSingle();
      if (!data) throw new NotFoundError('Lampiran tidak ditemukan.');
      return toAttachmentGroup(data as AttachmentGroupRow);
    },

    async versionDownloadUrl(versionId) {
      await requireRole();
      // Unduhan diproksikan server (URL berkas asli tidak pernah dibagikan).
      return `/api/attachments/download?versionId=${encodeURIComponent(versionId)}`;
    },

    async softDeleteVersion(versionId, ctx) {
      await requireWrite();
      await assertActor(ctx);
      await postAttachmentJson({ action: 'softDeleteVersion', versionId, confirmLast: 'true' });
    },

    async restoreVersion(versionId, ctx) {
      await requireWrite();
      await assertActor(ctx);
      await postAttachmentJson({ action: 'restoreVersion', versionId });
    },

    async softDeleteGroup(groupId, ctx) {
      await requireWrite();
      await assertActor(ctx);
      await postAttachmentJson({ action: 'softDeleteGroup', groupId });
    },

    async restoreGroup(groupId, ctx) {
      await requireWrite();
      await assertActor(ctx);
      await postAttachmentJson({ action: 'restoreGroup', groupId });
    },

    async permanentDeleteGroup(groupId, ctx) {
      await requireAdmin();
      await assertActor(ctx);
      await postAttachmentJson({ action: 'permanentDeleteGroup', groupId });
    },
  },

  // -------------------------------------------------------------- taxonomy
  taxonomy: {
    async listCategories(opts) {
      await requireRole();
      let q = getSupabase().from('categories').select().order('sort_order');
      if (!opts?.includeInactive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat kategori');
      return ((data ?? []) as TaxonomyRow[]).map(toTaxonomy);
    },
    async saveCategory(input, ctx) {
      return saveTaxonomy('categories', 'CATEGORY', input, ctx);
    },
    async reorderCategories(orderedIds, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const sb = getSupabase();
      await Promise.all(
        orderedIds.map((id, i) => sb.from('categories').update({ sort_order: i }).eq('id', id)),
      );
      await auditWrite({
        action: 'UPDATE',
        entityType: 'CATEGORY',
        entityLabel: 'Urutan kategori diubah',
        employeeId,
        after: { orderedIds },
      });
    },
    async listLabels(opts) {
      await requireRole();
      let q = getSupabase().from('labels').select().order('sort_order');
      if (!opts?.includeInactive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat label');
      return ((data ?? []) as TaxonomyRow[]).map(toTaxonomy);
    },
    async saveLabel(input, ctx) {
      return saveTaxonomy('labels', 'LABEL', input, ctx);
    },
    async reorderLabels(orderedIds, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const sb = getSupabase();
      await Promise.all(
        orderedIds.map((id, i) => sb.from('labels').update({ sort_order: i }).eq('id', id)),
      );
      await auditWrite({
        action: 'UPDATE',
        entityType: 'LABEL',
        entityLabel: 'Urutan label diubah',
        employeeId,
        after: { orderedIds },
      });
    },
  },

  // -------------------------------------------------------------- templates
  templates: {
    async list(opts) {
      await requireRole();
      let q = getSupabase().from('templates').select().order('sort_order');
      if (!opts?.includeInactive) q = q.eq('active', true);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat template');
      return ((data ?? []) as TemplateRow[]).map(toTemplate);
    },
    async save(input, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const row = {
        name: input.name.trim(),
        title: input.title.trim(),
        description: input.description,
        category_id: input.categoryId,
        label_ids: input.labelIds,
        duration_type: input.durationType,
        priority: input.priority,
        initial_step_id: input.initialStepId,
        target_offset_days: input.targetOffsetDays,
        checklist: input.checklist,
        active: input.active,
        updated_at: nowISO(),
      };
      const sb = getSupabase();
      const query = input.id
        ? sb.from('templates').update(row).eq('id', input.id).select().single()
        : sb.from('templates').insert(row).select().single();
      const { data, error } = await query;
      if (error || !data) wrap(error, 'Gagal menyimpan template');
      const tpl = toTemplate(data as TemplateRow);
      await auditWrite({
        action: input.id ? 'UPDATE' : 'CREATE',
        entityType: 'TEMPLATE',
        entityId: tpl.id,
        entityLabel: tpl.name,
        employeeId,
      });
      return tpl;
    },
    async remove(id, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const { error } = await getSupabase().from('templates').delete().eq('id', id);
      if (error) wrap(error, 'Gagal menghapus template');
      await auditWrite({
        action: 'PERMANENT_DELETE',
        entityType: 'TEMPLATE',
        entityId: id,
        entityLabel: 'Template dihapus',
        employeeId,
      });
    },
    async reorder(orderedIds, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const sb = getSupabase();
      await Promise.all(
        orderedIds.map((id, i) => sb.from('templates').update({ sort_order: i }).eq('id', id)),
      );
      await auditWrite({
        action: 'UPDATE',
        entityType: 'TEMPLATE',
        entityLabel: 'Urutan template diubah',
        employeeId,
        after: { orderedIds },
      });
    },
  },

  // ------------------------------------------------------------ distribution
  distribution: {
    async getActive(year, period) {
      await requireRole();
      let q = getSupabase()
        .from('distribution_snapshots')
        .select()
        .eq('status', 'ACTIVE')
        .order('activated_at', { ascending: false })
        .limit(1);
      if (year !== undefined) q = q.eq('year', year);
      if (period !== undefined) q = q.eq('period', period);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat data penyaluran');
      const row = (data as SnapshotRow[] | null)?.[0];
      return row ? toSnapshot(row) : null;
    },
    async list() {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('distribution_snapshots')
        .select()
        .order('year', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) wrap(error, 'Gagal memuat histori penyaluran');
      return ((data ?? []) as SnapshotRow[]).map(toSnapshot);
    },
    async get(id) {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('distribution_snapshots')
        .select()
        .eq('id', id)
        .maybeSingle();
      if (error || !data) throw new NotFoundError('Snapshot tidak ditemukan.');
      return toSnapshot(data as SnapshotRow);
    },
    async createDraft(input, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const errors = [...validateScope(input.year, input.period), ...validateRows(input.rows)];
      if (errors.length > 0) throw new ValidationError(errors[0] ?? 'Data tidak valid.');
      const { data, error } = await getSupabase()
        .from('distribution_snapshots')
        .insert({
          year: input.year,
          period: input.period.trim(),
          status: 'DRAFT',
          rows: input.rows,
          source_file_name: input.sourceFileName ?? null,
          note: input.note ?? null,
          created_by_employee_id: employeeId,
        })
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal menyimpan draft');
      const snap = toSnapshot(data as SnapshotRow);
      await auditWrite({
        action: 'IMPORT',
        entityType: 'SNAPSHOT',
        entityId: snap.id,
        entityLabel: `Penyaluran ${snap.year} · ${snap.period}`,
        employeeId,
        after: { fileName: snap.sourceFileName, rows: snap.rows.length },
      });
      return snap;
    },
    async activate(id, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const { data, error } = await getSupabase().rpc('activate_snapshot', { p_id: id });
      if (error) wrap(error, 'Gagal mengaktifkan snapshot');
      const snap = toSnapshot(data as SnapshotRow);
      await auditWrite({
        action: 'ACTIVATE',
        entityType: 'SNAPSHOT',
        entityId: id,
        entityLabel: `Penyaluran ${snap.year} · ${snap.period}`,
        employeeId,
        after: { status: 'ACTIVE' },
      });
      return snap;
    },
    async deactivate(id, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const { data, error } = await getSupabase()
        .from('distribution_snapshots')
        .update({ status: 'DRAFT', activated_at: null, updated_at: nowISO() })
        .eq('id', id)
        .eq('status', 'ACTIVE')
        .select();
      if (error) wrap(error, 'Gagal membatalkan aktivasi');
      const row = (data as SnapshotRow[] | null)?.[0];
      if (!row)
        throw new ValidationError('Hanya snapshot aktif yang dapat dibatalkan aktivasinya.');
      const snap = toSnapshot(row);
      await auditWrite({
        action: 'DEACTIVATE',
        entityType: 'SNAPSHOT',
        entityId: id,
        entityLabel: `Penyaluran ${snap.year} · ${snap.period}`,
        employeeId,
      });
      return snap;
    },
    async correct(id, rows, reason, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      if (!reason.trim()) throw new ValidationError('Alasan koreksi wajib diisi.');
      const rowErrors = validateRows(rows);
      if (rowErrors.length > 0)
        throw new ValidationError(rowErrors[0] ?? 'Data koreksi tidak valid.');
      const source = await supabaseAdapter.distribution.get(id);
      const corrected = await supabaseAdapter.distribution.createDraft(
        {
          year: source.year,
          period: source.period,
          rows,
          sourceFileName: source.sourceFileName,
          note: `Koreksi manual: ${reason.trim()}`,
        },
        ctx,
      );
      await auditWrite({
        action: 'CORRECTION',
        entityType: 'SNAPSHOT',
        entityId: corrected.id,
        entityLabel: `Penyaluran ${corrected.year} · ${corrected.period}`,
        employeeId,
        before: { sourceSnapshotId: id },
        after: { reason: reason.trim() },
      });
      if (source.status === 'ACTIVE') {
        return supabaseAdapter.distribution.activate(corrected.id, ctx);
      }
      return corrected;
    },
    async remove(id, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const snap = await supabaseAdapter.distribution.get(id);
      if (snap.status === 'ACTIVE') {
        throw new ValidationError('Snapshot aktif tidak dapat dihapus. Batalkan aktivasi dahulu.');
      }
      const { error } = await getSupabase().from('distribution_snapshots').delete().eq('id', id);
      if (error) wrap(error, 'Gagal menghapus snapshot');
      await auditWrite({
        action: 'PERMANENT_DELETE',
        entityType: 'SNAPSHOT',
        entityId: id,
        entityLabel: `Penyaluran ${snap.year} · ${snap.period}`,
        employeeId,
      });
    },
    async listSkRecords(opts) {
      await requireRole();
      let q = getSupabase()
        .from('pip_progress_records')
        .select('jenjang, sk_nomor, sk_tanggal, jumlah_siswa, jumlah_dana')
        .is('deleted_at', null);
      if (opts?.year !== undefined) q = q.eq('source_year', opts.year);
      if (opts?.sourceId !== undefined) q = q.eq('source_id', opts.sourceId);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat data SK Pemberian');
      const valid = new Set<string>(['SD', 'SMP', 'SMA', 'SMK']);
      return (
        (data ?? []) as Array<{
          jenjang: string;
          sk_nomor: string | null;
          sk_tanggal: string | null;
          jumlah_siswa: number | null;
          jumlah_dana: number | string | null;
        }>
      )
        .filter((r) => valid.has(r.jenjang))
        .map((r) => ({
          jenjang: r.jenjang as PipSkRecord['jenjang'],
          skNomor: r.sk_nomor ?? '',
          skTanggal: r.sk_tanggal,
          jumlahSiswa: Number(r.jumlah_siswa ?? 0),
          jumlahDana: Number(r.jumlah_dana ?? 0),
        }));
    },
    async listScopes() {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('distribution_snapshots')
        .select('year, period');
      if (error) wrap(error, 'Gagal memuat scope');
      const seen = new Set<string>();
      const scopes: { year: number; period: string }[] = [];
      for (const r of (data ?? []) as Array<{ year: number; period: string }>) {
        const key = `${r.year}|${r.period}`;
        if (!seen.has(key)) {
          seen.add(key);
          scopes.push(r);
        }
      }
      return scopes.sort((a, b) => b.year - a.year || a.period.localeCompare(b.period));
    },
  },

  // ------------------------------------------------------------ integrations
  integrations: {
    async listSources(opts) {
      await requireRole();
      let q = getSupabase()
        .from('spreadsheet_sources')
        .select()
        .order('year', { ascending: false });
      if (!opts?.includeDeleted) q = q.is('deleted_at', null);
      if (!opts?.includeInactive) q = q.or('is_active.eq.true,deleted_at.not.is.null');
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat sumber spreadsheet');
      return ((data ?? []) as SourceRow[]).map(toSource);
    },
    async saveSource(input, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const name = input.name.trim();
      if (!name) throw new ValidationError('Nama sumber wajib diisi.');
      const spreadsheetId = extractSheetId(input.spreadsheetUrl);
      if (!spreadsheetId) {
        throw new ValidationError('URL/ID spreadsheet tidak valid. Tempel tautan Google Sheets.');
      }
      const sb = getSupabase();
      const row: Record<string, unknown> = {
        source_type: input.sourceType,
        year: input.year,
        name,
        spreadsheet_url: input.spreadsheetUrl.trim(),
        spreadsheet_id: spreadsheetId,
        updated_by_employee_id: employeeId,
        updated_at: nowISO(),
      };
      if (input.isActive !== undefined) row.is_active = input.isActive;
      if (input.syncMode !== undefined) row.sync_mode = input.syncMode;
      let data: SourceRow | null;
      if (input.id) {
        const res = await sb
          .from('spreadsheet_sources')
          .update(row)
          .eq('id', input.id)
          .select()
          .single();
        if (res.error || !res.data) wrap(res.error, 'Gagal menyimpan sumber');
        data = res.data as SourceRow;
      } else {
        const res = await sb
          .from('spreadsheet_sources')
          .insert({ ...row, created_by_employee_id: employeeId })
          .select()
          .single();
        if (res.error || !res.data) wrap(res.error, 'Gagal menambah sumber');
        data = res.data as SourceRow;
        // Binding bawaan sesuai jenis sumber — mapping menunggu konfirmasi Admin.
        const bindings =
          input.sourceType === 'pip_progress'
            ? [
                { source_id: data.id, binding_type: 'detail_realisasi', sheet_name: 'Pemberian' },
                {
                  source_id: data.id,
                  binding_type: 'allocation_summary',
                  sheet_name: 'REKAP PROGRESS',
                },
              ]
            : [{ source_id: data.id, binding_type: 'activity_rows', sheet_name: 'Sheet1' }];
        await sb.from('spreadsheet_sheet_bindings').insert(bindings);
      }
      const source = toSource(data);
      await auditWrite({
        action: input.id ? 'UPDATE' : 'CREATE',
        entityType: 'SPREADSHEET_SOURCE',
        entityId: source.id,
        entityLabel: `${source.name} (${source.year})`,
        employeeId,
        after: { name: source.name, spreadsheetId: source.spreadsheetId },
      });
      return source;
    },
    async setSourceActive(id, active, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const { data, error } = await getSupabase()
        .from('spreadsheet_sources')
        .update({ is_active: active, updated_at: nowISO(), updated_by_employee_id: employeeId })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal memperbarui sumber');
      const source = toSource(data as SourceRow);
      await auditWrite({
        action: active ? 'ACTIVATE' : 'DEACTIVATE',
        entityType: 'SPREADSHEET_SOURCE',
        entityId: id,
        entityLabel: `${source.name} (${source.year})`,
        employeeId,
      });
      return source;
    },
    async archiveSource(id, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const { data, error } = await getSupabase()
        .from('spreadsheet_sources')
        .update({
          deleted_at: nowISO(),
          is_active: false,
          is_primary: false,
          updated_at: nowISO(),
          updated_by_employee_id: employeeId,
        })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal mengarsipkan sumber');
      const source = toSource(data as SourceRow);
      await auditWrite({
        action: 'SOFT_DELETE',
        entityType: 'SPREADSHEET_SOURCE',
        entityId: id,
        entityLabel: `${source.name} (${source.year})`,
        employeeId,
      });
    },
    async restoreSource(id, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const { data, error } = await getSupabase()
        .from('spreadsheet_sources')
        .update({ deleted_at: null, updated_at: nowISO(), updated_by_employee_id: employeeId })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal memulihkan sumber');
      const source = toSource(data as SourceRow);
      await auditWrite({
        action: 'RESTORE',
        entityType: 'SPREADSHEET_SOURCE',
        entityId: id,
        entityLabel: `${source.name} (${source.year})`,
        employeeId,
      });
      return source;
    },
    async setPrimary(id, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const { data, error } = await getSupabase().rpc('set_primary_source', { p_id: id });
      if (error) wrap(error, 'Gagal menetapkan sumber utama');
      const source = toSource(data as SourceRow);
      await auditWrite({
        action: 'UPDATE',
        entityType: 'SPREADSHEET_SOURCE',
        entityId: id,
        entityLabel: `${source.name} (${source.year}) dijadikan sumber utama`,
        employeeId,
      });
      return source;
    },
    async listBindings(sourceId) {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('spreadsheet_sheet_bindings')
        .select()
        .eq('source_id', sourceId);
      if (error) wrap(error, 'Gagal memuat sheet binding');
      return ((data ?? []) as BindingRow[]).map(toBinding);
    },
    async listMappings(bindingId) {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('spreadsheet_column_mappings')
        .select()
        .eq('binding_id', bindingId);
      if (error) wrap(error, 'Gagal memuat mapping kolom');
      return ((data ?? []) as MappingRow[]).map(toMapping);
    },
    async confirmMapping(sourceId, bindingId, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const sb = getSupabase();
      const { count } = await sb
        .from('spreadsheet_column_mappings')
        .select('id', { count: 'exact', head: true })
        .eq('binding_id', bindingId);
      if (!count) {
        throw new ValidationError(
          'Belum ada header terdeteksi — jalankan tes koneksi/preview terlebih dahulu.',
        );
      }
      const { data, error } = await sb
        .from('spreadsheet_sheet_bindings')
        .update({ mapping_status: 'TERKONFIRMASI' })
        .eq('id', bindingId)
        .eq('source_id', sourceId)
        .select()
        .single();
      if (error || !data) wrap(error, 'Gagal mengonfirmasi mapping');
      const binding = toBinding(data as BindingRow);
      await auditWrite({
        action: 'UPDATE',
        entityType: 'SPREADSHEET_SOURCE',
        entityId: sourceId,
        entityLabel: `Mapping "${binding.sheetName}" dikonfirmasi`,
        employeeId,
      });
      return binding;
    },
    async listSyncRuns(opts) {
      await requireRole();
      let q = getSupabase()
        .from('spreadsheet_sync_runs')
        .select()
        .order('started_at', { ascending: false })
        .limit(opts?.limit ?? 50);
      if (opts?.sourceId) q = q.eq('source_id', opts.sourceId);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat histori sinkronisasi');
      return ((data ?? []) as SyncRunRow[]).map(toSyncRun);
    },
    async googleStatus() {
      await requireRole();
      // Status detail (configured) berasal dari server; fallback ke tabel metadata.
      const viaApi = await callServerApi<GoogleConnectionStatus>(
        'GET',
        '/api/integrations/google/status',
      );
      if (viaApi.ok && viaApi.data) return viaApi.data;
      const { data } = await getSupabase()
        .from('google_oauth_connections')
        .select('id, email, connected_at, last_used_at, token_status')
        .eq('id', 1)
        .maybeSingle();
      const row = (data ?? null) as GoogleConnRow | null;
      return {
        configured: false,
        accessMode: 'none',
        serviceAccountEmail: null,
        connected: Boolean(row?.email),
        email: row?.email ?? null,
        connectedAt: row?.connected_at ?? null,
        lastUsedAt: row?.last_used_at ?? null,
        tokenStatus: row?.token_status ?? null,
      };
    },
    async testConnection(sourceId) {
      await requireAdmin();
      const res = await callServerApi<{ ok: boolean; message: string; sheets?: string[] }>(
        'POST',
        '/api/sync/run',
        { sourceId, mode: 'test' },
      );
      if (!res.ok || !res.data) {
        return {
          ok: false,
          message: res.message ?? 'Integrasi Google belum dikonfigurasi.',
        };
      }
      return res.data;
    },
    async preview(sourceId, bindingId) {
      await requireAdmin();
      const res = await callServerApi<{ headers: string[]; rows: string[][] } | null>(
        'POST',
        '/api/sync/run',
        { sourceId, bindingId, mode: 'preview' },
      );
      if (!res.ok) return null;
      return res.data ?? null;
    },
    async syncNow(sourceId, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const res = await callServerApi<SyncRunRow>('POST', '/api/sync/run', {
        sourceId,
        mode: 'sync',
        employeeActorId: employeeId,
      });
      if (!res.ok || !res.data) {
        throw new AppError(
          'UNAVAILABLE',
          res.message ??
            'Sinkronisasi belum tersedia — Integrasi Google belum dikonfigurasi di server.',
        );
      }
      await auditWrite({
        action: 'SYNC',
        entityType: 'SYNC',
        entityId: sourceId,
        entityLabel: 'Sinkronisasi manual dari Admin',
        employeeId,
        after: { status: res.data.status, rowsRead: res.data.rows_read },
      });
      return toSyncRun(res.data);
    },
  },

  // -------------------------------------------------------------- activities
  activities: {
    async list(opts) {
      await requireRole();
      let q = getSupabase()
        .from('activity_plan_items')
        .select()
        .is('deleted_at', null)
        .order('start_date')
        .order('start_time', { nullsFirst: true });
      if (opts?.year) q = q.eq('year', opts.year);
      const { data, error } = await q;
      if (error) wrap(error, 'Gagal memuat Rencana Kegiatan');
      return ((data ?? []) as ActivityRow[]).map(toActivity);
    },
    async listYears() {
      await requireRole();
      const { data, error } = await getSupabase()
        .from('spreadsheet_sources')
        .select('year')
        .eq('source_type', 'activity_plan')
        .is('deleted_at', null);
      if (error) return [];
      const years = new Set<number>(((data ?? []) as Array<{ year: number }>).map((r) => r.year));
      return [...years].sort((a, b) => b - a);
    },
    async syncInfo(year) {
      await requireRole();
      const sb = getSupabase();
      let q = sb
        .from('spreadsheet_sources')
        .select()
        .eq('source_type', 'activity_plan')
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })
        .order('year', { ascending: false })
        .limit(1);
      if (year) q = q.eq('year', year);
      const { data } = await q;
      const row = (data as SourceRow[] | null)?.[0];
      if (!row) return { source: null, lastRun: null };
      const { data: runs } = await sb
        .from('spreadsheet_sync_runs')
        .select()
        .eq('source_id', row.id)
        .order('started_at', { ascending: false })
        .limit(1);
      const runRow = (runs as SyncRunRow[] | null)?.[0];
      return { source: toSource(row), lastRun: runRow ? toSyncRun(runRow) : null };
    },
  },

  // ------------------------------------------------------------------ audit
  audit: {
    async list(filter) {
      await requireAdmin();
      let q = getSupabase().from('audit_log').select('*', { count: 'exact' });
      if (filter?.action) q = q.eq('action', filter.action);
      if (filter?.entityType) q = q.eq('entity_type', filter.entityType);
      if (filter?.employeeId) q = q.eq('employee_id', filter.employeeId);
      if (filter?.dateFrom) q = q.gte('at', filter.dateFrom);
      if (filter?.dateTo) q = q.lte('at', `${filter.dateTo}T23:59:59.999Z`);
      if (filter?.search) q = q.ilike('entity_label', `%${filter.search}%`);
      const offset = filter?.offset ?? 0;
      const limit = filter?.limit ?? 50;
      const { data, error, count } = await q
        .order('at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) wrap(error, 'Gagal memuat audit');
      return { entries: ((data ?? []) as AuditRow[]).map(toAudit), total: count ?? 0 };
    },
    async recentActivity(limit = 20) {
      await requireRole();
      // Feed aktivitas memakai view/policy khusus? Di produksi, audit hanya Admin;
      // aktivitas untuk semua akun dibaca lewat tabel yang sama dengan kolom terbatas.
      const { data, error } = await getSupabase()
        .from('audit_log')
        .select()
        .order('at', { ascending: false })
        .limit(limit * 4);
      if (error) return [];
      const events = [];
      for (const row of (data ?? []) as AuditRow[]) {
        const evt = toActivityEvent(toAudit(row));
        if (evt) events.push(evt);
        if (events.length >= limit) break;
      }
      return events;
    },
  },

  // --------------------------------------------------------------- settings
  settings: {
    async get(): Promise<AppSettings> {
      // requireRole() memastikan sesi auth siap sebelum kueri RLS dijalankan;
      // tanpa ini, permintaan bisa terkirim anonim (RLS menyaring semua baris →
      // 0 baris → .single() 406) dan mengotori console pada muat awal/refresh.
      await requireRole();
      const { data, error } = await getSupabase()
        .from('app_settings')
        .select()
        .eq('id', 1)
        .single();
      if (error || !data) wrap(error, 'Gagal memuat pengaturan');
      return toSettings(data as SettingsRow);
    },
    async update(patch, expectedVersion, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      const row: Record<string, unknown> = {
        updated_at: nowISO(),
        version: expectedVersion + 1,
      };
      if (patch.appName !== undefined) row.app_name = patch.appName.trim();
      if (patch.logoDataUrl !== undefined) row.logo_data_url = patch.logoDataUrl;
      if (patch.activeYear !== undefined) row.active_year = patch.activeYear;
      if (patch.userSessionDays !== undefined) row.user_session_days = patch.userSessionDays;
      if (patch.staleDays !== undefined) row.stale_days = patch.staleDays;
      if (patch.attachmentMaxMB !== undefined) row.attachment_max_mb = patch.attachmentMaxMB;
      if (patch.attachmentAllowedExt !== undefined) {
        row.attachment_allowed_ext = patch.attachmentAllowedExt;
      }
      const { data, error } = await getSupabase()
        .from('app_settings')
        .update(row)
        .eq('id', 1)
        .eq('version', expectedVersion)
        .select();
      if (error) wrap(error, 'Gagal menyimpan pengaturan');
      const updated = (data as SettingsRow[] | null)?.[0];
      if (!updated) throw new ConflictError();
      await auditWrite({
        action: 'SETTINGS_UPDATE',
        entityType: 'SETTINGS',
        entityLabel: 'Pengaturan aplikasi',
        employeeId,
        after: patch,
      });
      return toSettings(updated);
    },
    async changeUserPassword(newPassword, ctx) {
      await requireAdmin();
      const employeeId = await assertActor(ctx);
      if (newPassword.length < 8) throw new ValidationError('Password User minimal 8 karakter.');
      const { error } = await getSupabase().functions.invoke('admin-actions', {
        body: { action: 'change-user-password', newPassword },
      });
      if (error) {
        throw new AppError('UNAVAILABLE', `Gagal mengganti password: ${error.message}`);
      }
      await auditWrite({
        action: 'PASSWORD_CHANGE',
        entityType: 'SETTINGS',
        entityLabel: 'Password akun User diganti',
        employeeId,
      });
    },
    async exportBackup(): Promise<BackupPayload> {
      await requireAdmin();
      const sb = getSupabase();
      const tables = [
        'employees',
        'board',
        'steps',
        'tasks',
        'task_comments',
        'attachments',
        'categories',
        'labels',
        'templates',
        'distribution_snapshots',
        'app_settings',
      ];
      const data: Record<string, unknown> = {};
      for (const table of tables) {
        const { data: rows } = await sb.from(table).select();
        data[table] = rows ?? [];
      }
      await auditWrite({
        action: 'BACKUP',
        entityType: 'SETTINGS',
        entityLabel: 'Ekspor backup JSON',
      });
      return { exportedAt: nowISO(), appVersion: '1.0-supabase', data };
    },
    async importBackup() {
      throw new ValidationError(
        'Pada mode produksi, pemulihan dilakukan lewat backup database Supabase (PITR/pg_restore) — lihat DEPLOYMENT.md.',
      );
    },
  },

  // ---------------------------------------------------------------- realtime
  realtime: {
    subscribe(listener) {
      const TABLE_TOPIC: Record<string, ChangeTopic> = {
        board: 'board',
        steps: 'steps',
        tasks: 'tasks',
        task_comments: 'comments',
        attachments: 'attachments',
        attachment_groups: 'attachments',
        attachment_versions: 'attachments',
        notifications: 'notifications',
        account_roles: 'accounts',
        employees: 'employees',
        categories: 'categories',
        labels: 'labels',
        templates: 'templates',
        distribution_snapshots: 'distribution',
        activity_plan_items: 'activities',
        spreadsheet_sources: 'integrations',
        spreadsheet_sheet_bindings: 'integrations',
        spreadsheet_column_mappings: 'integrations',
        spreadsheet_sync_runs: 'integrations',
        pip_progress_snapshots: 'distribution',
        app_settings: 'settings',
        device_sessions: 'sessions',
        audit_log: 'audit',
      };
      const channel = getSupabase()
        .channel('pip-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          const topic = TABLE_TOPIC[payload.table];
          if (!topic) return;
          const event: ChangeEvent = { topic };
          if (topic === 'sessions') {
            const newRow = payload.new as { id?: string; revoked_at?: string | null } | null;
            if (newRow?.revoked_at && newRow.id) {
              event.revokedSessionId = newRow.id;
            }
          }
          listener(event);
        })
        .subscribe();
      return () => {
        void getSupabase().removeChannel(channel);
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Helper internal
// ---------------------------------------------------------------------------

async function setTaskFlag(
  id: string,
  row: Record<string, unknown>,
  action: AuditEntry['action'],
  ctx: ActorContext,
): Promise<Task> {
  await requireRole();
  const employeeId = await assertActor(ctx);
  const { data, error } = await getSupabase()
    .from('tasks')
    .update({ ...row, updated_at: nowISO(), updated_by_employee_id: employeeId })
    .eq('id', id)
    .select()
    .single();
  if (error || !data) wrap(error, 'Gagal memperbarui pekerjaan');
  const task = toTask(data as TaskRow);
  await auditWrite({
    action,
    entityType: 'TASK',
    entityId: id,
    entityLabel: task.title,
    employeeId,
    after: row,
  });
  return task;
}

async function saveTaxonomy(
  table: 'categories' | 'labels',
  entityType: 'CATEGORY' | 'LABEL',
  input: { id?: string; name: string; color: string; active?: boolean },
  ctx: ActorContext,
) {
  await requireAdmin();
  const employeeId = await assertActor(ctx);
  const name = input.name.trim();
  if (!name) throw new ValidationError('Nama wajib diisi.');
  const sb = getSupabase();
  // Tolak duplikat nama (case-insensitive)
  const { data: dup } = await sb.from(table).select('id, name').ilike('name', name);
  const exists = ((dup ?? []) as Array<{ id: string; name: string }>).some(
    (d) => d.name.toLowerCase() === name.toLowerCase() && d.id !== input.id,
  );
  if (exists) throw new ValidationError(`"${name}" sudah ada.`);
  const row = {
    name,
    color: input.color,
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
  const query = input.id
    ? sb.from(table).update(row).eq('id', input.id).select().single()
    : sb
        .from(table)
        .insert({ ...row, sort_order: 999 })
        .select()
        .single();
  const { data, error } = await query;
  if (error || !data) wrap(error, 'Gagal menyimpan');
  await auditWrite({
    action: input.id ? 'UPDATE' : 'CREATE',
    entityType,
    entityId: (data as TaxonomyRow).id,
    entityLabel: name,
    employeeId,
  });
  return toTaxonomy(data as TaxonomyRow);
}
