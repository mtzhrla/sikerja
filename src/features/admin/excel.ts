/** Parsing & pemetaan berkas Excel data penyaluran (agregat per jenjang). */
import ExcelJS from 'exceljs';
import type { DistributionRow, Jenjang } from '@/services/types';
import { JENJANG_LIST } from '@/services/types';

export interface ParsedSheet {
  headers: string[];
  rows: Array<Array<string | number>>;
}

export type FieldKey = keyof DistributionRow;

export const FIELD_DEFS: Array<{ key: FieldKey; label: string; keywords: string[] }> = [
  { key: 'jenjang', label: 'Jenjang', keywords: ['jenjang', 'jenis', 'satuan'] },
  { key: 'alokasiSiswa', label: 'Alokasi siswa', keywords: ['alokasi siswa', 'alokasi_siswa', 'kuota'] },
  { key: 'alokasiAnggaran', label: 'Alokasi anggaran', keywords: ['alokasi anggaran', 'pagu', 'anggaran'] },
  { key: 'skSiswa', label: 'SK siswa', keywords: ['sk siswa', 'sk_siswa', 'sk pemberian siswa'] },
  { key: 'skAnggaran', label: 'SK anggaran', keywords: ['sk anggaran', 'sk_anggaran', 'sk pemberian anggaran', 'nominal sk'] },
  { key: 'salurSiswa', label: 'Siswa tersalur', keywords: ['siswa tersalur', 'salur siswa', 'tersalur siswa', 'penyaluran siswa'] },
  { key: 'salurAnggaran', label: 'Dana tersalur', keywords: ['dana tersalur', 'salur anggaran', 'tersalur anggaran', 'nominal salur', 'dana'] },
];

/** Baca sheet pertama workbook menjadi header + baris data. */
export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headers: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = String(cell.value ?? '').trim();
  });

  const rows: Array<Array<string | number>> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Array<string | number> = [];
    for (let col = 1; col <= headers.length; col += 1) {
      const cell = row.getCell(col);
      const v = cell.value;
      if (v === null || v === undefined) values[col - 1] = '';
      else if (typeof v === 'number') values[col - 1] = v;
      else if (typeof v === 'object' && 'result' in v) {
        values[col - 1] = (v.result as string | number | undefined) ?? '';
      } else values[col - 1] = String(v).trim();
    }
    if (values.some((v) => v !== '')) rows.push(values);
  });
  return { headers: headers.map((h) => h ?? ''), rows };
}

/** Tebak pemetaan kolom dari nama header. */
export function guessMapping(headers: string[]): Partial<Record<FieldKey, number>> {
  const mapping: Partial<Record<FieldKey, number>> = {};
  const normalized = headers.map((h) => h.toLowerCase().replace(/[_-]+/g, ' ').trim());
  for (const def of FIELD_DEFS) {
    let found = -1;
    for (const kw of def.keywords) {
      found = normalized.findIndex(
        (h, i) => h.includes(kw) && !Object.values(mapping).includes(i),
      );
      if (found >= 0) break;
    }
    if (found >= 0) mapping[def.key] = found;
  }
  return mapping;
}

/** "10.400.000" / "Rp 1.500,00" / 10400000 → angka bulat; NaN bila tidak valid. */
export function parseNumberCell(value: string | number): number {
  if (typeof value === 'number') return Math.round(value);
  const cleaned = value
    .replace(/rp/gi, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/,\d{1,2}$/, '') // buang desimal ,00
    .replace(/,/g, '');
  if (cleaned === '' || !/^-?\d+$/.test(cleaned)) return Number.NaN;
  return Number.parseInt(cleaned, 10);
}

export function parseJenjangCell(value: string | number): Jenjang | null {
  const v = String(value).trim().toUpperCase();
  return (JENJANG_LIST as readonly string[]).includes(v) ? (v as Jenjang) : null;
}

/**
 * Konversi baris mentah + pemetaan menjadi DistributionRow.
 * Nilai tidak valid dibiarkan (NaN / jenjang asli) agar tertangkap validasi
 * dan dilaporkan sebagai error per baris.
 */
export function convertRows(
  raw: Array<Array<string | number>>,
  mapping: Partial<Record<FieldKey, number>>,
): DistributionRow[] {
  const get = (row: Array<string | number>, key: FieldKey): string | number => {
    const idx = mapping[key];
    return idx === undefined ? '' : (row[idx] ?? '');
  };
  return raw.map((row) => {
    const jenjangRaw = get(row, 'jenjang');
    return {
      jenjang: (parseJenjangCell(jenjangRaw) ?? String(jenjangRaw).trim()) as Jenjang,
      alokasiSiswa: parseNumberCell(get(row, 'alokasiSiswa')),
      alokasiAnggaran: parseNumberCell(get(row, 'alokasiAnggaran')),
      skSiswa: parseNumberCell(get(row, 'skSiswa')),
      skAnggaran: parseNumberCell(get(row, 'skAnggaran')),
      salurSiswa: parseNumberCell(get(row, 'salurSiswa')),
      salurAnggaran: parseNumberCell(get(row, 'salurAnggaran')),
    };
  });
}
