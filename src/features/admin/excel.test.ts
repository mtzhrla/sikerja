import { describe, expect, it } from 'vitest';
import { validateRows } from '@/services/local/distribution.service';
import { convertRows, guessMapping, parseJenjangCell, parseNumberCell } from './excel';

describe('parseNumberCell', () => {
  it('menangani format Indonesia', () => {
    expect(parseNumberCell('10.400.000')).toBe(10_400_000);
    expect(parseNumberCell('Rp 4.680.000.000,00')).toBe(4_680_000_000);
    expect(parseNumberCell(12345.6)).toBe(12346);
    expect(parseNumberCell('0')).toBe(0);
  });
  it('nilai tidak valid menjadi NaN', () => {
    expect(Number.isNaN(parseNumberCell('abc'))).toBe(true);
    expect(Number.isNaN(parseNumberCell(''))).toBe(true);
  });
});

describe('parseJenjangCell', () => {
  it('menormalkan huruf besar', () => {
    expect(parseJenjangCell('sd')).toBe('SD');
    expect(parseJenjangCell(' SMK ')).toBe('SMK');
    expect(parseJenjangCell('universitas')).toBeNull();
  });
});

describe('guessMapping', () => {
  it('menebak kolom dari header umum', () => {
    const mapping = guessMapping([
      'Jenjang',
      'Alokasi Siswa',
      'Alokasi Anggaran',
      'SK Siswa',
      'SK Anggaran',
      'Siswa Tersalur',
      'Dana Tersalur',
    ]);
    expect(mapping.jenjang).toBe(0);
    expect(mapping.alokasiSiswa).toBe(1);
    expect(mapping.salurAnggaran).toBe(6);
  });
});

describe('convertRows + validateRows', () => {
  const mapping = {
    jenjang: 0,
    alokasiSiswa: 1,
    alokasiAnggaran: 2,
    skSiswa: 3,
    skAnggaran: 4,
    salurSiswa: 5,
    salurAnggaran: 6,
  } as const;

  it('data valid lolos validasi', () => {
    const rows = convertRows(
      [
        ['SD', '100', '45.000.000', '90', '40.500.000', '80', '36.000.000'],
        ['SMP', 50, 37_500_000, 40, 30_000_000, 25, 18_750_000],
      ],
      mapping,
    );
    expect(validateRows(rows)).toEqual([]);
  });

  it('jenjang tidak dikenal & angka negatif terdeteksi', () => {
    const rows = convertRows(
      [
        ['SLB', '10', '100', '5', '50', '2', '20'],
        ['SD', '-5', '100', '5', '50', '2', '20'],
      ],
      mapping,
    );
    const errors = validateRows(rows);
    expect(errors.some((e) => e.includes('jenjang tidak valid'))).toBe(true);
    expect(errors.some((e) => e.includes('tidak boleh negatif'))).toBe(true);
  });

  it('salur melebihi alokasi terdeteksi', () => {
    const rows = convertRows([['SD', '100', '1000', '90', '900', '150', '900']], mapping);
    const errors = validateRows(rows);
    expect(errors.some((e) => e.includes('melebihi alokasi'))).toBe(true);
  });
});
