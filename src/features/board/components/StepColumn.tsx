import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowLeftRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';
import type { Category, Employee, Label, Step, Task } from '@/services/types';
import { TaskCard } from './TaskCard';

interface StepColumnProps {
  step: Step;
  tasks: Task[];
  employees: Employee[];
  categories: Category[];
  labels: Label[];
  countsByTask: Map<string, { comments: number; attachments: number }>;
  onOpenTask: (taskId: string) => void;
  onAddTask: (stepId: string) => void;
  onEditStep: (step: Step) => void;
  onDeleteStep: (step: Step) => void;
  onMoveStep: (step: Step, direction: -1 | 1) => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  dragDisabled?: boolean;
}

const KIND_LABEL: Record<Step['kind'], string | null> = {
  NORMAL: null,
  BLOCKED: 'Step terhambat',
  DONE: 'Step selesai',
};

export function StepColumn({
  step,
  tasks,
  employees,
  categories,
  labels,
  countsByTask,
  onOpenTask,
  onAddTask,
  onEditStep,
  onDeleteStep,
  onMoveStep,
  canMoveLeft,
  canMoveRight,
  dragDisabled,
}: StepColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${step.id}`,
    data: { type: 'column', stepId: step.id },
  });

  return (
    <section
      aria-label={`Step ${step.name}`}
      className="flex w-72 shrink-0 flex-col rounded-2xl bg-slate-200/50 2xl:w-80"
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: step.color }}
        />
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
          {step.name}
          {KIND_LABEL[step.kind] && <span className="sr-only"> — {KIND_LABEL[step.kind]}</span>}
        </h3>
        <span className="tnum rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600">
          {tasks.length}
        </span>
        <DropdownRoot>
          <DropdownTrigger asChild>
            <button
              type="button"
              aria-label={`Menu step ${step.name}`}
              className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem icon={<Pencil />} onSelect={() => onEditStep(step)}>
              Ubah step
            </DropdownItem>
            <DropdownItem
              icon={<ArrowLeftRight />}
              disabled={!canMoveLeft}
              onSelect={() => onMoveStep(step, -1)}
            >
              Geser ke kiri
            </DropdownItem>
            <DropdownItem
              icon={<ArrowLeftRight />}
              disabled={!canMoveRight}
              onSelect={() => onMoveStep(step, 1)}
            >
              Geser ke kanan
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem danger icon={<Trash2 />} onSelect={() => onDeleteStep(step)}>
              Hapus step
            </DropdownItem>
          </DropdownContent>
        </DropdownRoot>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          'scrollbar-thin flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2 transition-colors',
          isOver && 'rounded-xl bg-brand-100/50',
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => {
            const counts = countsByTask.get(task.id);
            return (
              <TaskCard
                key={task.id}
                task={task}
                employees={employees}
                categories={categories}
                labels={labels}
                commentCount={counts?.comments ?? 0}
                attachmentCount={counts?.attachments ?? 0}
                onOpen={onOpenTask}
                dragDisabled={dragDisabled}
              />
            );
          })}
        </SortableContext>
        {tasks.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
            Belum ada kartu
          </p>
        )}
      </div>

      <div className="px-2.5 pb-2.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-500"
          onClick={() => onAddTask(step.id)}
        >
          <Plus className="size-4" aria-hidden />
          Tambah pekerjaan
        </Button>
      </div>
    </section>
  );
}
