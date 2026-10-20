/**
 * DATA CONTOH (MOCK) — hanya untuk mode lokal/development.
 * Tidak dipakai oleh adapter produksi.
 * Pegawai memakai seed resmi 25 pegawai (Docs/09 §P) — sama dengan seed produksi.
 * Data penyaluran hanya agregat per jenjang — tanpa data individual siswa.
 */
import { DEFAULT_TEAM } from '@/lib/org';
import type {
  ActivityPlanItem,
  AppSettings,
  AuditEntry,
  BoardInfo,
  Category,
  ChecklistGroup,
  ColumnMapping,
  DistributionRow,
  DistributionSnapshot,
  Employee,
  Jenjang,
  Label,
  SheetBinding,
  SpreadsheetSource,
  Step,
  SyncRun,
  Task,
  TaskComment,
  TaskTemplate,
} from '@/services/types';

// ---------------------------------------------------------------------------
// Util waktu relatif — data contoh selalu tampak "hidup"
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const iso = (ms: number) => new Date(ms).toISOString();
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const now = Date.now();
const hoursAgo = (n: number) => iso(now - n * HOUR);
const daysAgo = (n: number) => iso(now - n * DAY);
const dateDaysAgo = (n: number) => isoDate(now - n * DAY);
const dateDaysFromNow = (n: number) => isoDate(now + n * DAY);

const CATEGORIES: Array<[string, string, string]> = [
  ['cat-penyaluran', 'Penyaluran', '#2361e3'],
  ['cat-sk', 'SK & Regulasi', '#7c3aed'],
  ['cat-rekon', 'Rekonsiliasi', '#0d9488'],
  ['cat-rapat', 'Rapat & Koordinasi', '#d97706'],
  ['cat-data', 'Data & Sistem', '#0284c7'],
  ['cat-layanan', 'Surat & Layanan', '#e11d48'],
];
const LABELS: Array<[string, string, string]> = [
  ['lbl-pimpinan', 'Prioritas Pimpinan', '#b91c1c'],
  ['lbl-termin1', 'Termin 1', '#1c4dc4'],
  ['lbl-termin2', 'Termin 2', '#0d9488'],
  ['lbl-termin3', 'Termin 3', '#7c3aed'],
  ['lbl-lintas', 'Lintas Tim', '#d97706'],
  ['lbl-eksternal', 'Menunggu Eksternal', '#64748b'],
  ['lbl-rutin', 'Rutin', '#059669'],
];
const buildCategories = (): Category[] =>
  CATEGORIES.map(([id, name, color], sortOrder) => ({ id, name, color, sortOrder, active: true }));
const buildLabels = (): Label[] =>
  LABELS.map(([id, name, color], sortOrder) => ({ id, name, color, sortOrder, active: true }));

// ---------------------------------------------------------------------------
// Pegawai — seed resmi 25 pegawai (Docs/09 §P). Tag board satu kata & unik.
// ---------------------------------------------------------------------------

interface EmployeeSpec {
  id: string;
  fullName: string;
  displayName: string;
  initials: string;
  color: string;
  nip: string | null;
  position: string;
  team: string;
  active?: boolean;
}

export const EMPLOYEES: EmployeeSpec[] = [
  { id: 'emp-rakean', fullName: 'Rakean Sundayana, S.Pd., M.A', displayName: 'Rakean', initials: 'RS', color: 'blue', nip: '198102082005011003', position: 'Ketua Tim Kerja Kemitraan dan Tata Kelola Program', team: DEFAULT_TEAM },
  { id: 'emp-thoriq', fullName: 'Thoriq Rozaq Rosyadi', displayName: 'Thoriq', initials: 'TR', color: 'emerald', nip: '199412252022031015', position: 'Penelaah Teknis Kebijakan', team: DEFAULT_TEAM },
  { id: 'emp-hesti', fullName: 'Tri Hesti Wahyudiati', displayName: 'Hesti', initials: 'TH', color: 'rose', nip: '197008102007102001', position: 'Penelaah Teknis Kebijakan', team: DEFAULT_TEAM },
  { id: 'emp-erna', fullName: 'Erna Fitriawati Novi Hastuti', displayName: 'Erna', initials: 'EF', color: 'violet', nip: '198309252008122002', position: 'Penelaah Teknis Kebijakan', team: DEFAULT_TEAM },
  { id: 'emp-yusna', fullName: 'Yusna Yurita', displayName: 'Yusna', initials: 'YY', color: 'teal', nip: '198209242014042001', position: 'Penelaah Teknis Kebijakan', team: DEFAULT_TEAM },
  { id: 'emp-sucianingsih', fullName: 'Sucianingsih', displayName: 'Sucianingsih', initials: 'SC', color: 'amber', nip: '1990031020015042003', position: 'Perencana Ahli Pertama', team: DEFAULT_TEAM },
  { id: 'emp-entin', fullName: 'Entin Jainingsih', displayName: 'Entin', initials: 'EJ', color: 'fuchsia', nip: '196903111990022001', position: 'Pengadministrasian Perkantoran', team: DEFAULT_TEAM },
  { id: 'emp-suyadi', fullName: 'Suyadi', displayName: 'Suyadi', initials: 'SY', color: 'sky', nip: '196907151994031010', position: 'Pengadministrasian Perkantoran', team: DEFAULT_TEAM },
  { id: 'emp-drajat', fullName: 'Drajat Sujarwo', displayName: 'Drajat', initials: 'DS', color: 'orange', nip: '198102032007011001', position: 'Pengolah Data dan Informasi', team: DEFAULT_TEAM },
  { id: 'emp-sirda', fullName: 'Sirda Eldita', displayName: 'Sirda', initials: 'SE', color: 'blue', nip: '199204152018012002', position: 'Penelaah Teknis Kebijakan', team: DEFAULT_TEAM },
  { id: 'emp-linda', fullName: 'Linda Eri Jayanti', displayName: 'Linda', initials: 'LJ', color: 'emerald', nip: '199101032025212048', position: 'Penata Layanan Operasional', team: DEFAULT_TEAM },
  { id: 'emp-rendy', fullName: 'Rendy Pamungkas', displayName: 'Rendy', initials: 'RP', color: 'rose', nip: '199105062025211055', position: 'Penata Layanan Operasional', team: DEFAULT_TEAM },
  { id: 'emp-nur', fullName: 'Muhammad Nur', displayName: 'Nur', initials: 'MN', color: 'violet', nip: '199503102025211034', position: 'Penata Layanan Operasional', team: DEFAULT_TEAM },
  { id: 'emp-rifai', fullName: 'Muhammad Rifai', displayName: 'Rifai', initials: 'MR', color: 'teal', nip: '199608292025211031', position: 'Penata Layanan Operasional', team: DEFAULT_TEAM },
  { id: 'emp-lina', fullName: 'Lina Fitriani', displayName: 'Lina', initials: 'LF', color: 'amber', nip: '198602032025212037', position: 'Pengadministrasi Perkantoran', team: DEFAULT_TEAM },
  { id: 'emp-mulkirom', fullName: 'Mulkirom', displayName: 'Mulkirom', initials: 'MK', color: 'fuchsia', nip: null, position: '', team: DEFAULT_TEAM },
  { id: 'emp-eka', fullName: 'Eka Dewi Pertiwi', displayName: 'Eka', initials: 'ED', color: 'sky', nip: null, position: '', team: DEFAULT_TEAM },
  { id: 'emp-santika', fullName: 'Santika Indah Pratiwi', displayName: 'Santika', initials: 'SP', color: 'orange', nip: null, position: '', team: DEFAULT_TEAM },
  { id: 'emp-vyja', fullName: 'Vyja Tona Rapolo', displayName: 'Vyja', initials: 'VR', color: 'blue', nip: null, position: '', team: DEFAULT_TEAM },
  { id: 'emp-ulfi', fullName: 'Achmad Ulfi', displayName: 'Ulfi', initials: 'AU', color: 'emerald', nip: null, position: '', team: DEFAULT_TEAM },
  { id: 'emp-dhani', fullName: 'Dhani Prayudi', displayName: 'Dhani', initials: 'DP', color: 'rose', nip: null, position: '', team: DEFAULT_TEAM },
  { id: 'emp-sendi', fullName: 'Sendi Irjansaputra', displayName: 'Sendi', initials: 'SD', color: 'violet', nip: null, position: '', team: DEFAULT_TEAM },
  { id: 'emp-fajar', fullName: 'Fajar Robbyana', displayName: 'Fajar', initials: 'FR', color: 'teal', nip: null, position: '', team: DEFAULT_TEAM },
  { id: 'emp-ferry', fullName: 'Ferry Widiarta', displayName: 'Ferry', initials: 'FW', color: 'amber', nip: null, position: '', team: DEFAULT_TEAM },
  { id: 'emp-kamil', fullName: 'Muhammad Lazuardy Kamil', displayName: 'Kamil', initials: 'MZ', color: 'fuchsia', nip: null, position: '', team: DEFAULT_TEAM },
];

function buildEmployees(): Employee[] {
  return EMPLOYEES.map((e, i) => ({
    id: e.id,
    fullName: e.fullName,
    displayName: e.displayName,
    initials: e.initials,
    color: e.color,
    nip: e.nip,
    nipNormalized: e.nip ? e.nip.replace(/[^0-9]/g, '') : null,
    username: e.displayName.toLowerCase().replace(/[^a-z0-9._-]/g, '') || null,
    level: /ketua|kepala|koordinator/i.test(e.position) ? ('LEADER' as const) : ('STAFF' as const),
    supervisorId: null,
    position: e.position,
    team: e.team,
    sortOrder: i,
    active: e.active ?? true,
    avatarPath: null,
    avatarUpdatedAt: null,
    createdAt: daysAgo(400),
    updatedAt: daysAgo(30),
  }));
}



// ---------------------------------------------------------------------------
// Board & step default
// ---------------------------------------------------------------------------

const buildBoard = (): BoardInfo => ({
  id: 'board-utama',
  title: 'Board Pekerjaan Tim PIP',
  updatedAt: daysAgo(2),
  version: 1,
});

const STEPS: Array<[string, string, Step['kind'], string]> = [
  ['step-willdo', 'Will Do', 'NORMAL', '#94a3b8'],
  ['step-todo', 'To Do', 'NORMAL', '#3579ee'],
  ['step-onprogress', 'On Progress', 'NORMAL', '#f59e0b'],
  ['step-done', 'Done', 'DONE', '#10b981'],
];

const buildSteps = (): Step[] =>
  STEPS.map(([id, name, kind, color], i) => ({
    id,
    boardId: 'board-utama',
    name,
    kind,
    color,
    sortOrder: i,
    deletedAt: null,
    version: 1,
  }));

// ---------------------------------------------------------------------------
// Checklist helper
// ---------------------------------------------------------------------------

let clSeq = 0;
function checklist(groups: Array<[string, Array<[string, boolean]>]>): ChecklistGroup[] {
  return groups.map(([title, items], gi) => ({
    id: `clg-${(clSeq += 1)}`,
    title,
    sortOrder: gi,
    items: items.map(([text, done], ii) => ({
      id: `cli-${clSeq}-${ii}`,
      text,
      done,
      sortOrder: ii,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Pekerjaan
// ---------------------------------------------------------------------------

type TaskSeed = Omit<
  Task,
  | 'boardId'
  | 'description'
  | 'categoryId'
  | 'labelIds'
  | 'startDate'
  | 'dueDate'
  | 'progressMode'
  | 'manualProgress'
  | 'picMainIds'
  | 'picMainId'
  | 'picIds'
  | 'checklist'
  | 'isFocus'
  | 'archivedAt'
  | 'deletedAt'
  | 'deleteReason'
  | 'createdByEmployeeId'
  | 'updatedByEmployeeId'
  | 'ownerEmployeeId'
  | 'taskType'
  | 'disposedByEmployeeId'
  | 'driveFolderId'
> &
  Partial<Task>;

function task(seed: TaskSeed): Task {
  const base = {
    boardId: 'board-utama',
    description: '',
    categoryId: null,
    labelIds: [],
    startDate: null,
    dueDate: null,
    progressMode: 'MANUAL' as const,
    manualProgress: 0,
    picMainId: null,
    picIds: [],
    checklist: [],
    isFocus: false,
    archivedAt: null,
    deletedAt: null,
    deleteReason: null,
    createdByEmployeeId: null,
    updatedByEmployeeId: null,
    ownerEmployeeId: null as string | null,
    taskType: 'MANDIRI' as const,
    disposedByEmployeeId: null,
    driveFolderId: null,
    ...seed,
  };
  const picMainIds =
    base.picMainIds && base.picMainIds.length > 0
      ? base.picMainIds
      : base.picMainId
        ? [base.picMainId]
        : [];
  return {
    ...base,
    picMainIds,
    ownerEmployeeId: base.ownerEmployeeId ?? base.createdByEmployeeId ?? picMainIds[0] ?? null,
  };
}

function buildTasks(): Task[] {
  return [
    task({
      id: 'task-sk-termin2',
      stepId: 'step-onprogress',
      title: 'Finalisasi SK Pemberian PIP Termin 2',
      description:
        'Menyelesaikan draf SK Pemberian termin 2 termasuk lampiran penerima per jenjang, paraf berjenjang, dan penomoran.',
      durationType: 'JANGKA_PANJANG',
      categoryId: 'cat-sk',
      labelIds: ['lbl-termin2', 'lbl-pimpinan'],
      priority: 'TINGGI',
      startDate: dateDaysAgo(12),
      dueDate: dateDaysFromNow(0),
      progressMode: 'CHECKLIST',
      picMainId: 'emp-hesti',
      picIds: ['emp-rakean', 'emp-thoriq'],
      isFocus: true,
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
      sortOrder: 0,
      createdAt: daysAgo(12),
      updatedAt: hoursAgo(2),
      version: 7,
      createdByEmployeeId: 'emp-hesti',
      updatedByEmployeeId: 'emp-hesti',
    }),
    
    task({
      id: 'task-aktivasi-sma',
      stepId: 'step-onprogress',
      title: 'Aktivasi rekening siswa SMA wilayah timur',
      description: 'Percepatan aktivasi rekening SimPel siswa SMA di wilayah timur bersama bank penyalur.',
      durationType: 'JANGKA_PANJANG',
      categoryId: 'cat-penyaluran',
      labelIds: ['lbl-termin2', 'lbl-eksternal'],
      priority: 'SEDANG',
      startDate: dateDaysAgo(9),
      dueDate: dateDaysFromNow(6),
      progressMode: 'CHECKLIST',
      picMainId: 'emp-erna',
      picIds: [],
      checklist: checklist([
        [
          'Aktivasi',
          [
            ['Kirim daftar nominatif ke bank', true],
            ['Konfirmasi jadwal aktivasi kolektif', true],
            ['Monitoring aktivasi mingguan', false],
            ['Laporan akhir aktivasi', false],
          ],
        ],
      ]),
      sortOrder: 1,
      createdAt: daysAgo(9),
      updatedAt: hoursAgo(5),
      version: 4,
      createdByEmployeeId: 'emp-erna',
      updatedByEmployeeId: 'emp-erna',
    }),
    task({
      id: 'task-bahan-pimpinan',
      stepId: 'step-todo',
      title: 'Bahan paparan pimpinan: evaluasi penyaluran Juli',
      description: 'Menyiapkan bahan paparan rapat evaluasi bulanan pimpinan.',
      durationType: 'JANGKA_PENDEK',
      categoryId: 'cat-rapat',
      labelIds: ['lbl-pimpinan'],
      priority: 'TINGGI',
      startDate: dateDaysAgo(1),
      dueDate: dateDaysFromNow(1),
      progressMode: 'MANUAL',
      manualProgress: 20,
      picMainId: 'emp-sirda',
      picIds: ['emp-sendi'],
      isFocus: true,
      sortOrder: 0,
      createdAt: daysAgo(1),
      updatedAt: hoursAgo(1),
      version: 3,
      createdByEmployeeId: 'emp-sirda',
      updatedByEmployeeId: 'emp-sirda',
    }),
    task({
      id: 'task-dashboard-internal',
      stepId: 'step-onprogress',
      title: 'Pembaruan dashboard monitoring internal',
      description: 'Menambah indikator progres per jenjang dan perbaikan kinerja kueri.',
      durationType: 'JANGKA_PANJANG',
      categoryId: 'cat-data',
      labelIds: ['lbl-rutin'],
      priority: 'SEDANG',
      startDate: dateDaysAgo(20),
      progressMode: 'MANUAL',
      manualProgress: 80,
      picMainId: 'emp-fajar',
      picIds: ['emp-sendi'],
      sortOrder: 2,
      createdAt: daysAgo(20),
      updatedAt: hoursAgo(0.5),
      version: 11,
      createdByEmployeeId: 'emp-fajar',
      updatedByEmployeeId: 'emp-sendi',
    }),
    task({
      id: 'task-verifikasi-susulan',
      stepId: 'step-todo',
      title: 'Verifikasi usulan penerima tahap susulan',
      description: 'Verifikasi kelengkapan usulan penerima susulan dari dinas pendidikan.',
      durationType: 'JANGKA_PANJANG',
      categoryId: 'cat-penyaluran',
      labelIds: [],
      priority: 'SEDANG',
      startDate: dateDaysAgo(3),
      dueDate: dateDaysFromNow(4),
      progressMode: 'MANUAL',
      manualProgress: 0,
      sortOrder: 1,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3),
      version: 1,
      createdByEmployeeId: 'emp-erna',
      updatedByEmployeeId: 'emp-erna',
    }),
    task({
      id: 'task-data-dpr',
      stepId: 'step-willdo',
      title: 'Permintaan data penyaluran dari Komisi X DPR RI',
      description: 'Menyiapkan data agregat penyaluran per provinsi untuk bahan rapat dengar pendapat.',
      durationType: 'JANGKA_PENDEK',
      categoryId: 'cat-layanan',
      labelIds: ['lbl-pimpinan'],
      priority: 'TINGGI',
      dueDate: dateDaysFromNow(0),
      progressMode: 'MANUAL',
      manualProgress: 0,
      picMainId: 'emp-hesti',
      picIds: [],
      sortOrder: 0,
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(6),
      version: 1,
      createdByEmployeeId: 'emp-hesti',
      updatedByEmployeeId: 'emp-hesti',
    }),
    task({
      id: 'task-juknis',
      stepId: 'step-willdo',
      title: 'Penyusunan juknis pencairan kolektif',
      description: 'Menyusun petunjuk teknis pencairan kolektif untuk sekolah daerah 3T.',
      durationType: 'JANGKA_PANJANG',
      categoryId: 'cat-sk',
      labelIds: [],
      priority: 'SEDANG',
      dueDate: dateDaysFromNow(20),
      progressMode: 'MANUAL',
      manualProgress: 10,
      picMainId: 'emp-thoriq',
      picIds: [],
      sortOrder: 1,
      createdAt: daysAgo(25),
      updatedAt: daysAgo(12),
      version: 2,
      createdByEmployeeId: 'emp-thoriq',
      updatedByEmployeeId: 'emp-thoriq',
    }),
    task({
      id: 'task-rapat-bank',
      stepId: 'step-done',
      title: 'Rapat koordinasi teknis dengan bank penyalur',
      description: 'Koordinasi percepatan aktivasi dan jadwal pencairan termin 2.',
      durationType: 'JANGKA_PENDEK',
      categoryId: 'cat-rapat',
      labelIds: ['lbl-lintas'],
      priority: 'SEDANG',
      startDate: dateDaysAgo(4),
      dueDate: dateDaysAgo(2),
      progressMode: 'CHECKLIST',
      picMainId: 'emp-drajat',
      picIds: ['emp-erna', 'emp-yusna'],
      checklist: checklist([
        [
          'Pelaksanaan',
          [
            ['Undangan & agenda', true],
            ['Bahan paparan', true],
            ['Pelaksanaan rapat', true],
            ['Notulen & tindak lanjut', true],
          ],
        ],
      ]),
      sortOrder: 0,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(2),
      version: 6,
      createdByEmployeeId: 'emp-drajat',
      updatedByEmployeeId: 'emp-drajat',
    }),
    task({
      id: 'task-surat-jabar',
      stepId: 'step-done',
      title: 'Surat balasan Dinas Pendidikan Provinsi Jawa Barat',
      description: 'Balasan permohonan penjelasan mekanisme pemutakhiran data penerima.',
      durationType: 'JANGKA_PENDEK',
      categoryId: 'cat-layanan',
      labelIds: ['lbl-rutin'],
      priority: 'RENDAH',
      dueDate: dateDaysAgo(5),
      progressMode: 'MANUAL',
      manualProgress: 100,
      picMainId: 'emp-sirda',
      picIds: [],
      sortOrder: 1,
      createdAt: daysAgo(8),
      updatedAt: daysAgo(5),
      version: 3,
      createdByEmployeeId: 'emp-sirda',
      updatedByEmployeeId: 'emp-sirda',
    }),
    task({
      id: 'task-pemutakhiran',
      stepId: 'step-onprogress',
      title: 'Pemutakhiran data penerima per jenjang',
      description: 'Sinkronisasi data penerima dengan Dapodik dan EMIS untuk semester berjalan.',
      durationType: 'JANGKA_PANJANG',
      categoryId: 'cat-data',
      labelIds: ['lbl-rutin', 'lbl-lintas'],
      priority: 'SEDANG',
      startDate: dateDaysAgo(15),
      dueDate: dateDaysFromNow(10),
      progressMode: 'CHECKLIST',
      picMainId: 'emp-thoriq',
      picIds: ['emp-sendi'],
      checklist: checklist([
        [
          'Sinkronisasi',
          [
            ['Tarik data Dapodik', true],
            ['Tarik data EMIS', true],
            ['Padankan NISN ganda', true],
            ['Validasi anomali', false],
            ['Berita acara pemutakhiran', false],
          ],
        ],
        ['Kualitas data', [['Uji sampel 5%', true], ['Reviu tim kebijakan', false]]],
      ]),
      sortOrder: 3,
      createdAt: daysAgo(15),
      updatedAt: daysAgo(1),
      version: 8,
      createdByEmployeeId: 'emp-thoriq',
      updatedByEmployeeId: 'emp-thoriq',
    }),
    task({
      id: 'task-pengaduan',
      stepId: 'step-todo',
      title: 'Monitoring pengaduan layanan PIP minggu ke-29',
      description: 'Rekap pengaduan ULT dan media sosial, klasifikasi, dan distribusi tindak lanjut.',
      durationType: 'JANGKA_PENDEK',
      categoryId: 'cat-layanan',
      labelIds: ['lbl-rutin'],
      priority: 'RENDAH',
      dueDate: dateDaysFromNow(2),
      progressMode: 'MANUAL',
      manualProgress: 0,
      picMainId: 'emp-sirda',
      picIds: [],
      sortOrder: 2,
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
      version: 1,
      createdByEmployeeId: 'emp-sirda',
      updatedByEmployeeId: 'emp-sirda',
    }),
    

    task({
      id: 'task-arsip-termin1',
      stepId: 'step-done',
      title: 'Penyaluran PIP Termin 1 tahun 2026',
      description: 'Seluruh rangkaian penyaluran termin 1: SK, aktivasi, pencairan, dan pelaporan.',
      durationType: 'JANGKA_PANJANG',
      categoryId: 'cat-penyaluran',
      labelIds: ['lbl-termin1'],
      priority: 'TINGGI',
      startDate: dateDaysAgo(150),
      dueDate: dateDaysAgo(40),
      progressMode: 'MANUAL',
      manualProgress: 100,
      picMainId: 'emp-erna',
      picIds: ['emp-drajat', 'emp-yusna'],
      archivedAt: daysAgo(30),
      sortOrder: 2,
      createdAt: daysAgo(150),
      updatedAt: daysAgo(30),
      version: 21,
      createdByEmployeeId: 'emp-erna',
      updatedByEmployeeId: 'emp-erna',
    }),
    task({
      id: 'task-arsip-sosialisasi',
      stepId: 'step-done',
      title: 'Sosialisasi juknis PIP 2026 ke dinas pendidikan',
      description: 'Rangkaian webinar sosialisasi juknis untuk 38 provinsi.',
      durationType: 'JANGKA_PANJANG',
      categoryId: 'cat-rapat',
      labelIds: [],
      priority: 'SEDANG',
      startDate: dateDaysAgo(120),
      dueDate: dateDaysAgo(60),
      progressMode: 'MANUAL',
      manualProgress: 100,
      picMainId: 'emp-sirda',
      picIds: ['emp-hesti'],
      archivedAt: daysAgo(45),
      sortOrder: 3,
      createdAt: daysAgo(120),
      updatedAt: daysAgo(45),
      version: 9,
      createdByEmployeeId: 'emp-sirda',
      updatedByEmployeeId: 'emp-sirda',
    }),
    task({
      id: 'task-terhapus-demo',
      stepId: 'step-willdo',
      title: 'Uji coba formulir pengumpulan data lama',
      description: 'Duplikat dari pekerjaan pemutakhiran data.',
      durationType: 'JANGKA_PENDEK',
      categoryId: 'cat-data',
      labelIds: [],
      priority: 'RENDAH',
      progressMode: 'MANUAL',
      manualProgress: 0,
      picMainId: 'emp-sendi',
      picIds: [],
      deletedAt: daysAgo(10),
      deleteReason: 'Duplikat dengan pekerjaan pemutakhiran data',
      sortOrder: 9,
      createdAt: daysAgo(40),
      updatedAt: daysAgo(10),
      version: 2,
      createdByEmployeeId: 'emp-sendi',
      updatedByEmployeeId: 'emp-sendi',
    }),
  ];
}

// ---------------------------------------------------------------------------
// Komentar / kendala / tindak lanjut
// ---------------------------------------------------------------------------

function buildComments(): TaskComment[] {
  return [
    {
      id: 'cmt-1',
      taskId: 'task-sk-termin2',
      type: 'KOMENTAR',
      text: 'Lampiran penerima sudah final, menunggu jadwal paraf biro hukum.',
      employeeId: 'emp-hesti',
      createdAt: hoursAgo(26),
    },
    {
      id: 'cmt-2',
      taskId: 'task-sk-termin2',
      type: 'KENDALA',
      text: 'Slot paraf biro hukum penuh sampai Kamis; berisiko menggeser penomoran SK.',
      employeeId: 'emp-hesti',
      createdAt: hoursAgo(8),
    },
    {
      id: 'cmt-3',
      taskId: 'task-sk-termin2',
      type: 'TINDAK_LANJUT',
      text: 'Ketua tim mengirim nota dinas percepatan ke biro hukum hari ini.',
      employeeId: 'emp-rakean',
      createdAt: hoursAgo(2),
    },
    {
      id: 'cmt-4',
      taskId: 'task-rekon-juni',
      type: 'KENDALA',
      text: 'Bank belum mengirim rekening koran final; selisih 0,4% belum bisa dijelaskan.',
      employeeId: 'emp-drajat',
      createdAt: daysAgo(1),
    },
    {
      id: 'cmt-5',
      taskId: 'task-evaluasi-sem1',
      type: 'TINDAK_LANJUT',
      text: 'Sudah diminta data final ke bank melalui surat resmi minggu lalu.',
      employeeId: 'emp-hesti',
      createdAt: daysAgo(4),
    },
    {
      id: 'cmt-6',
      taskId: 'task-evaluasi-sem1',
      type: 'KENDALA',
      text: 'Data final bank penyalur belum masuk; analisis tren belum bisa ditutup.',
      employeeId: 'emp-drajat',
      createdAt: hoursAgo(26),
    },
    {
      id: 'cmt-7',
      taskId: 'task-aktivasi-sma',
      type: 'KOMENTAR',
      text: 'Aktivasi minggu ini mencapai 68% dari target wilayah timur.',
      employeeId: 'emp-erna',
      createdAt: hoursAgo(5),
    },
  ];
}

// ---------------------------------------------------------------------------
// Data penyaluran agregat (per jenjang) — tanpa data individual siswa
// ---------------------------------------------------------------------------

interface JenjangBase {
  alokasiSiswa: number;
  unit: number; // nominal bantuan per siswa per tahun
}

const BASE: Record<Jenjang, JenjangBase> = {
  SD: { alokasiSiswa: 10_400_000, unit: 450_000 },
  SMP: { alokasiSiswa: 4_400_000, unit: 750_000 },
  SMA: { alokasiSiswa: 1_350_000, unit: 1_800_000 },
  SMK: { alokasiSiswa: 1_850_000, unit: 1_800_000 },
};

/** Buat baris agregat dari rasio SK & salur per jenjang. */
function rows(sk: Record<Jenjang, number>, salur: Record<Jenjang, number>): DistributionRow[] {
  return (Object.keys(BASE) as Jenjang[]).map((j) => {
    const base = BASE[j];
    const skSiswa = Math.round(base.alokasiSiswa * sk[j]);
    const salurSiswa = Math.round(base.alokasiSiswa * salur[j]);
    return {
      jenjang: j,
      alokasiSiswa: base.alokasiSiswa,
      alokasiAnggaran: base.alokasiSiswa * base.unit,
      skSiswa,
      skAnggaran: skSiswa * base.unit,
      salurSiswa,
      salurAnggaran: salurSiswa * base.unit,
    };
  });
}

interface SnapshotSpec {
  id: string;
  year: number;
  period: string;
  status: DistributionSnapshot['status'];
  createdDaysAgo: number;
  activatedDaysAgo: number | null;
  sk: Record<Jenjang, number>;
  salur: Record<Jenjang, number>;
  note?: string;
  sourceFileName?: string;
}

const SNAPSHOTS: SnapshotSpec[] = [
  // Histori 2026 Termin 1 — beberapa versi untuk tren
  {
    id: 'snap-2026t1-feb',
    year: 2026,
    period: 'Termin 1',
    status: 'ARCHIVED',
    createdDaysAgo: 150,
    activatedDaysAgo: 149,
    sk: { SD: 0.42, SMP: 0.4, SMA: 0.38, SMK: 0.37 },
    salur: { SD: 0.12, SMP: 0.11, SMA: 0.09, SMK: 0.08 },
    sourceFileName: 'penyaluran-2026-t1-feb.xlsx',
  },
  {
    id: 'snap-2026t1-mar',
    year: 2026,
    period: 'Termin 1',
    status: 'ARCHIVED',
    createdDaysAgo: 120,
    activatedDaysAgo: 119,
    sk: { SD: 0.61, SMP: 0.58, SMA: 0.55, SMK: 0.53 },
    salur: { SD: 0.31, SMP: 0.28, SMA: 0.24, SMK: 0.22 },
    sourceFileName: 'penyaluran-2026-t1-mar.xlsx',
  },
  {
    id: 'snap-2026t1-apr',
    year: 2026,
    period: 'Termin 1',
    status: 'ARCHIVED',
    createdDaysAgo: 90,
    activatedDaysAgo: 89,
    sk: { SD: 0.78, SMP: 0.75, SMA: 0.7, SMK: 0.69 },
    salur: { SD: 0.52, SMP: 0.48, SMA: 0.43, SMK: 0.41 },
    sourceFileName: 'penyaluran-2026-t1-apr.xlsx',
  },
  {
    id: 'snap-2026t1-mei',
    year: 2026,
    period: 'Termin 1',
    status: 'ARCHIVED',
    createdDaysAgo: 60,
    activatedDaysAgo: 59,
    sk: { SD: 0.9, SMP: 0.88, SMA: 0.84, SMK: 0.82 },
    salur: { SD: 0.71, SMP: 0.67, SMA: 0.61, SMK: 0.58 },
    sourceFileName: 'penyaluran-2026-t1-mei.xlsx',
  },
  {
    id: 'snap-2026t1-jun',
    year: 2026,
    period: 'Termin 1',
    status: 'ARCHIVED',
    createdDaysAgo: 30,
    activatedDaysAgo: 29,
    sk: { SD: 0.95, SMP: 0.93, SMA: 0.9, SMK: 0.88 },
    salur: { SD: 0.82, SMP: 0.79, SMA: 0.73, SMK: 0.7 },
    sourceFileName: 'penyaluran-2026-t1-jun.xlsx',
  },
  {
    id: 'snap-2026t1-jul',
    year: 2026,
    period: 'Termin 1',
    status: 'ACTIVE',
    createdDaysAgo: 6,
    activatedDaysAgo: 5,
    sk: { SD: 0.97, SMP: 0.95, SMA: 0.93, SMK: 0.91 },
    salur: { SD: 0.88, SMP: 0.85, SMA: 0.8, SMK: 0.77 },
    sourceFileName: 'penyaluran-2026-t1-jul.xlsx',
    note: 'Pembaruan mingguan dari bank penyalur',
  },
  // Draft Termin 2 2026 (untuk demo alur aktivasi Admin)
  {
    id: 'snap-2026t2-draft',
    year: 2026,
    period: 'Termin 2',
    status: 'DRAFT',
    createdDaysAgo: 2,
    activatedDaysAgo: null,
    sk: { SD: 0.35, SMP: 0.33, SMA: 0.3, SMK: 0.28 },
    salur: { SD: 0.05, SMP: 0.04, SMA: 0.03, SMK: 0.03 },
    sourceFileName: 'penyaluran-2026-t2-awal.xlsx',
    note: 'Draft awal termin 2 — menunggu validasi',
  },
  // Tahun 2025 (histori tahun lalu)
  {
    id: 'snap-2025t3',
    year: 2025,
    period: 'Termin 3',
    status: 'ACTIVE',
    createdDaysAgo: 240,
    activatedDaysAgo: 239,
    sk: { SD: 0.99, SMP: 0.99, SMA: 0.98, SMK: 0.98 },
    salur: { SD: 0.985, SMP: 0.98, SMA: 0.975, SMK: 0.97 },
    sourceFileName: 'penyaluran-2025-final.xlsx',
    note: 'Data final tahun anggaran 2025',
  },
  {
    id: 'snap-2025t2',
    year: 2025,
    period: 'Termin 2',
    status: 'ARCHIVED',
    createdDaysAgo: 330,
    activatedDaysAgo: 329,
    sk: { SD: 0.93, SMP: 0.91, SMA: 0.9, SMK: 0.89 },
    salur: { SD: 0.78, SMP: 0.75, SMA: 0.72, SMK: 0.7 },
  },
  {
    id: 'snap-2025t1',
    year: 2025,
    period: 'Termin 1',
    status: 'ARCHIVED',
    createdDaysAgo: 420,
    activatedDaysAgo: 419,
    sk: { SD: 0.55, SMP: 0.52, SMA: 0.5, SMK: 0.48 },
    salur: { SD: 0.35, SMP: 0.32, SMA: 0.3, SMK: 0.28 },
  },
];

function buildSnapshots(): DistributionSnapshot[] {
  return SNAPSHOTS.map((s) => ({
    id: s.id,
    year: s.year,
    period: s.period,
    status: s.status,
    rows: rows(s.sk, s.salur),
    sourceFileName: s.sourceFileName ?? null,
    note: s.note ?? null,
    createdAt: daysAgo(s.createdDaysAgo),
    createdByEmployeeId: 'emp-sucianingsih',
    activatedAt: s.activatedDaysAgo === null ? null : daysAgo(s.activatedDaysAgo),
    updatedAt: daysAgo(s.activatedDaysAgo ?? s.createdDaysAgo),
    version: 1,
  }));
}

// ---------------------------------------------------------------------------
// Template pekerjaan
// ---------------------------------------------------------------------------

function buildTemplates(): TaskTemplate[] {
  return [
    {
      id: 'tpl-rapat',
      name: 'Rapat koordinasi',
      title: 'Rapat koordinasi: [topik]',
      description: 'Koordinasi terjadwal dengan pemangku kepentingan terkait.',
      categoryId: 'cat-rapat',
      labelIds: ['lbl-lintas'],
      durationType: 'JANGKA_PENDEK',
      priority: 'SEDANG',
      initialStepId: 'step-todo',
      targetOffsetDays: 3,
      checklist: checklist([
        [
          'Persiapan',
          [
            ['Susun agenda & undangan', false],
            ['Siapkan bahan paparan', false],
            ['Konfirmasi peserta', false],
          ],
        ],
        ['Pasca rapat', [['Notulen', false], ['Distribusi tindak lanjut', false]]],
      ]),
      sortOrder: 0,
      active: true,
      createdAt: daysAgo(200),
      updatedAt: daysAgo(60),
    },
    {
      id: 'tpl-permintaan-data',
      name: 'Permintaan data pimpinan',
      title: 'Permintaan data: [perihal]',
      description: 'Pemenuhan permintaan data agregat dari pimpinan/eksternal.',
      categoryId: 'cat-layanan',
      labelIds: ['lbl-pimpinan'],
      durationType: 'JANGKA_PENDEK',
      priority: 'TINGGI',
      initialStepId: 'step-todo',
      targetOffsetDays: 2,
      checklist: checklist([
        [
          'Pemenuhan',
          [
            ['Pahami kebutuhan & format', false],
            ['Tarik & olah data', false],
            ['Verifikasi silang', false],
            ['Kirim & arsipkan', false],
          ],
        ],
      ]),
      sortOrder: 1,
      active: true,
      createdAt: daysAgo(200),
      updatedAt: daysAgo(90),
    },
    {
      id: 'tpl-penyaluran',
      name: 'Penyaluran termin',
      title: 'Penyaluran PIP Termin [n] [tahun]',
      description: 'Rangkaian penyaluran satu termin: SK, aktivasi, pencairan, pelaporan.',
      categoryId: 'cat-penyaluran',
      labelIds: [],
      durationType: 'JANGKA_PANJANG',
      priority: 'TINGGI',
      initialStepId: 'step-willdo',
      targetOffsetDays: 45,
      checklist: checklist([
        [
          'Tahapan utama',
          [
            ['Finalisasi SK Pemberian', false],
            ['Kirim SP2D / daftar nominatif', false],
            ['Monitoring aktivasi rekening', false],
            ['Monitoring pencairan', false],
            ['Rekonsiliasi & pelaporan', false],
          ],
        ],
      ]),
      sortOrder: 2,
      active: true,
      createdAt: daysAgo(200),
      updatedAt: daysAgo(30),
    },
  ];
}

// ---------------------------------------------------------------------------
// Audit awal (menghidupkan feed aktivitas)
// ---------------------------------------------------------------------------

function buildAudit(): AuditEntry[] {
  const mk = (
    at: string,
    employeeId: string,
    action: AuditEntry['action'],
    entityType: AuditEntry['entityType'],
    entityId: string,
    entityLabel: string,
    before: unknown,
    after: unknown,
  ): AuditEntry => ({
    id: `aud-seed-${entityId}-${action}-${at}`,
    at,
    actorRole: 'EMPLOYEE',
    actorAccount: 'tim-pip',
    employeeId,
    action,
    entityType,
    entityId,
    entityLabel,
    before,
    after,
    success: true,
    errorMessage: null,
    sessionId: null,
    deviceLabel: 'Perangkat tim',
  });

  return [
    mk(hoursAgo(0.5), 'emp-sendi', 'UPDATE', 'TASK', 'task-dashboard-internal', 'Pembaruan dashboard monitoring internal', { progress: 70 }, { progress: 80 }),
    mk(hoursAgo(1), 'emp-sirda', 'UPDATE', 'TASK', 'task-bahan-pimpinan', 'Bahan paparan pimpinan: evaluasi penyaluran Juli', { progress: 0 }, { progress: 20 }),
    mk(hoursAgo(2), 'emp-rakean', 'UPDATE', 'TASK', 'task-sk-termin2', 'Finalisasi SK Pemberian PIP Termin 2', { checklist: '5/6' }, { checklist: '4/6' }),
    {
      ...mk(hoursAgo(5), 'emp-sucianingsih', 'ACTIVATE', 'SNAPSHOT', 'snap-2026t1-jul', 'Penyaluran 2026 · Termin 1', { status: 'DRAFT' }, { status: 'ACTIVE' }),
      actorRole: 'ADMIN',
      actorAccount: 'admin',
    },
    mk(hoursAgo(6), 'emp-hesti', 'CREATE', 'TASK', 'task-data-dpr', 'Permintaan data penyaluran dari Komisi X DPR RI', null, { stepId: 'step-willdo' }),
    mk(hoursAgo(26), 'emp-hesti', 'MOVE', 'TASK', 'task-evaluasi-sem1', 'Evaluasi capaian penyaluran semester 1', { step: 'On Progress' }, { step: 'On Progress' }),
    mk(daysAgo(1), 'emp-drajat', 'UPDATE', 'TASK', 'task-rekon-juni', 'Rekonsiliasi penyaluran bank penyalur bulan Juni', { progress: 50 }, { progress: 65 }),
    mk(daysAgo(2), 'emp-drajat', 'MOVE', 'TASK', 'task-rapat-bank', 'Rapat koordinasi teknis dengan bank penyalur', { step: 'On Progress' }, { step: 'Done' }),
    mk(daysAgo(2), 'emp-sirda', 'UPDATE', 'TASK', 'task-pengaduan', 'Monitoring pengaduan layanan PIP minggu ke-29', null, { pic: 'Maya' }),
    mk(daysAgo(3), 'emp-erna', 'CREATE', 'TASK', 'task-verifikasi-susulan', 'Verifikasi usulan penerima tahap susulan', null, { stepId: 'step-todo' }),
  ];
}

// ---------------------------------------------------------------------------
// Pengaturan
// ---------------------------------------------------------------------------

const buildSettings = (): AppSettings => ({
  appName: 'Dashboard PIP',
  logoDataUrl: null,
  activeYear: 2026,
  userSessionDays: 180,
  staleDays: 7,
  attachmentMaxMB: 10,
  attachmentAllowedExt: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'csv', 'txt'],
  updatedAt: daysAgo(30),
  version: 1,
});

// ---------------------------------------------------------------------------
// Sumber spreadsheet (metadata seed 2026 — Docs/09 §R, §S, §V)
// ---------------------------------------------------------------------------

export const PIP_SPREADSHEET_ID = '11IgR3kwN3xiSuArIKgPmC98AcdotR0k_iWOMPJjNVY8';
export const PLAN_SPREADSHEET_ID = '16U0Zv9lHXr41S1oiXdf1m0xt2K1bZiN6neLz5lCbO98';

function buildSources(): SpreadsheetSource[] {
  const base = {
    isActive: true,
    isPrimary: true,
    syncMode: 'WEBHOOK_DAN_INTERVAL' as const,
    lastSyncedAt: hoursAgo(1),
    lastSyncStatus: 'BERHASIL' as const,
    lastError: null,
    createdByEmployeeId: 'emp-rakean',
    updatedByEmployeeId: 'emp-rakean',
    createdAt: daysAgo(30),
    updatedAt: hoursAgo(1),
    deletedAt: null,
  };
  return [
    {
      id: 'src-pip-2026',
      sourceType: 'pip_progress',
      year: 2026,
      name: 'Progres Penyaluran SK 2026',
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${PIP_SPREADSHEET_ID}/edit`,
      spreadsheetId: PIP_SPREADSHEET_ID,
      ...base,
    },
    {
      id: 'src-plan-2026',
      sourceType: 'activity_plan',
      year: 2026,
      name: 'Rencana Kegiatan 2026',
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${PLAN_SPREADSHEET_ID}/edit`,
      spreadsheetId: PLAN_SPREADSHEET_ID,
      ...base,
    },
  ];
}

function buildBindings(): SheetBinding[] {
  return [
    {
      id: 'bind-pip-detail',
      sourceId: 'src-pip-2026',
      bindingType: 'detail_realisasi',
      sheetName: 'Pemberian',
      headerRow: 1,
      dataStartRow: 2,
      optionalRange: null,
      mappingStatus: 'TERKONFIRMASI',
    },
    {
      id: 'bind-pip-rekap',
      sourceId: 'src-pip-2026',
      bindingType: 'allocation_summary',
      sheetName: 'REKAP PROGRESS',
      headerRow: 1,
      dataStartRow: 2,
      optionalRange: null,
      mappingStatus: 'TERKONFIRMASI',
    },
    {
      id: 'bind-plan-rows',
      sourceId: 'src-plan-2026',
      bindingType: 'activity_rows',
      sheetName: 'Sheet1',
      headerRow: 1,
      dataStartRow: 2,
      optionalRange: null,
      mappingStatus: 'TERKONFIRMASI',
    },
  ];
}

function buildColumnMappings(): ColumnMapping[] {
  const mk = (
    bindingId: string,
    detectedHeader: string,
    targetField: string,
    parserType: ColumnMapping['parserType'],
    required = false,
  ): ColumnMapping => ({
    id: `map-${bindingId}-${targetField}`,
    bindingId,
    detectedHeader,
    targetField,
    parserType,
    transformRule: null,
    required,
    validationStatus: 'VALID',
  });
  return [
    mk('bind-pip-detail', 'Jenjang', 'jenjang', 'text', true),
    mk('bind-pip-detail', 'Tahap', 'tahap', 'text'),
    mk('bind-pip-detail', 'Nomor SK', 'nomor_sk', 'text'),
    mk('bind-pip-detail', 'Tanggal SK', 'tanggal_sk', 'date'),
    mk('bind-pip-detail', 'Jumlah Siswa', 'jumlah_siswa', 'number', true),
    mk('bind-pip-detail', 'Jumlah Dana', 'jumlah_dana', 'currency', true),
    mk('bind-pip-rekap', 'Jenjang', 'jenjang', 'text', true),
    mk('bind-pip-rekap', 'Alokasi Siswa', 'alokasi_siswa', 'number', true),
    mk('bind-pip-rekap', 'Pagu', 'alokasi_anggaran', 'currency', true),
    mk('bind-pip-rekap', 'Realisasi Siswa', 'realisasi_siswa', 'number', true),
    mk('bind-pip-rekap', 'Realisasi Dana', 'realisasi_dana', 'currency', true),
    mk('bind-plan-rows', 'Kegiatan', 'title', 'text', true),
    mk('bind-plan-rows', 'Tanggal Mulai', 'start_date', 'date', true),
    mk('bind-plan-rows', 'Tanggal Selesai', 'end_date', 'date'),
    mk('bind-plan-rows', 'PIC', 'pic', 'text'),
    mk('bind-plan-rows', 'Lokasi', 'location', 'text'),
    mk('bind-plan-rows', 'Status', 'status', 'text'),
  ];
}

function buildSyncRuns(): SyncRun[] {
  const mk = (
    id: string,
    sourceId: string,
    hAgo: number,
    trigger: SyncRun['trigger'],
    status: SyncRun['status'],
    rowsRead: number,
    message: string | null = null,
  ): SyncRun => ({
    id,
    sourceId,
    trigger,
    status,
    startedAt: hoursAgo(hAgo),
    finishedAt: hoursAgo(hAgo - 0.01),
    rowsRead,
    rowsUpserted: rowsRead,
    message,
    errorMessage: status === 'GAGAL' ? (message ?? 'Kesalahan tidak diketahui') : null,
  });
  return [
    mk('run-pip-1', 'src-pip-2026', 1, 'WEBHOOK', 'BERHASIL', 42, 'Perubahan sheet Pemberian'),
    mk('run-plan-1', 'src-plan-2026', 1, 'WEBHOOK', 'BERHASIL', 28, 'Perubahan Sheet1'),
    mk('run-pip-2', 'src-pip-2026', 26, 'MANUAL', 'BERHASIL', 42, 'Sinkronisasi manual Admin'),
    mk('run-pip-3', 'src-pip-2026', 50, 'JADWAL', 'BERHASIL', 41, 'Rekonsiliasi terjadwal'),
  ];
}

// ---------------------------------------------------------------------------
// Rencana Kegiatan (contoh lokal — produksi membaca hasil sinkronisasi sheet)
// ---------------------------------------------------------------------------

interface ActivitySpec {
  id: string;
  title: string;
  /** Hari relatif dari hari ini (negatif = lampau). */
  startIn: number;
  days?: number;
  startTime?: string;
  endTime?: string;
  location?: string;
  category?: string;
  picIds?: string[];
  picExtra?: string[];
  participants?: string;
  status: ActivityPlanItem['status'];
  notes?: string;
  meetingLink?: string;
}

const ACTIVITIES: ActivitySpec[] = [
  { id: 'act-rakor-bank', title: 'Rapat koordinasi bank penyalur Termin 2', startIn: 0, startTime: '09:00', endTime: '12:00', location: 'Ruang Rapat Lantai 3, Puslapdik', category: 'Rapat', picIds: ['emp-rakean', 'emp-drajat'], participants: 'Tim PIP, Bank Penyalur', status: 'BERLANGSUNG', notes: 'Agenda: percepatan aktivasi rekening.' },
  { id: 'act-monev-jabar', title: 'Monitoring & evaluasi penyaluran Jawa Barat', startIn: 1, days: 3, location: 'Bandung', category: 'Perjalanan Dinas', picIds: ['emp-hesti', 'emp-erna'], status: 'TERJADWAL' },
  { id: 'act-webinar-juknis', title: 'Webinar sosialisasi juknis PIP untuk dinas pendidikan', startIn: 3, startTime: '13:00', endTime: '15:30', location: 'Zoom', category: 'Sosialisasi', picIds: ['emp-sirda'], picExtra: ['Narasumber Ditjen'], participants: '38 dinas provinsi', status: 'TERJADWAL', meetingLink: 'https://zoom.us/j/000000000' },
  { id: 'act-rekon-juli', title: 'Rekonsiliasi data penyaluran bulan Juli', startIn: 6, days: 2, location: 'Puslapdik', category: 'Rekonsiliasi', picIds: ['emp-drajat', 'emp-yusna'], status: 'RENCANA' },
  { id: 'act-paparan-pimpinan', title: 'Paparan capaian penyaluran kepada pimpinan', startIn: 8, startTime: '10:00', endTime: '11:30', location: 'Ruang Kerja Kapus', category: 'Rapat', picIds: ['emp-rakean'], status: 'RENCANA' },
  { id: 'act-bimtek-plpp', title: 'Bimbingan teknis pengelolaan data PIP', startIn: 14, days: 3, location: 'Bogor', category: 'Bimtek', picIds: ['emp-thoriq', 'emp-sendi', 'emp-kamil'], status: 'RENCANA' },
  { id: 'act-fgd-kebijakan', title: 'FGD penyempurnaan kebijakan penyaluran 2027', startIn: 21, startTime: '09:00', endTime: '16:00', location: 'Jakarta', category: 'FGD', picIds: ['emp-hesti', 'emp-sucianingsih'], status: 'RENCANA' },
  { id: 'act-rapat-internal', title: 'Rapat internal mingguan Tim Kemitraan', startIn: -2, startTime: '08:30', endTime: '10:00', location: 'Ruang Rapat Lantai 3', category: 'Rapat', picIds: ['emp-rakean'], status: 'SELESAI' },
  { id: 'act-verifikasi-susulan', title: 'Verifikasi usulan penerima tahap susulan', startIn: -5, days: 2, location: 'Puslapdik', category: 'Verifikasi', picIds: ['emp-erna', 'emp-linda'], status: 'SELESAI' },
  { id: 'act-kunjungan-dpr', title: 'Pendampingan kunjungan kerja Komisi X DPR RI', startIn: 10, days: 2, location: 'Yogyakarta', category: 'Perjalanan Dinas', picIds: ['emp-rakean', 'emp-hesti'], status: 'DITUNDA', notes: 'Menunggu jadwal ulang dari Setkomisi.' },
  { id: 'act-pelatihan-arsip', title: 'Pelatihan pengelolaan arsip digital', startIn: 17, startTime: '09:00', endTime: '12:00', location: 'Ruang Pelatihan', category: 'Pelatihan', picIds: ['emp-entin', 'emp-lina'], status: 'DIBATALKAN', notes: 'Digabung dengan agenda biro umum.' },
  { id: 'act-rekap-semester', title: 'Penyusunan rekap capaian semester 1', startIn: 27, days: 4, location: 'Puslapdik', category: 'Pelaporan', picIds: ['emp-yusna', 'emp-suyadi'], status: 'RENCANA' },
];

function buildActivities(): ActivityPlanItem[] {
  const empById = new Map(EMPLOYEES.map((e) => [e.id, e]));
  return ACTIVITIES.map((a, i) => {
    const startDate = dateDaysFromNow(a.startIn);
    const endDate = dateDaysFromNow(a.startIn + (a.days ? a.days - 1 : 0));
    const picEmployeeIds = a.picIds ?? [];
    const picNames = [
      ...picEmployeeIds.map((id) => empById.get(id)?.displayName ?? id),
      ...(a.picExtra ?? []),
    ];
    return {
      id: a.id,
      sourceId: 'src-plan-2026',
      year: 2026,
      title: a.title,
      startDate,
      endDate,
      startTime: a.startTime ?? null,
      endTime: a.endTime ?? null,
      allDay: !a.startTime,
      location: a.location ?? '',
      category: a.category ?? '',
      picNames,
      picEmployeeIds,
      participants: a.participants ?? '',
      status: a.status,
      notes: a.notes ?? '',
      meetingLink: a.meetingLink ?? null,
      documentLink: null,
      sourceRowKey: `sheet1:${i + 2}`,
      createdAt: daysAgo(20),
      updatedAt: hoursAgo(1),
    };
  });
}

// ---------------------------------------------------------------------------
// API seed
// ---------------------------------------------------------------------------

export interface SeedData {
  employees: Employee[];
  board: BoardInfo;
  steps: Step[];
  tasks: Task[];
  comments: TaskComment[];
  categories: Category[];
  labels: Label[];
  templates: TaskTemplate[];
  snapshots: DistributionSnapshot[];
  settings: AppSettings;
  audit: AuditEntry[];
  sources: SpreadsheetSource[];
  bindings: SheetBinding[];
  columnMappings: ColumnMapping[];
  syncRuns: SyncRun[];
  activities: ActivityPlanItem[];
}

export function buildSeedData(): SeedData {
  return {
    employees: buildEmployees(),
    board: buildBoard(),
    steps: buildSteps(),
    tasks: buildTasks(),
    comments: buildComments(),
    categories: buildCategories(),
    labels: buildLabels(),
    templates: buildTemplates(),
    snapshots: buildSnapshots(),
    settings: buildSettings(),
    audit: buildAudit(),
    sources: buildSources(),
    bindings: buildBindings(),
    columnMappings: buildColumnMappings(),
    syncRuns: buildSyncRuns(),
    activities: buildActivities(),
  };
}
