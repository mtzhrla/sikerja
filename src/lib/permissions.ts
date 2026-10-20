/**
 * Matriks hak akses — logika MURNI (tanpa React/network) sehingga dapat diuji
 * unit dan dipakai konsisten di seluruh UI.
 *
 * PENTING: fungsi di sini hanya untuk umpan balik cepat di antarmuka.
 * Penegakan sesungguhnya ada di server (RLS + trigger, migrasi 0008–0010).
 */
import type { AccountType, Employee, EmployeeLevel, Task } from '@/services/types';

/** Identitas pengguna aktif untuk pemeriksaan hak akses. */
export interface Viewer {
  accountType: AccountType | null;
  /** Pegawai yang terhubung ke akun (null untuk ADMIN & DEMO). */
  employeeId: string | null;
  level: EmployeeLevel | null;
}

export type TaskRole = 'ADMIN' | 'OWNER' | 'MEMBER' | 'NONE';

export const VIEWER_NONE: Viewer = { accountType: null, employeeId: null, level: null };

export function viewerFrom(
  accountType: AccountType | null,
  employeeId: string | null,
  employees: readonly Employee[] | undefined,
): Viewer {
  const employee = employeeId ? employees?.find((e) => e.id === employeeId) : undefined;
  return { accountType, employeeId, level: employee?.level ?? null };
}

export function isAdmin(v: Viewer): boolean {
  return v.accountType === 'ADMIN';
}

export function isDemo(v: Viewer): boolean {
  return v.accountType === 'DEMO';
}

export function isLeader(v: Viewer): boolean {
  return v.level === 'LEADER';
}

/** Akun DEMO tidak pernah boleh mengubah data apa pun. */
export function canWrite(v: Viewer): boolean {
  return v.accountType === 'ADMIN' || v.accountType === 'EMPLOYEE';
}

/** Seluruh PIC & anggota tim sebuah pekerjaan (tanpa duplikat). */
export function taskParticipantIds(
  task: Pick<Task, 'picMainIds' | 'picMainId' | 'picIds' | 'ownerEmployeeId' | 'createdByEmployeeId'
    | 'disposedByEmployeeId'>,
): string[] {
  return [
    ...new Set(
      [
        task.ownerEmployeeId,
        task.createdByEmployeeId,
        task.disposedByEmployeeId,
        task.picMainId,
        ...task.picMainIds,
        ...task.picIds,
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
}

/** Peran pengguna terhadap satu pekerjaan — cerminan `task_role_for_current` di DB. */
export function taskRole(v: Viewer, task: Task): TaskRole {
  if (isAdmin(v)) return 'ADMIN';
  if (!v.employeeId) return 'NONE';
  if (
    task.ownerEmployeeId === v.employeeId ||
    task.createdByEmployeeId === v.employeeId ||
    task.disposedByEmployeeId === v.employeeId
  ) {
    return 'OWNER';
  }
  if (
    task.picMainIds.includes(v.employeeId) ||
    task.picMainId === v.employeeId ||
    task.picIds.includes(v.employeeId)
  ) {
    return 'MEMBER';
  }
  return 'NONE';
}

/** Boleh mengubah bagian operasional (progres, checklist, status, komentar). */
export function canEditTask(v: Viewer, task: Task): boolean {
  if (!canWrite(v)) return false;
  const role = taskRole(v, task);
  return role === 'ADMIN' || role === 'OWNER' || role === 'MEMBER';
}

/**
 * Boleh mengelola pekerjaan: PIC utama, anggota tim, prioritas, tenggat,
 * judul/deskripsi, arsip, dan soft delete.
 */
export function canManageTask(v: Viewer, task: Task): boolean {
  if (!canWrite(v)) return false;
  const role = taskRole(v, task);
  return role === 'ADMIN' || role === 'OWNER';
}

/** Hapus permanen hanya Admin. */
export function canPermanentDelete(v: Viewer): boolean {
  return isAdmin(v);
}

/** Boleh membuat pekerjaan baru. */
export function canCreateTask(v: Viewer): boolean {
  return canWrite(v) && (isAdmin(v) || Boolean(v.employeeId));
}

/** Boleh membuat DISPOSISI (menugaskan pegawai lain sebagai PIC utama). */
export function canDispose(v: Viewer): boolean {
  return canWrite(v) && (isAdmin(v) || isLeader(v));
}

/** Boleh mengubah konfigurasi board (judul & step). */
export function canEditBoardConfig(v: Viewer): boolean {
  return canWrite(v);
}

/** "Pekerjaan Saya" — pekerjaan tempat pengguna terlibat. */
export function isMyTask(v: Viewer, task: Task): boolean {
  if (!v.employeeId) return false;
  return taskParticipantIds(task).includes(v.employeeId);
}

/** Pesan singkat mengapa sebuah aksi tidak tersedia (untuk tooltip/toast). */
export function denyReason(v: Viewer): string {
  if (isDemo(v)) return 'Akun demo hanya dapat melihat data (read-only).';
  if (!canWrite(v)) return 'Sesi Anda tidak memiliki izin untuk perubahan ini.';
  return 'Anda bukan pemilik, PIC utama, atau anggota tim pekerjaan ini.';
}
