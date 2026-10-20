import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, CheckSquare2, MessageSquareText, Paperclip, Star } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { AvatarGroup } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { formatDate, todayISO } from '@/lib/format';
import { checklistStats, taskProgress } from '@/lib/progress';
import { cn } from '@/lib/utils';
import type { Category, Employee, Label, Task } from '@/services/types';
import { PRIORITY_LABEL, taskPicIds } from '../lib';

interface TaskCardProps {
  task: Task;
  employees: Employee[];
  categories: Category[];
  labels: Label[];
  commentCount?: number;
  attachmentCount?: number;
  onOpen: (taskId: string) => void;
  /** Nonaktifkan dnd (mis. saat filter aktif). */
  dragDisabled?: boolean;
}

export function TaskCard({
  task,
  employees,
  categories,
  labels,
  commentCount = 0,
  attachmentCount = 0,
  onOpen,
  dragDisabled = false,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', stepId: task.stepId },
    disabled: dragDisabled,
  });

  const category = task.categoryId ? categories.find((c) => c.id === task.categoryId) : null;
  const taskLabels = labels.filter((l) => task.labelIds.includes(l.id));
  const pics = taskPicIds(task)
    .map((id) => employees.find((e) => e.id === id))
    .filter((e): e is Employee => !!e);
  const progress = taskProgress(task);
  const cl = checklistStats(task.checklist);
  const today = todayISO();
  const overdue = !!task.dueDate && task.dueDate < today;
  const dueToday = task.dueDate === today;

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    listeners?.onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onOpen(task.id);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'z-30 opacity-40')}
    >
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        aria-label={`Buka pekerjaan ${task.title}`}
        onClick={() => onOpen(task.id)}
        onKeyDown={handleKeyDown}
        className={cn(
          'group cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow select-none',
          'hover:border-brand-300 hover:shadow-md',
          task.priority === 'TINGGI' && 'border-l-[3px] border-l-danger-500',
        )}
      >
        <div className="flex items-start gap-1.5">
          <p className="min-w-0 flex-1 text-[13px] leading-snug font-semibold text-slate-800">
            {task.title}
          </p>
          {task.isFocus && (
            <Star
              aria-label="Ditandai fokus"
              className="mt-0.5 size-3.5 shrink-0 fill-warning-500 text-warning-500"
            />
          )}
        </div>

        {(category || taskLabels.length > 0) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {category && (
              <Badge tone="outline" dotColor={category.color}>
                {category.name}
              </Badge>
            )}
            {taskLabels.slice(0, 2).map((l) => (
              <Badge key={l.id} tone="outline" dotColor={l.color}>
                {l.name}
              </Badge>
            ))}
            {taskLabels.length > 2 && <Badge tone="outline">+{taskLabels.length - 2}</Badge>}
          </div>
        )}

        {(progress > 0 || task.progressMode === 'CHECKLIST') && (
          <div className="mt-2">
            <ProgressBar value={progress} size="sm" label={`Progres ${task.title}`} showValue />
          </div>
        )}

        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          {task.dueDate && (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium',
                overdue && 'text-danger-700',
                dueToday && 'text-warning-700',
              )}
            >
              <CalendarClock className="size-3" aria-hidden />
              {formatDate(task.dueDate)}
            </span>
          )}
          {cl.total > 0 && (
            <span className="tnum inline-flex items-center gap-1" title="Checklist">
              <CheckSquare2 className="size-3" aria-hidden />
              {cl.done}/{cl.total}
            </span>
          )}
          {commentCount > 0 && (
            <span className="tnum inline-flex items-center gap-1" title="Catatan">
              <MessageSquareText className="size-3" aria-hidden />
              {commentCount}
            </span>
          )}
          {attachmentCount > 0 && (
            <span className="tnum inline-flex items-center gap-1" title="Lampiran">
              <Paperclip className="size-3" aria-hidden />
              {attachmentCount}
            </span>
          )}
          <span className="sr-only">Prioritas {PRIORITY_LABEL[task.priority]}</span>
          <span className="ml-auto">
            {pics.length > 0 && <AvatarGroup employees={pics} size="xs" max={3} />}
          </span>
        </div>
      </div>
    </div>
  );
}
