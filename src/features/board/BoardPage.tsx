import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Check,
  FileSpreadsheet,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  UserRoundX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ErrorState } from '@/components/feedback/error-state';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { arrayMove, cn } from '@/lib/utils';
import { todayISO } from '@/lib/format';
import { canCreateTask, canDispose, isAssignedToViewer, viewerFrom } from '@/lib/permissions';
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Modal } from '@/components/ui/dialog';
import type { DurationType, Priority, Step, Task } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import {
  useAllComments,
  useAttachmentCounts,
  useBoard,
  useCategories,
  useEmployees,
  useLabels,
  useSteps,
  useTasks,
  qk,
} from '@/hooks/queries';
import { useSessionStore } from '@/features/auth/session-store';
import { getDataService } from '@/services';
import { ArchiveList } from './components/ArchiveList';
import { PicPicker } from './components/PicPicker';
import { DeleteStepDialog } from './components/DeleteStepDialog';
import { DeleteTaskDialog } from './components/DeleteTaskDialog';
import { KanbanBoard } from './components/KanbanBoard';
import { StepDialog } from './components/StepDialog';
import { TaskDetailDialog } from './components/TaskDetailDialog';
import { TaskDialog } from './components/TaskDialog';
import { TaskImportDialog } from './components/TaskImportDialog';
import {
  applyScope,
  buildColumns,
  countActiveFilters,
  DURATION_LABEL,
  EMPTY_FILTERS,
  PRIORITY_LABEL,
  QUICK_FILTER_LABEL,
  quickFilterCounts,
  type BoardFilters,
  type BoardScope,
  type QuickFilterKey,
} from './lib';
import { useBoardErrorHandler, useMoveTask } from './useBoardActions';

export default function BoardPage() {
  const boardQ = useBoard();
  const stepsQ = useSteps();
  const tasksQ = useTasks({ includeArchived: true });
  const categoriesQ = useCategories();
  const labelsQ = useLabels();
  const employeesQ = useEmployees(true);
  const commentsQ = useAllComments();
  const attachmentsCountQ = useAttachmentCounts();
  const [searchParams, setSearchParams] = useSearchParams();
  const stepFilter = searchParams.get('step');
  const openTaskId = searchParams.get('task');
  // Halaman Pekerjaan hanya punya DUA pilihan tampilan (spesifikasi §H):
  // Semua Pekerjaan (?scope=all) dan Pekerjaan Saya (?scope=mine).
  // Keduanya memakai record & Board yang SAMA — hanya berbeda saringan.
  const scope: BoardScope = searchParams.get('scope') === 'mine' ? 'mine' : 'all';
  const [archiveOpen, setArchiveOpen] = useState(false);

  const [search, setSearch] = useState('');
  // Indikator cepat dapat ditautkan dari Dashboard lewat ?quick=TERLAMBAT dll.
  const quickParam = searchParams.get('quick');
  const [filters, setFilters] = useState<BoardFilters>(() => ({
    ...EMPTY_FILTERS,
    quick: quickParam && quickParam in QUICK_FILTER_LABEL ? (quickParam as QuickFilterKey) : null,
  }));
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Dialog state
  const [taskImportOpen, setTaskImportOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogTask, setTaskDialogTask] = useState<Task | null>(null);
  const [taskDialogStepId, setTaskDialogStepId] = useState<string | undefined>(undefined);
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [stepDialogStep, setStepDialogStep] = useState<Step | null>(null);
  const [deleteStepTarget, setDeleteStepTarget] = useState<Step | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null);

  const getCtx = useActorCtx();
  const onError = useBoardErrorHandler();
  const queryClient = useQueryClient();
  const moveTask = useMoveTask();

  const steps = useMemo(() => stepsQ.data ?? [], [stepsQ.data]);
  const allTasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);

  const { role, accountEmployeeId, actorId } = useSessionStore();
  const viewer = useMemo(
    () => viewerFrom(role, accountEmployeeId ?? actorId, employees),
    [role, accountEmployeeId, actorId, employees],
  );
  // Scope "Pekerjaan Saya" harus mengikuti akun yang masuk. `actorId` hanya
  // identitas pelaku audit yang dapat dipilih Admin, bukan identitas akun.
  const accountViewer = useMemo(
    () => viewerFrom(role, accountEmployeeId, employees),
    [role, accountEmployeeId, employees],
  );
  const defaultPicMainIds = useMemo(
    () =>
      viewer.accountType === 'EMPLOYEE' && viewer.level === 'STAFF' && viewer.employeeId
        ? [viewer.employeeId]
        : [],
    [viewer],
  );
  const today = todayISO();

  // "Pekerjaan Saya" = saringan murni dari data yang sama.
  const isEmployeeAccount = role === 'EMPLOYEE';
  const tasks = useMemo(() => {
    if (isEmployeeAccount) return allTasks.filter((task) => isAssignedToViewer(accountViewer, task));
    return applyScope(allTasks, scope, accountViewer) as typeof allTasks;
  }, [allTasks, scope, accountViewer, isEmployeeAccount]);
  const quickCounts = useMemo(() => quickFilterCounts(tasks, steps, today), [tasks, steps, today]);
  const categories = categoriesQ.data ?? [];
  const labels = labelsQ.data ?? [];

  const effectiveFilters = useMemo<BoardFilters>(
    () => ({ ...filters, search, stepId: stepFilter }),
    [filters, search, stepFilter],
  );

  const visibleSteps = useMemo(
    () => (stepFilter ? steps.filter((s) => s.id === stepFilter) : steps),
    [steps, stepFilter],
  );

  const columns = useMemo(
    () => buildColumns(tasks, steps, effectiveFilters, { todayIso: today }),
    [tasks, steps, effectiveFilters, today],
  );

  const countsByTask = useMemo(() => {
    const map = new Map<string, { comments: number; attachments: number }>();
    for (const c of commentsQ.data ?? []) {
      const cur = map.get(c.taskId) ?? { comments: 0, attachments: 0 };
      cur.comments += 1;
      map.set(c.taskId, cur);
    }
    for (const [taskId, count] of Object.entries(attachmentsCountQ.data ?? {})) {
      const cur = map.get(taskId) ?? { comments: 0, attachments: 0 };
      cur.attachments = count;
      map.set(taskId, cur);
    }
    return map;
  }, [commentsQ.data, attachmentsCountQ.data]);

  // Detail dibuka dari seluruh data agar deep link notifikasi tetap berfungsi
  // walau kartu tidak masuk saringan yang sedang aktif.
  const openTask = useMemo(
    () => (openTaskId ? (allTasks.find((t) => t.id === openTaskId) ?? null) : null),
    [openTaskId, allTasks],
  );
  const archivedTasks = useMemo(
    () => allTasks.filter((t) => t.archivedAt && !t.deletedAt),
    [allTasks],
  );

  const filterCount = countActiveFilters(filters);
  const hasSearchOrFilter = filterCount > 0 || search.trim().length > 0;

  function setOpenTaskId(id: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('task', id);
        else next.delete('task');
        return next;
      },
      { replace: true },
    );
  }

  function clearStepFilter() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('step');
        return next;
      },
      { replace: true },
    );
  }

  function setScope(next: BoardScope) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'all') params.delete('scope');
        else params.set('scope', next);
        return params;
      },
      { replace: true },
    );
  }

  function toggleQuick(key: QuickFilterKey) {
    setFilters((f) => ({ ...f, quick: f.quick === key ? null : key }));
  }

  async function saveTitle() {
    const board = boardQ.data;
    if (!board) return;
    const trimmed = titleDraft.trim();
    setEditingTitle(false);
    if (!trimmed || trimmed === board.title) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().board.rename(trimmed, board.version, ctx);
      await queryClient.invalidateQueries({ queryKey: qk.board() });
      notify.success('Judul board diperbarui.');
    } catch (err) {
      onError(err, 'Gagal mengubah judul board');
    }
  }

  async function handleMoveStep(step: Step, direction: -1 | 1) {
    const ids = steps.map((s) => s.id);
    const from = ids.indexOf(step.id);
    const to = from + direction;
    if (to < 0 || to >= ids.length) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().board.reorderSteps(arrayMove(ids, from, to), ctx);
      await queryClient.invalidateQueries({ queryKey: ['steps'] });
    } catch (err) {
      onError(err, 'Gagal mengubah urutan step');
    }
  }

  function handleMoveTask(taskId: string, to: { stepId: string; index: number }) {
    const ctx = getCtx();
    if (!ctx) return;
    void moveTask(taskId, to, ctx);
  }

  const isLoading = boardQ.isLoading || stepsQ.isLoading || tasksQ.isLoading;
  const isError = boardQ.isError || stepsQ.isError || tasksQ.isError;

  if (isError) {
    return (
      <Card>
        <ErrorState
          error={boardQ.error ?? stepsQ.error ?? tasksQ.error}
          onRetry={() => {
            void boardQ.refetch();
            void stepsQ.refetch();
            void tasksQ.refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Judul board (editable) */}
        {editingTitle ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveTitle();
            }}
          >
            <Input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="h-9 w-72 font-bold"
              maxLength={80}
              aria-label="Judul board"
            />
            <Button type="submit" size="icon" variant="secondary" aria-label="Simpan judul">
              <Check className="size-4" aria-hidden />
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setTitleDraft(boardQ.data?.title ?? '');
              setEditingTitle(true);
            }}
            className="group flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-left"
            aria-label="Ubah judul board"
          >
            <span className="text-base font-bold text-slate-900">{boardQ.data?.title ?? '…'}</span>
            <Pencil
              className="size-3.5 text-slate-300 transition-colors group-hover:text-slate-500"
              aria-hidden
            />
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Dua pilihan tampilan dalam halaman — bukan board/tabel terpisah */}
          {isEmployeeAccount ? (
            <span className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
              Pekerjaan Saya
            </span>
          ) : <div
            role="group"
            aria-label="Cakupan pekerjaan"
            className="inline-flex items-center gap-1 rounded-xl bg-slate-200/60 p-1"
          >
            {(
              [
                { value: 'all', label: 'Semua Pekerjaan' },
                { value: 'mine', label: 'Pekerjaan Saya' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={scope === opt.value}
                onClick={() => setScope(opt.value)}
                className={cn(
                  'pressable inline-flex min-h-9 cursor-pointer items-center rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors',
                  scope === opt.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>}
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pekerjaan…"
              aria-label="Cari pekerjaan"
              className="h-9 w-48 pl-9 lg:w-64"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <Filter className="size-3.5" aria-hidden />
                Filter
                {filterCount > 0 && <Badge tone="brand">{filterCount}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3">
              <Field label="Prioritas">
                <Select
                  value={filters.priority ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      priority: (e.target.value || null) as Priority | null,
                    }))
                  }
                >
                  <option value="">Semua prioritas</option>
                  {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="PIC">
                <PicPicker
                  employees={employees}
                  value={filters.picIds}
                  onChange={(ids) => setFilters((f) => ({ ...f, picIds: ids }))}
                  placeholder="Semua PIC"
                />
              </Field>
              <Field label="Jenis durasi">
                <Select
                  value={filters.durationType ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      durationType: (e.target.value || null) as DurationType | null,
                    }))
                  }
                >
                  <option value="">Semua durasi</option>
                  {(Object.keys(DURATION_LABEL) as DurationType[]).map((d) => (
                    <option key={d} value={d}>
                      {DURATION_LABEL[d]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tenggat">
                <Select
                  value={filters.dueFilter}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      dueFilter: e.target.value as BoardFilters['dueFilter'],
                    }))
                  }
                >
                  <option value="ALL">Semua tenggat</option>
                  <option value="HAS_DUE">Punya tenggat</option>
                  <option value="NO_DUE">Tanpa tenggat</option>
                </Select>
              </Field>
              {/* Arsip diakses dari sini & menu ⋯ — bukan tab utama. */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => setArchiveOpen(true)}
              >
                <Archive className="size-4" aria-hidden />
                Lihat pekerjaan diarsipkan ({archivedTasks.length})
              </Button>
              {filterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  Hapus semua filter
                </Button>
              )}
            </PopoverContent>
          </Popover>
          {!isEmployeeAccount && canCreateTask(viewer) && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setTaskImportOpen(true)}
              >
                <FileSpreadsheet className="size-4" aria-hidden />
                Impor Excel
              </Button>
              <Button
                size="sm"
                className="h-9"
                onClick={() => {
                  setTaskDialogTask(null);
                  setTaskDialogStepId(undefined);
                  setTaskDialogOpen(true);
                }}
              >
                <Plus className="size-4" aria-hidden />
                Pekerjaan baru
              </Button>
            </>
          )}
          {/* Menu ⋯ — arsip & aksi sekunder tanpa menambah tab utama */}
          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button variant="outline" size="icon" className="size-9" aria-label="Menu lainnya">
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownTrigger>
            <DropdownContent className="w-60">
              <DropdownItem icon={<Archive />} onSelect={() => setArchiveOpen(true)}>
                Pekerjaan diarsipkan ({archivedTasks.length})
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                icon={<Filter />}
                onSelect={() => {
                  setFilters(EMPTY_FILTERS);
                  setSearch('');
                }}
              >
                Bersihkan semua filter
              </DropdownItem>
            </DropdownContent>
          </DropdownRoot>
        </div>
      </div>

      {/* Indikator cepat — dapat diklik untuk memfilter Board (§I) */}
      <div role="group" aria-label="Indikator cepat" className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: 'TERLAMBAT', icon: AlertTriangle, tone: 'danger' },
            { key: 'MENDEKATI_TENGGAT', icon: CalendarClock, tone: 'warning' },
            { key: 'TANPA_PIC', icon: UserRoundX, tone: 'neutral' },
          ] as Array<{
            key: QuickFilterKey;
            icon: LucideIcon;
            tone: 'danger' | 'warning' | 'neutral';
          }>
        ).map(({ key, icon: Icon, tone }) => {
          const active = filters.quick === key;
          const count = quickCounts[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => toggleQuick(key)}
              className={cn(
                'pressable inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors',
                active
                  ? 'border-brand-400 bg-brand-50 text-brand-800'
                  : count === 0
                    ? 'border-slate-200 text-slate-400 hover:border-slate-300'
                    : tone === 'danger'
                      ? 'hover:border-danger-300 border-danger-100 bg-danger-50/60 text-danger-700'
                      : tone === 'warning'
                        ? 'border-amber-100 bg-amber-50/60 text-amber-800 hover:border-amber-300'
                        : 'border-slate-200 text-slate-600 hover:border-brand-200 hover:text-brand-700',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {QUICK_FILTER_LABEL[key]}
              <span className="tnum rounded-full bg-white/70 px-1.5 text-xs font-bold">
                {count}
              </span>
            </button>
          );
        })}
        {filters.quick && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, quick: null }))}
          >
            <X className="size-3.5" aria-hidden />
            Hapus indikator
          </Button>
        )}
      </div>

      {/* Chip filter step dari Dashboard */}
      {stepFilter && (
        <div className="flex items-center gap-2">
          <Badge tone="brand">
            Filter step: {steps.find((s) => s.id === stepFilter)?.name ?? '?'}
          </Badge>
          <Button variant="ghost" size="sm" onClick={clearStepFilter}>
            <X className="size-3.5" aria-hidden />
            Hapus filter
          </Button>
        </div>
      )}

      {/* Konten */}
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : (
        <KanbanBoard
          steps={visibleSteps}
          columns={columns}
          employees={employees}
          categories={categories}
          labels={labels}
          countsByTask={countsByTask}
          onOpenTask={setOpenTaskId}
          onAddTask={(stepId) => {
            setTaskDialogTask(null);
            setTaskDialogStepId(stepId);
            setTaskDialogOpen(true);
          }}
          onAddStep={() => {
            setStepDialogStep(null);
            setStepDialogOpen(true);
          }}
          onEditStep={(step) => {
            setStepDialogStep(step);
            setStepDialogOpen(true);
          }}
          onDeleteStep={setDeleteStepTarget}
          onMoveStep={(step, dir) => void handleMoveStep(step, dir)}
          onMoveTask={handleMoveTask}
          dragDisabled={hasSearchOrFilter}
        />
      )}

      {/* Dialog */}
      <TaskImportDialog
        open={taskImportOpen}
        onOpenChange={setTaskImportOpen}
        steps={steps}
        employees={employees}
        actorEmployeeId={viewer.employeeId}
        canDispose={canDispose(viewer)}
        isEmployee={viewer.accountType === 'EMPLOYEE'}
        defaultPicMainIds={defaultPicMainIds}
      />
      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
       task={taskDialogTask}
       initialStepId={taskDialogStepId}
       steps={steps}
       employees={employees}
      />
      <TaskDetailDialog
        open={!!openTask}
        onOpenChange={(open) => {
          if (!open) setOpenTaskId(null);
        }}
        task={openTask}
        steps={steps}
        categories={categories}
        labels={labels}
        employees={employees}
        onEdit={(task) => {
          setTaskDialogTask(task);
          setTaskDialogStepId(undefined);
          setTaskDialogOpen(true);
        }}
        onDelete={setDeleteTaskTarget}
      />
      {/* Arsip: modal, bukan tab utama. Data & fungsi arsip tetap utuh. */}
      <Modal
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Pekerjaan diarsipkan"
        description="Pekerjaan yang disembunyikan dari Board aktif — riwayatnya tetap tersimpan."
        size="xl"
      >
        <ArchiveList
          tasks={allTasks}
          employees={employees}
          categories={categories}
          onOpenTask={(id) => {
            setArchiveOpen(false);
            setOpenTaskId(id);
          }}
        />
      </Modal>

      <StepDialog open={stepDialogOpen} onOpenChange={setStepDialogOpen} step={stepDialogStep} />
      <DeleteStepDialog
        open={!!deleteStepTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteStepTarget(null);
        }}
        step={deleteStepTarget}
        steps={steps}
        tasks={tasks}
      />
      <DeleteTaskDialog
        open={!!deleteTaskTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTaskTarget(null);
        }}
        task={deleteTaskTarget}
        onDeleted={() => setOpenTaskId(null)}
      />
    </div>
  );
}
