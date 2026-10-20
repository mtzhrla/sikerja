/** Validasi data penyaluran agregat — dipakai adapter lokal, adapter produksi, dan UI. */
import { JENJANG_LIST, type DistributionRow } from './types';

/** Validasi baris agregat — dipakai upload, koreksi, dan test. */
export function validateRows(rows: DistributionRow[]): string[] {
  const errors: string[] = [];
  if (rows.length === 0) errors.push('Data kosong — tidak ada baris yang dapat disimpan.');
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const rowLabel = `Baris ${i + 1} (${row.jenjang || '?'})`;
    if (!JENJANG_LIST.includes(row.jenjang)) {
      errors.push(`${rowLabel}: jenjang tidak valid (harus SD/SMP/SMA/SMK).`);
      return;
    }
    if (seen.has(row.jenjang)) errors.push(`${rowLabel}: jenjang ${row.jenjang} duplikat.`);
    seen.add(row.jenjang);
    const numbers: Array<[string, number]> = [
      ['alokasi siswa', row.alokasiSiswa],
      ['alokasi anggaran', row.alokasiAnggaran],
      ['SK siswa', row.skSiswa],
      ['SK anggaran', row.skAnggaran],
      ['salur siswa', row.salurSiswa],
      ['salur anggaran', row.salurAnggaran],
    ];
    for (const [label, value] of numbers) {
      if (!Number.isFinite(value)) errors.push(`${rowLabel}: ${label} bukan angka.`);
      else if (value < 0) errors.push(`${rowLabel}: ${label} tidak boleh negatif.`);
      else if (!Number.isInteger(value)) errors.push(`${rowLabel}: ${label} harus bilangan bulat.`);
    }
    if (row.skSiswa > row.alokasiSiswa)
      errors.push(`${rowLabel}: SK siswa melebihi alokasi siswa.`);
    if (row.salurSiswa > row.alokasiSiswa)
      errors.push(`${rowLabel}: siswa tersalur melebihi alokasi siswa.`);
    if (row.salurAnggaran > row.alokasiAnggaran)
      errors.push(`${rowLabel}: dana tersalur melebihi alokasi anggaran.`);
    if (row.skAnggaran > row.alokasiAnggaran)
      errors.push(`${rowLabel}: SK anggaran melebihi alokasi anggaran.`);
  });
  return errors;
}

export function validateScope(year: number, period: string): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    errors.push('Tahun tidak valid (2020–2100).');
  }
  if (!period.trim()) errors.push('Periode wajib diisi.');
  if (period.trim().length > 30) errors.push('Periode maksimal 30 karakter.');
  return errors;
}
