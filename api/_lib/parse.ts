/**
 * Parser nilai spreadsheet format Indonesia:
 * angka "1.234.567", rupiah "Rp 1.234.567,89", persen "82,5%",
 * tanggal "17/07/2026" / "17-07-2026" / "2026-07-17" / "17 Juli 2026".
 * Nilai mentah selalu dipertahankan pemanggil (kolom raw) bila diperlukan.
 */

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Angka Indonesia → number; null bila tidak dapat diparse. */
export function parseIdNumber(value: string): number | null {
  const cleaned = value
    .replace(/rp/gi, '')
    .replace(/\s/g, '')
    .replace(/%$/, '')
    .trim();
  if (!cleaned || /[a-z]/i.test(cleaned)) return null;
  let normalized = cleaned;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    // Format ID: titik ribuan, koma desimal — kecuali pola sebaliknya (1,234.56)
    if (cleaned.lastIndexOf('.') > cleaned.lastIndexOf(',')) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma) {
    // "12,5" = desimal; "1,234,567" = ribuan
    normalized = /^\d{1,3}(,\d{3})+$/.test(cleaned)
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(',', '.');
  } else if (hasDot) {
    // "1.234.567" = ribuan; "12.5" = desimal
    normalized = /^\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, '') : cleaned;
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

const MONTHS_ID: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, agt: 8, sep: 9, okt: 10, nov: 11, des: 12,
};

/** Nama bulan/angka → nomor bulan 1–12; null bila bukan bulan Indonesia dikenal. */
function monthNumber(token: string): number | null {
  return MONTHS_ID[token.trim().toLowerCase()] ?? null;
}

/**
 * "6", "6 Januari", "6 Januari 2026" → ISO yyyy-MM-dd.
 * `fallbackMonth`/`year` dipakai bila token tidak memuat bulan/tahun (sisi kiri rentang).
 */
function parseDayMonth(token: string, fallbackMonth: number | null, year: number): string | null {
  const m = /^(\d{1,2})(?:\s+([A-Za-z]+))?(?:\s+(\d{4}))?$/.exec(token.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const mon = m[2] ? monthNumber(m[2]) : fallbackMonth;
  const yr = m[3] ? Number(m[3]) : year;
  if (!mon || day < 1 || day > 31) return null;
  return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Satu rentang: "6 - 9 Januari" | "30 Maret - 2 April" | "6 Januari". */
function parseSingleRange(part: string, year: number): { start: string; end: string } | null {
  const seg = part
    .split(/\s*[-–—]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (seg.length === 0) return null;
  if (seg.length === 1) {
    const d = parseDayMonth(seg[0] ?? '', null, year);
    return d ? { start: d, end: d } : null;
  }
  // Sisi kanan biasanya memuat bulan (+tahun opsional); sisi kiri mewarisinya.
  const right = parseDayMonth(seg[seg.length - 1] ?? '', null, year);
  if (!right) return null;
  const left = parseDayMonth(seg[0] ?? '', Number(right.slice(5, 7)), Number(right.slice(0, 4)));
  if (!left) return null;
  return left <= right ? { start: left, end: right } : { start: right, end: left };
}

/**
 * Rentang tanggal Indonesia dalam satu sel kalender:
 * "6 - 9 Januari", "30 Maret - 2 April", "8 - 11 Maret & 12 - 15 Maret",
 * atau tanggal tunggal "6 Januari". Mengembalikan {start,end} ISO (start≤end);
 * null bila tak ada tanggal terbaca. Tahun default = `year`.
 */
export function parseIdDateRange(
  value: string,
  year: number,
): { start: string; end: string } | null {
  const raw = value.trim();
  if (!raw) return null;
  // Beberapa rentang dalam satu sel dipisah "&", ";", atau "dan".
  const parts = raw
    .split(/\s*(?:&|;|\bdan\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const dates: string[] = [];
  for (const part of parts) {
    const r = parseSingleRange(part, year);
    if (r) dates.push(r.start, r.end);
  }
  if (dates.length === 0) return null;
  dates.sort();
  return { start: dates[0] ?? '', end: dates[dates.length - 1] ?? '' };
}

/** Tanggal → ISO yyyy-MM-dd; null bila tidak valid. */
export function parseIdDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // ISO langsung
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy atau dd-mm-yyyy
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (m) {
    const [, d = '', mo = '', y = ''] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // "17 Juli 2026"
  m = /^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/.exec(v);
  if (m) {
    const [, d = '', monthName = '', y = ''] = m;
    const mo = MONTHS_ID[monthName.toLowerCase()];
    if (mo) return `${y}-${String(mo).padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

/** Waktu → HH:mm; null bila tidak valid. Menerima "09.00", "9:00", "09:00:00". */
export function parseIdTime(value: string): string | null {
  const m = /^(\d{1,2})[.:](\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const JENJANG_ALIASES: Record<string, string> = {
  sd: 'SD', 'sd sederajat': 'SD', 'sd/sederajat': 'SD', 'sd paket a': 'SD',
  smp: 'SMP', 'smp sederajat': 'SMP',
  sma: 'SMA', 'sma sederajat': 'SMA',
  smk: 'SMK', 'smk sederajat': 'SMK',
};

/** Normalisasi jenjang; null bila bukan jenjang dikenal (baris judul/total). */
export function parseJenjang(value: string): string | null {
  const key = normalizeHeader(value);
  if (JENJANG_ALIASES[key]) return JENJANG_ALIASES[key];
  const first = key.split(' ')[0] ?? '';
  return JENJANG_ALIASES[first] ?? null;
}

/** Baris subtotal/judul/kosong yang harus diabaikan pembaca sheet. */
export function isNoiseRow(cells: string[]): boolean {
  const joined = cells.join('').trim();
  if (!joined) return true;
  const first = (cells.find((c) => c.trim()) ?? '').toLowerCase();
  return /^(total|jumlah|grand total|sub ?total|rekap|no\.?$)/.test(first.trim());
}

/** Status kegiatan bebas → enum aplikasi. */
export function parseActivityStatus(value: string): string {
  const v = normalizeHeader(value);
  if (/batal/.test(v)) return 'DIBATALKAN';
  if (/tunda|reschedul|pending/.test(v)) return 'DITUNDA';
  if (/selesai|done|terlaksana/.test(v)) return 'SELESAI';
  if (/berlangsung|proses|progress/.test(v)) return 'BERLANGSUNG';
  if (/jadwal|fix|pasti|confirmed/.test(v)) return 'TERJADWAL';
  return 'RENCANA';
}

// ---------------------------------------------------------------------------
// Deteksi header → target field (mapping berbasis header, bukan posisi)
// ---------------------------------------------------------------------------

export interface HeaderRule {
  targetField: string;
  parserType: 'text' | 'number' | 'currency' | 'date' | 'time' | 'percent';
  required: boolean;
  /** Pola dicocokkan terhadap header ternormalisasi. */
  patterns: RegExp[];
  /**
   * Pola prioritas — dicoba lebih dulu untuk SELURUH aturan sebelum `patterns`.
   * Dipakai saat satu sheet punya beberapa kolom mirip (mis. SISWA_AWAL/AKHIR,
   * SISWA_BERJALAN, SISWA_TOTAL) dan kita ingin mengunci kolom TOTAL, tetapi
   * tetap punya fallback generik untuk sheet lain. Backward-compatible: aturan
   * tanpa `preferredPatterns` berperilaku persis seperti sebelumnya.
   */
  preferredPatterns?: RegExp[];
}

/** Jenjang yang tampil pada Dashboard penyaluran (PIP: SD/SMP/SMA/SMK; tanpa TK). */
export const DASHBOARD_JENJANG = ['SD', 'SMP', 'SMA', 'SMK'] as const;

export const PIP_DETAIL_RULES: HeaderRule[] = [
  { targetField: 'tahun', parserType: 'number', required: false, patterns: [/^tahun/] },
  { targetField: 'jenjang', parserType: 'text', required: true, patterns: [/jenjang|bentuk pendidikan/] },
  { targetField: 'tahap', parserType: 'text', required: false, patterns: [/tahap|termin|batch/] },
  { targetField: 'sk_keterangan', parserType: 'text', required: false, patterns: [/keterangan|jenis sk|kategori sk|cutoff|cut off/] },
  { targetField: 'sk_nomor', parserType: 'text', required: false, patterns: [/no(mor)? ?sk|nomor surat/] },
  { targetField: 'sk_tanggal', parserType: 'date', required: false, patterns: [/tanggal ?sk|tgl ?sk/] },
  {
    targetField: 'jumlah_siswa',
    parserType: 'number',
    required: true,
    // Utamakan kolom TOTAL (SISWA_TOTAL) di atas AWAL/AKHIR & BERJALAN (§3).
    preferredPatterns: [/siswa ?total|total ?siswa|jumlah ?siswa ?total/],
    patterns: [/jumlah ?sisw|siswa|penerima/],
  },
  {
    targetField: 'jumlah_dana',
    parserType: 'currency',
    required: true,
    preferredPatterns: [/dana ?total|total ?dana/],
    patterns: [/dana|nominal|anggaran|rupiah/],
  },
  { targetField: 'status', parserType: 'text', required: false, patterns: [/^status/] },
  { targetField: 'updated_on', parserType: 'date', required: false, patterns: [/tanggal update|update|pembaruan/] },
  { targetField: 'catatan', parserType: 'text', required: false, patterns: [/catatan|ket$|note/] },
];

export const PIP_REKAP_RULES: HeaderRule[] = [
  { targetField: 'tahun', parserType: 'number', required: false, patterns: [/^tahun/] },
  { targetField: 'jenjang', parserType: 'text', required: true, patterns: [/jenjang|bentuk pendidikan/] },
  { targetField: 'alokasi_siswa', parserType: 'number', required: true, patterns: [/alokasi ?sisw|target ?sisw|kuota/] },
  { targetField: 'alokasi_anggaran', parserType: 'currency', required: true, patterns: [/pagu|alokasi ?(anggaran|dana)|target ?(anggaran|dana)/] },
  { targetField: 'realisasi_siswa', parserType: 'number', required: true, patterns: [/realisasi ?sisw|salur ?sisw|tersalur ?sisw|sisw.*(salur|realisasi)/] },
  { targetField: 'realisasi_dana', parserType: 'currency', required: true, patterns: [/realisasi ?dan|salur ?dan|tersalur ?dan|dan.*(salur|realisasi)/] },
  { targetField: 'sisa_siswa', parserType: 'number', required: false, patterns: [/sisa ?sisw/] },
  { targetField: 'sisa_dana', parserType: 'currency', required: false, patterns: [/sisa ?dan|sisa ?anggaran/] },
  { targetField: 'progres_siswa', parserType: 'percent', required: false, patterns: [/progres ?sisw|persen ?sisw|% ?sisw/] },
  { targetField: 'progres_dana', parserType: 'percent', required: false, patterns: [/progres ?dan|persen ?dan|% ?dan/] },
];

export const ACTIVITY_RULES: HeaderRule[] = [
  { targetField: 'tahun', parserType: 'number', required: false, patterns: [/^tahun/] },
  { targetField: 'title', parserType: 'text', required: true, patterns: [/kegiatan|agenda|acara|judul|nama kegiatan|uraian/] },
  { targetField: 'start_date', parserType: 'date', required: true, patterns: [/tanggal ?mulai|tgl ?mulai|mulai|^tanggal$|^tgl$|waktu pelaksanaan/] },
  { targetField: 'end_date', parserType: 'date', required: false, patterns: [/tanggal ?selesai|tgl ?selesai|selesai|sampai|s d$/] },
  { targetField: 'start_time', parserType: 'time', required: false, patterns: [/jam ?mulai|waktu ?mulai|pukul/] },
  { targetField: 'end_time', parserType: 'time', required: false, patterns: [/jam ?selesai|waktu ?selesai/] },
  { targetField: 'location', parserType: 'text', required: false, patterns: [/lokasi|tempat|venue/] },
  { targetField: 'category', parserType: 'text', required: false, patterns: [/kategori|jenis/] },
  { targetField: 'pic', parserType: 'text', required: false, patterns: [/^pic|penanggung ?jawab|pj$/] },
  { targetField: 'participants', parserType: 'text', required: false, patterns: [/peserta|undangan/] },
  { targetField: 'status', parserType: 'text', required: false, patterns: [/^status/] },
  { targetField: 'notes', parserType: 'text', required: false, patterns: [/substansi|keterangan|catatan|note|deskripsi/] },
  { targetField: 'meeting_link', parserType: 'text', required: false, patterns: [/link ?(rapat|meeting|zoom)|zoom|meet/] },
  { targetField: 'document_link', parserType: 'text', required: false, patterns: [/link ?dokumen|dokumen|berkas|drive/] },
];

export interface DetectedMapping {
  detectedHeader: string;
  columnIndex: number;
  targetField: string;
  parserType: HeaderRule['parserType'];
  required: boolean;
}

/**
 * Cocokkan header aktual terhadap aturan. Header ambigu TIDAK ditebak.
 * Dua fase: `preferredPatterns` seluruh aturan lebih dulu (mengunci kolom
 * spesifik seperti TOTAL), lalu `patterns` generik sebagai fallback.
 */
export function detectMappings(headers: string[], rules: HeaderRule[]): DetectedMapping[] {
  const result: DetectedMapping[] = [];
  const usedFields = new Set<string>();
  const usedColumns = new Set<number>();
  const normalized = headers.map((h) => normalizeHeader(h ?? ''));

  const runPhase = (getPatterns: (rule: HeaderRule) => RegExp[] | undefined) => {
    for (const rule of rules) {
      if (usedFields.has(rule.targetField)) continue;
      const patterns = getPatterns(rule);
      if (!patterns || patterns.length === 0) continue;
      for (let i = 0; i < headers.length; i += 1) {
        if (usedColumns.has(i)) continue;
        const header = normalized[i] ?? '';
        if (!header) continue;
        if (patterns.some((p) => p.test(header))) {
          result.push({
            detectedHeader: headers[i] ?? '',
            columnIndex: i,
            targetField: rule.targetField,
            parserType: rule.parserType,
            required: rule.required,
          });
          usedFields.add(rule.targetField);
          usedColumns.add(i);
          break;
        }
      }
    }
  };

  runPhase((rule) => rule.preferredPatterns);
  runPhase((rule) => rule.patterns);
  return result;
}

// ---------------------------------------------------------------------------
// Matriks ALOKASI 2026 (REKAP PROGRESS) — kuota per jenjang dari baris TOTAL.
// Sheet ini cross-tab (bukan tabel datar): kita HANYA mengambil kuota/alokasi
// dari baris TOTAL, bukan realisasi/progres/sisa (§2).
// ---------------------------------------------------------------------------

const MATRIX_JENJANG = ['TK', 'SD', 'SMP', 'SMA', 'SMK'] as const;

export interface JenjangQuota {
  siswa: number;
  dana: number;
}

/**
 * Baca kuota per jenjang dari matriks "ALOKASI 2026" pada REKAP PROGRESS:
 * temukan baris anchor "ALOKASI 2026" (memuat grup SISWA & DANA), petakan kolom
 * jenjang di baris header berikutnya, lalu ambil nilai pada baris "TOTAL".
 * Mengembalikan null bila struktur tidak dikenali (pemanggil pakai fallback config).
 */
export function parseAlokasiMatrix(values: string[][]): Record<string, JenjangQuota> | null {
  let anchor = -1;
  for (let i = 0; i < values.length; i += 1) {
    if ((values[i] ?? []).some((c) => normalizeHeader(c) === 'alokasi 2026')) {
      anchor = i;
      break;
    }
  }
  if (anchor < 0) return null;

  const anchorRow = values[anchor] ?? [];
  const siswaGroupCol = anchorRow.findIndex((c) => normalizeHeader(c) === 'siswa');
  const danaGroupCol = anchorRow.findIndex((c) => normalizeHeader(c) === 'dana');
  if (siswaGroupCol < 0 || danaGroupCol < 0 || danaGroupCol <= siswaGroupCol) return null;

  const headerRow = values[anchor + 1] ?? [];
  const siswaCol: Record<string, number> = {};
  const danaCol: Record<string, number> = {};
  headerRow.forEach((c, idx) => {
    const key = normalizeHeader(c).toUpperCase();
    if (!(MATRIX_JENJANG as readonly string[]).includes(key)) return;
    if (idx >= siswaGroupCol && idx < danaGroupCol) siswaCol[key] = idx;
    else if (idx >= danaGroupCol) danaCol[key] = idx;
  });

  let totalRow: string[] | null = null;
  for (let i = anchor + 1; i < values.length; i += 1) {
    if (normalizeHeader((values[i] ?? [])[0] ?? '') === 'total') {
      totalRow = values[i] ?? [];
      break;
    }
  }
  if (!totalRow) return null;

  const out: Record<string, JenjangQuota> = {};
  for (const j of MATRIX_JENJANG) {
    const si = siswaCol[j];
    const di = danaCol[j];
    if (si === undefined || di === undefined) return null;
    const siswa = parseIdNumber(totalRow[si] ?? '');
    const dana = parseIdNumber(totalRow[di] ?? '');
    if (siswa === null || dana === null || siswa < 0 || dana < 0) return null;
    out[j] = { siswa, dana };
  }
  return out;
}

/** Field wajib yang belum terpetakan. */
export function missingRequiredFields(
  detected: DetectedMapping[],
  rules: HeaderRule[],
): string[] {
  const found = new Set(detected.map((d) => d.targetField));
  return rules.filter((r) => r.required && !found.has(r.targetField)).map((r) => r.targetField);
}
