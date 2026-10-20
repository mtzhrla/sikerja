import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatNumber } from '@/lib/format';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import { validateRows, validateScope } from '@/services/local/distribution.service';
import type { DistributionRow } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import {
  FIELD_DEFS,
  convertRows,
  guessMapping,
  parseWorkbook,
  type FieldKey,
  type ParsedSheet,
} from '../excel';

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'upload' | 'mapping' | 'preview';

/** Alur impor: upload → mapping kolom → preview + validasi → simpan draft / aktifkan. */
export function ImportWizard({ open, onOpenChange }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [fileName, setFileName] = useState('');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState('Termin 1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'draft' | 'activate' | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  function reset() {
    setStep('upload');
    setFileName('');
    setSheet(null);
    setMapping({});
    setNote('');
    setParseError(null);
  }

  async function handleFile(file: File) {
    setParseError(null);
    try {
      const parsed = await parseWorkbook(await file.arrayBuffer());
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError('Berkas tidak berisi data yang dapat dibaca (sheet pertama kosong).');
        return;
      }
      setFileName(file.name);
      setSheet(parsed);
      setMapping(guessMapping(parsed.headers));
      setStep('mapping');
    } catch {
      setParseError('Berkas tidak dapat dibaca. Pastikan format .xlsx yang valid.');
    }
  }

  const rows: DistributionRow[] = useMemo(
    () => (sheet ? convertRows(sheet.rows, mapping) : []),
    [sheet, mapping],
  );
  const rowErrors = useMemo(() => validateRows(rows), [rows]);
  const scopeErrors = useMemo(() => validateScope(year, period), [year, period]);
  const allErrors = [...scopeErrors, ...rowErrors];
  const mappingComplete = FIELD_DEFS.every((f) => mapping[f.key] !== undefined);

  async function save(activate: boolean) {
    const ctx = getCtx();
    if (!ctx) return;
    setBusy(activate ? 'activate' : 'draft');
    try {
      const draft = await getDataService().distribution.createDraft(
        { year, period, rows, sourceFileName: fileName, note: note || null },
        ctx,
      );
      if (activate) {
        await getDataService().distribution.activate(draft.id, ctx);
        notify.success('Data penyaluran diaktifkan.', `${year} · ${period}`);
      } else {
        notify.success('Draft tersimpan.', `${year} · ${period}`);
      }
      await queryClient.invalidateQueries({ queryKey: ['distribution'] });
      onOpenChange(false);
      reset();
    } catch (err) {
      notify.error('Gagal menyimpan data', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      size="xl"
      title="Unggah Data Penyaluran"
      description="Alur: unggah Excel → pemetaan kolom → pratinjau & validasi → simpan draft / aktifkan."
      footer={
        step === 'upload' ? undefined : step === 'mapping' ? (
          <>
            <Button variant="ghost" onClick={() => setStep('upload')}>
              Kembali
            </Button>
            <Button onClick={() => setStep('preview')} disabled={!mappingComplete}>
              Lanjut ke pratinjau
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('mapping')}>
              Kembali
            </Button>
            <Button
              variant="outline"
              onClick={() => void save(false)}
              loading={busy === 'draft'}
              disabled={allErrors.length > 0 || busy !== null}
            >
              Simpan draft
            </Button>
            <Button
              onClick={() => void save(true)}
              loading={busy === 'activate'}
              disabled={allErrors.length > 0 || busy !== null}
            >
              Simpan & aktifkan
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
              accept=".xlsx"
              className="sr-only"
              aria-label="Pilih berkas Excel"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = '';
              }}
            />
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Upload className="size-6" aria-hidden />
            </span>
            <span className="text-sm font-bold text-slate-700">
              Pilih atau letakkan berkas .xlsx
            </span>
            <span className="max-w-sm text-xs text-slate-500">
              Baris pertama = nama kolom. Data agregat per jenjang (SD/SMP/SMA/SMK) — tanpa data
              individual siswa.
            </span>
          </label>
          {parseError && (
            <p role="alert" className="rounded-xl border border-danger-100 bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
              {parseError}
            </p>
          )}
        </div>
      )}

      {step === 'mapping' && sheet && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <FileSpreadsheet className="size-4 text-success-600" aria-hidden />
            <strong>{fileName}</strong> · {sheet.rows.length} baris data
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELD_DEFS.map((f) => (
              <Field key={f.key} label={f.label} required>
                <Select
                  value={mapping[f.key] ?? ''}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [f.key]: e.target.value === '' ? undefined : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">Pilih kolom…</option>
                  {sheet.headers.map((h, i) => (
                    <option key={`${h}-${i}`} value={i}>
                      {h || `(kolom ${i + 1})`}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          {!mappingComplete && (
            <p className="text-xs text-slate-500">Lengkapi pemetaan seluruh kolom untuk lanjut.</p>
          )}
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tahun" required>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2020}
                max={2100}
              />
            </Field>
            <Field label="Periode" required>
              <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
                {['Termin 1', 'Termin 2', 'Termin 3'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Catatan">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Opsional"
              />
            </Field>
          </div>

          <div className="scrollbar-thin overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold text-slate-500 uppercase">
                  <th className="px-3 py-2">Jenjang</th>
                  <th className="tnum px-3 py-2 text-right">Alokasi Siswa</th>
                  <th className="tnum px-3 py-2 text-right">Alokasi Anggaran</th>
                  <th className="tnum px-3 py-2 text-right">SK Siswa</th>
                  <th className="tnum px-3 py-2 text-right">SK Anggaran</th>
                  <th className="tnum px-3 py-2 text-right">Salur Siswa</th>
                  <th className="tnum px-3 py-2 text-right">Salur Anggaran</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-semibold">{String(r.jenjang)}</td>
                    {(
                      [
                        r.alokasiSiswa,
                        r.alokasiAnggaran,
                        r.skSiswa,
                        r.skAnggaran,
                        r.salurSiswa,
                        r.salurAnggaran,
                      ] as number[]
                    ).map((v, j) => (
                      <td key={j} className="tnum px-3 py-2 text-right">
                        {Number.isNaN(v) ? (
                          <Badge tone="danger">tidak valid</Badge>
                        ) : (
                          formatNumber(v)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allErrors.length > 0 ? (
            <div
              role="alert"
              className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-danger-100 bg-danger-50 px-3 py-2.5"
            >
              <p className="text-sm font-bold text-danger-700">
                {allErrors.length} error validasi — data tidak dapat disimpan/diaktifkan:
              </p>
              <ul className="list-inside list-disc text-xs text-danger-700">
                {allErrors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {allErrors.length > 10 && <li>… dan {allErrors.length - 10} error lain</li>}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-success-100 bg-success-50 px-3 py-2.5 text-sm font-semibold text-success-700">
              Validasi lolos — data siap disimpan.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
