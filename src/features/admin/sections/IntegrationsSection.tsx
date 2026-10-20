import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Unplug,
} from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime, formatRelative } from '@/lib/format';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import type {
  SheetBinding,
  SpreadsheetSource,
  SpreadsheetSourceInput,
  SyncStatus,
} from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import {
  useBindings,
  useGoogleStatus,
  useMappings,
  useSources,
  useSyncRuns,
} from '@/hooks/queries';

const SOURCE_TYPE_LABEL: Record<SpreadsheetSource['sourceType'], string> = {
  pip_progress: 'Progres Penyaluran SK',
  activity_plan: 'Rencana Kegiatan',
};

const SYNC_BADGE: Record<SyncStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  BELUM_SINKRON: { label: 'Belum sinkron', tone: 'neutral' },
  BERHASIL: { label: 'Berhasil', tone: 'success' },
  PERLU_VALIDASI: { label: 'Perlu Validasi', tone: 'warning' },
  GAGAL: { label: 'Gagal', tone: 'danger' },
};

/**
 * Integrasi Spreadsheet (Docs/09 §M.2, §R–§V):
 * koneksi Google Admin, sumber per tahun, sheet binding, mapping berbasis
 * header, preview, tes koneksi, sinkronisasi manual, dan histori sync.
 * Data spreadsheet READ-ONLY — tidak ada write-back.
 */
export function IntegrationsSection() {
  return (
    <Tabs defaultValue="sumber">
      <TabsList>
        <TabsTrigger value="sumber">Sumber Google Sheets</TabsTrigger>
        <TabsTrigger value="riwayat">Histori Sinkronisasi</TabsTrigger>
      </TabsList>
      <TabsContent value="sumber">
        <div className="mt-4 space-y-4">
          <GoogleConnectionCard />
          <SourcesCard />
        </div>
      </TabsContent>
      <TabsContent value="riwayat">
        <div className="mt-4">
          <SyncHistoryCard />
        </div>
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Koneksi Google
// ---------------------------------------------------------------------------

/**
 * Koneksi Sistem (Service Account) — mode akses utama (§4).
 * Menyembunyikan proses teknis: tanpa tombol "Hubungkan Google", tanpa login,
 * tanpa menampilkan private key. Email Service Account ditampilkan agar Admin
 * dapat membagikan spreadsheet dengan akses Viewer.
 */
function SystemConnectionCard({
  email,
  lastUsedAt,
}: {
  email: string | null;
  lastUsedAt: string | null;
}) {
  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      notify.success('Email koneksi disalin.');
    } catch {
      notify.warning('Tidak dapat menyalin otomatis', 'Salin email secara manual.');
    }
  }

  return (
    <Card>
      <CardHeader
        title="Koneksi Google Sheets"
        description="Aplikasi membaca spreadsheet melalui koneksi sistem (read-only). Tidak perlu login Google."
        actions={
          <Badge tone="success">
            <ShieldCheck className="size-3.5" aria-hidden />
            Aktif
          </Badge>
        }
      />
      <div className="space-y-3 p-4 pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
            <CheckCircle2 className="size-4 text-success-600" aria-hidden />
            Metode akses: Koneksi Sistem
          </span>
          {lastUsedAt && <span>Terakhir dipakai {formatRelative(lastUsedAt)}</span>}
        </div>
        {email ? (
          <div className="rounded-xl border border-info-100 bg-info-50 p-3">
            <p className="text-xs leading-relaxed text-info-700">
              Bagikan spreadsheet kepada email koneksi sistem dengan akses{' '}
              <span className="font-semibold">Viewer</span>.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-info-200 bg-white px-2.5 py-1.5 text-xs font-semibold break-all text-slate-700">
                {email}
              </code>
              <Button size="sm" variant="outline" onClick={() => void copyEmail()}>
                <Copy className="size-3.5" aria-hidden />
                Salin email
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            Koneksi sistem aktif. Email koneksi tidak tersedia untuk ditampilkan.
          </p>
        )}
      </div>
    </Card>
  );
}

function GoogleConnectionCard() {
  const { data: google, refetch } = useGoogleStatus();
  const [busy, setBusy] = useState(false);

  // Mode utama: Service Account ("Koneksi Sistem"). Tidak ada login Google —
  // Admin cukup membagikan spreadsheet ke email koneksi sistem (Viewer).
  if (google?.accessMode === 'service_account') {
    return <SystemConnectionCard email={google.serviceAccountEmail} lastUsedAt={google.lastUsedAt} />;
  }

  /** Header Authorization dari sesi Supabase (hanya ada pada mode produksi). */
  async function authHeader(): Promise<Record<string, string>> {
    try {
      const { getSupabase } = await import('@/services/supabase/client');
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  async function connect() {
    if (!google?.configured) {
      notify.warning(
        'Integrasi Google belum disiapkan',
        'Hubungi pengelola sistem untuk mengaktifkan integrasi Google terlebih dahulu.',
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/google/start', { headers: await authHeader() });
      const payload = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !payload.url) {
        throw new Error(payload.error ?? 'Server menolak permintaan.');
      }
      // Redirect ke halaman consent Google; kembali via callback server.
      window.location.href = payload.url;
    } catch (err) {
      notify.error('Gagal memulai koneksi Google', errorMessage(err));
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch('/api/integrations/google/disconnect', {
        method: 'POST',
        headers: await authHeader(),
      });
      if (!res.ok) throw new Error('Server menolak permintaan.');
      notify.success('Koneksi Google diputuskan.');
      await refetch();
    } catch {
      notify.error(
        'Gagal memutuskan koneksi',
        'Endpoint integrasi tidak tersedia — Integrasi Google belum dikonfigurasi.',
      );
    } finally {
      setBusy(false);
    }
  }

  const connected = google?.connected ?? false;

  return (
    <Card>
      <CardHeader
        title="Koneksi Google"
        description="Satu akun Google Admin dipakai membaca seluruh spreadsheet (scope read-only). Bukan untuk login aplikasi."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant={connected ? 'outline' : 'primary'} onClick={connect}>
              <Link2 className="size-4" aria-hidden />
              {connected ? 'Hubungkan Ulang' : 'Hubungkan Google'}
            </Button>
            {connected && (
              <Button variant="outline" onClick={() => void disconnect()} loading={busy}>
                <Unplug className="size-4" aria-hidden />
                Putuskan
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 pt-3 text-sm text-slate-600">
        {connected ? (
          <>
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
              <CheckCircle2 className="size-4 text-success-600" aria-hidden />
              {google?.email}
            </span>
            {google?.connectedAt && <span>Terhubung {formatRelative(google.connectedAt)}</span>}
            {google?.lastUsedAt && <span>Terakhir dipakai {formatRelative(google.lastUsedAt)}</span>}
            <Badge tone={google?.tokenStatus === 'AKTIF' ? 'success' : 'warning'}>
              {google?.tokenStatus === 'AKTIF' ? 'Koneksi aktif' : 'Perlu login ulang'}
            </Badge>
          </>
        ) : (
          <span className="text-slate-500">
            {google?.configured
              ? 'Belum ada akun terhubung. Klik "Hubungkan Google" untuk memberi akses baca spreadsheet.'
              : 'Integrasi Google belum disiapkan oleh pengelola sistem. Aplikasi tetap berjalan; data memakai hasil sinkron terakhir.'}
          </span>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Daftar sumber per tahun
// ---------------------------------------------------------------------------

function SourcesCard() {
  const sourcesQ = useSources({ includeInactive: true });
  const [editing, setEditing] = useState<SpreadsheetSource | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailSource, setDetailSource] = useState<SpreadsheetSource | null>(null);
  const getCtx = useActorCtx();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const sources = (sourcesQ.data ?? []).filter((s) => !s.deletedAt);
  const byYear = useMemo(() => {
    const map = new Map<number, SpreadsheetSource[]>();
    for (const s of sources) {
      const list = map.get(s.year) ?? [];
      list.push(s);
      map.set(s.year, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [sources]);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['integrations'] });
  }

  async function toggleActive(source: SpreadsheetSource) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().integrations.setSourceActive(source.id, !source.isActive, ctx);
      notify.success(source.isActive ? 'Sumber dinonaktifkan.' : 'Sumber diaktifkan.');
      await invalidate();
    } catch (err) {
      notify.error('Gagal mengubah status sumber', errorMessage(err));
    }
  }

  async function archive(source: SpreadsheetSource) {
    const ok = await confirm({
      title: 'Arsipkan sumber?',
      description: `"${source.name}" dipindahkan ke Data Terhapus dan dapat dipulihkan kembali.`,
      confirmLabel: 'Arsipkan',
      danger: true,
    });
    if (!ok) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().integrations.archiveSource(source.id, ctx);
      notify.success('Sumber diarsipkan.', 'Pulihkan lewat Admin › Data Terhapus.');
      await invalidate();
    } catch (err) {
      notify.error('Gagal mengarsipkan', errorMessage(err));
    }
  }

  async function setPrimary(source: SpreadsheetSource) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().integrations.setPrimary(source.id, ctx);
      notify.success(`"${source.name}" menjadi sumber utama ${source.year}.`);
      await invalidate();
    } catch (err) {
      notify.error('Gagal menetapkan sumber utama', errorMessage(err));
    }
  }

  async function testConnection(source: SpreadsheetSource) {
    try {
      const res = await getDataService().integrations.testConnection(source.id);
      if (res.ok) {
        notify.success(
          'Tes koneksi berhasil',
          res.sheets?.length ? `Sheet ditemukan: ${res.sheets.join(', ')}` : res.message,
        );
      } else {
        notify.warning('Tes koneksi gagal', res.message);
      }
    } catch (err) {
      notify.error('Tes koneksi gagal', errorMessage(err));
    }
  }

  async function syncNow(source: SpreadsheetSource) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const run = await getDataService().integrations.syncNow(source.id, ctx);
      const badge = SYNC_BADGE[run.status];
      notify.success(
        `Sinkronisasi ${badge.label.toLowerCase()}`,
        run.message ?? `${run.rowsRead} baris dibaca.`,
      );
      await invalidate();
    } catch (err) {
      notify.error('Sinkronisasi gagal', errorMessage(err));
    }
  }

  if (sourcesQ.isLoading) return <LoadingBlock label="Memuat sumber spreadsheet…" />;

  return (
    <Card>
      <CardHeader
        title="Sumber Spreadsheet per Tahun"
        description="Progres Penyaluran SK & Rencana Kegiatan. Satu akun Google dipakai untuk seluruh sumber — tidak perlu menghubungkan ulang tiap tahun."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Tambah sumber
          </Button>
        }
      />
      <div className="space-y-5 p-4">
        {byYear.length === 0 && (
          <EmptyState
            compact
            title="Belum ada sumber spreadsheet"
            description="Tambahkan sumber Progres Penyaluran SK dan Rencana Kegiatan untuk tahun berjalan."
          />
        )}
        {byYear.map(([year, list]) => (
          <section key={year} aria-label={`Sumber tahun ${year}`}>
            <h3 className="tnum mb-2 text-sm font-bold text-slate-600">{year}</h3>
            <ul className="space-y-2">
              {list.map((source) => {
                const sync = SYNC_BADGE[source.lastSyncStatus];
                return (
                  <li
                    key={source.id}
                    className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 text-sm font-bold text-slate-800">
                        {source.name}
                        {source.isPrimary && (
                          <Badge tone="brand" className="ml-2">
                            Utama
                          </Badge>
                        )}
                        {!source.isActive && (
                          <Badge tone="neutral" className="ml-2">
                            Nonaktif
                          </Badge>
                        )}
                      </p>
                      <Badge tone={sync.tone}>{sync.label}</Badge>
                      <Switch
                        checked={source.isActive}
                        onCheckedChange={() => void toggleActive(source)}
                        aria-label={`Status aktif ${source.name}`}
                      />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>{SOURCE_TYPE_LABEL[source.sourceType]}</span>
                      <a
                        href={source.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                      >
                        Buka spreadsheet
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                      <span>
                        Terakhir sinkron:{' '}
                        {source.lastSyncedAt ? formatRelative(source.lastSyncedAt) : 'belum pernah'}
                      </span>
                      {source.lastError && (
                        <span className="text-danger-600">Error: {source.lastError}</span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setDetailSource(source)}>
                        <Eye className="size-3.5" aria-hidden />
                        Detail & mapping
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void testConnection(source)}>
                        <Link2 className="size-3.5" aria-hidden />
                        Tes koneksi
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void syncNow(source)}>
                        <RefreshCw className="size-3.5" aria-hidden />
                        Sinkronkan sekarang
                      </Button>
                      {!source.isPrimary && (
                        <Button size="sm" variant="ghost" onClick={() => void setPrimary(source)}>
                          <Star className="size-3.5" aria-hidden />
                          Jadikan utama
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(source);
                          setDialogOpen(true);
                        }}
                      >
                        Ubah
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void archive(source)}>
                        <Archive className="size-3.5" aria-hidden />
                        Arsipkan
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <SourceDialog open={dialogOpen} onOpenChange={setDialogOpen} source={editing} />
      <SourceDetailDialog source={detailSource} onClose={() => setDetailSource(null)} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dialog tambah/ubah sumber
// ---------------------------------------------------------------------------

function SourceDialog({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: SpreadsheetSource | null;
}) {
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState<SpreadsheetSourceInput>({
    sourceType: 'pip_progress',
    year: currentYear,
    name: '',
    spreadsheetUrl: '',
  });
  const [busy, setBusy] = useState(false);
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setForm(
        source
          ? {
              id: source.id,
              sourceType: source.sourceType,
              year: source.year,
              name: source.name,
              spreadsheetUrl: source.spreadsheetUrl,
            }
          : { sourceType: 'pip_progress', year: currentYear, name: '', spreadsheetUrl: '' },
      );
    }
  }, [open, source, currentYear]);

  async function submit() {
    const ctx = getCtx();
    if (!ctx) return;
    setBusy(true);
    try {
      await getDataService().integrations.saveSource(form, ctx);
      notify.success(source ? 'Sumber diperbarui.' : 'Sumber ditambahkan.', form.name);
      await queryClient.invalidateQueries({ queryKey: ['integrations'] });
      onOpenChange(false);
    } catch (err) {
      notify.error('Gagal menyimpan sumber', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={source ? 'Ubah Sumber Spreadsheet' : 'Tambah Sumber Spreadsheet'}
      description="Data dibaca read-only — aplikasi tidak pernah menulis balik ke spreadsheet."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jenis sumber" required>
            <Select
              value={form.sourceType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  sourceType: e.target.value as SpreadsheetSourceInput['sourceType'],
                }))
              }
            >
              <option value="pip_progress">Progres Penyaluran SK</option>
              <option value="activity_plan">Rencana Kegiatan</option>
            </Select>
          </Field>
          <Field label="Tahun" required>
            <Input
              type="number"
              min={2020}
              max={2100}
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
            />
          </Field>
        </div>
        <Field label="Nama sumber" required>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={`cth. Progres Penyaluran SK ${form.year}`}
          />
        </Field>
        <Field
          label="URL Google Sheets"
          required
          hint="Tempel tautan lengkap; Spreadsheet ID diekstrak otomatis."
        >
          <Input
            value={form.spreadsheetUrl}
            onChange={(e) => setForm((f) => ({ ...f, spreadsheetUrl: e.target.value }))}
            placeholder="https://docs.google.com/spreadsheets/d/…"
          />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detail sumber: sheet binding, mapping kolom, preview
// ---------------------------------------------------------------------------

function SourceDetailDialog({
  source,
  onClose,
}: {
  source: SpreadsheetSource | null;
  onClose: () => void;
}) {
  const { data: bindings } = useBindings(source?.id ?? null);
  const [activeBinding, setActiveBinding] = useState<SheetBinding | null>(null);

  useEffect(() => {
    setActiveBinding(bindings?.[0] ?? null);
  }, [bindings]);

  return (
    <Modal
      open={source !== null}
      onOpenChange={(open) => !open && onClose()}
      title={source?.name ?? ''}
      description={source ? `Spreadsheet ID: ${source.spreadsheetId}` : undefined}
      size="lg"
    >
      {source && (
        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="mb-2 text-xs font-bold text-slate-500 uppercase">Sheet yang dibaca</p>
            <div className="flex flex-wrap gap-1.5">
              {(bindings ?? []).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setActiveBinding(b)}
                  aria-pressed={activeBinding?.id === b.id}
                  className={
                    activeBinding?.id === b.id
                      ? 'pressable cursor-pointer rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white'
                      : 'pressable cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50'
                  }
                >
                  {b.sheetName}
                  {b.mappingStatus !== 'TERKONFIRMASI' && ' · mapping belum dikonfirmasi'}
                </button>
              ))}
              {(bindings ?? []).length === 0 && (
                <p className="text-sm text-slate-500">Belum ada sheet binding.</p>
              )}
            </div>
          </div>
          {activeBinding && <BindingMappingTable source={source} binding={activeBinding} />}
        </div>
      )}
    </Modal>
  );
}

function BindingMappingTable({
  source,
  binding,
}: {
  source: SpreadsheetSource;
  binding: SheetBinding;
}) {
  const { data: mappings, isLoading } = useMappings(binding.id);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  async function confirmMapping() {
    const ctx = getCtx();
    if (!ctx) return;
    setConfirmBusy(true);
    try {
      await getDataService().integrations.confirmMapping(source.id, binding.id, ctx);
      notify.success('Mapping dikonfirmasi.', `Sheet "${binding.sheetName}" siap disinkronkan.`);
      await queryClient.invalidateQueries({ queryKey: ['integrations'] });
    } catch (err) {
      notify.error('Gagal mengonfirmasi mapping', errorMessage(err));
    } finally {
      setConfirmBusy(false);
    }
  }

  async function loadPreview() {
    setPreviewBusy(true);
    try {
      const res = await getDataService().integrations.preview(source.id, binding.id);
      if (!res) {
        notify.warning(
          'Preview belum tersedia',
          'Integrasi Google belum dikonfigurasi atau mapping belum dikonfirmasi.',
        );
      }
      setPreview(res);
    } catch (err) {
      notify.error('Gagal memuat preview', errorMessage(err));
    } finally {
      setPreviewBusy(false);
    }
  }

  if (isLoading) return <LoadingBlock label="Memuat mapping…" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-800">Mapping kolom — {binding.sheetName}</p>
          <p className="text-xs text-slate-500">
            Berbasis header (bukan posisi kolom). Header baris {binding.headerRow}, data mulai
            baris {binding.dataStartRow}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={binding.mappingStatus === 'TERKONFIRMASI' ? 'success' : 'warning'}>
            {binding.mappingStatus === 'TERKONFIRMASI'
              ? 'Mapping terkonfirmasi'
              : binding.mappingStatus === 'PERLU_VALIDASI'
                ? 'Perlu Validasi'
                : 'Mapping belum dikonfirmasi'}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => void loadPreview()} loading={previewBusy}>
            <Eye className="size-3.5" aria-hidden />
            Preview
          </Button>
          {binding.mappingStatus !== 'TERKONFIRMASI' && (mappings ?? []).length > 0 && (
            <Button size="sm" onClick={() => void confirmMapping()} loading={confirmBusy}>
              <CheckCircle2 className="size-3.5" aria-hidden />
              Konfirmasi mapping
            </Button>
          )}
        </div>
      </div>

      {(mappings ?? []).length === 0 ? (
        <EmptyState
          compact
          title="Mapping belum dikonfirmasi"
          description="Jalankan tes koneksi setelah Google terhubung; header akan dideteksi otomatis lalu dikonfirmasi di sini."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Header terdeteksi</th>
                <th className="px-3 py-2 font-semibold">Field tujuan</th>
                <th className="px-3 py-2 font-semibold">Parser</th>
                <th className="px-3 py-2 font-semibold">Wajib</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(mappings ?? []).map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2 font-semibold text-slate-700">{m.detectedHeader}</td>
                  <td className="px-3 py-2">
                    <code className="text-xs text-slate-600">{m.targetField}</code>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{m.parserType}</td>
                  <td className="px-3 py-2 text-xs">{m.required ? 'Ya' : '—'}</td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        m.validationStatus === 'VALID'
                          ? 'success'
                          : m.validationStatus === 'TIDAK_VALID'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {m.validationStatus === 'VALID'
                        ? 'Valid'
                        : m.validationStatus === 'TIDAK_VALID'
                          ? 'Tidak valid'
                          : 'Belum divalidasi'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-brand-50 text-xs text-brand-800">
              <tr>
                {preview.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-xs whitespace-nowrap text-slate-600">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Histori sinkronisasi
// ---------------------------------------------------------------------------

function SyncHistoryCard() {
  const { data: runs, isLoading } = useSyncRuns(undefined, 50);
  const { data: sources } = useSources({ includeInactive: true, includeDeleted: true });
  const nameById = useMemo(
    () => new Map((sources ?? []).map((s) => [s.id, `${s.name} (${s.year})`])),
    [sources],
  );

  if (isLoading) return <LoadingBlock label="Memuat histori sinkronisasi…" />;

  return (
    <Card>
      <CardHeader
        title="Histori Sinkronisasi"
        description="Setiap proses sinkron tercatat: pemicu, jumlah baris, status, dan error."
      />
      {(runs ?? []).length === 0 ? (
        <EmptyState compact title="Belum ada sinkronisasi" />
      ) : (
        <div className="overflow-x-auto p-4 pt-2">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="px-2 py-2 font-semibold">Waktu</th>
                <th className="px-2 py-2 font-semibold">Sumber</th>
                <th className="px-2 py-2 font-semibold">Pemicu</th>
                <th className="px-2 py-2 font-semibold">Baris</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(runs ?? []).map((run) => {
                const badge = SYNC_BADGE[run.status];
                return (
                  <tr key={run.id}>
                    <td className="tnum px-2 py-2 text-xs whitespace-nowrap text-slate-600">
                      {formatDateTime(run.startedAt)}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-700">
                      {nameById.get(run.sourceId) ?? run.sourceId}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500">
                      {run.trigger === 'MANUAL'
                        ? 'Manual'
                        : run.trigger === 'WEBHOOK'
                          ? 'Webhook'
                          : 'Terjadwal'}
                    </td>
                    <td className="tnum px-2 py-2 text-xs text-slate-600">{run.rowsRead}</td>
                    <td className="px-2 py-2">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td className="max-w-64 truncate px-2 py-2 text-xs text-slate-500">
                      {run.errorMessage ?? run.message ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
