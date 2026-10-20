/**
 * Seed data DEMO EFEMERAL untuk E2E mode Supabase.
 *
 * Dijalankan pada globalSetup SETELAH snapshot diambil (state bersih), dan
 * dibersihkan kembali oleh globalTeardown (restoreSupabase menghapus + memulihkan
 * snapshot kosong). Dengan begitu produksi TIDAK menyimpan data dummy — data ini
 * hanya hidup selama satu proses pengujian.
 *
 * Migrasi hanya menyemai master data (25 pegawai, board + step, sumber
 * spreadsheet). Board tidak punya kartu contoh & Dashboard tidak punya snapshot
 * penyaluran (menunggu sinkronisasi Google). Beberapa E2E menguji alur pada data
 * yang sudah ada, jadi kita semai kartu + snapshot penyaluran secara efemeral.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

type Jenjang = 'SD' | 'SMP' | 'SMA' | 'SMK';

function readDotEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const entries: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line) || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (key && entries[key] === undefined) entries[key] = value;
  }
  return entries;
}

function env(name: string, dotEnv: Record<string, string>): string {
  return process.env[name] ?? dotEnv[name] ?? '';
}

function shouldSeed(dotEnv = readDotEnv()): boolean {
  if (process.env.E2E_SUPABASE_SNAPSHOT === '0') return false;
  const mode = (env('VITE_DATA_MODE', dotEnv) || env('NEXT_PUBLIC_DATA_MODE', dotEnv)).toLowerCase();
  const hasUrl = Boolean(env('VITE_SUPABASE_URL', dotEnv) || env('NEXT_PUBLIC_SUPABASE_URL', dotEnv));
  return mode === 'supabase' || (mode !== 'local' && hasUrl);
}

function serviceClient(): SupabaseClient {
  const dotEnv = readDotEnv();
  const url = env('VITE_SUPABASE_URL', dotEnv) || env('NEXT_PUBLIC_SUPABASE_URL', dotEnv);
  const key = env('SUPABASE_SERVICE_ROLE_KEY', dotEnv);
  if (!url || !key) {
    throw new Error('Seed E2E membutuhkan URL Supabase dan SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as never },
  });
}

const dateOnly = (deltaDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
};
const hoursAgoISO = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

let clSeq = 0;
function checklist(groups: Array<[string, Array<[string, boolean]>]>) {
  return groups.map(([title, items], gi) => ({
    id: `clg-${(clSeq += 1)}`,
    title,
    sortOrder: gi,
    items: items.map(([text, done], ii) => ({ id: `cli-${clSeq}-${ii}`, text, done, sortOrder: ii })),
  }));
}

// Alokasi agregat per jenjang (tanpa data individual siswa) — sama dengan seed lokal.
const BASE: Record<Jenjang, { alokasiSiswa: number; unit: number }> = {
  SD: { alokasiSiswa: 10_400_000, unit: 450_000 },
  SMP: { alokasiSiswa: 4_400_000, unit: 750_000 },
  SMA: { alokasiSiswa: 1_350_000, unit: 1_800_000 },
  SMK: { alokasiSiswa: 1_850_000, unit: 1_800_000 },
};
function rows(sk: Record<Jenjang, number>, salur: Record<Jenjang, number>) {
  return (Object.keys(BASE) as Jenjang[]).map((j) => {
    const b = BASE[j];
    const skSiswa = Math.round(b.alokasiSiswa * sk[j]);
    const salurSiswa = Math.round(b.alokasiSiswa * salur[j]);
    return {
      jenjang: j,
      alokasiSiswa: b.alokasiSiswa,
      alokasiAnggaran: b.alokasiSiswa * b.unit,
      skSiswa,
      skAnggaran: skSiswa * b.unit,
      salurSiswa,
      salurAnggaran: salurSiswa * b.unit,
    };
  });
}

export async function seedDemoData(): Promise<void> {
  if (!shouldSeed()) return;
  const sb = serviceClient();

  const { data: stepRows, error: stepErr } = await sb
    .from('steps')
    .select('id, name')
    .eq('board_id', 'board-utama')
    .is('deleted_at', null);
  if (stepErr) throw new Error(`Seed E2E: gagal membaca steps — ${stepErr.message}`);
  const stepId = (name: string): string => {
    const row = (stepRows ?? []).find((s) => s.name === name);
    if (!row) throw new Error(`Seed E2E: step "${name}" tidak ditemukan (migrasi 0001 diterapkan?).`);
    return row.id as string;
  };

  const { data: empRows, error: empErr } = await sb.from('employees').select('id, display_name');
  if (empErr) throw new Error(`Seed E2E: gagal membaca employees — ${empErr.message}`);
  const emp = (displayName: string): string | null =>
    ((empRows ?? []).find((e) => e.display_name === displayName)?.id as string | undefined) ?? null;
  const picIds = (...names: string[]): string[] => names.map(emp).filter((v): v is string => v !== null);

  // --- Kartu pekerjaan (dirujuk oleh board.spec / a11y / dashboard) ---
  // Semua objek WAJIB berbagi kumpulan kunci yang sama: PostgREST bulk-insert
  // menyetel kolom yang absen pada sebagian baris menjadi NULL (melanggar
  // NOT NULL, mem-bypass DEFAULT). Normalisasi lewat TASK_DEFAULTS.
  const TASK_DEFAULTS = {
    description: '',
    category_id: null as string | null,
    label_ids: [] as string[],
    start_date: null as string | null,
    due_date: null as string | null,
    progress_mode: 'MANUAL',
    manual_progress: 0,
    pic_main_id: null as string | null,
    pic_ids: [] as string[],
    checklist: [] as unknown[],
    is_focus: false,
    sort_order: 0,
    created_by_employee_id: null as string | null,
    updated_by_employee_id: null as string | null,
  };
  const tasks = [
    {
      board_id: 'board-utama',
      step_id: stepId('On Progress'),
      title: 'Finalisasi SK Pemberian PIP Termin 2',
      description: 'Menyelesaikan draf SK Pemberian termin 2 termasuk lampiran penerima per jenjang.',
      duration_type: 'JANGKA_PANJANG',
      priority: 'TINGGI',
      start_date: dateOnly(-12),
      due_date: dateOnly(0),
      progress_mode: 'CHECKLIST',
      pic_main_id: emp('Hesti'),
      pic_ids: picIds('Rakean', 'Thoriq'),
      checklist: checklist([
        [
          'Penyusunan draf',
          [
            ['Kompilasi lampiran penerima per jenjang', true],
            ['Reviu nominal per jenjang', true],
            ['Sinkronisasi dengan data pusat', true],
          ],
        ],
        [
          'Persetujuan',
          [
            ['Paraf koordinator', true],
            ['Paraf biro hukum', false],
            ['Tanda tangan pimpinan', false],
          ],
        ],
      ]),
      is_focus: true,
      sort_order: 0,
      created_by_employee_id: emp('Hesti'),
      updated_by_employee_id: emp('Hesti'),
    },
    
    {
      board_id: 'board-utama',
      step_id: stepId('To Do'),
      title: 'Verifikasi usulan penerima tahap susulan',
      description: 'Verifikasi kelengkapan usulan penerima susulan dari dinas pendidikan.',
      duration_type: 'JANGKA_PANJANG',
      priority: 'SEDANG',
      start_date: dateOnly(-3),
      due_date: dateOnly(4),
      progress_mode: 'MANUAL',
      manual_progress: 0,
      sort_order: 1,
      created_by_employee_id: emp('Erna'),
      updated_by_employee_id: emp('Erna'),
    },
    {
      board_id: 'board-utama',
      step_id: stepId('Will Do'),
      title: 'Permintaan data penyaluran dari Komisi X DPR RI',
      description: 'Menyiapkan data agregat penyaluran per provinsi untuk bahan rapat dengar pendapat.',
      duration_type: 'JANGKA_PENDEK',
      priority: 'TINGGI',
      due_date: dateOnly(0),
      progress_mode: 'MANUAL',
      pic_main_id: emp('Hesti'),
      sort_order: 0,
      created_by_employee_id: emp('Hesti'),
      updated_by_employee_id: emp('Hesti'),
    },
    {
      board_id: 'board-utama',
      step_id: stepId('Will Do'),
      title: 'Penyusunan juknis pencairan kolektif',
      description: 'Menyusun petunjuk teknis pencairan kolektif untuk sekolah daerah 3T.',
      duration_type: 'JANGKA_PANJANG',
      priority: 'SEDANG',
      due_date: dateOnly(20),
      progress_mode: 'MANUAL',
      manual_progress: 10,
      pic_main_id: emp('Thoriq'),
      sort_order: 1,
      created_by_employee_id: emp('Thoriq'),
      updated_by_employee_id: emp('Thoriq'),
    },
    {
      board_id: 'board-utama',
      step_id: stepId('Done'),
      title: 'Rapat koordinasi teknis dengan bank penyalur',
      description: 'Koordinasi percepatan aktivasi dan jadwal pencairan termin 2.',
      duration_type: 'JANGKA_PENDEK',
      priority: 'SEDANG',
      start_date: dateOnly(-4),
      due_date: dateOnly(-2),
      progress_mode: 'MANUAL',
      manual_progress: 100,
      pic_main_id: emp('Drajat'),
      pic_ids: picIds('Erna', 'Yusna'),
      sort_order: 0,
      created_by_employee_id: emp('Drajat'),
      updated_by_employee_id: emp('Drajat'),
    },
  ].map((task) => ({ ...TASK_DEFAULTS, ...task }));
  const { error: taskErr } = await sb.from('tasks').insert(tasks);
  if (taskErr) throw new Error(`Seed E2E: gagal insert tasks — ${taskErr.message}`);

  // --- Snapshot penyaluran: Termin 1 (ACTIVE) + Termin 2 (DRAFT untuk opsi periode) ---
  const { data: snapData, error: snapErr } = await sb
    .from('distribution_snapshots')
    .insert([
      {
        year: 2026,
        period: 'Termin 1',
        status: 'ACTIVE',
        rows: rows(
          { SD: 0.97, SMP: 0.95, SMA: 0.93, SMK: 0.91 },
          { SD: 0.88, SMP: 0.85, SMA: 0.8, SMK: 0.77 },
        ),
        source_file_name: 'penyaluran-2026-t1-jul.xlsx',
        note: 'Pembaruan mingguan dari bank penyalur',
        activated_at: hoursAgoISO(24 * 5),
        created_by_employee_id: emp('Sucianingsih'),
      },
      {
        year: 2026,
        period: 'Termin 2',
        status: 'DRAFT',
        rows: rows(
          { SD: 0.35, SMP: 0.33, SMA: 0.3, SMK: 0.28 },
          { SD: 0.05, SMP: 0.04, SMA: 0.03, SMK: 0.03 },
        ),
        source_file_name: 'penyaluran-2026-t2-awal.xlsx',
        note: 'Draft awal termin 2 — menunggu validasi',
        created_by_employee_id: emp('Sucianingsih'),
      },
    ])
    .select('id, period');
  if (snapErr) throw new Error(`Seed E2E: gagal insert snapshot penyaluran — ${snapErr.message}`);
  const activeId = (snapData ?? []).find((s) => s.period === 'Termin 1')?.id as string | undefined;

  // --- Satu entri aktivitas "memperbarui data penyaluran" untuk Dashboard ---
  if (activeId) {
    const { error: auditErr } = await sb.from('audit_log').insert({
      at: hoursAgoISO(2),
      actor_role: 'ADMIN',
      actor_account: 'admin',
      employee_id: emp('Sucianingsih'),
      action: 'ACTIVATE',
      entity_type: 'SNAPSHOT',
      entity_id: activeId,
      entity_label: 'Penyaluran 2026 · Termin 1',
      before: { status: 'DRAFT' },
      after: { status: 'ACTIVE' },
      success: true,
    });
    if (auditErr) throw new Error(`Seed E2E: gagal insert aktivitas — ${auditErr.message}`);
  }
}
