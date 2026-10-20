import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

const nfID = new Intl.NumberFormat('id-ID');

/** 1234567 → "1.234.567" */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '–';
  return nfID.format(value);
}

/** Rupiah penuh: 1500000 → "Rp1.500.000" */
export function formatRupiah(value: number): string {
  if (!Number.isFinite(value)) return '–';
  return `Rp${nfID.format(Math.round(value))}`;
}

/**
 * Rupiah ringkas untuk kartu statistik / TV:
 * 1_500_000_000_000 → "Rp1,50 T"; 2_300_000_000 → "Rp2,30 M"; 750_000_000 → "Rp750,0 jt"
 */
export function formatRupiahCompact(value: number): string {
  if (!Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const fmt = (v: number, suffix: string, digits = 2) =>
    `${sign}Rp${v.toLocaleString('id-ID', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })} ${suffix}`;
  if (abs >= 1e12) return fmt(abs / 1e12, 'T');
  if (abs >= 1e9) return fmt(abs / 1e9, 'M');
  if (abs >= 1e6) return fmt(abs / 1e6, 'jt', 1);
  return `${sign}Rp${nfID.format(Math.round(abs))}`;
}

const nfCompact = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 10_400_000 → "10,4 jt" (ringkas untuk sumbu & label chart). */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '–';
  return nfCompact.format(value);
}

/** 0.734 (rasio) → "73,4%" */
export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return '–';
  return `${(ratio * 100).toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function toDate(value: string | Date): Date | null {
  const d = typeof value === 'string' ? parseISO(value) : value;
  return isValid(d) ? d : null;
}

/** "2026-07-16" → "16 Jul 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '–';
  const d = toDate(value);
  return d ? format(d, 'd MMM yyyy', { locale: localeId }) : '–';
}

/** → "16 Jul 2026, 09.30" */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '–';
  const d = toDate(value);
  return d ? format(d, 'd MMM yyyy, HH.mm', { locale: localeId }) : '–';
}

/** → "3 hari yang lalu" */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '–';
  const d = toDate(value);
  if (!d) return '–';
  return formatDistanceToNowStrict(d, { addSuffix: true, locale: localeId });
}

/** Tanggal ISO hari ini (yyyy-MM-dd, zona waktu perangkat). */
export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}
