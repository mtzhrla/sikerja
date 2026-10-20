import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_RULES,
  detectMappings,
  parseAlokasiMatrix,
  parseIdDateRange,
  PIP_DETAIL_RULES,
} from './parse';

describe('parseIdDateRange (kalender Indonesia)', () => {
  it('rentang satu bulan "6 - 9 Januari"', () => {
    expect(parseIdDateRange('6 - 9 Januari', 2026)).toEqual({
      start: '2026-01-06',
      end: '2026-01-09',
    });
  });

  it('rentang lintas bulan "30 Maret - 2 April"', () => {
    expect(parseIdDateRange('30 Maret - 2 April', 2026)).toEqual({
      start: '2026-03-30',
      end: '2026-04-02',
    });
  });

  it('rentang ganda "8 - 11 Maret & 12 - 15 Maret" → rentang menyeluruh', () => {
    expect(parseIdDateRange('8 - 11 Maret & 12 - 15 Maret', 2026)).toEqual({
      start: '2026-03-08',
      end: '2026-03-15',
    });
  });

  it('tanggal tunggal "6 Januari" → mulai = selesai', () => {
    expect(parseIdDateRange('6 Januari', 2026)).toEqual({
      start: '2026-01-06',
      end: '2026-01-06',
    });
  });

  it('mengabaikan spasi berlebih', () => {
    expect(parseIdDateRange('  10 - 13 Februari ', 2026)).toEqual({
      start: '2026-02-10',
      end: '2026-02-13',
    });
  });

  it('null untuk kosong, header, atau format numerik (dilempar ke parseIdDate)', () => {
    expect(parseIdDateRange('', 2026)).toBeNull();
    expect(parseIdDateRange('Tanggal', 2026)).toBeNull();
    expect(parseIdDateRange('17/07/2026', 2026)).toBeNull();
  });
});

describe('detectMappings — dua fase (utamakan kolom TOTAL)', () => {
  it('Pemberian: jumlah_siswa/jumlah_dana mengunci kolom TOTAL, bukan AWAL/AKHIR', () => {
    const headers = [
      'NO', 'TIPE SK', 'JENJANG', 'TAHAP', 'KATEGORI', 'KETERANGAN',
      'SISWA_AWAL/AKHIR', 'DANA_AWAL/AKHIR', 'SISWA_BERJALAN', 'DANA_BERJALAN',
      'SISWA_TOTAL', 'DANA_TOTAL', 'NOMOR_SK', 'TGL_SK',
    ];
    const detected = detectMappings(headers, PIP_DETAIL_RULES);
    const by = (f: string) => detected.find((d) => d.targetField === f)?.detectedHeader;
    expect(by('jumlah_siswa')).toBe('SISWA_TOTAL');
    expect(by('jumlah_dana')).toBe('DANA_TOTAL');
    expect(by('jenjang')).toBe('JENJANG');
    expect(by('sk_nomor')).toBe('NOMOR_SK');
    expect(by('sk_tanggal')).toBe('TGL_SK');
  });

  it('tetap cocok saat hanya ada kolom generik (tanpa TOTAL)', () => {
    const detected = detectMappings(['Jenjang', 'Jumlah Siswa', 'Dana'], PIP_DETAIL_RULES);
    const by = (f: string) => detected.find((d) => d.targetField === f)?.detectedHeader;
    expect(by('jumlah_siswa')).toBe('Jumlah Siswa');
    expect(by('jumlah_dana')).toBe('Dana');
  });

  it('Kalender: Tanggal/Nama Kegiatan/Substansi/Tempat/Peserta', () => {
    const headers = ['', 'JANUARY 2026', '', '', '', '', '', '', 'Tanggal', 'Nama Kegiatan', 'Substansi', 'Tempat', 'Peserta'];
    const detected = detectMappings(headers, ACTIVITY_RULES);
    const by = (f: string) => detected.find((d) => d.targetField === f)?.detectedHeader;
    expect(by('start_date')).toBe('Tanggal');
    expect(by('title')).toBe('Nama Kegiatan');
    expect(by('notes')).toBe('Substansi');
    expect(by('location')).toBe('Tempat');
    expect(by('participants')).toBe('Peserta');
  });
});

describe('parseAlokasiMatrix (REKAP PROGRESS baris TOTAL)', () => {
  const values: string[][] = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Rekap Sasaran'],
    ['ALOKASI 2026', '', '', '', 'SISWA', '', '', '', '', 'DANA'],
    ['', '', '', '', 'TK', 'SD', 'SMP', 'SMA', 'SMK', 'TK', 'SD', 'SMP', 'SMA', 'SMK'],
    ['', '', '', '', '  888.000  ', '  10.360.614  ', '', '', '', '', '  4.212.276.300.000  '],
    ['TAMBAHAN/BLOKIR'],
    [
      'TOTAL', '', '', '',
      '  888.000  ', '  10.360.614  ', '  4.369.968  ', '  1.935.774  ', '  1.928.271  ',
      '  399.600.000.000  ', '  4.212.276.300.000  ', '  2.711.107.500.000  ',
      '  3.291.821.100.000  ', '  3.148.801.200.000  ',
    ],
  ];

  it('membaca kuota siswa & dana per jenjang dari baris TOTAL', () => {
    const q = parseAlokasiMatrix(values);
    expect(q).not.toBeNull();
    expect(q!.SD).toEqual({ siswa: 10360614, dana: 4212276300000 });
    expect(q!.SMP).toEqual({ siswa: 4369968, dana: 2711107500000 });
    expect(q!.SMA).toEqual({ siswa: 1935774, dana: 3291821100000 });
    expect(q!.SMK).toEqual({ siswa: 1928271, dana: 3148801200000 });
    expect(q!.TK).toEqual({ siswa: 888000, dana: 399600000000 });
  });

  it('null bila anchor "ALOKASI 2026" tidak ada', () => {
    expect(parseAlokasiMatrix([['x'], ['y']])).toBeNull();
  });
});
