import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Database, PencilLine, Trash2, Undo2, Upload } from 'lucide-react';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/dialog';
import { formatDateTime, formatNumber } from '@/lib/format';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import { validateRows } from '@/services/local/distribution.service';
import type { DistributionRow, DistributionSnapshot, SnapshotStatus } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useEmployees, useSnapshots } from '@/hooks/queries';
import { ImportWizard } from './ImportWizard';

const STATUS_META: Record<SnapshotStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Aktif', tone: 'success' },
  DRAFT: { label: 'Draft', tone: 'warning' },
  ARCHIVED: { label: 'Arsip', tone: 'neutral' },
};

export function DistributionSection() {
  const snapshotsQ = useSnapshots();
  const employeesQ = useEmployees(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [correcting, setCorrecting] = useState<DistributionSnapshot | null>(null);
  const confirm = useConfirm();
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  const byId = useMemo(
    () => new Map((employeesQ.data ?? []).map((e) => [e.id, e])),
    [employeesQ.data],
  );

  async function run(
    action: () => Promise<unknown>,
    successMsg: string,
    errTitle: string,
  ): Promise<void> {
    try {
      await action();
      notify.success(successMsg);
      await queryClient.invalidateQueries({ queryKey: ['distribution'] });
    } catch (err) {
      notify.error(errTitle, errorMessage(err));
    }
  }

  async function activate(snap: DistributionSnapshot) {
    const ok = await confirm({
      title: `Aktifkan ${snap.year} · ${snap.period}?`,
      description:
        'Snapshot aktif lain pada periode yang sama akan diarsipkan. Dashboard langsung memakai data ini.',
      confirmLabel: 'Aktifkan',
    });
    if (!ok) return;
    const ctx = getCtx();
    if (!ctx) return;
    await run(
      () => getDataService().distribution.activate(snap.id, ctx),
      'Snapshot diaktifkan.',
      'Gagal mengaktifkan',
    );
  }

  async function deactivate(snap: DistributionSnapshot) {
    const ok = await confirm({
      title: 'Batalkan aktivasi?',
      description: 'Snapshot kembali menjadi draft; Dashboard tidak lagi menampilkan data ini.',
      confirmLabel: 'Batalkan aktivasi',
      danger: true,
    });
    if (!ok) return;
    const ctx = getCtx();
    if (!ctx) return;
    await run(
      () => getDataService().distribution.deactivate(snap.id, ctx),
      'Aktivasi dibatalkan.',
      'Gagal membatalkan aktivasi',
    );
  }

  async function remove(snap: DistributionSnapshot) {
    const ok = await confirm({
      title: `Hapus snapshot ${snap.year} · ${snap.period}?`,
      description: 'Snapshot non-aktif ini dihapus permanen dari histori.',
      confirmLabel: 'Hapus permanen',
      danger: true,
    });
    if (!ok) return;
    const ctx = getCtx();
    if (!ctx) return;
    await run(
      () => getDataService().distribution.remove(snap.id, ctx),
      'Snapshot dihapus.',
      'Gagal menghapus',
    );
  }

  if (snapshotsQ.isLoading) return <LoadingBlock label="Memuat data penyaluran…" />;
  if (snapshotsQ.isError) {
    return <ErrorState error={snapshotsQ.error} onRetry={() => void snapshotsQ.refetch()} />;
  }

  const snapshots = snapshotsQ.data ?? [];

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Data Penyaluran"
          description="Upload Excel, validasi, aktivasi snapshot, histori, dan koreksi manual. Hanya data agregat per jenjang."
          actions={
            <Button onClick={() => setWizardOpen(true)}>
              <Upload className="size-4" aria-hidden />
              Unggah data
            </Button>
          }
        />
        <div className="p-4 pt-3">
          {snapshots.length === 0 ? (
            <EmptyState
              icon={Database}
              title="Belum ada data penyaluran"
              description="Unggah berkas Excel untuk membuat snapshot pertama."
            />
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] font-bold text-slate-500 uppercase">
                    <th className="py-2 pr-3">Scope</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="tnum px-3 py-2 text-right">Total salur siswa</th>
                    <th className="px-3 py-2">Sumber</th>
                    <th className="px-3 py-2">Oleh</th>
                    <th className="px-3 py-2">Diperbarui</th>
                    <th className="px-3 py-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snap) => {
                    const meta = STATUS_META[snap.status];
                    const total = snap.rows.reduce((a, r) => a + r.salurSiswa, 0);
                    const creator = snap.createdByEmployeeId
                      ? byId.get(snap.createdByEmployeeId)
                      : null;
                    return (
                      <tr key={snap.id} className="border-b border-slate-100 align-top">
                        <td className="py-2.5 pr-3 font-bold text-slate-800">
                          {snap.year} · {snap.period}
                          {snap.note && (
                            <p className="max-w-56 truncate text-xs font-normal text-slate-400" title={snap.note}>
                              {snap.note}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </td>
                        <td className="tnum px-3 py-2.5 text-right">{formatNumber(total)}</td>
                        <td className="max-w-40 truncate px-3 py-2.5 text-xs text-slate-500">
                          {snap.sourceFileName ?? '–'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {creator?.displayName ?? '–'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {formatDateTime(snap.activatedAt ?? snap.updatedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-1">
                            {snap.status !== 'ACTIVE' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void activate(snap)}
                                aria-label={`Aktifkan ${snap.year} ${snap.period}`}
                              >
                                <CheckCircle2 className="size-3.5" aria-hidden />
                                Aktifkan
                              </Button>
                            )}
                            {snap.status === 'ACTIVE' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void deactivate(snap)}
                              >
                                <Undo2 className="size-3.5" aria-hidden />
                                Batalkan
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setCorrecting(snap)}
                              aria-label={`Koreksi ${snap.year} ${snap.period}`}
                            >
                              <PencilLine className="size-3.5" aria-hidden />
                              Koreksi
                            </Button>
                            {snap.status !== 'ACTIVE' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => void remove(snap)}
                                aria-label={`Hapus snapshot ${snap.year} ${snap.period}`}
                              >
                                <Trash2 className="size-4 text-slate-400" aria-hidden />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <ImportWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <CorrectionDialog
        snapshot={correcting}
        onOpenChange={(open) => {
          if (!open) setCorrecting(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Koreksi manual dengan alasan → snapshot baru (versi terjaga)
// ---------------------------------------------------------------------------

function CorrectionDialog({
  snapshot,
  onOpenChange,
}: {
  snapshot: DistributionSnapshot | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<DistributionRow[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  if (snapshot && loadedFor !== snapshot.id) {
    setRows(snapshot.rows.map((r) => ({ ...r })));
    setReason('');
    setLoadedFor(snapshot.id);
  }

  const errors = useMemo(() => validateRows(rows), [rows]);

  function setCell(index: number, key: keyof DistributionRow, value: string) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, [key]: key === 'jenjang' ? value : Number(value) } : r,
      ),
    );
  }

  async function submit() {
    if (!snapshot || !reason.trim() || errors.length > 0) return;
    const ctx = getCtx();
    if (!ctx) return;
    setBusy(true);
    try {
      await getDataService().distribution.correct(snapshot.id, rows, reason, ctx);
      notify.success('Koreksi tersimpan.', 'Snapshot baru dibuat dengan catatan alasan.');
      await queryClient.invalidateQueries({ queryKey: ['distribution'] });
      onOpenChange(false);
    } catch (err) {
      notify.error('Gagal menyimpan koreksi', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const NUMERIC_FIELDS: Array<{ key: keyof DistributionRow; label: string }> = [
    { key: 'alokasiSiswa', label: 'Alokasi Siswa' },
    { key: 'alokasiAnggaran', label: 'Alokasi Anggaran' },
    { key: 'skSiswa', label: 'SK Siswa' },
    { key: 'skAnggaran', label: 'SK Anggaran' },
    { key: 'salurSiswa', label: 'Salur Siswa' },
    { key: 'salurAnggaran', label: 'Salur Anggaran' },
  ];

  return (
    <Modal
      open={!!snapshot}
      onOpenChange={onOpenChange}
      size="xl"
      title={snapshot ? `Koreksi Manual — ${snapshot.year} · ${snapshot.period}` : 'Koreksi'}
      description="Koreksi membuat snapshot baru dengan alasan tercatat; histori versi sebelumnya tetap tersimpan."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={() => void submit()}
            loading={busy}
            disabled={!reason.trim() || errors.length > 0}
          >
            Simpan koreksi
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold text-slate-500 uppercase">
                <th className="px-3 py-2">Jenjang</th>
                {NUMERIC_FIELDS.map((f) => (
                  <th key={f.key} className="px-3 py-2 text-right">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.jenjang} className="border-b border-slate-100">
                  <td className="px-3 py-1.5 font-bold">{r.jenjang}</td>
                  {NUMERIC_FIELDS.map((f) => (
                    <td key={f.key} className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        value={r[f.key] as number}
                        onChange={(e) => setCell(i, f.key, e.target.value)}
                        className="tnum h-8 text-right text-xs"
                        aria-label={`${f.label} ${r.jenjang}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errors.length > 0 && (
          <p role="alert" className="rounded-xl border border-danger-100 bg-danger-50 px-3 py-2 text-xs text-danger-700">
            {errors[0]}
          </p>
        )}
        <Field label="Alasan koreksi" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="cth. Pembetulan angka salur SMA sesuai rekening koran bank"
            rows={2}
          />
        </Field>
      </div>
    </Modal>
  );
}
