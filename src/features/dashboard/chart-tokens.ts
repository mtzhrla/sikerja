import type { Jenjang } from '@/services/types';

/**
 * Token warna chart (tervalidasi validator dataviz — mode light,
 * permukaan kartu putih):
 * - Ramp ordinal 1 hue (Alokasi → SK → Tersalur): #5a9cf5, #2361e3, #14244d.
 */
export const ORDINAL_RAMP = {
  alokasi: '#5a9cf5',
  sk: '#2361e3',
  salur: '#14244d',
} as const;

/**
 * Warna kategorikal jenjang — urutan tetap SD→SMP→SMA→SMK, tidak pernah
 * digilir ulang. Lolos validator (CVD ΔE 16,3; normal ΔE 19,6 pada putih).
 * Kontras magenta/kuning < 3:1 → wajib ada relief: legend + tabel rekap
 * dengan angka eksak selalu tampil bersama chart yang memakainya.
 */
export const JENJANG_COLORS: Record<Jenjang, string> = {
  SD: '#2a78d6',
  SMP: '#008300',
  SMA: '#e87ba4',
  SMK: '#eda100',
} as const;

export const CHART_INK = {
  grid: '#e2e8f0',
  axis: '#64748b',
  label: '#334155',
  areaStroke: '#2361e3',
  areaFillFrom: 'rgba(53, 121, 238, 0.28)',
  areaFillTo: 'rgba(53, 121, 238, 0.02)',
} as const;
