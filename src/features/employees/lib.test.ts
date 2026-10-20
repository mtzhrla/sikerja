import { describe, expect, it } from 'vitest';
import { DEFAULT_TEAM, normalizeTeam } from '@/lib/org';
import { EMPLOYEES as SEED_EMPLOYEES } from '@/services/local/seed';
import type { Employee, Step, Task } from '@/services/types';
import {
  DEFAULT_PAGE_SIZE,
  distinctTeams,
  PAGE_SIZES,
  pageRangeLabel,
  paginate,
  employeeWorkSummary,
  filterProfileTasks,
  relationsOf,
  tasksOfEmployee,
} from './lib';

const STEPS: Step[] = [
  { id: 'todo', boardId: 'b', name: 'To Do', kind: 'NORMAL', color: '#1', sortOrder: 0, deletedAt: null, version: 1 },
  { id: 'block', boardId: 'b', name: 'Blocking', kind: 'BLOCKED', color: '#2', sortOrder: 1, deletedAt: null, version: 1 },
  { id: 'done', boardId: 'b', name: 'Done', kind: 'DONE', color: '#3', sortOrder: 2, deletedAt: null, version: 1 },
];

const TODAY = '2026-07-23';

function employee(partial: Partial<Employee> & { id: string }): Employee {
  return {
    fullName: partial.id,
    displayName: partial.id,
    initials: 'XX',
    color: 'blue',
    nip: null,
    nipNormalized: null,
    username: partial.id,
    position: '',
    team: DEFAULT_TEAM,
    level: 'STAFF',
    supervisorId: null,
    sortOrder: 0,
    active: true,
    avatarPath: null,
    avatarUpdatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    boardId: 'b',
    stepId: 'todo',
    title: partial.id,
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
    ownerEmployeeId: null,
    taskType: 'MANDIRI',
    disposedByEmployeeId: null,
    driveFolderId: null,
    checklist: [],
    isFocus: false,
    sortOrder: 0,
    archivedAt: null,
    deletedAt: null,
    deleteReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
    createdByEmployeeId: null,
    updatedByEmployeeId: null,
    ...partial,
  };
}

describe('keterkaitan pegawai dengan pekerjaan', () => {
  it('mengenali PIC utama, anggota, pembuat, dan pemilik', () => {
    const t = task({
      id: 't1',
      picMainIds: ['nur'],
      picIds: ['ulfi'],
      createdByEmployeeId: 'thoriq',
      ownerEmployeeId: 'thoriq',
    });
    expect(relationsOf(t, 'nur')).toContain('PIC_UTAMA');
    expect(relationsOf(t, 'ulfi')).toContain('ANGGOTA');
    expect(relationsOf(t, 'thoriq')).toEqual(expect.arrayContaining(['PEMBUAT', 'PEMILIK']));
    expect(relationsOf(t, 'dhani')).toHaveLength(0);
  });

  it('pekerjaan terhapus tidak ikut dihitung', () => {
    const tasks = [
      task({ id: 't1', picMainIds: ['nur'] }),
      task({ id: 't2', picMainIds: ['nur'], deletedAt: '2026-07-01T00:00:00.000Z' }),
    ];
    expect(tasksOfEmployee(tasks, 'nur')).toHaveLength(1);
  });
});

describe('ringkasan pekerjaan pegawai', () => {
  const tasks = [
    task({ id: 'aktif', picMainIds: ['nur'] }),
    task({ id: 'selesai', picMainIds: ['nur'], stepId: 'done' }),
    task({ id: 'terlambat', picMainIds: ['nur'], dueDate: '2026-07-01' }),
    task({ id: 'terhambat', picMainIds: ['nur'], stepId: 'block' }),
    task({ id: 'arsip', picMainIds: ['nur'], archivedAt: '2026-07-01T00:00:00.000Z' }),
    task({ id: 'oranglain', picMainIds: ['ulfi'] }),
  ];

  it('menghitung aktif, selesai, terlambat, terhambat, dan persentase', () => {
    const s = employeeWorkSummary(tasks, STEPS, 'nur', TODAY);
    expect(s.total).toBe(5);
    expect(s.done).toBe(1);
    expect(s.blocked).toBe(1);
    expect(s.overdue).toBe(1);
    // aktif = seluruh pekerjaan tak terarsip di luar step DONE (3: aktif, terlambat, terhambat)
    expect(s.active).toBe(3);
    expect(s.completionPercent).toBe(20);
  });

  it('pegawai tanpa pekerjaan menghasilkan 0% (bukan NaN)', () => {
    const s = employeeWorkSummary(tasks, STEPS, 'kosong', TODAY);
    expect(s.total).toBe(0);
    expect(s.completionPercent).toBe(0);
  });

  it('saringan profil memilih subset yang benar', () => {
    expect(filterProfileTasks(tasks, STEPS, 'nur', 'SELESAI', TODAY).map((t) => t.id)).toEqual([
      'selesai',
    ]);
    expect(filterProfileTasks(tasks, STEPS, 'nur', 'TERLAMBAT', TODAY).map((t) => t.id)).toEqual([
      'terlambat',
    ]);
    expect(filterProfileTasks(tasks, STEPS, 'nur', 'TERHAMBAT', TODAY).map((t) => t.id)).toEqual([
      'terhambat',
    ]);
    expect(filterProfileTasks(tasks, STEPS, 'nur', 'SEMUA', TODAY)).toHaveLength(5);
  });
});


describe('pagination daftar pegawai', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it('default 12 per halaman dengan rentang data yang benar', () => {
    const slice = paginate(items, 1, DEFAULT_PAGE_SIZE);
    expect(DEFAULT_PAGE_SIZE).toBe(12);
    expect(slice.items).toHaveLength(12);
    expect(slice.totalPages).toBe(3);
    expect(pageRangeLabel(slice)).toBe('Menampilkan 1–12 dari 25 pegawai');
  });

  it('halaman terakhir hanya berisi sisa data', () => {
    const slice = paginate(items, 3, 12);
    expect(slice.items).toEqual([25]);
    expect(pageRangeLabel(slice)).toBe('Menampilkan 25–25 dari 25 pegawai');
  });

  it('pilihan ukuran halaman 12, 20, dan 40', () => {
    expect(PAGE_SIZES).toEqual([12, 20, 40]);
    expect(paginate(items, 1, 20).items).toHaveLength(20);
    expect(paginate(items, 1, 40).totalPages).toBe(1);
  });

  it('halaman di luar rentang dijepit sehingga daftar tidak pernah kosong', () => {
    expect(paginate(items, 99, 12).page).toBe(3);
    expect(paginate(items, 0, 12).page).toBe(1);
    expect(paginate(items, -5, 12).items[0]).toBe(1);
  });

  it('daftar kosong tetap punya satu halaman dan label yang jelas', () => {
    const slice = paginate([], 1, 12);
    expect(slice).toMatchObject({ total: 0, totalPages: 1, from: 0, to: 0 });
    expect(pageRangeLabel(slice)).toBe('Tidak ada pegawai untuk ditampilkan');
  });
});

describe('unit/tim pegawai', () => {
  it('seluruh pegawai memakai satu unit baku "PIP Puslapdik"', () => {
    expect(DEFAULT_TEAM).toBe('PIP Puslapdik');
    const teams = [...new Set(SEED_EMPLOYEES.map((e) => e.team))];
    expect(teams).toEqual([DEFAULT_TEAM]);
  });

  it('filter unit tidak berguna bila hanya ada satu unit', () => {
    const seeded = SEED_EMPLOYEES.map((e, i) => employee({ id: String(i), team: e.team }));
    expect(distinctTeams(seeded).length > 1).toBe(false);
  });

  it('nilai unit kosong dinormalkan menjadi unit baku', () => {
    expect(normalizeTeam('')).toBe(DEFAULT_TEAM);
    expect(normalizeTeam('   ')).toBe(DEFAULT_TEAM);
    expect(normalizeTeam(null)).toBe(DEFAULT_TEAM);
    expect(normalizeTeam('Puslapdik')).toBe('Puslapdik');
  });

  it('daftar unit unik mengabaikan nilai kosong', () => {
    const mixed = [employee({ id: 'a' }), employee({ id: 'b', team: '' })];
    expect(distinctTeams(mixed)).toEqual([DEFAULT_TEAM]);
  });
});
