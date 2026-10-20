import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { formatDateTime, formatRelative } from '@/lib/format';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import type { SpreadsheetSource, Step, Task } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useEmployees, useSources, useSteps, useTasks } from '@/hooks/queries';

/** Data Terhapus: pekerjaan, step, & sumber spreadsheet soft-deleted — pulihkan / hapus permanen (Admin). */
export function TrashSection() {
  const tasksQ = useTasks({ includeArchived: true, includeDeleted: true });
  const stepsQ = useSteps(true);
  const sourcesQ = useSources({ includeInactive: true, includeDeleted: true });
  const employeesQ = useEmployees(true);
  const confirm = useConfirm();
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  const byId = useMemo(
    () => new Map((employeesQ.data ?? []).map((e) => [e.id, e])),
    [employeesQ.data],
  );

  const deletedTasks = useMemo(
    () =>
      (tasksQ.data ?? [])
        .filter((t) => t.deletedAt)
        .sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!)),
    [tasksQ.data],
  );
  const deletedSteps = useMemo(
    () => (stepsQ.data ?? []).filter((s) => s.deletedAt),
    [stepsQ.data],
  );
  const deletedSources = useMemo(
    () => (sourcesQ.data ?? []).filter((s) => s.deletedAt),
    [sourcesQ.data],
  );

  async function restoreTask(task: Task) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().tasks.restore(task.id, ctx);
      notify.success('Pekerjaan dipulihkan.', task.title);
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      notify.error('Gagal memulihkan', errorMessage(err));
    }
  }

  async function permanentDeleteTask(task: Task) {
    const ok = await confirm({
      title: 'Hapus permanen?',
      description: `"${task.title}" beserta catatan & lampirannya akan dihapus permanen dan tidak dapat dikembalikan.`,
      confirmLabel: 'Hapus permanen',
      danger: true,
    });
    if (!ok) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().tasks.permanentDelete(task.id, ctx);
      notify.success('Dihapus permanen.');
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      notify.error('Gagal menghapus permanen', errorMessage(err));
    }
  }

  async function restoreStep(step: Step) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().board.restoreStep(step.id, ctx);
      notify.success('Step dipulihkan.', step.name);
      await queryClient.invalidateQueries({ queryKey: ['steps'] });
    } catch (err) {
      notify.error('Gagal memulihkan step', errorMessage(err));
    }
  }

  async function restoreSource(source: SpreadsheetSource) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().integrations.restoreSource(source.id, ctx);
      notify.success('Sumber spreadsheet dipulihkan.', source.name);
      await queryClient.invalidateQueries({ queryKey: ['integrations'] });
    } catch (err) {
      notify.error('Gagal memulihkan sumber', errorMessage(err));
    }
  }

  if (tasksQ.isLoading || stepsQ.isLoading) return <LoadingBlock label="Memuat data terhapus…" />;

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Pekerjaan Terhapus"
          description="Soft delete oleh User/Admin — pulihkan atau hapus permanen (hanya Admin)."
        />
        <div className="p-4 pt-2">
          {deletedTasks.length === 0 ? (
            <EmptyState
              compact
              icon={Trash2}
              title="Tidak ada pekerjaan terhapus"
              description="Pekerjaan yang dihapus dari board akan tampil di sini."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {deletedTasks.map((task) => {
                const actor = task.updatedByEmployeeId
                  ? byId.get(task.updatedByEmployeeId)
                  : null;
                return (
                  <li key={task.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar employee={actor} size="sm" showInactive />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800">{task.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Dihapus {formatRelative(task.deletedAt)} oleh{' '}
                        <strong>{actor?.displayName ?? '–'}</strong>
                        <span title={formatDateTime(task.deletedAt)}> · {formatDateTime(task.deletedAt)}</span>
                      </p>
                      {task.deleteReason && (
                        <p className="mt-1">
                          <Badge tone="warning">Alasan: {task.deleteReason}</Badge>
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void restoreTask(task)}>
                      <ArchiveRestore className="size-3.5" aria-hidden />
                      Pulihkan
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => void permanentDeleteTask(task)}>
                      <Trash2 className="size-3.5" aria-hidden />
                      Hapus permanen
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Step Terhapus"
          description="Step board yang dihapus (soft delete) — dapat dipulihkan ke ujung board."
        />
        <div className="p-4 pt-2">
          {deletedSteps.length === 0 ? (
            <EmptyState compact icon={Trash2} title="Tidak ada step terhapus" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {deletedSteps.map((step) => (
                <li key={step.id} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="size-3 rounded-full"
                    style={{ backgroundColor: step.color }}
                  />
                  <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                    {step.name}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      dihapus {formatRelative(step.deletedAt)}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void restoreStep(step)}>
                    <ArchiveRestore className="size-3.5" aria-hidden />
                    Pulihkan
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Sumber Spreadsheet Terhapus"
          description="Konfigurasi sumber Google Sheets yang diarsipkan — histori sinkronisasi & audit tetap tersimpan."
        />
        <div className="p-4 pt-2">
          {deletedSources.length === 0 ? (
            <EmptyState compact icon={Trash2} title="Tidak ada sumber terhapus" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {deletedSources.map((source) => (
                <li key={source.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                    {source.name}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {source.year} · dihapus {formatRelative(source.deletedAt)}
                    </span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void restoreSource(source)}>
                    <ArchiveRestore className="size-3.5" aria-hidden />
                    Pulihkan
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
