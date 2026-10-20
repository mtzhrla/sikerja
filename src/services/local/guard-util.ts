import { AuthError, ForbiddenError, NotFoundError, ValidationError } from '@/services/errors';
import {
  canEditTask,
  canManageTask,
  taskRole,
  type Viewer,
} from '@/lib/permissions';
import { uid } from '@/lib/utils';
import type {
  ActorContext,
  NotificationItem,
  NotificationType,
  SessionInfo,
  Task,
} from '@/services/types';
import { localBus } from './bus';
import { COL, db, nowISO } from './db';
import { findCurrentSession } from './session-util';

/** Sesi valid wajib ada untuk setiap operasi data. */
export function requireSession(): SessionInfo {
  const session = findCurrentSession();
  if (!session || session.revokedAt) {
    throw new AuthError('Sesi Anda berakhir. Silakan masuk kembali.');
  }
  return session;
}

/** Operasi khusus Admin (mencerminkan penegakan server-side di produksi). */
export function requireAdmin(): SessionInfo {
  const session = requireSession();
  if (session.role !== 'ADMIN') {
    throw new ForbiddenError('Tindakan ini hanya dapat dilakukan Admin.');
  }
  return session;
}

/** Akun DEMO hanya boleh membaca — cerminan RLS `can_write()` di produksi. */
export function requireWrite(): SessionInfo {
  const session = requireSession();
  if (session.role === 'DEMO') {
    throw new ForbiddenError('Akun demo hanya dapat melihat data (read-only).');
  }
  return session;
}

/** Identitas pengguna aktif untuk pemeriksaan hak akses pekerjaan. */
export function currentViewer(): Viewer {
  const session = findCurrentSession();
  if (!session) return { accountType: null, employeeId: null, level: null };
  const account = db.accounts().find((a) => a.id === session.account);
  const employee = account?.employeeId
    ? db.employees().find((e) => e.id === account.employeeId)
    : undefined;
  return {
    accountType: session.role,
    employeeId: account?.employeeId ?? null,
    level: employee?.level ?? null,
  };
}

/** Pegawai pelaku wajib valid & aktif (dipilih dari master pegawai). */
export function requireActor(ctx: ActorContext): string {
  const employee = db.employees().find((e) => e.id === ctx.employeeId);
  if (!employee) {
    throw new ValidationError('Pegawai pelaku tidak ditemukan. Pilih pegawai pelaku Anda.');
  }
  if (!employee.active) {
    throw new ValidationError('Pegawai pelaku nonaktif tidak dapat melakukan perubahan.');
  }
  return employee.id;
}

function findTask(taskId: string): Task {
  const task = db.tasks().find((t) => t.id === taskId);
  if (!task) throw new NotFoundError('Pekerjaan tidak ditemukan.');
  return task;
}

/** Hak mengubah bagian operasional pekerjaan (owner/PIC utama/anggota/Admin). */
export function requireTaskEdit(taskId: string): Task {
  requireWrite();
  const task = findTask(taskId);
  if (!canEditTask(currentViewer(), task)) {
    throw new ForbiddenError(
      'Anda bukan pemilik, PIC utama, atau anggota tim pekerjaan ini.',
    );
  }
  return task;
}

/** Hak mengelola pekerjaan (owner/pembuat/pendisposisi/Admin). */
export function requireTaskManage(taskId: string): Task {
  requireWrite();
  const task = findTask(taskId);
  if (!canManageTask(currentViewer(), task)) {
    throw new ForbiddenError('Hanya pemilik pekerjaan yang dapat mengubah bagian ini.');
  }
  return task;
}

export { taskRole };

// ---------------------------------------------------------------------------
// Notifikasi (mode lokal) — cerminan trigger database di produksi
// ---------------------------------------------------------------------------

const NOTIFICATION_CAP = 500;

/** Kirim notifikasi ke sejumlah pegawai (pelaku sendiri dilewati). */
export function pushNotifications(input: {
  recipients: (string | null | undefined)[];
  type: NotificationType;
  title: string;
  body?: string;
  taskId?: string | null;
  actorEmployeeId?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  const actor = input.actorEmployeeId ?? null;
  const active = new Set(db.employees().filter((e) => e.active).map((e) => e.id));
  const unique = [
    ...new Set(input.recipients.filter((id): id is string => Boolean(id))),
  ].filter((id) => id !== actor && active.has(id));
  if (unique.length === 0) return;

  const created: NotificationItem[] = unique.map((recipientEmployeeId) => ({
    id: uid('ntf'),
    recipientEmployeeId,
    type: input.type,
    title: input.title,
    body: input.body ?? '',
    taskId: input.taskId ?? null,
    actorEmployeeId: actor,
    metadata: input.metadata ?? {},
    readAt: null,
    createdAt: nowISO(),
  }));
  db.write(COL.notifications, [...created, ...db.notifications()].slice(0, NOTIFICATION_CAP));
  localBus.emit({ topic: 'notifications' });
}
