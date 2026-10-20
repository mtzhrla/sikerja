import { uid } from '@/lib/utils';
import {
  AuthError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '@/services/errors';
import type {
  AccountService,
  AccountType,
  AuthService,
  AuthState,
  EmployeeAccount,
  SessionInfo,
} from '@/services/types';
import { localBus } from './bus';
import {
  COL,
  db,
  ensureSeeded,
  hashPassword,
  nowISO,
  writeAudit,
  type LocalAccountRecord,
  type LoginAttemptRecord,
} from './db';
import {
  deviceLabel,
  findCurrentSession,
  getCurrentSessionId,
  setCurrentSessionId,
} from './session-util';

const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60_000;
const LOCK_MS = 5 * 60_000;
const ADMIN_SESSION_DAYS = 7;
const HEARTBEAT_MS = 5 * 60_000;
const SESSION_CAP = 60;

/** Password sementara akun baru & hasil reset Admin. */
export const TEMP_PASSWORD = '12345678';

/** Pesan tunggal untuk seluruh kegagalan kredensial (anti-enumerasi akun). */
const GENERIC_ERROR = 'NIP/username atau password salah. Periksa kembali.';

const EMPTY_STATE: AuthState = {
  session: null,
  role: null,
  employeeId: null,
  mustChangePassword: false,
};

function sessionExpired(session: SessionInfo, userSessionDays: number): boolean {
  const days = session.role === 'ADMIN' ? ADMIN_SESSION_DAYS : userSessionDays;
  const last = Date.parse(session.lastActiveAt);
  return Number.isFinite(last) && Date.now() - last > days * 86_400_000;
}

function checkRateLimit(account: string): void {
  const rec = db.loginAttempts()[account];
  if (rec?.lockedUntil && Date.now() < rec.lockedUntil) {
    const menit = Math.ceil((rec.lockedUntil - Date.now()) / 60_000);
    throw new RateLimitError(`Terlalu banyak percobaan gagal. Coba lagi dalam ${menit} menit.`);
  }
}

function recordFail(account: string): void {
  const attempts = { ...db.loginAttempts() };
  const prev = attempts[account];
  const withinWindow = prev && Date.now() - prev.firstAt < FAIL_WINDOW_MS;
  const rec: LoginAttemptRecord = withinWindow
    ? { count: prev.count + 1, firstAt: prev.firstAt, lockedUntil: null }
    : { count: 1, firstAt: Date.now(), lockedUntil: null };
  if (rec.count >= MAX_FAILS) {
    rec.lockedUntil = Date.now() + LOCK_MS;
    rec.count = 0;
    rec.firstAt = Date.now();
  }
  attempts[account] = rec;
  db.write(COL.loginAttempts, attempts);
}

function clearFails(account: string): void {
  const attempts = { ...db.loginAttempts() };
  if (attempts[account]) {
    delete attempts[account];
    db.write(COL.loginAttempts, attempts);
  }
}

function createSession(role: AccountType, account: string): SessionInfo {
  const session: SessionInfo = {
    id: uid('ses'),
    role,
    account,
    deviceLabel: deviceLabel(),
    createdAt: nowISO(),
    lastActiveAt: nowISO(),
    revokedAt: null,
  };
  const sessions = [session, ...db.sessions()].slice(0, SESSION_CAP);
  db.write(COL.sessions, sessions);
  setCurrentSessionId(session.id);
  localBus.emit({ topic: 'sessions' });
  return session;
}

function saveAccounts(accounts: LocalAccountRecord[]): void {
  db.write(COL.accounts, accounts);
  localBus.emit({ topic: 'accounts' });
}

/** Petakan NIP / username pegawai / nama akun sistem → akun. */
export function resolveAccount(identifier: string): LocalAccountRecord | null {
  const raw = identifier.trim();
  if (!raw) return null;
  const uname = raw.toLowerCase();
  const nip = raw.replace(/[^0-9]/g, '');
  const accounts = db.accounts();

  const employee = db
    .employees()
    .find(
      (e) => (e.username && e.username.toLowerCase() === uname) || (nip && e.nipNormalized === nip),
    );
  if (employee) {
    return accounts.find((a) => a.employeeId === employee.id) ?? null;
  }
  return accounts.find((a) => a.label.toLowerCase() === uname && !a.employeeId) ?? null;
}

/** Akun sesi aktif pada perangkat ini. */
export function currentAccount(): LocalAccountRecord | null {
  const session = findCurrentSession();
  if (!session) return null;
  return db.accounts().find((a) => a.label === session.account || a.id === session.account) ?? null;
}

export const localAuth: AuthService = {
  async getState(): Promise<AuthState> {
    await ensureSeeded();
    const session = findCurrentSession();
    if (!session || session.revokedAt) {
      if (session) setCurrentSessionId(null);
      return EMPTY_STATE;
    }
    const settings = db.settings();
    if (settings && sessionExpired(session, settings.userSessionDays)) {
      setCurrentSessionId(null);
      return EMPTY_STATE;
    }
    const account = db.accounts().find((a) => a.id === session.account);
    if (account && !account.isActive) {
      setCurrentSessionId(null);
      return EMPTY_STATE;
    }
    // Heartbeat (di-throttle): sesi persisten berbasis aktivitas terakhir.
    if (Date.now() - Date.parse(session.lastActiveAt) > HEARTBEAT_MS) {
      db.write(
        COL.sessions,
        db.sessions().map((s) => (s.id === session.id ? { ...s, lastActiveAt: nowISO() } : s)),
      );
    }
    return {
      session,
      role: session.role,
      employeeId: account?.employeeId ?? null,
      mustChangePassword: account?.mustChangePassword ?? false,
    };
  },

  /**
   * Login dengan NIP, username pegawai, atau nama akun sistem.
   * Jenis akun ditentukan SETELAH kredensial terverifikasi.
   */
  async login(identifier: string, password: string): Promise<SessionInfo> {
    await ensureSeeded();
    const raw = identifier.trim();
    if (!raw) throw new AuthError('Masukkan NIP atau username Anda.');
    const key = raw.toLowerCase();
    checkRateLimit(key);

    const account = resolveAccount(raw);
    const hash = await hashPassword(password);
    const employee = account?.employeeId
      ? db.employees().find((e) => e.id === account.employeeId)
      : null;
    const usable =
      account &&
      account.isActive &&
      account.passwordHash === hash &&
      (!account.employeeId || employee?.active === true);

    if (!usable || !account) {
      recordFail(key);
      writeAudit({
        actorRole: 'DEMO',
        actorAccount: raw.slice(0, 60),
        employeeId: null,
        action: 'LOGIN_FAILED',
        entityType: 'AUTH',
        entityLabel: 'Login gagal',
        success: false,
        errorMessage: 'Kredensial salah atau akun nonaktif',
        deviceLabel: deviceLabel(),
      });
      throw new AuthError(GENERIC_ERROR);
    }

    clearFails(key);
    saveAccounts(
      db.accounts().map((a) => (a.id === account.id ? { ...a, lastLoginAt: nowISO() } : a)),
    );
    const session = createSession(account.accountType, account.id);
    writeAudit({
      actorRole: account.accountType,
      actorAccount: account.label || (employee?.username ?? 'pegawai'),
      employeeId: account.employeeId,
      action: 'LOGIN',
      entityType: 'AUTH',
      entityLabel: `Login ${account.accountType}`,
      sessionId: session.id,
      deviceLabel: session.deviceLabel,
    });
    return session;
  },

  async changeOwnPassword(newPassword: string, currentPassword?: string): Promise<void> {
    await ensureSeeded();
    const account = currentAccount();
    if (!account) throw new AuthError('Sesi Anda berakhir. Silakan masuk kembali.');
    if (newPassword.length < 8) throw new ValidationError('Password baru minimal 8 karakter.');
    if (newPassword === TEMP_PASSWORD) {
      throw new ValidationError('Password baru tidak boleh sama dengan password sementara.');
    }
    if (!account.mustChangePassword) {
      const currentHash = await hashPassword(currentPassword ?? '');
      if (currentHash !== account.passwordHash) {
        throw new ValidationError('Password saat ini salah.');
      }
    }
    const hash = await hashPassword(newPassword);
    saveAccounts(
      db.accounts().map((a) =>
        a.id === account.id
          ? {
              ...a,
              passwordHash: hash,
              mustChangePassword: false,
              passwordChangedAt: nowISO(),
            }
          : a,
      ),
    );
    writeAudit({
      actorRole: account.accountType,
      actorAccount: account.label || 'pegawai',
      employeeId: account.employeeId,
      action: 'PASSWORD_CHANGE',
      entityType: 'AUTH',
      entityLabel: 'Password diganti sendiri',
    });
  },

  async logout(): Promise<void> {
    await ensureSeeded();
    const session = findCurrentSession();
    setCurrentSessionId(null);
    if (session) {
      db.write(
        COL.sessions,
        db.sessions().map((s) => (s.id === session.id ? { ...s, revokedAt: nowISO() } : s)),
      );
      writeAudit({
        actorRole: session.role,
        actorAccount: session.account,
        employeeId: null,
        action: 'LOGOUT',
        entityType: 'AUTH',
        entityLabel: 'Logout',
        sessionId: session.id,
        deviceLabel: session.deviceLabel,
      });
      localBus.emit({ topic: 'sessions' });
    }
  },

  async listSessions(): Promise<SessionInfo[]> {
    await ensureSeeded();
    const current = findCurrentSession();
    if (current?.role !== 'ADMIN') {
      throw new ForbiddenError('Hanya Admin yang dapat melihat daftar sesi.');
    }
    return [...db.sessions()].sort(
      (a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt),
    );
  },

  async revokeSession(sessionId: string): Promise<void> {
    await ensureSeeded();
    const current = findCurrentSession();
    if (current?.role !== 'ADMIN') {
      throw new ForbiddenError('Hanya Admin yang dapat mencabut sesi.');
    }
    const sessions = db.sessions();
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) throw new NotFoundError('Sesi tidak ditemukan.');
    if (target.revokedAt) return;
    db.write(
      COL.sessions,
      sessions.map((s) => (s.id === sessionId ? { ...s, revokedAt: nowISO() } : s)),
    );
    if (getCurrentSessionId() === sessionId) setCurrentSessionId(null);
    writeAudit({
      actorRole: 'ADMIN',
      actorAccount: current.account,
      employeeId: null,
      action: 'REVOKE_SESSION',
      entityType: 'SESSION',
      entityId: sessionId,
      entityLabel: `Sesi ${target.role} · ${target.deviceLabel}`,
      sessionId: current.id,
      deviceLabel: current.deviceLabel,
    });
    localBus.emit({ topic: 'sessions', revokedSessionId: sessionId });
  },
};

// ---------------------------------------------------------------------------
// Pengelolaan akun pegawai (Admin)
// ---------------------------------------------------------------------------

async function requireAdminAccount(): Promise<LocalAccountRecord> {
  await ensureSeeded();
  const account = currentAccount();
  if (account?.accountType !== 'ADMIN') {
    throw new ForbiddenError('Hanya Admin yang dapat mengelola akun pegawai.');
  }
  return account;
}

function toEmployeeAccount(
  employeeId: string,
  account: LocalAccountRecord | undefined,
): EmployeeAccount {
  return {
    employeeId,
    hasAccount: Boolean(account),
    accountType: account?.accountType ?? null,
    isActive: account?.isActive ?? false,
    mustChangePassword: account?.mustChangePassword ?? false,
    lastLoginAt: account?.lastLoginAt ?? null,
    passwordChangedAt: account?.passwordChangedAt ?? null,
    createdAt: account?.createdAt ?? null,
  };
}

async function provisionEmployee(employeeId: string): Promise<'created' | 'exists'> {
  const accounts = db.accounts();
  if (accounts.some((a) => a.employeeId === employeeId)) return 'exists';
  const record: LocalAccountRecord = {
    id: uid('acc'),
    accountType: 'EMPLOYEE',
    label: '',
    employeeId,
    passwordHash: await hashPassword(TEMP_PASSWORD),
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    passwordChangedAt: null,
    createdAt: nowISO(),
  };
  saveAccounts([...accounts, record]);
  return 'created';
}

export const localAccounts: AccountService = {
  async list(): Promise<EmployeeAccount[]> {
    await requireAdminAccount();
    const accounts = db.accounts();
    return db.employees().map((e) =>
      toEmployeeAccount(
        e.id,
        accounts.find((a) => a.employeeId === e.id),
      ),
    );
  },

  async provision(employeeId): Promise<EmployeeAccount> {
    const admin = await requireAdminAccount();
    const employee = db.employees().find((e) => e.id === employeeId);
    if (!employee) throw new NotFoundError('Pegawai tidak ditemukan.');
    if (!employee.active) {
      throw new ValidationError('Pegawai nonaktif tidak dapat dibuatkan akun.');
    }
    const result = await provisionEmployee(employeeId);
    if (result === 'created') {
      writeAudit({
        actorRole: 'ADMIN',
        actorAccount: admin.label,
        employeeId: null,
        action: 'ACCOUNT_CREATE',
        entityType: 'ACCOUNT',
        entityId: employeeId,
        entityLabel: `Akun dibuat untuk ${employee.fullName}`,
      });
    }
    return toEmployeeAccount(
      employeeId,
      db.accounts().find((a) => a.employeeId === employeeId),
    );
  },

  async provisionAll() {
    const admin = await requireAdminAccount();
    let created = 0;
    let skipped = 0;
    for (const employee of db.employees().filter((e) => e.active)) {
      const result = await provisionEmployee(employee.id);
      if (result === 'created') {
        created += 1;
        writeAudit({
          actorRole: 'ADMIN',
          actorAccount: admin.label,
          employeeId: null,
          action: 'ACCOUNT_CREATE',
          entityType: 'ACCOUNT',
          entityId: employee.id,
          entityLabel: `Akun dibuat untuk ${employee.fullName}`,
        });
      } else {
        skipped += 1;
      }
    }
    return { created, skipped, failed: [] };
  },

  async resetPassword(employeeId) {
    const admin = await requireAdminAccount();
    const accounts = db.accounts();
    const target = accounts.find((a) => a.employeeId === employeeId);
    if (!target) throw new NotFoundError('Pegawai ini belum memiliki akun.');
    const hash = await hashPassword(TEMP_PASSWORD);
    saveAccounts(
      accounts.map((a) =>
        a.id === target.id
          ? { ...a, passwordHash: hash, mustChangePassword: false, passwordChangedAt: null }
          : a,
      ),
    );
    // Cabut sesi lama akun tersebut.
    db.write(
      COL.sessions,
      db
        .sessions()
        .map((s) => (s.account === target.id && !s.revokedAt ? { ...s, revokedAt: nowISO() } : s)),
    );
    db.write(COL.notifications, [
      {
        id: uid('ntf'),
        recipientEmployeeId: employeeId,
        type: 'PASSWORD_RESET' as const,
        title: 'Password Anda direset Admin',
        body: 'Password Anda dikembalikan ke default 12345678. Masuk kembali memakai password tersebut.',
        taskId: null,
        actorEmployeeId: null,
        metadata: {},
        readAt: null,
        createdAt: nowISO(),
      },
      ...db.notifications(),
    ]);
    localBus.emit({ topic: 'notifications' });
    writeAudit({
      actorRole: 'ADMIN',
      actorAccount: admin.label,
      employeeId: null,
      action: 'PASSWORD_RESET',
      entityType: 'ACCOUNT',
      entityId: employeeId,
      entityLabel: 'Password pegawai direset Admin',
    });
  },

  async setActive(employeeId, active) {
    const admin = await requireAdminAccount();
    const accounts = db.accounts();
    const target = accounts.find((a) => a.employeeId === employeeId);
    if (!target) throw new NotFoundError('Pegawai ini belum memiliki akun.');
    saveAccounts(accounts.map((a) => (a.id === target.id ? { ...a, isActive: active } : a)));
    if (!active) {
      db.write(
        COL.sessions,
        db
          .sessions()
          .map((s) =>
            s.account === target.id && !s.revokedAt ? { ...s, revokedAt: nowISO() } : s,
          ),
      );
    }
    writeAudit({
      actorRole: 'ADMIN',
      actorAccount: admin.label,
      employeeId: null,
      action: active ? 'ACCOUNT_ACTIVATE' : 'ACCOUNT_DEACTIVATE',
      entityType: 'ACCOUNT',
      entityId: employeeId,
      entityLabel: active ? 'Akun pegawai diaktifkan' : 'Akun pegawai dinonaktifkan',
    });
  },

  async setRole(employeeId, role) {
    const admin = await requireAdminAccount();
    const accounts = db.accounts();
    const target = accounts.find((a) => a.employeeId === employeeId);
    if (!target) throw new NotFoundError('Pegawai ini belum memiliki akun.');
    if (target.accountType === role) return;
    if (
      target.accountType === 'ADMIN' &&
      role !== 'ADMIN' &&
      accounts.filter((a) => a.accountType === 'ADMIN' && a.isActive).length <= 1
    ) {
      throw new ValidationError('Admin aktif terakhir tidak dapat diubah menjadi User.');
    }
    saveAccounts(accounts.map((a) => (a.id === target.id ? { ...a, accountType: role } : a)));
    db.write(
      COL.sessions,
      db
        .sessions()
        .map((s) => (s.account === target.id && !s.revokedAt ? { ...s, revokedAt: nowISO() } : s)),
    );
    writeAudit({
      actorRole: 'ADMIN',
      actorAccount: admin.label,
      employeeId: null,
      action: 'ACCOUNT_ROLE_CHANGE',
      entityType: 'ACCOUNT',
      entityId: employeeId,
      entityLabel: `Role akun diubah menjadi ${role === 'ADMIN' ? 'Admin' : 'User'}`,
    });
  },
};
