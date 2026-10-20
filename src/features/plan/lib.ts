/** Util murni Rencana Kegiatan — dipisah agar mudah diuji unit. */
import type { ActivityPlanItem, ActivityStatus } from '@/services/types';

export interface ActivityFilters {
  search: string;
  category: string | 'ALL';
  picEmployeeId: string | 'ALL';
  status: ActivityStatus | 'ALL';
}

export const DEFAULT_FILTERS: ActivityFilters = {
  search: '',
  category: 'ALL',
  picEmployeeId: 'ALL',
  status: 'ALL',
};

export interface StatusMeta {
  label: string;
  /** Token badge (lihat komponen Badge). */
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'brand';
}

export const STATUS_META: Record<ActivityStatus, StatusMeta> = {
  RENCANA: { label: 'Rencana', tone: 'neutral' },
  TERJADWAL: { label: 'Terjadwal', tone: 'info' },
  BERLANGSUNG: { label: 'Berlangsung', tone: 'brand' },
  SELESAI: { label: 'Selesai', tone: 'success' },
  DITUNDA: { label: 'Ditunda', tone: 'warning' },
  DIBATALKAN: { label: 'Dibatalkan', tone: 'danger' },
};

/** yyyy-MM-dd hari ini (zona waktu perangkat). */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Kegiatan berlangsung pada tanggal tertentu (rentang inklusif). */
export function occursOn(item: ActivityPlanItem, isoDate: string): boolean {
  return item.startDate <= isoDate && isoDate <= item.endDate;
}

export function applyFilters(
  items: ActivityPlanItem[],
  filters: ActivityFilters,
): ActivityPlanItem[] {
  const q = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.category !== 'ALL' && item.category !== filters.category) return false;
    if (filters.status !== 'ALL' && item.status !== filters.status) return false;
    if (
      filters.picEmployeeId !== 'ALL' &&
      !item.picEmployeeIds.includes(filters.picEmployeeId)
    ) {
      return false;
    }
    if (q) {
      const haystack = [item.title, item.location, item.category, ...item.picNames, item.notes]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Kegiatan hari ini (status dibatalkan tetap tampil agar jelas — biar UI memutuskan). */
export function itemsToday(items: ActivityPlanItem[], iso = todayISO()): ActivityPlanItem[] {
  return items.filter((i) => occursOn(i, iso));
}

/** Kegiatan mendatang dalam N hari ke depan (tidak termasuk hari ini). */
export function itemsUpcoming(
  items: ActivityPlanItem[],
  days: number,
  iso = todayISO(),
): ActivityPlanItem[] {
  const end = addDaysISO(iso, days);
  return items
    .filter((i) => i.startDate > iso && i.startDate <= end)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function addDaysISO(iso: string, days: number): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return todayISO(date);
}

/** Kelompokkan per bulan (kunci yyyy-MM) untuk daftar kronologis. */
export function groupByMonth(items: ActivityPlanItem[]): Array<[string, ActivityPlanItem[]]> {
  const map = new Map<string, ActivityPlanItem[]>();
  for (const item of items) {
    const key = item.startDate.slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export interface CalendarCell {
  iso: string;
  inMonth: boolean;
  items: ActivityPlanItem[];
}

/**
 * Matriks kalender bulanan (baris minggu × 7 hari, Senin sebagai awal minggu)
 * beserta kegiatan yang berlangsung pada setiap sel.
 */
export function monthMatrix(
  year: number,
  month: number,
  items: ActivityPlanItem[],
): CalendarCell[][] {
  const first = new Date(year, month - 1, 1);
  // Geser ke Senin minggu berjalan (getDay: 0=Minggu).
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - offset);
  const weeks: CalendarCell[][] = [];
  const cursor = new Date(start);
  do {
    const week: CalendarCell[] = [];
    for (let i = 0; i < 7; i += 1) {
      const iso = todayISO(cursor);
      week.push({
        iso,
        inMonth: cursor.getMonth() === month - 1,
        items: items.filter((it) => occursOn(it, iso)),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month - 1);
  return weeks;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Bulan ${month}`;
}

/** "12–14 Agu" / "12 Agu" / "12 Agu 09.00–12.00" — ringkas untuk kartu. */
export function formatRange(item: ActivityPlanItem): string {
  const fmt = (iso: string): string => {
    const [, m = 1, d = 1] = iso.split('-').map(Number);
    return `${d} ${(MONTH_NAMES[m - 1] ?? '').slice(0, 3)}`;
  };
  const date =
    item.startDate === item.endDate ? fmt(item.startDate) : `${fmt(item.startDate)}–${fmt(item.endDate)}`;
  if (item.allDay || !item.startTime) return date;
  const time = item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime;
  return `${date} · ${time.replaceAll(':', '.')}`;
}

/** Daftar kategori unik (untuk filter). */
export function uniqueCategories(items: ActivityPlanItem[]): string[] {
  return [...new Set(items.map((i) => i.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'id'),
  );
}
