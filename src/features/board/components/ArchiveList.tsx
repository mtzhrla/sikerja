import { Archive, ArchiveRestore } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/feedback/empty-state';
import { notify } from '@/components/feedback/toaster';
import { AvatarGroup } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatRelative } from '@/lib/format';
import { getDataService } from '@/services';
import type { Category, Employee, Task } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useBoardErrorHandler } from '../useBoardActions';

interface ArchiveListProps {
  tasks: Task[];
  employees: Employee[];
  categories: Category[];
  onOpenTask: (taskId: string) => void;
}

/** Tab Arsip: daftar pekerjaan terarsip + pemulihan. */
export function ArchiveList({ tasks, employees, categories, onOpenTask }: ArchiveListProps) {
  const getCtx = useActorCtx();
  const onError = useBoardErrorHandler();
  const queryClient = useQueryClient();

  const archived = tasks
    .filter((t) => t.archivedAt && !t.deletedAt)
    .sort((a, b) => Date.parse(b.archivedAt!) - Date.parse(a.archivedAt!));

  async function restore(task: Task) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().tasks.unarchive(task.id, ctx);
      notify.success('Dipulihkan dari arsip.', task.title);
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      onError(err, 'Gagal memulihkan');
    }
  }

  if (archived.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="Arsip kosong"
        description="Pekerjaan yang diarsipkan akan tampil di sini dan dapat dipulihkan kapan saja."
      />
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {archived.map((task) => {
        const category = task.categoryId
          ? categories.find((c) => c.id === task.categoryId)
          : null;
        const pics = [task.picMainId, ...task.picIds]
          .filter((id): id is string => !!id)
          .map((id) => employees.find((e) => e.id === id))
          .filter((e): e is Employee => !!e);
        return (
          <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => onOpenTask(task.id)}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <p className="truncate text-sm font-semibold text-slate-800 hover:text-brand-700">
                {task.title}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {category && (
                  <Badge tone="outline" dotColor={category.color}>
                    {category.name}
                  </Badge>
                )}
                <span>Diarsipkan {formatRelative(task.archivedAt)}</span>
                {task.dueDate && <span>· target {formatDate(task.dueDate)}</span>}
              </p>
            </button>
            <AvatarGroup employees={pics} size="xs" max={3} />
            <Button variant="outline" size="sm" onClick={() => void restore(task)}>
              <ArchiveRestore className="size-3.5" aria-hidden />
              Pulihkan
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
