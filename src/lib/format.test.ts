import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatNumber,
  formatPercent,
  formatRupiah,
  formatRupiahCompact,
} from './format';

// Normalisasi spasi non-breaking (beberapa ICU memakainya pada output Intl).
const norm = (s: string) => s.replace(/\u00A0/g, ' ');

describe('formatNumber', () => {
  it('memformat ribuan dengan pemisah titik', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
  });
  it('menangani nol dan NaN', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('–');
  });
});

describe('formatRupiah', () => {
  it('memformat rupiah penuh', () => {
    expect(formatRupiah(1500000)).toBe('Rp1.500.000');
  });
});

describe('formatRupiahCompact', () => {
  it('memakai satuan Triliun', () => {
    expect(norm(formatRupiahCompact(1_500_000_000_000))).toBe('Rp1,50 T');
  });
  it('memakai satuan Miliar', () => {
    expect(norm(formatRupiahCompact(2_300_000_000))).toBe('Rp2,30 M');
  });
  it('memakai satuan juta', () => {
    expect(norm(formatRupiahCompact(750_000_000))).toBe('Rp750,0 jt');
  });
  it('nilai kecil tetap penuh', () => {
    expect(formatRupiahCompact(950_000)).toBe('Rp950.000');
  });
});

describe('formatPercent', () => {
  it('memformat rasio menjadi persen dengan koma desimal', () => {
    expect(formatPercent(0.734)).toBe('73,4%');
  });
  it('membulatkan sesuai digit', () => {
    expect(formatPercent(1, 0)).toBe('100%');
  });
});

describe('formatDate', () => {
  it('memformat tanggal ISO dalam Bahasa Indonesia', () => {
    expect(formatDate('2026-07-16')).toBe('16 Jul 2026');
  });
  it('mengembalikan strip untuk nilai kosong', () => {
    expect(formatDate(null)).toBe('–');
    expect(formatDate('bukan-tanggal')).toBe('–');
  });
});
