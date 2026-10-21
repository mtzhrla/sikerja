import { describe, expect, it } from 'vitest';
import type { DistributionRow, Task, TaskComment } from '@/services/types';
import {
  attentionReasons,
  attentionScore,
  isFocusToday,
  needsFollowUpIds,
  skStats,
  taskCountsByDueMonth,
  totalsFromRows,
  trendSeries,
  workStats,
} from './lib';

const rows: DistributionRow[] = [
  {
    jenjang: 'SD',
    alokasiSiswa: 100,
    alokasiAnggaran: 45_000,
    skSiswa: 90,
    skAnggaran: 40_500,
    salurSiswa: 80,
    salurAnggaran: 36_000,
  },
  {
    jenjang: 'SMP',
    alokasiSiswa: 50,
    alokasiAnggaran: 37_500,
    skSiswa: 40,
    skAnggaran: 30_000,
    salurSiswa: 25,
    salurAnggaran: 18_750,
  },
];

function makeTask(partial: Partial<Task>): Task {
  return {
    id: 't1',
    boardId: 'b',
    stepId: 'step-normal',
    title: 'Uji',
    description: '',
    durationType: 'JANGKA_PENDEK',
    categoryId: null,
    labelIds: [],
    priority: 'SEDANG',
    startDate: null,
    dueDate: null,
    progressMode: 'MANUAL',
    manualProgress: 0,
    picMainIds: ['emp-1'],
    picMainId: 'emp-1',
    picIds: [],
    checklist: [],
    isFocus: false,
    sortOrder: 0,
    archivedAt: null,
    deletedAt: null,
    deleteReason: null,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
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

const kinds = new Map<string, 'NORMAL' | 'BLOCKED' | 'DONE'>([
  ['step-normal', 'NORMAL'],
  ['step-blocked', 'BLOCKED'],
  ['step-done', 'DONE'],
]);

const TODAY = '2026-07-16';
const NOW = Date.parse('2026-07-16T08:00:00.000Z');

describe('taskCountsByDueMonth', () => {
  it('mengikuti jumlah pekerjaan berdasarkan tanggal tenggatnya', () => {
    const tasks = [
      makeTask({ id: 'jan-1', dueDate: '2026-01-02' }),
      makeTask({ id: 'jan-2', dueDate: '2026-01-18' }),
      makeTask({ id: 'apr', dueDate: '2026-04-07' }),
      makeTask({ id: 'nov', dueDate: '2026-11-02' }),
      makeTask({ id: 'no-due', dueDate: null }),
    ];

    expect(taskCountsByDueMonth(tasks, 2026)).toEqual([2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0]);
    expect(taskCountsByDueMonth(tasks.filter((task) => task.id !== 'nov'), 2026)).toEqual([
      2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it('mengabaikan tenggat di luar tahun terpilih dan tanggal tidak valid', () => {
    const tasks = [
      makeTask({ id: 'jan', dueDate: '2025-01-02' }),
      makeTask({ id: 'oct', dueDate: '2025-10-20' }),
      makeTask({ id: 'other-year', dueDate: '2026-04-02' }),
      makeTask({ id: 'invalid', dueDate: '2025-02-31' }),
    ];

    expect(taskCountsByDueMonth(tasks, 2025)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
  });

  it('mengembalikan nol pada semua bulan jika belum ada pekerjaan', () => {
    expect(taskCountsByDueMonth([], 2026)).toEqual(Array.from({ length: 12 }, () => 0));
  });
});

describe('totalsFromRows', () => {
  it('menjumlahkan seluruh jenjang dan menghitung sisa & progres', () => {
    const t = totalsFromRows(rows);
    expect(t.alokasiSiswa).toBe(150);
    expect(t.salurSiswa).toBe(105);
    expect(t.sisaSiswa).toBe(45);
    expect(t.progresSiswa).toBeCloseTo(0.7);
    expect(t.progresDana).toBeCloseTo(54_750 / 82_500);
  });

  it('filter jenjang hanya menghitung jenjang tersebut', () => {
    const t = totalsFromRows(rows, 'SMP');
    expect(t.alokasiSiswa).toBe(50);
    expect(t.progresSiswa).toBeCloseTo(0.5);
  });

  it('alokasi nol tidak membagi nol', () => {
    const t = totalsFromRows([]);
    expect(t.progresSiswa).toBe(0);
  });
});

describe('attentionReasons', () => {
  it('melewati tenggat & jatuh tempo hari ini', () => {
    const overdue = attentionReasons(makeTask({ dueDate: '2026-07-10' }), kinds, 7, TODAY, NOW);
    expect(overdue.map((r) => r.key)).toContain('OVERDUE');
    const dueToday = attentionReasons(makeTask({ dueDate: TODAY }), kinds, 7, TODAY, NOW);
    expect(dueToday.map((r) => r.key)).toContain('DUE_TODAY');
  });

  it('tanpa PIC, terhambat (step BLOCKED), prioritas tinggi', () => {
    const r = attentionReasons(
      makeTask({
        picMainIds: [],
        picMainId: null,
        picIds: [],
        stepId: 'step-blocked',
        priority: 'TINGGI',
      }),
      kinds,
      7,
      TODAY,
      NOW,
    );
    const keys = r.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['NO_PIC', 'BLOCKED', 'HIGH_PRIORITY']));
  });

  it('lama tidak diperbarui memakai ambang staleDays', () => {
    const stale = attentionReasons(
      makeTask({ updatedAt: '2026-07-01T00:00:00.000Z' }),
      kinds,
      7,
      TODAY,
      NOW,
    );
    expect(stale.map((r) => r.key)).toContain('STALE');
    const fresh = attentionReasons(
      makeTask({ updatedAt: '2026-07-15T00:00:00.000Z' }),
      kinds,
      7,
      TODAY,
      NOW,
    );
    expect(fresh.map((r) => r.key)).not.toContain('STALE');
  });

  it('pekerjaan pada step selesai/arsip/terhapus tidak pernah masuk', () => {
    expect(
      attentionReasons(
        makeTask({ stepId: 'step-done', dueDate: '2026-07-01' }),
        kinds,
        7,
        TODAY,
        NOW,
      ),
    ).toEqual([]);
    expect(
      attentionReasons(
        makeTask({ archivedAt: '2026-07-01T00:00:00.000Z', dueDate: '2026-07-01' }),
        kinds,
        7,
        TODAY,
        NOW,
      ),
    ).toEqual([]);
  });

  it('terlambat mendapat skor paling penting', () => {
    const overdue = attentionReasons(makeTask({ dueDate: '2026-07-10' }), kinds, 7, TODAY, NOW);
    const highOnly = attentionReasons(makeTask({ priority: 'TINGGI' }), kinds, 7, TODAY, NOW);
    expect(attentionScore(overdue)).toBeLessThan(attentionScore(highOnly));
  });
});

describe('needsFollowUpIds', () => {
  const cmt = (taskId: string, type: TaskComment['type'], at: string): TaskComment => ({
    id: `${taskId}-${type}-${at}`,
    taskId,
    type,
    text: 'x',
    employeeId: 'e',
    createdAt: at,
  });

  it('kendala terbaru tanpa tindak lanjut sesudahnya = perlu tindak lanjut', () => {
    const ids = needsFollowUpIds([
      cmt('a', 'KENDALA', '2026-07-15T00:00:00Z'),
      cmt('a', 'TINDAK_LANJUT', '2026-07-14T00:00:00Z'),
      cmt('b', 'KENDALA', '2026-07-10T00:00:00Z'),
      cmt('b', 'TINDAK_LANJUT', '2026-07-12T00:00:00Z'),
      cmt('c', 'KOMENTAR', '2026-07-15T00:00:00Z'),
    ]);
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(false);
    expect(ids.has('c')).toBe(false);
  });
});

describe('isFocusToday', () => {
  it('ditandai fokus selalu masuk', () => {
    const t = makeTask({ isFocus: true });
    expect(isFocusToday(t, [], false)).toBe(true);
  });
  it('memerlukan tindak lanjut masuk fokus', () => {
    const t = makeTask({});
    expect(isFocusToday(t, [], true)).toBe(true);
  });
  it('pekerjaan biasa tidak masuk', () => {
    const t = makeTask({});
    expect(isFocusToday(t, attentionReasons(t, kinds, 7, TODAY, NOW), false)).toBe(false);
  });
});

describe('trendSeries', () => {
  it('mengurutkan berdasarkan waktu aktivasi dan memfilter scope', () => {
    const snap = (id: string, activatedAt: string | null, salur: number) => ({
      id,
      year: 2026,
      period: 'Termin 1',
      status: 'ARCHIVED' as const,
      rows: [{ ...rows[0]!, salurSiswa: salur }],
      sourceFileName: null,
      note: null,
      createdAt: activatedAt ?? '2026-01-01T00:00:00Z',
      createdByEmployeeId: null,
      activatedAt,
      updatedAt: activatedAt ?? '2026-01-01T00:00:00Z',
      version: 1,
    });
    const series = trendSeries(
      [
        snap('b', '2026-03-01T00:00:00Z', 40),
        snap('a', '2026-02-01T00:00:00Z', 20),
        snap('draft', null, 99),
        { ...snap('other', '2026-03-01T00:00:00Z', 70), period: 'Termin 2' },
      ],
      2026,
      'Termin 1',
    );
    expect(series.map((p) => p.salurSiswa)).toEqual([20, 40]);
  });
});

describe('workStats', () => {
  const steps = [
    {
      id: 'step-normal',
      boardId: 'b',
      name: 'To Do',
      kind: 'NORMAL' as const,
      color: '#111',
      sortOrder: 0,
      deletedAt: null,
      version: 1,
    },
    {
      id: 'step-done',
      boardId: 'b',
      name: 'Selesai',
      kind: 'DONE' as const,
      color: '#222',
      sortOrder: 1,
      deletedAt: null,
      version: 1,
    },
  ];

  it('menghitung total aktif (tanpa selesai/arsip), jumlah per step, dan tenggat terdekat', () => {
    const tasks = [
      makeTask({ id: 'a', stepId: 'step-normal', dueDate: '2026-07-20' }),
      makeTask({ id: 'b', stepId: 'step-normal', dueDate: '2026-07-18' }),
      makeTask({ id: 'c', stepId: 'step-normal', dueDate: '2026-07-18' }),
      makeTask({ id: 'done', stepId: 'step-done', dueDate: '2026-07-17' }),
      makeTask({ id: 'arsip', stepId: 'step-normal', archivedAt: '2026-07-01T00:00:00Z' }),
      makeTask({ id: 'lewat', stepId: 'step-normal', dueDate: '2026-07-01' }),
    ];
    const s = workStats(tasks, steps, TODAY);
    expect(s.totalActive).toBe(4); // a, b, c, lewat — done & arsip tidak dihitung
    expect(s.perStep.map((p) => p.count)).toEqual([4, 1]);
    // Tenggat terdekat ≥ hari ini; step selesai & yang sudah lewat diabaikan
    expect(s.nearestDue).toEqual({ date: '2026-07-18', count: 2 });
  });

  it('tanpa tenggat mendatang → nearestDue null', () => {
    const s = workStats([makeTask({ dueDate: '2026-07-01' })], steps, TODAY);
    expect(s.nearestDue).toBeNull();
  });
});

describe('skStats', () => {
  const rec = (
    jenjang: 'SD' | 'SMP' | 'SMA' | 'SMK',
    skNomor: string,
    skTanggal: string | null,
  ) => ({ jenjang, skNomor, skTanggal });

  it('nomor SK sama pada banyak baris dihitung SATU SK (bukan jumlah baris)', () => {
    const s = skStats(
      [
        rec('SD', '1/PLPP.1.1/BP/SK.1/2026', '2026-03-30'),
        rec('SD', '1/PLPP.1.1/BP/SK.1/2026', '2026-03-30'),
        rec('SD', ' 1/plpp.1.1/bp/sk.1/2026 ', '2026-03-30'), // trim + case-insensitive
        rec('SMP', '6/PLPP.1.2/BP/SK.1/2026', '2026-03-30'),
      ],
      2026,
    );
    expect(s.totalSk).toBe(2);
    expect(s.perJenjang).toEqual({ SD: 1, SMP: 1 });
    expect(s.perMonth[2]).toEqual({ month: 3, perJenjang: { SD: 1, SMP: 1 }, total: 2 });
  });

  it('nomor SK kosong dilewati tanpa membuat ID buatan', () => {
    const s = skStats(
      [
        rec('SD', '', '2026-04-01'),
        rec('SD', '   ', '2026-04-01'),
        rec('SD', 'SK-A', '2026-04-01'),
      ],
      2026,
    );
    expect(s.totalSk).toBe(1);
    expect(s.unnumberedRows).toBe(2);
    expect(s.perMonth[3]!.total).toBe(1);
  });

  it('tanggal invalid/kosong/di luar tahun → di luar agregasi bulanan, tetap dihitung sebagai SK', () => {
    const s = skStats(
      [
        rec('SMA', 'SK-1', null),
        rec('SMA', 'SK-2', '30/03/2026'), // format bukan ISO
        rec('SMA', 'SK-3', '2026-02-30'), // kalender tidak valid
        rec('SMA', 'SK-4', '2025-11-10'), // tahun lain
        rec('SMA', 'SK-5', '2026-06-05'),
      ],
      2026,
    );
    expect(s.totalSk).toBe(5);
    expect(s.perJenjang).toEqual({ SMA: 5 });
    expect(s.undatedSk).toBe(4);
    expect(s.perMonth.reduce((a, m) => a + m.total, 0)).toBe(1);
    expect(s.perMonth[5]!.total).toBe(1);
  });

  it('satu SK lintas jenjang: dihitung pada tiap jenjang; total global tetap satu', () => {
    const s = skStats(
      [rec('SD', 'SK-GAB', '2026-05-02'), rec('SMP', 'SK-GAB', '2026-05-02')],
      2026,
    );
    expect(s.totalSk).toBe(1);
    expect(s.perJenjang).toEqual({ SD: 1, SMP: 1 });
    expect(s.perMonth[4]).toEqual({ month: 5, perJenjang: { SD: 1, SMP: 1 }, total: 1 });
  });

  it('satu nomor dengan beberapa tanggal → perlu validasi; bulan dari tanggal paling awal', () => {
    const s = skStats([rec('SMK', 'SK-X', '2026-06-20'), rec('SMK', 'SK-X', '2026-04-08')], 2026);
    expect(s.totalSk).toBe(1);
    expect(s.multiDateNomor).toEqual(['SK-X']);
    expect(s.perMonth[3]!.total).toBe(1); // April (paling awal)
    expect(s.perMonth[5]!.total).toBe(0);
  });

  it('filter jenjang membatasi baris yang diagregasi', () => {
    const data = [
      rec('SD', 'SK-SD-1', '2026-03-01'),
      rec('SMP', 'SK-SMP-1', '2026-03-01'),
      rec('SMP', 'SK-SMP-2', '2026-04-01'),
    ];
    const all = skStats(data, 2026);
    expect(all.totalSk).toBe(3);
    const smp = skStats(data, 2026, 'SMP');
    expect(smp.totalSk).toBe(2);
    expect(smp.perJenjang).toEqual({ SMP: 2 });
    expect(smp.perMonth[2]!.total).toBe(1);
    expect(smp.perMonth[3]!.total).toBe(1);
  });

  it('selalu mengembalikan 12 bulan (Jan–Des)', () => {
    const s = skStats([], 2026);
    expect(s.perMonth).toHaveLength(12);
    expect(s.perMonth.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
