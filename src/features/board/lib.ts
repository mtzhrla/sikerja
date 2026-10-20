/** Logika murni Board — teruji unit, bebas React. */
import type { DurationType, Priority, Step, StepKind, Task } from '@/services/types';
import { isMyTask, type Viewer } from '@/lib/permissions';

/** Cakupan tampilan Board — filter dari data yang SAMA (bukan board terpisah). */
export type BoardScope = 'all' | 'mine';

/** Indikator cepat di atas Board (spesifikasi §I). */
export type QuickFilterKey = 'TERLAMBAT' | 'MENDEKATI_TENGGAT' | 'TANPA_PIC';

export const QUICK_FILTER_LABEL: Record<QuickFilterKey, string> = {
  TERLAMBAT: 'Terlambat',
  MENDEKATI_TENGGAT: 'Mendekati Tenggat',
  TANPA_PIC: 'Tanpa PIC',
};

/** Ambang "mendekati tenggat" (hari). */
export const DUE_SOON_DAYS = 3;

export interface BoardFilters {
  search: string;
  stepId: string | null;
  categoryId: string | null;
  labelId: string | null;
  priority: Priority | null;
  /** Cocok bila task memiliki SALAH SATU pegawai ini sebagai PIC (utama/tambahan). */
  picIds: string[];
  durationType: DurationType | null;
  /** Saringan tenggat: semua | ada tenggat | tanpa tenggat. */
  dueFilter: 'ALL' | 'HAS_DUE' | 'NO_DUE';
  quick: QuickFilterKey | null;
}

export const EMPTY_FILTERS: BoardFilters = {
  search: '',
  stepId: null,
  categoryId: null,
  labelId: null,
  priority: null,
  picIds: [],
  durationType: null,
  dueFilter: 'ALL',
  quick: null,
};

export function countActiveFilters(f: BoardFilters): number {
  let n = 0;
  if (f.categoryId) n += 1;
  if (f.labelId) n += 1;
  if (f.priority) n += 1;
  if (f.picIds.length > 0) n += 1;
  if (f.durationType) n += 1;
  if (f.dueFilter !== 'ALL') n += 1;
  return n;
}

/** Tanggal ISO n hari ke depan dari `todayIso`. */
export function addDaysIso(todayIso: string, days: number): string {
  const date = new Date(`${todayIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function taskMatchesFilters(task: Task, f: BoardFilters): boolean {
  if (f.search) {
    const q = f.search.toLowerCase();
    if (!task.title.toLowerCase().includes(q) && !task.description.toLowerCase().includes(q)) {
      return false;
    }
  }
  if (f.categoryId && task.categoryId !== f.categoryId) return false;
  if (f.labelId && !task.labelIds.includes(f.labelId)) return false;
  if (f.priority && task.priority !== f.priority) return false;
  if (f.picIds.length > 0) {
    const pics = new Set([
      ...task.picMainIds,
      ...(task.picMainId ? [task.picMainId] : []),
      ...task.picIds,
    ]);
    if (!f.picIds.some((id) => pics.has(id))) return false;
  }
  if (f.durationType && task.durationType !== f.durationType) return false;
  if (f.dueFilter === 'HAS_DUE' && !task.dueDate) return false;
  if (f.dueFilter === 'NO_DUE' && task.dueDate) return false;
  return true;
}

/** Apakah kartu cocok dengan salah satu indikator cepat. */
export function matchesQuickFilter(
  task: Task,
  key: QuickFilterKey,
  kinds: Map<string, StepKind>,
  todayIso: string,
): boolean {
  const kind = kinds.get(task.stepId);
  switch (key) {
    case 'TERLAMBAT':
      return Boolean(task.dueDate && task.dueDate < todayIso && kind !== 'DONE');
    case 'MENDEKATI_TENGGAT':
      return Boolean(
        task.dueDate &&
          task.dueDate >= todayIso &&
          task.dueDate <= addDaysIso(todayIso, DUE_SOON_DAYS) &&
          kind !== 'DONE',
      );
    case 'TANPA_PIC':
      return task.picMainIds.length === 0 && !task.picMainId;
    default:
      return false;
  }
}

/** Jumlah kartu aktif per indikator cepat (dipakai sebagai badge chip). */
export function quickFilterCounts(
  tasks: readonly Task[],
  steps: readonly Step[],
  todayIso: string,
): Record<QuickFilterKey, number> {
  const kinds = new Map(steps.map((s) => [s.id, s.kind] as const));
  const live = tasks.filter((t) => !t.archivedAt && !t.deletedAt);
  return {
    TERLAMBAT: live.filter((t) => matchesQuickFilter(t, 'TERLAMBAT', kinds, todayIso)).length,
    MENDEKATI_TENGGAT: live.filter((t) =>
      matchesQuickFilter(t, 'MENDEKATI_TENGGAT', kinds, todayIso),
    ).length,
    TANPA_PIC: live.filter((t) => matchesQuickFilter(t, 'TANPA_PIC', kinds, todayIso)).length,
  };
}

/**
 * "Pekerjaan Saya" hanyalah SARINGAN dari data yang sama — tidak ada tabel,
 * board, atau duplikasi kartu per pegawai.
 */
export function applyScope(
  tasks: readonly Task[],
  scope: BoardScope,
  viewer: Viewer,
): readonly Task[] {
  if (scope !== 'mine') return tasks;
  return tasks.filter((t) => isMyTask(viewer, t));
}

/** Kartu per step, terurut, setelah filter (step filter diterapkan di level kolom). */
export function buildColumns(
  tasks: readonly Task[],
  steps: readonly Step[],
  filters: BoardFilters,
  opts?: { todayIso?: string },
): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const step of steps) map.set(step.id, []);
  const kinds = new Map(steps.map((s) => [s.id, s.kind] as const));
  const todayIso = opts?.todayIso ?? new Date().toISOString().slice(0, 10);
  const sorted = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const task of sorted) {
    if (task.archivedAt || task.deletedAt) continue;
    if (!taskMatchesFilters(task, filters)) continue;
    if (filters.quick && !matchesQuickFilter(task, filters.quick, kinds, todayIso)) continue;
    map.get(task.stepId)?.push(task);
  }
  return map;
}

/** Seluruh PIC sebuah task (utama lebih dulu, tanpa duplikat). */
export function taskPicIds(task: Pick<Task, 'picMainIds' | 'picMainId' | 'picIds'>): string[] {
  return [
    ...new Set([
      ...task.picMainIds,
      ...(task.picMainId ? [task.picMainId] : []),
      ...task.picIds,
    ]),
  ];
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  RENDAH: 'Rendah',
  SEDANG: 'Sedang',
  TINGGI: 'Tinggi',
};

export const DURATION_LABEL: Record<DurationType, string> = {
  JANGKA_PANJANG: 'Jangka panjang',
  JANGKA_PENDEK: 'Jangka pendek',
};

/** Preset warna step (kunci tampilan konsisten). */
export const STEP_COLORS = [
  '#94a3b8',
  '#3579ee',
  '#0d9488',
  '#f59e0b',
  '#ef4444',
  '#10b981',
  '#7c3aed',
  '#e11d48',
] as const;
