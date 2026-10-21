/** Logika murni Dashboard — teruji unit, bebas React. */
import type { BadgeTone } from '@/components/ui/badge';
import type {
  DistributionRow,
  DistributionSnapshot,
  Jenjang,
  PipSkRecord,
  Step,
  StepKind,
  Task,
  TaskComment,
} from '@/services/types';

// ---------------------------------------------------------------------------
// Agregasi penyaluran
// ---------------------------------------------------------------------------

export interface DistributionTotals {
  alokasiSiswa: number;
  alokasiAnggaran: number;
  skSiswa: number;
  skAnggaran: number;
  salurSiswa: number;
  salurAnggaran: number;
  sisaSiswa: number;
  sisaAnggaran: number;
  /** Rasio 0–1. */
  progresSiswa: number;
  progresDana: number;
}

export type JenjangFilter = Jenjang | 'ALL';

/**
 * Menghitung pekerjaan aktif berdasarkan tanggal tenggatnya dari data Board.
 * Tanpa angka contoh agar jumlah mengikuti isi pekerjaan setiap bulan.
 */
export function taskCountsByDueMonth(
  tasks: readonly Pick<Task, 'dueDate'>[],
  year: number,
): number[] {
  const counts = Array.from({ length: 12 }, () => 0);
  for (const task of tasks) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(task.dueDate ?? '');
    if (!match) continue;
    const taskYear = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (taskYear !== year || month < 1 || month > 12 || day < 1 || day > 31) continue;
    const validDate = new Date(Date.UTC(taskYear, month - 1, day));
    if (validDate.getUTCMonth() !== month - 1 || validDate.getUTCDate() !== day) continue;
    counts[month - 1] = (counts[month - 1] ?? 0) + 1;
  }
  return counts;
}

export function totalsFromRows(
  rows: readonly DistributionRow[],
  jenjang: JenjangFilter = 'ALL',
): DistributionTotals {
  const filtered = jenjang === 'ALL' ? rows : rows.filter((r) => r.jenjang === jenjang);
  const sum = (fn: (r: DistributionRow) => number) => filtered.reduce((acc, r) => acc + fn(r), 0);
  const alokasiSiswa = sum((r) => r.alokasiSiswa);
  const alokasiAnggaran = sum((r) => r.alokasiAnggaran);
  const salurSiswa = sum((r) => r.salurSiswa);
  const salurAnggaran = sum((r) => r.salurAnggaran);
  return {
    alokasiSiswa,
    alokasiAnggaran,
    skSiswa: sum((r) => r.skSiswa),
    skAnggaran: sum((r) => r.skAnggaran),
    salurSiswa,
    salurAnggaran,
    sisaSiswa: alokasiSiswa - salurSiswa,
    sisaAnggaran: alokasiAnggaran - salurAnggaran,
    progresSiswa: alokasiSiswa > 0 ? salurSiswa / alokasiSiswa : 0,
    progresDana: alokasiAnggaran > 0 ? salurAnggaran / alokasiAnggaran : 0,
  };
}

/** Titik tren dari riwayat snapshot yang pernah aktif pada scope yang sama. */
export interface TrendPoint {
  date: string;
  salurSiswa: number;
  salurAnggaran: number;
}

export function trendSeries(
  snapshots: readonly DistributionSnapshot[],
  year: number,
  period: string,
  jenjang: JenjangFilter = 'ALL',
  maxPoints = 10,
): TrendPoint[] {
  return snapshots
    .filter((s) => s.year === year && s.period === period && s.activatedAt !== null)
    .sort((a, b) => Date.parse(a.activatedAt!) - Date.parse(b.activatedAt!))
    .map((s) => {
      const t = totalsFromRows(s.rows, jenjang);
      return { date: s.activatedAt!, salurSiswa: t.salurSiswa, salurAnggaran: t.salurAnggaran };
    })
    .slice(-maxPoints);
}

// ---------------------------------------------------------------------------
// Agregasi SK unik (sheet Pemberian — nomor & tanggal SK)
// ---------------------------------------------------------------------------

/** Jumlah SK unik per bulan (1–12) dalam satu tahun anggaran. */
export interface SkMonthCount {
  /** Bulan 1–12. */
  month: number;
  /** SK unik per jenjang yang terbit pada bulan tsb. */
  perJenjang: Partial<Record<Jenjang, number>>;
  /** SK unik (global, lintas jenjang) yang terbit pada bulan tsb. */
  total: number;
}

export interface SkStats {
  /** Jumlah nomor SK unik global (nomor sama di banyak baris = satu SK). */
  totalSk: number;
  /** SK unik per jenjang; SK multi-jenjang dihitung pada tiap jenjang tercatat. */
  perJenjang: Partial<Record<Jenjang, number>>;
  /** Selalu 12 entri (Jan–Des). SK tanpa tanggal valid tidak masuk agregasi bulanan. */
  perMonth: SkMonthCount[];
  /** Baris dengan nomor SK kosong — TIDAK dihitung (tanpa ID buatan). */
  unnumberedRows: number;
  /** SK tanpa tanggal valid pada tahun terpilih — di luar agregasi bulanan. */
  undatedSk: number;
  /**
   * Nomor SK dengan lebih dari satu tanggal berbeda (data perlu validasi).
   * Aturan deterministik: bulan diambil dari tanggal valid PALING AWAL.
   */
  multiDateNomor: string[];
}

/** Normalisasi nomor SK untuk pencocokan: trim + case-insensitive. */
export function normalizeSkNomor(nomor: string): string {
  return nomor.trim().toUpperCase();
}

/** Tanggal ISO valid (yyyy-MM-dd, kalender benar) → dipakai; selain itu null. */
function validIsoDate(value: string | null): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(Number(y), month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * Statistik SK unik dari baris sheet Pemberian.
 * - Nomor dinormalisasi (trim, case-insensitive); nomor kosong dilewati.
 * - Satu nomor pada banyak baris = SATU SK (bukan jumlah baris).
 * - Agregasi bulanan memakai tanggal SK; `year` membatasi tahun anggaran —
 *   tanggal di luar tahun tsb diperlakukan tidak valid untuk agregasi bulanan.
 */
export function skStats(
  records: readonly Pick<PipSkRecord, 'jenjang' | 'skNomor' | 'skTanggal'>[],
  year?: number,
  jenjang: JenjangFilter = 'ALL',
): SkStats {
  const filtered = jenjang === 'ALL' ? records : records.filter((r) => r.jenjang === jenjang);

  interface Group {
    jenjangs: Set<Jenjang>;
    dates: Set<string>;
  }
  const groups = new Map<string, Group>();
  let unnumberedRows = 0;

  for (const r of filtered) {
    const key = normalizeSkNomor(r.skNomor);
    if (!key) {
      unnumberedRows += 1;
      continue;
    }
    const group = groups.get(key) ?? { jenjangs: new Set<Jenjang>(), dates: new Set<string>() };
    group.jenjangs.add(r.jenjang);
    const date = validIsoDate(r.skTanggal);
    if (date && (year === undefined || Number(date.slice(0, 4)) === year)) {
      group.dates.add(date);
    }
    groups.set(key, group);
  }

  const perJenjang: Partial<Record<Jenjang, number>> = {};
  const perMonth: SkMonthCount[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    perJenjang: {},
    total: 0,
  }));
  const multiDateNomor: string[] = [];
  let undatedSk = 0;

  for (const [nomor, group] of groups) {
    for (const j of group.jenjangs) {
      perJenjang[j] = (perJenjang[j] ?? 0) + 1;
    }
    if (group.dates.size === 0) {
      undatedSk += 1;
      continue;
    }
    if (group.dates.size > 1) multiDateNomor.push(nomor);
    // Deterministik: tanggal valid paling awal menentukan bulan penerbitan.
    const earliest = [...group.dates].sort()[0]!;
    const bucket = perMonth[Number(earliest.slice(5, 7)) - 1]!;
    bucket.total += 1;
    for (const j of group.jenjangs) {
      bucket.perJenjang[j] = (bucket.perJenjang[j] ?? 0) + 1;
    }
  }

  return {
    totalSk: groups.size,
    perJenjang,
    perMonth,
    unnumberedRows,
    undatedSk,
    multiDateNomor: multiDateNomor.sort(),
  };
}

// ---------------------------------------------------------------------------
// Perlu Perhatian & Fokus Hari Ini
// ---------------------------------------------------------------------------

export type AttentionKey =
  'OVERDUE' | 'DUE_TODAY' | 'BLOCKED' | 'NO_PIC' | 'STALE' | 'HIGH_PRIORITY';

export interface AttentionReason {
  key: AttentionKey;
  label: string;
  tone: BadgeTone;
}

const REASON_DEFS: Record<AttentionKey, { label: string; tone: BadgeTone; weight: number }> = {
  OVERDUE: { label: 'Melewati tenggat', tone: 'danger', weight: 0 },
  DUE_TODAY: { label: 'Jatuh tempo hari ini', tone: 'warning', weight: 1 },
  BLOCKED: { label: 'Terhambat', tone: 'danger', weight: 2 },
  NO_PIC: { label: 'Belum ada PIC', tone: 'warning', weight: 3 },
  STALE: { label: 'Lama tidak diperbarui', tone: 'neutral', weight: 4 },
  HIGH_PRIORITY: { label: 'Prioritas tinggi', tone: 'brand', weight: 5 },
};

function reason(key: AttentionKey): AttentionReason {
  const def = REASON_DEFS[key];
  return { key, label: def.label, tone: def.tone };
}

export function stepKindMap(steps: readonly Step[]): Map<string, StepKind> {
  return new Map(steps.map((s) => [s.id, s.kind]));
}

/**
 * Alasan sebuah pekerjaan masuk "Perlu Perhatian".
 * Pekerjaan pada step selesai (kind DONE) tidak pernah masuk.
 */
export function attentionReasons(
  task: Task,
  kinds: Map<string, StepKind>,
  staleDays: number,
  todayIso: string,
  nowMs: number = Date.now(),
): AttentionReason[] {
  if (task.archivedAt || task.deletedAt) return [];
  if (kinds.get(task.stepId) === 'DONE') return [];
  const reasons: AttentionReason[] = [];
  if (task.dueDate) {
    if (task.dueDate < todayIso) reasons.push(reason('OVERDUE'));
    else if (task.dueDate === todayIso) reasons.push(reason('DUE_TODAY'));
  }
  if (kinds.get(task.stepId) === 'BLOCKED') reasons.push(reason('BLOCKED'));
  if (task.picMainIds.length === 0 && !task.picMainId && task.picIds.length === 0) {
    reasons.push(reason('NO_PIC'));
  }
  const ageMs = nowMs - Date.parse(task.updatedAt);
  if (Number.isFinite(ageMs) && ageMs > staleDays * 86_400_000) reasons.push(reason('STALE'));
  if (task.priority === 'TINGGI') reasons.push(reason('HIGH_PRIORITY'));
  return reasons;
}

export function attentionScore(reasons: readonly AttentionReason[]): number {
  if (reasons.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...reasons.map((r) => REASON_DEFS[r.key].weight));
}

/**
 * Task yang "memerlukan tindak lanjut": kendala terakhir lebih baru daripada
 * tindak lanjut terakhir.
 */
export function needsFollowUpIds(comments: readonly TaskComment[]): Set<string> {
  const lastKendala = new Map<string, number>();
  const lastTindakLanjut = new Map<string, number>();
  for (const c of comments) {
    const at = Date.parse(c.createdAt);
    if (c.type === 'KENDALA') {
      lastKendala.set(c.taskId, Math.max(lastKendala.get(c.taskId) ?? 0, at));
    } else if (c.type === 'TINDAK_LANJUT') {
      lastTindakLanjut.set(c.taskId, Math.max(lastTindakLanjut.get(c.taskId) ?? 0, at));
    }
  }
  const ids = new Set<string>();
  for (const [taskId, kendalaAt] of lastKendala) {
    if (kendalaAt > (lastTindakLanjut.get(taskId) ?? 0)) ids.add(taskId);
  }
  return ids;
}

export interface FocusItem {
  task: Task;
  reasons: AttentionReason[];
  needsFollowUp: boolean;
}

/**
 * "Fokus Hari Ini": ditandai fokus, jatuh tempo hari ini, prioritas tinggi,
 * terhambat, atau memerlukan tindak lanjut.
 */
export function isFocusToday(
  task: Task,
  reasons: readonly AttentionReason[],
  needsFollowUp: boolean,
): boolean {
  if (task.archivedAt || task.deletedAt) return false;
  if (task.isFocus) return true;
  if (needsFollowUp) return true;
  return reasons.some(
    (r) => r.key === 'DUE_TODAY' || r.key === 'HIGH_PRIORITY' || r.key === 'BLOCKED',
  );
}

/** Skor urutan Fokus Hari Ini: ditandai fokus paling atas. */
export function focusScore(item: FocusItem): number {
  if (item.task.isFocus) return -1;
  const base = attentionScore(item.reasons);
  return item.needsFollowUp ? Math.min(base, 2.5) : base;
}

// ---------------------------------------------------------------------------
// Ringkasan eksekutif pekerjaan (kartu statistik Dashboard)
// ---------------------------------------------------------------------------

export interface WorkStatsSummary {
  /** Jumlah kartu aktif (belum diarsipkan/dihapus, di luar step selesai). */
  totalActive: number;
  /** Jumlah kartu per step (mengikuti urutan step board). */
  perStep: Array<{ step: Step; count: number }>;
  /** Tenggat terdekat yang belum lewat (ISO date) + jumlah kartu pada tanggal itu. */
  nearestDue: { date: string; count: number } | null;
}

export function workStats(
  tasks: readonly Task[],
  steps: readonly Step[],
  todayIso: string,
): WorkStatsSummary {
  const live = tasks.filter((t) => !t.archivedAt && !t.deletedAt);
  const counts = new Map<string, number>();
  for (const t of live) counts.set(t.stepId, (counts.get(t.stepId) ?? 0) + 1);
  const kinds = stepKindMap(steps);

  let nearestDate: string | null = null;
  let nearestCount = 0;
  for (const t of live) {
    if (!t.dueDate || t.dueDate < todayIso) continue;
    if (kinds.get(t.stepId) === 'DONE') continue;
    if (nearestDate === null || t.dueDate < nearestDate) {
      nearestDate = t.dueDate;
      nearestCount = 1;
    } else if (t.dueDate === nearestDate) {
      nearestCount += 1;
    }
  }

  return {
    totalActive: live.filter((t) => kinds.get(t.stepId) !== 'DONE').length,
    perStep: steps.map((step) => ({ step, count: counts.get(step.id) ?? 0 })),
    nearestDue: nearestDate ? { date: nearestDate, count: nearestCount } : null,
  };
}
