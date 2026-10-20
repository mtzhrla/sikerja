import { describe, expect, it } from 'vitest';
import type { Step, Task } from '@/services/types';
import {
  applyScope,
  buildColumns,
  countActiveFilters,
  EMPTY_FILTERS,
  matchesQuickFilter,
  quickFilterCounts,
  taskMatchesFilters,
} from './lib';

function makeTask(partial: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    boardId: 'b',
    stepId: 's1',
    title: 'Tugas',
    description: '',
    durationType: 'JANGKA_PENDEK',
    categoryId: null,
    labelIds: [],
    priority: 'SEDANG',
    startDate: null,
    dueDate: null,
    progressMode: 'MANUAL',
    manualProgress: 0,
    picMainIds: [],
    picMainId: null,
    picIds: [],
    checklist: [],
    isFocus: false,
    sortOrder: 0,
    archivedAt: null,
    deletedAt: null,
    deleteReason: null,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    version: 1,
    createdByEmployeeId: null,
    updatedByEmployeeId: null,
    ownerEmployeeId: null,
    taskType: 'MANDIRI',
    disposedByEmployeeId: null,
    driveFolderId: null,
    ...partial,
  };
}

const steps: Step[] = [
  { id: 's1', boardId: 'b', name: 'A', kind: 'NORMAL', color: '#000', sortOrder: 0, deletedAt: null, version: 1 },
  { id: 's2', boardId: 'b', name: 'B', kind: 'NORMAL', color: '#000', sortOrder: 1, deletedAt: null, version: 1 },
];

describe('taskMatchesFilters', () => {
  it('mencari pada judul dan deskripsi (case-insensitive)', () => {
    const t = makeTask({ title: 'Rekonsiliasi Bank', description: 'Data Juni' });
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, search: 'rekon' })).toBe(true);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, search: 'juni' })).toBe(true);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, search: 'zzz' })).toBe(false);
  });

  it('filter kategori, label, prioritas, durasi', () => {
    const t = makeTask({
      categoryId: 'c1',
      labelIds: ['l1', 'l2'],
      priority: 'TINGGI',
      durationType: 'JANGKA_PANJANG',
    });
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, categoryId: 'c1' })).toBe(true);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, categoryId: 'c2' })).toBe(false);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, labelId: 'l2' })).toBe(true);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, labelId: 'lx' })).toBe(false);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, priority: 'TINGGI' })).toBe(true);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, durationType: 'JANGKA_PENDEK' })).toBe(false);
  });

  it('filter PIC mencakup PIC utama (multi) dan tambahan', () => {
    const t = makeTask({ picMainIds: ['e1', 'e4'], picMainId: 'e1', picIds: ['e2'] });
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, picIds: ['e1'] })).toBe(true);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, picIds: ['e4'] })).toBe(true);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, picIds: ['e2'] })).toBe(true);
    expect(taskMatchesFilters(t, { ...EMPTY_FILTERS, picIds: ['e3'] })).toBe(false);
    // Data lama: hanya picMainId terisi (picMainIds kosong)
    const lama = makeTask({ picMainIds: [], picMainId: 'e9', picIds: [] });
    expect(taskMatchesFilters(lama, { ...EMPTY_FILTERS, picIds: ['e9'] })).toBe(true);
  });
});

describe('buildColumns', () => {
  it('mengelompokkan per step, urut sortOrder, tanpa arsip/terhapus', () => {
    const tasks = [
      makeTask({ id: 't2', stepId: 's1', sortOrder: 1 }),
      makeTask({ id: 't1', stepId: 's1', sortOrder: 0 }),
      makeTask({ id: 't3', stepId: 's2', sortOrder: 0 }),
      makeTask({ id: 'arsip', stepId: 's1', archivedAt: '2026-07-01T00:00:00Z' }),
      makeTask({ id: 'hapus', stepId: 's1', deletedAt: '2026-07-01T00:00:00Z' }),
    ];
    const cols = buildColumns(tasks, steps, EMPTY_FILTERS);
    expect(cols.get('s1')?.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(cols.get('s2')?.map((t) => t.id)).toEqual(['t3']);
  });
});

describe('countActiveFilters', () => {
  it('menghitung filter aktif (tanpa search/step)', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countActiveFilters({ ...EMPTY_FILTERS, categoryId: 'c', priority: 'TINGGI', search: 'x' }),
    ).toBe(2);
  });
});

describe('cakupan & indikator cepat Board', () => {
  const STEPS: Step[] = [
    { id: 's1', boardId: 'b', name: 'To Do', kind: 'NORMAL', color: '#1', sortOrder: 0, deletedAt: null, version: 1 },
    { id: 's2', boardId: 'b', name: 'Done', kind: 'DONE', color: '#3', sortOrder: 1, deletedAt: null, version: 1 },
  ];
  const TODAY = '2026-07-23';
  const VIEWER = { accountType: 'EMPLOYEE' as const, employeeId: 'nur', level: 'STAFF' as const };

  const tasks = [
    makeTask({ id: 'milikku', picMainIds: ['nur'], picMainId: 'nur', ownerEmployeeId: 'nur' }),
    makeTask({ id: 'anggota', picIds: ['nur'] }),
    makeTask({ id: 'oranglain', picMainIds: ['ulfi'], picMainId: 'ulfi' }),
    makeTask({ id: 'terlambat', dueDate: '2026-07-01' }),
    makeTask({ id: 'segera', dueDate: '2026-07-24' }),
    makeTask({ id: 'selesai-telat', stepId: 's2', dueDate: '2026-07-01' }),
  ];

  it('Pekerjaan Saya hanya menyaring data yang sama (tanpa duplikasi)', () => {
    const mine = applyScope(tasks, 'mine', VIEWER);
    expect(mine.map((t) => t.id).sort()).toEqual(['anggota', 'milikku']);
    // Objek identik — bukan salinan/duplikat.
    expect(mine[0]).toBe(tasks.find((t) => t.id === mine[0]!.id));
    expect(applyScope(tasks, 'all', VIEWER)).toHaveLength(tasks.length);
  });

  it('indikator cepat menghitung terlambat, mendekati tenggat, dan tanpa PIC', () => {
    const counts = quickFilterCounts(tasks, STEPS, TODAY);
    expect(counts.TERLAMBAT).toBe(1);
    expect(counts.MENDEKATI_TENGGAT).toBe(1);
    // Semua kartu tanpa PIC utama: anggota, terlambat, segera, selesai-telat
    expect(counts.TANPA_PIC).toBe(4);
  });

  it('kartu pada step DONE tidak dihitung terlambat', () => {
    const kinds = new Map(STEPS.map((s) => [s.id, s.kind] as const));
    const selesai = tasks.find((t) => t.id === 'selesai-telat')!;
    expect(matchesQuickFilter(selesai, 'TERLAMBAT', kinds, TODAY)).toBe(false);
  });

  it('saringan tenggat memisahkan kartu dengan & tanpa tenggat', () => {
    const adaTenggat = buildColumns(
      tasks,
      STEPS,
      { ...EMPTY_FILTERS, dueFilter: 'HAS_DUE' },
      { todayIso: TODAY },
    );
    const total = [...adaTenggat.values()].flat();
    expect(total.every((t) => t.dueDate)).toBe(true);
  });
});
