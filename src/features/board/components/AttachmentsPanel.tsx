import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Download,
  ExternalLink,
  History,
  Paperclip,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import type { AttachmentGroup, AttachmentVersion, Employee, Task } from '@/services/types';
import { useSessionStore } from '@/features/auth/session-store';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useAttachmentGroups } from '@/hooks/queries';

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface Props {
  task: Task;
  employees: Employee[];
  /** Pengguna boleh menambah/mengubah lampiran pekerjaan ini. */
  canEdit: boolean;
}

/**
 * Lampiran pekerjaan dengan RIWAYAT VERSI (spesifikasi §P).
 *
 * Setiap unggahan menjadi versi tersendiri: versi lama tetap dapat diunduh dan
 * tidak pernah tertimpa. Berkas disimpan di Google Drive aplikasi bila akun
 * Google terhubung; selama belum terhubung dipakai penyimpanan aplikasi —
 * keduanya melalui endpoint server yang sama.
 */
export function AttachmentsPanel({ task, employees, canEdit }: Props) {
  const groupsQ = useAttachmentGroups(task.id);
  const queryClient = useQueryClient();
  const getCtx = useActorCtx();
  const confirm = useConfirm();
  const role = useSessionStore((s) => s.role);

  const [newOpen, setNewOpen] = useState(false);
  const [historyOf, setHistoryOf] = useState<AttachmentGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const groups = groupsQ.data ?? [];
  const nameOf = (id: string | null) =>
    (id ? employees.find((e) => e.id === id)?.displayName : null) ?? '–';

  async function refresh() {
    await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'attachments' });
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx || !file) return;
    setBusy(true);
    try {
      await getDataService().attachments.createGroup(
        task.id,
        { title: title.trim() || file.name, file, changeNote: note.trim() },
        ctx,
      );
      await refresh();
      notify.success('Lampiran diunggah.', file.name);
      setNewOpen(false);
      setTitle('');
      setNote('');
      setFile(null);
    } catch (err) {
      notify.error('Unggah gagal', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleNewVersion(group: AttachmentGroup, nextFile: File, changeNote: string) {
    const ctx = getCtx();
    if (!ctx) return;
    setBusy(true);
    try {
      await getDataService().attachments.addVersion(
        group.id,
        { file: nextFile, changeNote },
        ctx,
      );
      await refresh();
      notify.success('Versi baru diunggah.', nextFile.name);
    } catch (err) {
      // Versi lama tidak terpengaruh oleh kegagalan unggah.
      notify.error('Unggah versi gagal', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(version: AttachmentVersion) {
    try {
      const url = await getDataService().attachments.versionDownloadUrl(version.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = version.fileName;
      a.rel = 'noopener';
      a.click();
      if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      notify.error('Unduh gagal', errorMessage(err));
    }
  }

  async function handleDeleteVersion(group: AttachmentGroup, version: AttachmentVersion) {
    const ctx = getCtx();
    if (!ctx) return;
    const isLastActive = group.versions.filter((v) => !v.deletedAt).length <= 1;
    const ok = await confirm({
      title: isLastActive ? 'Hapus versi aktif terakhir?' : `Hapus versi ${version.version}?`,
      description: isLastActive
        ? 'Ini satu-satunya versi aktif pada lampiran ini. Berkas dipindahkan ke tempat sampah dan masih dapat dipulihkan Admin.'
        : 'Berkas ditandai terhapus dan masih dapat dipulihkan.',
      confirmLabel: 'Hapus versi',
      danger: true,
    });
    if (!ok) return;
    try {
      await getDataService().attachments.softDeleteVersion(version.id, ctx);
      await refresh();
      notify.success('Versi lampiran dihapus.');
    } catch (err) {
      notify.error('Gagal menghapus versi', errorMessage(err));
    }
  }

  async function handleDeleteGroup(group: AttachmentGroup) {
    const ctx = getCtx();
    if (!ctx) return;
    const ok = await confirm({
      title: `Hapus lampiran "${group.title}"?`,
      description: 'Seluruh versi disembunyikan; Admin dapat memulihkan kembali.',
      confirmLabel: 'Hapus lampiran',
      danger: true,
    });
    if (!ok) return;
    try {
      await getDataService().attachments.softDeleteGroup(group.id, ctx);
      await refresh();
      notify.success('Lampiran dihapus.');
    } catch (err) {
      notify.error('Gagal menghapus lampiran', errorMessage(err));
    }
  }

  if (groupsQ.isLoading) return <LoadingBlock compact />;

  return (
    <div className="space-y-3">
      {canEdit && (
        <Button variant="outline" size="sm" onClick={() => setNewOpen(true)}>
          <Upload className="size-3.5" aria-hidden />
          Unggah lampiran
        </Button>
      )}

      {groups.length === 0 ? (
        <EmptyState
          compact
          icon={Paperclip}
          title="Belum ada lampiran"
          description="Setiap unggahan disimpan sebagai versi tersendiri sehingga versi lama tetap dapat diunduh."
        />
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => {
            const latest = group.versions.find((v) => !v.deletedAt) ?? group.versions[0];
            if (!latest) return null;
            return (
              <li
                key={group.id}
                className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    aria-hidden
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
                  >
                    <Paperclip className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                      <span className="truncate">{group.title}</span>
                      <Badge tone="success">Terbaru · v{latest.version}</Badge>
                      {latest.storageBackend === 'drive' && <Badge tone="brand">Drive</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-slate-600">{latest.fileName}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatSize(latest.size)} · {latest.mimeType || 'berkas'} ·{' '}
                      {nameOf(latest.uploadedByEmployeeId)} · {formatRelative(latest.createdAt)}
                    </p>
                    {latest.changeNote && (
                      <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        Catatan: {latest.changeNote}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Unduh ${latest.fileName}`}
                      onClick={() => void handleDownload(latest)}
                    >
                      <Download className="size-4" aria-hidden />
                    </Button>
                    {latest.driveWebViewLink && (
                      <a
                        href={latest.driveWebViewLink}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label="Buka di Google Drive"
                        className="pressable inline-flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <ExternalLink className="size-4" aria-hidden />
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Riwayat versi ${group.title}`}
                      onClick={() => setHistoryOf(group)}
                    >
                      <History className="size-4" aria-hidden />
                    </Button>
                    {canEdit && (
                      <>
                        <label className="inline-flex">
                          <input
                            type="file"
                            className="sr-only"
                            aria-label={`Unggah versi baru ${group.title}`}
                            disabled={busy}
                            onChange={(e) => {
                              const next = e.target.files?.[0];
                              if (next) {
                                const changeNote =
                                  window.prompt('Catatan perubahan versi ini (opsional):') ?? '';
                                void handleNewVersion(group, next, changeNote);
                              }
                              e.target.value = '';
                            }}
                          />
                          <span
                            className={cn(
                              'pressable inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50',
                              busy && 'pointer-events-none opacity-60',
                            )}
                          >
                            <Upload className="size-3.5" aria-hidden />
                            Versi baru
                          </span>
                        </label>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Hapus lampiran ${group.title}`}
                          onClick={() => void handleDeleteGroup(group)}
                        >
                          <Trash2 className="size-4 text-slate-400" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {group.versions.length > 1 && (
                  <p className="mt-2 text-xs text-slate-400">
                    {group.versions.length} versi tersimpan — versi lama tetap dapat diunduh.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ------------------------------------------------ unggah lampiran baru */}
      <Modal
        open={newOpen}
        onOpenChange={setNewOpen}
        title="Unggah lampiran"
        description="Berkas disimpan sebagai versi 1 pada kelompok lampiran baru."
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" form="form-lampiran" loading={busy} disabled={!file}>
              Unggah
            </Button>
          </>
        }
      >
        <form id="form-lampiran" onSubmit={handleCreate} className="space-y-4">
          <Field label="Judul lampiran" required hint="Contoh: Dokumen Utama, Lampiran Lainnya.">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dokumen Utama"
            />
          </Field>
          <Field label="Berkas" required hint="Maksimal 4 MB per berkas.">
            <input
              type="file"
              aria-label="Pilih berkas lampiran"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
            />
          </Field>
          <Field label="Catatan perubahan" hint="Dianjurkan agar riwayat versi mudah dibaca.">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Versi awal"
            />
          </Field>
        </form>
      </Modal>

      {/* ------------------------------------------------------ riwayat versi */}
      <Modal
        open={historyOf !== null}
        onOpenChange={(o) => {
          if (!o) setHistoryOf(null);
        }}
        title={`Riwayat versi — ${historyOf?.title ?? ''}`}
        description="Versi lama tetap tersimpan dan dapat diunduh."
        size="lg"
      >
        <ul className="divide-y divide-slate-100">
          {(historyOf?.versions ?? []).map((version, index) => (
            <li key={version.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="tnum inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                v{version.version}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className="truncate">{version.fileName}</span>
                  {index === 0 && !version.deletedAt && <Badge tone="success">Terbaru</Badge>}
                  {version.deletedAt && <Badge tone="warning">Terhapus</Badge>}
                </p>
                <p className="text-xs text-slate-400">
                  {formatSize(version.size)} · {nameOf(version.uploadedByEmployeeId)} ·{' '}
                  {formatRelative(version.createdAt)}
                </p>
                {version.changeNote && (
                  <p className="mt-0.5 text-xs text-slate-600">Catatan: {version.changeNote}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Unduh versi ${version.version}`}
                onClick={() => void handleDownload(version)}
              >
                <Download className="size-4" aria-hidden />
              </Button>
              {canEdit && historyOf && !version.deletedAt && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus versi ${version.version}`}
                  onClick={() => void handleDeleteVersion(historyOf, version)}
                >
                  <Trash2 className="size-4 text-slate-400" aria-hidden />
                </Button>
              )}
              {role === 'ADMIN' && version.deletedAt && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Pulihkan versi ${version.version}`}
                  onClick={() => {
                    const ctx = getCtx();
                    if (!ctx) return;
                    void getDataService()
                      .attachments.restoreVersion(version.id, ctx)
                      .then(refresh)
                      .then(() => notify.success('Versi dipulihkan.'))
                      .catch((err: unknown) =>
                        notify.error('Gagal memulihkan', errorMessage(err)),
                      );
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
