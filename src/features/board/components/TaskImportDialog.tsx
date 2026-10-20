import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import type { Employee, Step } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import {
  guessTaskImportMapping,
  parseTaskWorkbook,
  prepareTaskImportRows,
  TASK_IMPORT_FIELDS,
  type TaskImportMapping,
  type ParsedTaskWorkbook,
} from '../task-import';

interface TaskImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: Step[];
  employees: Employee[];
  actorEmployeeId: string | null;
  canDispose: boolean;
  isEmployee: boolean;
  defaultPicMainIds: string[];
}

type ImportStep = 'upload' | 'mapping' | 'preview';

export function TaskImportDialog({
  open,
  onOpenChange,
  steps,
  employees,
  actorEmployeeId,
  canDispose,
  isEmployee,
  defaultPicMainIds,
}: TaskImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [workbook, setWorkbook] = useState<ParsedTaskWorkbook | null>(null);
  const [mapping, setMapping] = useState<TaskImportMapping>({});
  const [defaultStepId, setDefaultStepId] = useState(steps[0]?.id ?? '');
  const [parseError, setParseError] = useState('');
  const [importError, setImportError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [importedRows, setImportedRows] = useState<Set<number>>(() => new Set());
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  const importRows = useMemo(
    () =>
      workbook
        ? prepareTaskImportRows(
            workbook,
            mapping,
            steps,
            defaultStepId,
            employees.filter((employee) => employee.active),
            defaultPicMainIds,
          )
        : [],
    [workbook, mapping, steps, defaultStepId, employees, defaultPicMainIds],
  );
  const invalidRows = importRows.filter((row) => row.errors.length > 0);
  const checklistCount = importRows.reduce((total, row) => total + row.checklistCount, 0);

  function reset() {
    setStep('upload');
    setFileName('');
    setWorkbook(null);
    setMapping({});
    setDefaultStepId(steps[0]?.id ?? '');
    setParseError('');
    setImportError('');
    setBusy(false);
    setImportedCount(0);
    setImportedRows(new Set());
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && busy) return;
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  }

  async function handleFile(file: File) {
    setParseError('');
    setImportError('');
    setImportedRows(new Set());
    setImportedCount(0);
    setFileName('');
    setWorkbook(null);
    setMapping({});
    try {
      if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
        setParseError('Pilih berkas Excel berformat .xlsx atau .xlsm.');
        return;
      }
      const parsed = await parseTaskWorkbook(await file.arrayBuffer());
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError('Workbook tidak berisi baris pekerjaan.');
        return;
      }
      setFileName(file.name);
      setWorkbook(parsed);
      setMapping(guessTaskImportMapping(parsed.headers));
      setDefaultStepId((current) => current || steps[0]?.id || '');
      setStep('mapping');
    } catch (err) {
      setParseError(`Berkas Excel tidak dapat dibaca. ${errorMessage(err)}`);
    }
  }

  async function importTasks() {
    const ctx = getCtx();
    if (!ctx) {
      setImportError('Sesi pengguna tidak tersedia. Silakan masuk kembali.');
      return;
    }
    if (
      importRows.length === 0 ||
      invalidRows.length > 0 ||
      (workbook?.unmatchedChecklistRows.length ?? 0) > 0
    ) {
      return;
    }

    setBusy(true);
    setImportError('');
    let count = importedRows.size;
    setImportedCount(count);
    for (const row of importRows) {
      if (!row.input || importedRows.has(row.rowNumber)) continue;
      try {
        const assignsOtherEmployees = row.input.picMainIds?.some(
          (employeeId) => employeeId !== actorEmployeeId,
        );
        const taskInput = {
          ...row.input,
          taskType:
            isEmployee && canDispose && assignsOtherEmployees
              ? ('DISPOSISI' as const)
              : row.input.taskType,
        };
        await getDataService().tasks.create(taskInput, ctx);
        count += 1;
        setImportedRows((current) => new Set(current).add(row.rowNumber));
        setImportedCount(count);
      } catch (err) {
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
        setImportError(
          `Impor berhenti pada baris Excel ${row.rowNumber}. ${count} pekerjaan berhasil disimpan. ${errorMessage(err)}`,
        );
        setBusy(false);
        return;
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    notify.success(`${count} pekerjaan berhasil diimpor.`);
    onOpenChange(false);
    reset();
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      size="xl"
      title="Impor Pekerjaan dari Excel"
      description="Unggah .xlsx atau .xlsm, periksa pemetaan, lalu simpan pekerjaan beserta checklist."
      footer={
        step === 'upload' ? undefined : step === 'mapping' ? (
          <>
            <Button variant="ghost" onClick={() => setStep('upload')}>
              Kembali
            </Button>
            <Button onClick={() => setStep('preview')} disabled={mapping.title === undefined}>
              Pratinjau data
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('mapping')} disabled={busy}>
              Kembali
            </Button>
            <Button
              onClick={() => void importTasks()}
              loading={busy}
              disabled={
                busy ||
                importRows.length === 0 ||
                invalidRows.length > 0 ||
                (workbook?.unmatchedChecklistRows.length ?? 0) > 0
              }
            >
              {busy ? `Mengimpor ${importedCount}/${importRows.length}…` : 'Impor pekerjaan'}
            </Button>
          </>
        )
      }
    >
      {step === 'upload' && (
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40">
            <input
              type="file"
              accept=".xlsx,.xlsm"
              className="sr-only"
              aria-label="Pilih berkas Excel pekerjaan"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Upload className="size-6" aria-hidden />
            </span>
            <span className="text-sm font-bold text-slate-700">Pilih berkas .xlsx atau .xlsm</span>
            <span className="max-w-sm text-xs text-slate-500">
              Data pekerjaan dan checklist dibaca dari sheet bernama &quot;Data Pekerjaan&quot; dan
              &quot;Checklist&quot;.
            </span>
          </label>
          {parseError && (
            <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {parseError}
            </p>
          )}
        </div>
      )}

      {step === 'mapping' && workbook && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <FileSpreadsheet className="size-4 text-success-600" aria-hidden />
            <strong>{fileName}</strong> · {workbook.rows.length} pekerjaan ·{' '}
            {workbook.checklistRows.length} item checklist
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {TASK_IMPORT_FIELDS.map((field) => (
              <Field key={field.key} label={field.label} required={field.key === 'title'}>
                <Select
                  value={mapping[field.key] ?? ''}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field.key]:
                        event.target.value === '' ? undefined : Number(event.target.value),
                    }))
                  }
                >
                  <option value="">Tidak dipetakan</option>
                  {workbook.headers.map((header, index) => (
                    <option key={`${header}-${index}`} value={index}>
                      {header || `(kolom ${index + 1})`}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            <Field label="Step default" required>
              <Select
                value={defaultStepId}
                onChange={(event) => setDefaultStepId(event.target.value)}
              >
                <option value="">Pilih step…</option>
                {steps.map((boardStep) => (
                  <option key={boardStep.id} value={boardStep.id}>
                    {boardStep.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            PIC dicocokkan dengan pegawai aktif. Checklist dipasangkan berdasarkan nomor pekerjaan
            atau judul, beserta kelompok dan status selesai. Kolom kategori dan label tidak diimpor.
          </p>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={invalidRows.length === 0 ? 'success' : 'danger'}>
              {importRows.length - invalidRows.length} valid
            </Badge>
            {invalidRows.length > 0 && (
              <Badge tone="danger">{invalidRows.length} perlu diperbaiki</Badge>
            )}
            <Badge tone="neutral">{checklistCount} item checklist</Badge>
            <span className="text-xs text-slate-500">{fileName}</span>
          </div>
          {(workbook?.unmatchedChecklistRows.length ?? 0) > 0 && (
            <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {workbook?.unmatchedChecklistRows.length} baris checklist tidak cocok dengan pekerjaan
              (baris Excel: {workbook?.unmatchedChecklistRows.slice(0, 10).join(', ')}). Perbaiki
              nomor atau judul pekerjaan pada sheet Checklist sebelum mengimpor.
            </p>
          )}
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2">Baris</th>
                  <th className="px-3 py-2">Nama pekerjaan</th>
                  <th className="px-3 py-2">Step</th>
                  <th className="px-3 py-2">Checklist</th>
                  <th className="px-3 py-2">Validasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importRows.slice(0, 20).map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-3 py-2 text-slate-500">{row.rowNumber}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.title || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.stepName || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.checklistCount}</td>
                    <td className="px-3 py-2">
                      {row.errors.length === 0 ? (
                        <span className="text-success-700">Siap diimpor</span>
                      ) : (
                        <span className="text-danger-700">{row.errors.join(' ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {importRows.length > 20 && (
            <p className="text-xs text-slate-500">
              Pratinjau menampilkan 20 baris pertama dari {importRows.length}.
            </p>
          )}
          {importError && (
            <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {importError}
            </p>
          )}
          <p className="text-xs text-slate-500">
            {importedCount > 0
              ? `${importedCount} dari ${importRows.length} pekerjaan sudah tersimpan. Baris tersebut tidak akan dibuat ulang saat melanjutkan.`
              : 'Semua baris harus valid sebelum proses impor dimulai.'}
          </p>
        </div>
      )}
    </Modal>
  );
}
