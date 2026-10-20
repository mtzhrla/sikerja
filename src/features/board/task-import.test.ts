import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Employee, Step } from '@/services/types';
import { guessTaskImportMapping, parseTaskWorkbook, prepareTaskImportRows } from './task-import';

const steps: Step[] = [
  {
    id: 'step-will-do',
    boardId: 'board-1',
    name: 'Will Do',
    kind: 'NORMAL',
    color: '#64748b',
    sortOrder: 0,
    deletedAt: null,
    version: 1,
  },
  {
    id: 'step-done',
    boardId: 'board-1',
    name: 'Done',
    kind: 'DONE',
    color: '#16a34a',
    sortOrder: 1,
    deletedAt: null,
    version: 1,
  },
];

const employees: Employee[] = [
  {
    id: 'employee-rakean',
    fullName: 'Rakean Sundayana, S.Pd., M.A',
    displayName: 'Rakean',
    initials: 'RS',
    color: '#64748b',
    nip: null,
    nipNormalized: null,
    username: null,
    position: '',
    team: '',
    level: 'STAFF',
    supervisorId: null,
    sortOrder: 0,
    active: true,
    avatarPath: null,
    avatarUpdatedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'employee-budi',
    fullName: 'Budi Santoso',
    displayName: 'Budi',
    initials: 'BS',
    color: '#64748b',
    nip: null,
    nipNormalized: null,
    username: null,
    position: '',
    team: '',
    level: 'STAFF',
    supervisorId: null,
    sortOrder: 1,
    active: true,
    avatarPath: null,
    avatarUpdatedAt: null,
    createdAt: '',
    updatedAt: '',
  },
];

async function parseWorkbook(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return parseTaskWorkbook(buffer);
}

describe('task Excel import', () => {
  it('tetap membaca workbook umum dari sheet pertama', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pekerjaan');
    sheet.addRow(['Task', 'Deskripsi']);
    sheet.addRow(['Menyusun laporan', 'Rincian']);

    const parsed = await parseWorkbook(workbook);

    expect(parsed.headers).toEqual(['Task', 'Deskripsi']);
    expect(parsed.rows).toEqual([{ rowNumber: 2, values: ['Menyusun laporan', 'Rincian'] }]);
  });

  it('menebak kolom pekerjaan dan nomor sumber, tanpa memetakan kategori atau label', () => {
    expect(
      guessTaskImportMapping([
        'No',
        'Judul Pekerjaan',
        'Deskripsi',
        'Step',
        'Jenis Durasi',
        'Prioritas',
        'Tanggal Mulai',
        'Target Selesai',
        'PIC Utama',
        'Anggota Tim',
        'Mode Progres',
        'Jumlah Checklist',
        'Checklist Selesai',
        'Progres (%)',
        'Fokus Hari Ini',
        'Kategori',
        'Label',
      ]),
    ).toEqual({
      title: 1,
      description: 2,
      step: 3,
      durationType: 4,
      priority: 5,
      startDate: 6,
      dueDate: 7,
      picMain: 8,
      picMembers: 9,
      progressMode: 10,
      manualProgress: 13,
      focus: 14,
      sourceId: 0,
    });
  });

  it('membaca workbook dua sheet dan mempertahankan status formula false/true checklist', async () => {
    const workbook = new ExcelJS.Workbook();
    const tasks = workbook.addWorksheet('Data Pekerjaan');
    tasks.addRow([
      'No',
      'Judul Pekerjaan',
      'Deskripsi',
      'Step',
      'Jenis Durasi',
      'Prioritas',
      'Tanggal Mulai',
      'Target Selesai',
      'PIC Utama',
      'Anggota Tim',
      'Mode Progres',
      'Daftar Checklist',
      'Jumlah Checklist',
      'Checklist Selesai',
      'Progres (%)',
      'Fokus Hari Ini',
    ]);
    tasks.addRow([
      1,
      'Menyusun laporan',
      'Rincian',
      'Will Do',
      'Jangka Panjang',
      'Tinggi',
      '2026-01-10',
      '2026-02-01',
      'Rakean Sundayana, S.Pd., M.A',
      'Budi Santoso',
      'Otomatis dari Checklist',
      '',
      0,
      0,
      0.5,
      'Ya',
    ]);

    const checklist = workbook.addWorksheet('Checklist');
    checklist.addRow([
      'No Pekerjaan',
      'Judul Pekerjaan',
      'Kelompok Checklist',
      'Item Checklist',
      'Selesai',
    ]);
    checklist.addRow([1, 'Menyusun laporan', 'Persiapan', 'Kumpulkan data', { formula: 'TRUE()' }]);
    checklist.addRow([1, 'Menyusun laporan', 'Persiapan', 'Tinjau data', { formula: 'FALSE()' }]);

    const parsed = await parseWorkbook(workbook);
    const rows = prepareTaskImportRows(
      parsed,
      guessTaskImportMapping(parsed.headers),
      steps,
      'step-will-do',
      employees,
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.checklistRows.map((row) => row.done)).toEqual([true, false]);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      errors: [],
      checklistCount: 2,
      input: {
        title: 'Menyusun laporan',
        description: 'Rincian',
        stepId: 'step-will-do',
        priority: 'TINGGI',
        durationType: 'JANGKA_PANJANG',
        startDate: '2026-01-10',
        dueDate: '2026-02-01',
        progressMode: 'CHECKLIST',
        picMainIds: ['employee-rakean'],
        picIds: ['employee-budi'],
        isFocus: true,
      },
    });
    expect(rows[0]?.input?.checklist?.[0]?.items.map((item) => item.done)).toEqual([true, false]);
    expect(rows[0]?.checklistCount).toBe(2);
  });

  it('mencocokkan checklist menurut nomor pekerjaan dan mendeteksi checklist yang tidak tertaut', async () => {
    const workbook = new ExcelJS.Workbook();
    const tasks = workbook.addWorksheet('Data Pekerjaan');
    tasks.addRow(['No', 'Judul Pekerjaan']);
    tasks.addRow([1, 'Pekerjaan pertama']);
    const checklist = workbook.addWorksheet('Checklist');
    checklist.addRow([
      'No Pekerjaan',
      'Judul Pekerjaan',
      'Kelompok Checklist',
      'Item Checklist',
      'Selesai',
    ]);
    checklist.addRow([99, 'Judul berbeda', 'Kelompok', 'Item', false]);

    const parsed = await parseWorkbook(workbook);

    expect(parsed.unmatchedChecklistRows).toEqual([2]);
  });

  it('menolak workbook yang menyatakan ada checklist tetapi tidak menyertakan sheet Checklist', async () => {
    const workbook = new ExcelJS.Workbook();
    const tasks = workbook.addWorksheet('Data Pekerjaan');
    tasks.addRow(['No', 'Judul Pekerjaan', 'Jumlah Checklist']);
    tasks.addRow([1, 'Pekerjaan pertama', 2]);

    await expect(parseWorkbook(workbook)).rejects.toThrow('Sheet "Checklist" tidak ditemukan');
  });

  it('menormalkan progres manual berbentuk pecahan atau persen', async () => {
    const workbook = new ExcelJS.Workbook();
    const tasks = workbook.addWorksheet('Data Pekerjaan');
    tasks.addRow(['Judul Pekerjaan', 'Step', 'Mode Progres', 'Progres (%)']);
    tasks.addRow(['Pekerjaan pecahan', 'Will Do', 'Manual', 0.1666]);
    tasks.addRow(['Pekerjaan persen', 'Done', 'Manual', 16.6]);

    const parsed = await parseWorkbook(workbook);
    const rows = prepareTaskImportRows(
      parsed,
      guessTaskImportMapping(parsed.headers),
      steps,
      'step-will-do',
      employees,
    );

    expect(rows.map((row) => row.input?.manualProgress)).toEqual([17, 17]);
    expect(rows.map((row) => row.input?.stepId)).toEqual(['step-will-do', 'step-done']);
  });

  it('menandai step dan PIC yang tidak dikenal serta tanggal tidak valid', async () => {
    const workbook = new ExcelJS.Workbook();
    const tasks = workbook.addWorksheet('Data Pekerjaan');
    tasks.addRow(['Judul Pekerjaan', 'Step', 'Mulai', 'Target Selesai', 'PIC Utama']);
    tasks.addRow(['Pekerjaan', 'Step asing', '2026-10-20', '2026-10-01', 'Nama asing']);

    const parsed = await parseWorkbook(workbook);
    const rows = prepareTaskImportRows(
      parsed,
      guessTaskImportMapping(parsed.headers),
      steps,
      'step-will-do',
      employees,
    );

    expect(rows[0]?.input).toBeNull();
    expect(rows[0]?.errors).toContain('Step "Step asing" tidak ditemukan.');
    expect(rows[0]?.errors).toContain('Tenggat tidak boleh sebelum tanggal mulai.');
    expect(rows[0]?.errors).toContain('PIC utama tidak ditemukan: nama asing.');
  });

  it('mengizinkan pekerjaan tanpa PIC utama atau anggota, termasuk tanda strip sebagai penanda kosong', async () => {
    const workbook = new ExcelJS.Workbook();
    const tasks = workbook.addWorksheet('Data Pekerjaan');
    tasks.addRow(['Judul Pekerjaan', 'Step', 'PIC Utama', 'Anggota Tim']);
    tasks.addRow(['Tanpa PIC', 'Will Do', '', '']);
    tasks.addRow(['PIC bertanda strip', 'Will Do', '-', '—']);

    const parsed = await parseWorkbook(workbook);
    const rows = prepareTaskImportRows(
      parsed,
      guessTaskImportMapping(parsed.headers),
      steps,
      'step-will-do',
      employees,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.errors)).toEqual([[], []]);
    expect(rows.map((row) => row.input?.picMainIds)).toEqual([[], []]);
    expect(rows.map((row) => row.input?.picIds)).toEqual([[], []]);
  });

  it('mencegah staf memulai impor dengan PIC utama pegawai lain', async () => {
    const workbook = new ExcelJS.Workbook();
    const tasks = workbook.addWorksheet('Data Pekerjaan');
    tasks.addRow(['Judul Pekerjaan', 'Step', 'PIC Utama']);
    tasks.addRow(['Pekerjaan', 'Will Do', 'Budi Santoso']);

    const parsed = await parseWorkbook(workbook);
    const rows = prepareTaskImportRows(
      parsed,
      guessTaskImportMapping(parsed.headers),
      steps,
      'step-will-do',
      employees,
      ['employee-rakean'],
    );

    expect(rows[0]?.input).toBeNull();
    expect(rows[0]?.errors).toContain(
      'Akun ini hanya dapat mengimpor pekerjaan dengan PIC utama untuk dirinya sendiri.',
    );
  });
});
