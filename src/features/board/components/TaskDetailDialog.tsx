import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  History,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/progress';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { checklistStats, taskProgress } from '@/lib/progress';
import { cn } from '@/lib/utils';
import { getDataService } from '@/services';
import type {
  AuditEntry,
  Category,
  CommentType,
  Employee,
  Label,
  Step,
  Task,
} from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useSessionStore } from '@/features/auth/session-store';
import { canEditTask, canManageTask, denyReason, viewerFrom } from '@/lib/permissions';
import { AttachmentsPanel } from './AttachmentsPanel';
import { qk } from '@/hooks/queries';
import { DURATION_LABEL, PRIORITY_LABEL } from '../lib';
import { useBoardErrorHandler } from '../useBoardActions';

interface TaskDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  steps: Step[];
  categories: Category[];
  labels: Label[];
  employees: Employee[];
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const ACTION_LABEL: Partial<Record<AuditEntry['action'], string>> = {
  CREATE: 'membuat',
  UPDATE: 'memperbarui',
  MOVE: 'memindahkan',
  ARCHIVE: 'mengarsipkan',
  UNARCHIVE: 'memulihkan dari arsip',
  SOFT_DELETE: 'menghapus',
  RESTORE: 'memulihkan',
  PERMANENT_DELETE: 'menghapus permanen',
};

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  steps,
  categories,
  labels,
  employees,
  onEdit,
  onDelete,
}: TaskDetailDialogProps) {
  const getCtx = useActorCtx();
  const onError = useBoardErrorHandler();
  const queryClient = useQueryClient();
  const [commentType, setCommentType] = useState<CommentType>('KOMENTAR');
  const [commentText, setCommentText] = useState('');

  const taskId = task?.id ?? '';
  const commentsQ = useQuery({
    queryKey: qk.comments(taskId),
    queryFn: () => getDataService().tasks.listComments(taskId),
    enabled: open && !!taskId,
  });
  const historyQ = useQuery({
    queryKey: qk.taskHistory(taskId),
    queryFn: () => getDataService().tasks.history(taskId),
    enabled: open && !!taskId,
  });

  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const { role, accountEmployeeId, actorId } = useSessionStore();
  const viewer = useMemo(
    () => viewerFrom(role, accountEmployeeId ?? actorId, employees),
    [role, accountEmployeeId, actorId, employees],
  );

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });

  if (!task) return null;

  const category = task.categoryId ? categories.find((c) => c.id === task.categoryId) : null;
  const taskLabels = labels.filter((l) => task.labelIds.includes(l.id));
  const picMains = task.picMainIds.map((id) => byId.get(id)).filter((e): e is Employee => !!e);
  const picOthers = task.picIds
    .filter((id) => !task.picMainIds.includes(id))
    .map((id) => byId.get(id))
    .filter((e): e is Employee => !!e);
  const progress = taskProgress(task);
  const cl = checklistStats(task.checklist);
  // Hak akses ditegakkan server (RLS + trigger); di sini untuk umpan balik UI.
  const bolehEdit = canEditTask(viewer, task);
  const bolehKelola = canManageTask(viewer, task);
  const alasanTolak = denyReason(viewer);

  async function withCtx(fn: (ctx: { employeeId: string }) => Promise<unknown>, errTitle: string) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await fn(ctx);
      await invalidateTasks();
    } catch (err) {
      onError(err, errTitle);
    }
  }

  async function toggleChecklistItem(groupId: string, itemId: string, done: boolean) {
    if (!task) return;
    const checklist = task.checklist.map((g) =>
      g.id === groupId
        ? { ...g, items: g.items.map((it) => (it.id === itemId ? { ...it, done } : it)) }
        : g,
    );
    await withCtx(
      (ctx) => getDataService().tasks.update(task.id, { checklist }, task.version, ctx),
      'Gagal memperbarui checklist',
    );
  }

  async function moveToStep(stepId: string) {
    if (!task || stepId === task.stepId) return;
    await withCtx(
      (ctx) => getDataService().tasks.move(task.id, { stepId, index: 9999 }, ctx),
      'Gagal memindahkan pekerjaan',
    );
    notify.success('Kartu dipindahkan.');
  }

  async function toggleFocus() {
    if (!task) return;
    await withCtx(
      (ctx) =>
        getDataService().tasks.update(task.id, { isFocus: !task.isFocus }, task.version, ctx),
      'Gagal mengubah fokus',
    );
  }

  async function toggleArchive() {
    if (!task) return;
    await withCtx(
      (ctx) =>
        task.archivedAt
          ? getDataService().tasks.unarchive(task.id, ctx)
          : getDataService().tasks.archive(task.id, ctx),
      'Gagal mengubah status arsip',
    );
    notify.success(task.archivedAt ? 'Pekerjaan dipulihkan dari arsip.' : 'Pekerjaan diarsipkan.');
    if (!task.archivedAt) onOpenChange(false);
  }

  async function submitComment() {
    if (!task || !commentText.trim()) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().tasks.addComment(task.id, commentType, commentText, ctx);
      setCommentText('');
      await queryClient.invalidateQueries({ queryKey: qk.comments(task.id) });
      await invalidateTasks();
      notify.success('Catatan ditambahkan.');
    } catch (err) {
      onError(err, 'Gagal menambah catatan');
    }
  }


  const commentTypeMeta: Record<CommentType, { label: string; tone: 'neutral' | 'danger' | 'info' }> = {
    KOMENTAR: { label: 'Komentar', tone: 'neutral' },
    KENDALA: { label: 'Kendala', tone: 'danger' },
    TINDAK_LANJUT: { label: 'Tindak lanjut', tone: 'info' },
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          {task.title}
          {task.archivedAt && <Badge tone="neutral">Diarsipkan</Badge>}
        </span>
      }
      description={`Diperbarui ${formatRelative(task.updatedAt)} · dibuat ${formatDate(task.createdAt)}`}
    >
      <div className="space-y-4">
        {/* Aksi utama */}
        <div className="flex flex-wrap items-center gap-2">
          <Field label="Step" className="w-44">
            <Select value={task.stepId} onChange={(e) => void moveToStep(e.target.value)}>
              {steps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!bolehEdit}
              title={bolehEdit ? undefined : alasanTolak}
              onClick={() => onEdit(task)}
            >
              <Pencil className="size-3.5" aria-hidden />
              Ubah
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!bolehEdit}
              title={bolehEdit ? undefined : alasanTolak}
              onClick={() => void toggleFocus()}
            >
              <Star
                className={cn('size-3.5', task.isFocus && 'fill-warning-500 text-warning-500')}
                aria-hidden
              />
              {task.isFocus ? 'Hapus fokus' : 'Tandai fokus'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!bolehKelola}
              title={bolehKelola ? undefined : alasanTolak}
              onClick={() => void toggleArchive()}
            >
              {task.archivedAt ? (
                <>
                  <ArchiveRestore className="size-3.5" aria-hidden /> Pulihkan
                </>
              ) : (
                <>
                  <Archive className="size-3.5" aria-hidden /> Arsipkan
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!bolehKelola}
              title={bolehKelola ? undefined : alasanTolak}
              onClick={() => onDelete(task)}
            >
              <Trash2 className="size-3.5 text-danger-500" aria-hidden />
              Hapus
            </Button>
            {!bolehEdit && (
              <p className="w-full text-xs text-slate-500">{alasanTolak}</p>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase">Kategori & label</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {category ? (
                <Badge tone="outline" dotColor={category.color}>
                  {category.name}
                </Badge>
              ) : (
                <span className="text-xs text-slate-400">Tanpa kategori</span>
              )}
              {taskLabels.map((l) => (
                <Badge key={l.id} tone="outline" dotColor={l.color}>
                  {l.name}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase">Prioritas & durasi</p>
            <p className="mt-1 font-semibold text-slate-700">
              {PRIORITY_LABEL[task.priority]} · {DURATION_LABEL[task.durationType]}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase">Jadwal</p>
            <p className="mt-1 inline-flex items-center gap-1.5 font-semibold text-slate-700">
              <CalendarClock className="size-3.5 text-slate-400" aria-hidden />
              {formatDate(task.startDate)} → {formatDate(task.dueDate)}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-[11px] font-bold text-slate-500 uppercase">PIC</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {picMains.map((e) => (
                <span
                  key={e.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white py-0.5 pr-2.5 pl-0.5 shadow-sm"
                >
                  <Avatar employee={e} size="sm" showInactive />
                  <span className="text-xs font-bold text-slate-700">
                    {e.displayName} · utama
                  </span>
                </span>
              ))}
              {picOthers.map((e) => (
                <span
                  key={e.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white py-0.5 pr-2.5 pl-0.5 shadow-sm"
                >
                  <Avatar employee={e} size="sm" showInactive />
                  <span className="text-xs font-semibold text-slate-600">{e.displayName}</span>
                </span>
              ))}
              {picMains.length === 0 && picOthers.length === 0 && (
                <span className="text-xs text-slate-400 italic">Belum ada PIC</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase">
              Progres ({task.progressMode === 'CHECKLIST' ? 'otomatis dari checklist' : 'manual'})
            </p>
            <div className="mt-1.5">
              <ProgressBar value={progress} showValue label="Progres pekerjaan" />
            </div>
          </div>
        </div>

        {task.description && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-600">
            {task.description}
          </p>
        )}
        {task.activityPlan && (
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Rencana Kegiatan</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{task.activityPlan}</p>
          </section>
        )}

        {/* Tab detail */}
        <Tabs defaultValue="checklist">
          <TabsList>
            <TabsTrigger value="checklist">
              Checklist{cl.total > 0 && ` (${cl.done}/${cl.total})`}
            </TabsTrigger>
            <TabsTrigger value="catatan">
              Catatan{(commentsQ.data?.length ?? 0) > 0 && ` (${commentsQ.data?.length})`}
            </TabsTrigger>
            <TabsTrigger value="lampiran">Lampiran</TabsTrigger>
            <TabsTrigger value="riwayat">Riwayat</TabsTrigger>
          </TabsList>

          <TabsContent value="checklist" className="pt-3">
            {task.checklist.length === 0 ? (
              <EmptyState
                compact
                title="Belum ada checklist"
                description="Tambahkan lewat tombol Ubah."
              />
            ) : (
              <div className="space-y-3">
                {task.checklist.map((group) => (
                  <div key={group.id}>
                    <p className="mb-1.5 text-xs font-bold text-slate-500 uppercase">
                      {group.title}
                    </p>
                    <ul className="space-y-1.5">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <label className="flex cursor-pointer items-start gap-2.5">
                            <Checkbox
                              checked={item.done}
                              onCheckedChange={(v) =>
                                void toggleChecklistItem(group.id, item.id, v === true)
                              }
                              aria-label={item.text}
                            />
                            <span
                              className={cn(
                                'text-sm',
                                item.done ? 'text-slate-400 line-through' : 'text-slate-700',
                              )}
                            >
                              {item.text}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="catatan" className="pt-3">
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex gap-1.5" role="radiogroup" aria-label="Jenis catatan">
                  {(Object.keys(commentTypeMeta) as CommentType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={commentType === t}
                      onClick={() => setCommentType(t)}
                      className={cn(
                        'cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                        commentType === t
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {commentTypeMeta[t].label}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={
                    commentType === 'KENDALA'
                      ? 'Jelaskan kendala yang dihadapi…'
                      : commentType === 'TINDAK_LANJUT'
                        ? 'Tuliskan tindak lanjut yang dilakukan…'
                        : 'Tulis komentar…'
                  }
                  rows={2}
                  aria-label="Isi catatan"
                />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" onClick={() => void submitComment()} disabled={!commentText.trim()}>
                    Kirim
                  </Button>
                </div>
              </div>
              {commentsQ.isLoading ? (
                <LoadingBlock compact />
              ) : (commentsQ.data?.length ?? 0) === 0 ? (
                <EmptyState compact title="Belum ada catatan" />
              ) : (
                <ul className="space-y-2.5">
                  {[...(commentsQ.data ?? [])].reverse().map((c) => {
                    const emp = byId.get(c.employeeId);
                    return (
                      <li key={c.id} className="flex items-start gap-2.5">
                        <Avatar employee={emp} size="sm" showInactive />
                        <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2">
                          <p className="flex flex-wrap items-center gap-1.5 text-xs">
                            <strong className="font-bold text-slate-800">
                              {emp?.displayName ?? 'Pegawai'}
                            </strong>
                            <Badge tone={commentTypeMeta[c.type].tone}>
                              {commentTypeMeta[c.type].label}
                            </Badge>
                            <span className="text-slate-400">{formatRelative(c.createdAt)}</span>
                          </p>
                          <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">
                            {c.text}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="lampiran" className="pt-3">
            <AttachmentsPanel task={task} employees={employees} canEdit={bolehEdit} />
          </TabsContent>

          <TabsContent value="riwayat" className="pt-3">
            {historyQ.isLoading ? (
              <LoadingBlock compact />
            ) : (historyQ.data?.length ?? 0) === 0 ? (
              <EmptyState compact icon={History} title="Belum ada riwayat" />
            ) : (
              <ul className="space-y-2">
                {(historyQ.data ?? []).map((entry) => {
                  const emp = entry.employeeId ? byId.get(entry.employeeId) : null;
                  const changed =
                    entry.after && typeof entry.after === 'object'
                      ? Object.keys(entry.after as Record<string, unknown>).join(', ')
                      : null;
                  return (
                    <li key={entry.id} className="flex items-start gap-2.5">
                      <Avatar employee={emp} size="sm" showInactive />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">
                          <strong className="font-bold text-slate-900">
                            {emp?.displayName ?? entry.actorAccount}
                          </strong>{' '}
                          {ACTION_LABEL[entry.action] ?? entry.action.toLowerCase()}
                          {entry.entityType === 'COMMENT' && ' catatan'}
                          {entry.entityType === 'ATTACHMENT' && ' lampiran'}
                          {changed && entry.entityType === 'TASK' && entry.action === 'UPDATE' && (
                            <span className="text-slate-500"> — {changed}</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400" title={formatDateTime(entry.at)}>
                          {formatRelative(entry.at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Modal>
  );
}
