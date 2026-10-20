import type ExcelJSModule from 'exceljs';
import { uid } from '@/lib/utils';
import type {
  ChecklistGroup,
  DurationType,
  Employee,
  Priority,
  Step,
  TaskCreateInput,
} from '@/services/types';

export type TaskImportField =
  | 'title'
  | 'description'
  | 'step'
  | 'startDate'
  | 'dueDate'
  | 'priority'
  | 'durationType'
  | 'picMain'
  | 'picMembers'
  | 'progressMode'
  | 'manualProgress'
  | 'focus'
  | 'sourceId';

export type TaskImportMapping = Partial<Record<TaskImportField, number>>;
type CellValue = string | number | boolean;

export interface ParsedChecklistRow {
  taskId: string;
  taskTitle: string;
  groupTitle: string;
  itemText: string;
  done: boolean | null;
  rowNumber: number;
}

export interface ParsedTaskWorkbook {
  headers: string[];
  rows: Array<{ rowNumber: number; values: CellValue[] }>;
  checklistRows: ParsedChecklistRow[];
  unmatchedChecklistRows: number[];
}

export interface TaskImportRow {
  rowNumber: number;
  title: string;
  stepName: string;
  checklistCount: number;
  errors: string[];
  input: TaskCreateInput | null;
}

export const TASK_IMPORT_FIELDS: Array<{
  key: Exclude<TaskImportField, 'sourceId'>;
  label: string;
  keywords: string[];
}> = [
  {
    key: 'title',
    label: 'Nama pekerjaan',
    keywords: ['nama pekerjaan', 'judul pekerjaan', 'judul', 'pekerjaan', 'task'],
  },
  { key: 'description', label: 'Deskripsi', keywords: ['deskripsi', 'uraian', 'keterangan'] },
  { key: 'step', label: 'Step/status', keywords: ['step', 'status', 'tahap', 'kolom'] },
  { key: 'startDate', label: 'Tanggal mulai', keywords: ['tanggal mulai', 'mulai', 'start date'] },
  {
    key: 'dueDate',
    label: 'Tenggat',
    keywords: ['tenggat', 'target selesai', 'deadline', 'due date'],
  },
  { key: 'priority', label: 'Prioritas', keywords: ['prioritas', 'priority'] },
  { key: 'durationType', label: 'Jenis durasi', keywords: ['jenis durasi', 'durasi', 'jangka'] },
  { key: 'picMain', label: 'PIC utama', keywords: ['pic utama'] },
  { key: 'picMembers', label: 'Anggota tim', keywords: ['anggota tim', 'anggota', 'pic tambahan'] },
  { key: 'progressMode', label: 'Mode progres', keywords: ['mode progres', 'progress mode'] },
  {
    key: 'manualProgress',
    label: 'Progres (%)',
    keywords: ['progres (%)', 'progress (%)', 'progres'],
  },
  { key: 'focus', label: 'Fokus hari ini', keywords: ['fokus hari ini', 'fokus'] },
];

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formulaBoolean(formula: string): boolean | null {
  const normalized = formula.trim().replace(/^=/, '').replace(/\s+/g, '').toUpperCase();
  if (normalized === 'TRUE' || normalized === 'TRUE()') return true;
  if (normalized === 'FALSE' || normalized === 'FALSE()') return false;
  return null;
}

function readCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'string' ? value.trim() : value;
  }
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (isRecord(value)) {
    if ('result' in value) return readCellValue(value.result);
    if (typeof value.formula === 'string') {
      return formulaBoolean(value.formula) ?? value.formula;
    }
    if (Array.isArray(value.richText)) {
      return value.richText
        .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();
    }
    if (typeof value.text === 'string') return value.text.trim();
  }
  return String(value).trim();
}

function readSheetRows(sheet: ExcelJSModule.Worksheet, width: number) {
  const rows: Array<{ rowNumber: number; values: CellValue[] }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = Array.from({ length: width }, (_, index) =>
      readCellValue(row.getCell(index + 1).value),
    );
    if (values.some((value) => value !== '')) rows.push({ rowNumber, values });
  });
  return rows;
}

function findHeader(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex((header) => aliases.includes(header));
}

function parseChecklistDone(value: CellValue): boolean | null {
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['ya', 'yes', 'true', '1', 'selesai', 'sudah'].includes(normalized)) return true;
  if (['tidak', 'no', 'false', '0', 'belum', ''].includes(normalized)) return false;
  return null;
}

export async function parseTaskWorkbook(buffer: ArrayBuffer): Promise<ParsedTaskWorkbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const taskSheet =
    workbook.worksheets.find((sheet) => normalizeHeader(sheet.name) === 'data pekerjaan') ??
    workbook.worksheets[0];
  if (!taskSheet) throw new Error('Workbook tidak memiliki sheet data.');

  const headerRow = taskSheet.getRow(1);
  const headers = Array.from({ length: taskSheet.columnCount }, (_, index) =>
    String(headerRow.getCell(index + 1).value ?? '').trim(),
  );
  const titleColumn = findHeader(headers, ['judul pekerjaan', 'nama pekerjaan', 'judul']);
  const sheetRows = readSheetRows(taskSheet, headers.length);
  const rows =
    titleColumn < 0
      ? sheetRows
      : sheetRows.filter(({ values }) => String(values[titleColumn] ?? '').trim() !== '');
  if (rows.length === 0) {
    return { headers, rows, checklistRows: [], unmatchedChecklistRows: [] };
  }

  const checklistSheet = workbook.worksheets.find(
    (sheet) => normalizeHeader(sheet.name) === 'checklist',
  );
  if (!checklistSheet) {
    const checklistTotalColumn = findHeader(headers, ['jumlah checklist', 'total checklist']);
    const hasChecklistItems = rows.some(
      ({ values }) => Number(values[checklistTotalColumn] ?? 0) > 0,
    );
    if (hasChecklistItems) {
      throw new Error(
        'Sheet "Checklist" tidak ditemukan, padahal data pekerjaan mencatat checklist.',
      );
    }
    return { headers, rows, checklistRows: [], unmatchedChecklistRows: [] };
  }

  const checklistHeaders = Array.from({ length: checklistSheet.columnCount }, (_, index) =>
    String(checklistSheet.getRow(1).getCell(index + 1).value ?? '').trim(),
  );
  const taskIdColumn = findHeader(checklistHeaders, ['no pekerjaan', 'no', 'nomor pekerjaan']);
  const taskTitleColumn = findHeader(checklistHeaders, [
    'judul pekerjaan',
    'nama pekerjaan',
    'judul',
  ]);
  const groupColumn = findHeader(checklistHeaders, ['kelompok checklist', 'kelompok', 'grup']);
  const itemColumn = findHeader(checklistHeaders, ['item checklist', 'item', 'checklist']);
  const doneColumn = findHeader(checklistHeaders, ['selesai', 'done', 'status']);
  if ([taskTitleColumn, groupColumn, itemColumn, doneColumn].some((index) => index < 0)) {
    throw new Error('Kolom sheet "Checklist" tidak lengkap.');
  }

  const validTaskIds = new Set(
    rows
      .map(({ values }) =>
        taskIdColumn >= 0
          ? String(values[findHeader(headers, ['no', 'no pekerjaan', 'nomor'])] ?? '').trim()
          : '',
      )
      .filter(Boolean),
  );
  const validTaskTitles = new Set(
    rows.map(({ values }) => normalizeHeader(String(values[titleColumn] ?? ''))),
  );
  const checklistRows: ParsedChecklistRow[] = [];
  const unmatchedChecklistRows: number[] = [];

  for (const { rowNumber, values } of readSheetRows(checklistSheet, checklistHeaders.length)) {
    const taskId = taskIdColumn >= 0 ? String(values[taskIdColumn] ?? '').trim() : '';
    const taskTitle = String(values[taskTitleColumn] ?? '').trim();
    if (
      !(taskId && validTaskIds.has(taskId)) &&
      !(taskTitle && validTaskTitles.has(normalizeHeader(taskTitle)))
    ) {
      unmatchedChecklistRows.push(rowNumber);
      continue;
    }
    checklistRows.push({
      taskId,
      taskTitle,
      groupTitle: String(values[groupColumn] ?? '').trim(),
      itemText: String(values[itemColumn] ?? '').trim(),
      done: parseChecklistDone(values[doneColumn] ?? ''),
      rowNumber,
    });
  }

  return { headers, rows, checklistRows, unmatchedChecklistRows };
}

export function guessTaskImportMapping(headers: string[]): TaskImportMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: TaskImportMapping = {};
  const used = new Set<number>();
  for (const field of TASK_IMPORT_FIELDS) {
    const index = normalized.findIndex(
      (header, headerIndex) =>
        !used.has(headerIndex) && field.keywords.some((keyword) => header.includes(keyword)),
    );
    if (index >= 0) {
      mapping[field.key] = index;
      used.add(index);
    }
  }
  const sourceId = normalized.findIndex((header) =>
    ['no', 'no pekerjaan', 'nomor', 'nomor pekerjaan'].includes(header),
  );
  if (sourceId >= 0) mapping.sourceId = sourceId;
  return mapping;
}

function getCell(row: CellValue[], mapping: TaskImportMapping, key: TaskImportField): CellValue {
  const index = mapping[key];
  return index === undefined ? '' : (row[index] ?? '');
}

function parseDate(value: CellValue): string | null {
  if (!value) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const normalized = String(value)
    .trim()
    .replace(/^["']|["']$/g, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const date = new Date(`${normalized}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized
      ? null
      : normalized;
  }
  const dmy = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(normalized);
  if (dmy) {
    const [, day, month, year] = dmy;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }
    return date.toISOString().slice(0, 10);
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  const utcDate = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const year = utcDate ? date.getUTCFullYear() : date.getFullYear();
  const month = (utcDate ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = utcDate ? date.getUTCDate() : date.getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parsePriority(value: string): Priority | null {
  if (!value) return 'SEDANG';
  const normalized = value.toLowerCase();
  if (normalized.includes('tinggi') || normalized === 'high') return 'TINGGI';
  if (normalized.includes('rendah') || normalized === 'low') return 'RENDAH';
  if (normalized.includes('sedang') || normalized === 'medium' || normalized === 'normal') {
    return 'SEDANG';
  }
  return null;
}

function parseDuration(value: string): DurationType | null {
  if (!value) return 'JANGKA_PENDEK';
  const normalized = value.toLowerCase();
  if (normalized.includes('panjang') || normalized === 'long') return 'JANGKA_PANJANG';
  if (normalized.includes('pendek') || normalized === 'short') return 'JANGKA_PENDEK';
  return null;
}

function parseProgressMode(value: string): 'CHECKLIST' | 'MANUAL' | null {
  const normalized = value.toLowerCase().trim();
  if (!normalized) return null;
  if (normalized.includes('otomatis') || normalized.includes('checklist')) return 'CHECKLIST';
  if (normalized.includes('manual')) return 'MANUAL';
  return null;
}

function parseManualProgress(value: CellValue): number | null {
  if (value === '') return 0;
  const hasPercentSign = typeof value === 'string' && value.includes('%');
  const numeric = typeof value === 'number' ? value : Number(String(value).replace('%', '').trim());
  if (!Number.isFinite(numeric)) return null;
  const progress = !hasPercentSign && numeric <= 1 ? numeric * 100 : numeric;
  if (progress < 0 || progress > 100) return null;
  return Math.round(progress);
}

function parseBoolean(value: CellValue): boolean | null {
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['ya', 'yes', 'true', '1'].includes(normalized)) return true;
  if (['tidak', 'no', 'false', '0', ''].includes(normalized)) return false;
  return null;
}

function normalizePersonName(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizePersonList(value: string): string {
  const normalized = normalizePersonName(value);
  return ['-', '—', '–', 'n/a', 'na', 'n.a.', 'none', 'null', 'tidak ada', 'kosong'].includes(
    normalized,
  )
    ? ''
    : value.trim();
}

function matchEmployees(
  value: string,
  employees: Employee[],
): { ids: string[]; unknown: string[] } {
  let remaining = normalizePersonName(normalizePersonList(value));
  const knownNames = employees
    .flatMap((employee) =>
      [employee.fullName, employee.displayName].map((name) => ({
        id: employee.id,
        name: normalizePersonName(name),
      })),
    )
    .filter((candidate) => candidate.name)
    .sort((left, right) => right.name.length - left.name.length);
  const ids: string[] = [];
  const unknown: string[] = [];

  while (remaining) {
    remaining = remaining.replace(/^[\s,;]+/, '');
    if (!remaining) break;
    const match = knownNames.find(
      ({ name }) =>
        remaining === name ||
        (remaining.startsWith(name) && /^[,;]\s*/.test(remaining.slice(name.length))),
    );
    if (match) {
      if (!ids.includes(match.id)) ids.push(match.id);
      remaining = remaining.slice(match.name.length).replace(/^[\s,;]+/, '');
      continue;
    }
    const nextDelimiter = remaining.search(/[,;]/);
    const unmatched = nextDelimiter < 0 ? remaining : remaining.slice(0, nextDelimiter);
    unknown.push(unmatched.trim());
    remaining = nextDelimiter < 0 ? '' : remaining.slice(nextDelimiter + 1);
  }
  return { ids, unknown };
}

function checklistForTask(
  taskId: string,
  title: string,
  checklistRows: ParsedChecklistRow[],
): { groups: ChecklistGroup[]; errors: string[] } {
  const normalizedId = taskId.trim();
  const normalizedTitle = normalizeHeader(title);
  const rowsById = normalizedId
    ? checklistRows.filter((row) => row.taskId.trim() === normalizedId)
    : [];
  const matchedRows =
    rowsById.length > 0
      ? rowsById
      : checklistRows.filter((row) => normalizeHeader(row.taskTitle) === normalizedTitle);
  const groups: ChecklistGroup[] = [];
  const errors: string[] = [];
  const groupsByTitle = new Map<string, ChecklistGroup>();

  for (const row of matchedRows) {
    if (!row.groupTitle || !row.itemText || row.done === null) {
      errors.push(`Checklist baris ${row.rowNumber} tidak lengkap atau statusnya tidak dikenali.`);
      continue;
    }
    let group = groupsByTitle.get(row.groupTitle);
    if (!group) {
      group = {
        id: uid('clg'),
        title: row.groupTitle,
        sortOrder: groups.length,
        items: [],
      };
      groupsByTitle.set(row.groupTitle, group);
      groups.push(group);
    }
    group.items.push({
      id: uid('cli'),
      text: row.itemText,
      done: row.done,
      sortOrder: group.items.length,
    });
  }
  return { groups, errors };
}

export function prepareTaskImportRows(
  workbook: ParsedTaskWorkbook,
  mapping: TaskImportMapping,
  steps: Step[],
  defaultStepId: string,
  employees: Employee[],
  defaultPicMainIds: string[] = [],
): TaskImportRow[] {
  return workbook.rows.map(({ rowNumber, values }) => {
    const title = String(getCell(values, mapping, 'title')).trim();
    const description = String(getCell(values, mapping, 'description')).trim();
    const stepName = String(getCell(values, mapping, 'step')).trim();
    const startDateValue = getCell(values, mapping, 'startDate');
    const dueDateValue = getCell(values, mapping, 'dueDate');
    const priorityValue = String(getCell(values, mapping, 'priority')).trim();
    const durationValue = String(getCell(values, mapping, 'durationType')).trim();
    const sourceId = String(getCell(values, mapping, 'sourceId')).trim();
    const errors: string[] = [];

    if (!title) errors.push('Nama pekerjaan wajib diisi.');

    const matchedStep = stepName
      ? steps.find((step) => step.name.trim().toLowerCase() === stepName.toLowerCase())
      : steps.find((step) => step.id === defaultStepId);
    if (!matchedStep) {
      errors.push(
        stepName
          ? `Step "${stepName}" tidak ditemukan.`
          : 'Pilih step default atau isi kolom step.',
      );
    }

    const startDate = parseDate(startDateValue);
    const dueDate = parseDate(dueDateValue);
    if (startDateValue && !startDate) errors.push('Tanggal mulai tidak valid.');
    if (dueDateValue && !dueDate) errors.push('Tenggat tidak valid.');
    if (startDate && dueDate && startDate > dueDate) {
      errors.push('Tenggat tidak boleh sebelum tanggal mulai.');
    }

    const priority = parsePriority(priorityValue);
    if (!priority) errors.push(`Prioritas "${priorityValue}" tidak dikenali.`);
    const durationType = parseDuration(durationValue);
    if (!durationType) errors.push(`Jenis durasi "${durationValue}" tidak dikenali.`);

    const progressModeValue = String(getCell(values, mapping, 'progressMode')).trim();
    const checklist = checklistForTask(sourceId, title, workbook.checklistRows);
    const progressMode =
      parseProgressMode(progressModeValue) ??
      (progressModeValue ? null : checklist.groups.length > 0 ? 'CHECKLIST' : 'MANUAL');
    if (!progressMode) errors.push(`Mode progres "${progressModeValue}" tidak dikenali.`);
    errors.push(...checklist.errors);

    const manualProgress = parseManualProgress(getCell(values, mapping, 'manualProgress'));
    if (progressMode === 'MANUAL' && manualProgress === null) {
      errors.push('Progres manual harus berupa angka antara 0 dan 100.');
    }

    const isFocus = parseBoolean(getCell(values, mapping, 'focus'));
    if (isFocus === null) errors.push('Nilai fokus hari ini tidak dikenali.');

    const mainPicValue = normalizePersonList(String(getCell(values, mapping, 'picMain')));
    const memberPicValue = normalizePersonList(String(getCell(values, mapping, 'picMembers')));
    const mainPicMatch = matchEmployees(mainPicValue, employees);
    const memberPicMatch = matchEmployees(memberPicValue, employees);
    if (mainPicMatch.unknown.length) {
      errors.push(`PIC utama tidak ditemukan: ${mainPicMatch.unknown.join(', ')}.`);
    }
    if (memberPicMatch.unknown.length) {
      errors.push(`Anggota tim tidak ditemukan: ${memberPicMatch.unknown.join(', ')}.`);
    }
    const picMainIds = mainPicValue ? mainPicMatch.ids : defaultPicMainIds;
    if (
      defaultPicMainIds.length > 0 &&
      picMainIds.some((employeeId) => !defaultPicMainIds.includes(employeeId))
    ) {
      errors.push(
        'Akun ini hanya dapat mengimpor pekerjaan dengan PIC utama untuk dirinya sendiri.',
      );
    }

    return {
      rowNumber,
      title,
      stepName: matchedStep?.name ?? stepName,
      checklistCount: checklist.groups.reduce((total, group) => total + group.items.length, 0),
      errors,
      input:
        errors.length === 0 &&
        matchedStep &&
        priority &&
        durationType &&
        progressMode &&
        isFocus !== null
          ? {
              title,
              description,
              stepId: matchedStep.id,
              durationType,
              priority,
              startDate,
              dueDate,
              progressMode,
              manualProgress: manualProgress ?? 0,
              picMainIds,
              picIds: memberPicMatch.ids.filter((id) => !picMainIds.includes(id)),
              checklist: checklist.groups,
              isFocus,
              taskType: 'MANDIRI',
            }
          : null,
    };
  });
}
