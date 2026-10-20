/**
 * Logika murni Daftar Pegawai & Profil Pegawai — teruji unit, bebas React.
 *
 * Ringkasan di sini adalah alat PEMANTAUAN PEKERJAAN, bukan penilaian kinerja
 * ASN: tidak ada skor, predikat, maupun peringkat antar-pegawai.
 */
import type { Employee, ProfileTaskFilter, Step, StepKind, Task } from '@/services/types';

export type { ProfileTaskFilter } from '@/services/types';

export type EmployeeRelation = 'PIC_UTAMA' | 'ANGGOTA' | 'PEMBUAT' | 'PEMILIK';

export interface EmployeeWorkSummary {
  active: number;
  done: number;
  overdue: number;
  blocked: number;
  /** Persentase pekerjaan selesai dari seluruh pekerjaan terkait (0–100). */
  completionPercent: number;
  total: number;
}

/** Peta stepId → perilaku step (NORMAL/BLOCKED/DONE). */
export function stepKinds(steps: readonly Step[]): Map<string, StepKind> {
  return new Map(steps.map((s) => [s.id, s.kind]));
}

/** Semua keterkaitan pegawai dengan sebuah pekerjaan (bisa lebih dari satu). */
export function relationsOf(task: Task, employeeId: string): EmployeeRelation[] {
  const relations: EmployeeRelation[] = [];
  if (task.picMainIds.includes(employeeId) || task.picMainId === employeeId) {
    relations.push('PIC_UTAMA');
  }
  if (task.picIds.includes(employeeId)) relations.push('ANGGOTA');
  if (task.createdByEmployeeId === employeeId) relations.push('PEMBUAT');
  if (task.ownerEmployeeId === employeeId) relations.push('PEMILIK');
  return relations;
}

/** Pekerjaan yang melibatkan pegawai (PIC utama, anggota, pembuat, pemilik). */
export function tasksOfEmployee(tasks: readonly Task[], employeeId: string): Task[] {
  return tasks.filter((t) => !t.deletedAt && relationsOf(t, employeeId).length > 0);
}

export function isOverdue(task: Task, kinds: Map<string, StepKind>, todayIso: string): boolean {
  if (!task.dueDate || task.archivedAt || task.deletedAt) return false;
  if (kinds.get(task.stepId) === 'DONE') return false;
  return task.dueDate < todayIso;
}

/** Ringkasan pekerjaan seorang pegawai untuk kartu profil. */
export function employeeWorkSummary(
  tasks: readonly Task[],
  steps: readonly Step[],
  employeeId: string,
  todayIso: string,
): EmployeeWorkSummary {
  const kinds = stepKinds(steps);
  const related = tasksOfEmployee(tasks, employeeId);
  const live = related.filter((t) => !t.archivedAt);

  const done = related.filter((t) => kinds.get(t.stepId) === 'DONE').length;
  const active = live.filter((t) => kinds.get(t.stepId) !== 'DONE').length;
  const blocked = live.filter((t) => kinds.get(t.stepId) === 'BLOCKED').length;
  const overdue = live.filter((t) => isOverdue(t, kinds, todayIso)).length;
  const total = related.length;

  return {
    active,
    done,
    overdue,
    blocked,
    total,
    completionPercent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** Saring pekerjaan terkait pegawai sesuai pilihan filter profil. */
export function filterProfileTasks(
  tasks: readonly Task[],
  steps: readonly Step[],
  employeeId: string,
  filter: ProfileTaskFilter,
  todayIso: string,
): Task[] {
  const kinds = stepKinds(steps);
  const related = tasksOfEmployee(tasks, employeeId);
  switch (filter) {
    case 'AKTIF':
      return related.filter((t) => !t.archivedAt && kinds.get(t.stepId) !== 'DONE');
    case 'SELESAI':
      return related.filter((t) => kinds.get(t.stepId) === 'DONE');
    case 'TERLAMBAT':
      return related.filter((t) => isOverdue(t, kinds, todayIso));
    case 'TERHAMBAT':
      return related.filter((t) => !t.archivedAt && kinds.get(t.stepId) === 'BLOCKED');
    case 'SEMUA':
    default:
      return related;
  }
}

// ---------------------------------------------------------------------------
// Pagination Daftar Pegawai
//
// Halaman Daftar Pegawai hanya punya SATU tampilan (tanpa "Struktur Tim"):
// relasi atasan tetap terbaca lewat badge, filter tingkat, dan Profil Pegawai.
// ---------------------------------------------------------------------------

/** Pilihan jumlah baris per halaman (default = elemen pertama). */
export const PAGE_SIZES = [12, 20, 40] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = PAGE_SIZES[0];

export interface PageSlice<T> {
  items: T[];
  /** Halaman efektif (1-based, sudah dijepit ke rentang yang sah). */
  page: number;
  totalPages: number;
  total: number;
  /** Nomor urut item pertama pada halaman (1-based); 0 bila kosong. */
  from: number;
  /** Nomor urut item terakhir pada halaman; 0 bila kosong. */
  to: number;
}

/**
 * Potong daftar untuk satu halaman. `page` di luar rentang dijepit agar daftar
 * tidak pernah tampil kosong setelah filter memperkecil jumlah hasil.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const total = items.length;
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice,
    page: safePage,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + slice.length,
  };
}

/** Label rentang data, mis. "Menampilkan 1–12 dari 25 pegawai". */
export function pageRangeLabel(slice: PageSlice<unknown>): string {
  if (slice.total === 0) return 'Tidak ada pegawai untuk ditampilkan';
  return `Menampilkan ${slice.from}–${slice.to} dari ${slice.total} pegawai`;
}

/** Daftar Unit/Tim unik (dipakai untuk memutuskan filter unit perlu tampil). */
export function distinctTeams(employees: readonly Employee[]): string[] {
  return [...new Set(employees.map((e) => e.team.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'id'),
  );
}
