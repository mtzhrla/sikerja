import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Category, Employee, Label, Step, Task } from '@/services/types';
import { StepColumn } from './StepColumn';
import { TaskCard } from './TaskCard';

interface KanbanBoardProps {
  steps: Step[];
  columns: Map<string, Task[]>;
  employees: Employee[];
  categories: Category[];
  labels: Label[];
  countsByTask: Map<string, { comments: number; attachments: number }>;
  onOpenTask: (taskId: string) => void;
  onAddTask: (stepId: string) => void;
  onAddStep: () => void;
  onEditStep: (step: Step) => void;
  onDeleteStep: (step: Step) => void;
  onMoveStep: (step: Step, direction: -1 | 1) => void;
  onMoveTask: (taskId: string, to: { stepId: string; index: number }) => void;
  /** Saat filter aktif, urutan tampilan ≠ urutan asli — dnd dimatikan. */
  dragDisabled?: boolean;
}

export function KanbanBoard({
  steps,
  columns,
  employees,
  categories,
  labels,
  countsByTask,
  onOpenTask,
  onAddTask,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onMoveStep,
  onMoveTask,
  dragDisabled = false,
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findTask(id: string): Task | null {
    for (const tasks of columns.values()) {
      const found = tasks.find((t) => t.id === id);
      if (found) return found;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveTask(findTask(String(event.active.id)));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const task = findTask(taskId);
    if (!task) return;

    const overId = String(over.id);
    let targetStepId: string;
    let targetIndex: number;

    if (overId.startsWith('col:')) {
      targetStepId = overId.slice(4);
      targetIndex = columns.get(targetStepId)?.length ?? 0;
    } else {
      const overTask = findTask(overId);
      if (!overTask) return;
      targetStepId = overTask.stepId;
      const list = columns.get(targetStepId) ?? [];
      targetIndex = list.findIndex((t) => t.id === overId);
      if (targetIndex < 0) targetIndex = list.length;
    }

    if (task.stepId === targetStepId) {
      const list = columns.get(targetStepId) ?? [];
      const currentIndex = list.findIndex((t) => t.id === taskId);
      if (currentIndex === targetIndex || (overId.startsWith('col:') && currentIndex === list.length - 1)) {
        return; // tidak berpindah
      }
    }

    onMoveTask(taskId, { stepId: targetStepId, index: targetIndex });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div
        className="scrollbar-thin flex items-stretch gap-3 overflow-x-auto pb-3"
        aria-label="Board kanban"
      >
        {steps.map((step, i) => (
          <StepColumn
            key={step.id}
            step={step}
            tasks={columns.get(step.id) ?? []}
            employees={employees}
            categories={categories}
            labels={labels}
            countsByTask={countsByTask}
            onOpenTask={onOpenTask}
            onAddTask={onAddTask}
            onEditStep={onEditStep}
            onDeleteStep={onDeleteStep}
            onMoveStep={onMoveStep}
            canMoveLeft={i > 0}
            canMoveRight={i < steps.length - 1}
            dragDisabled={dragDisabled}
          />
        ))}
        <div className="w-64 shrink-0 pt-1">
          <Button variant="outline" className="w-full border-dashed" onClick={onAddStep}>
            <Plus className="size-4" aria-hidden />
            Tambah step
          </Button>
        </div>
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="w-72 rotate-2 2xl:w-80">
            <TaskCard
              task={activeTask}
              employees={employees}
              categories={categories}
              labels={labels}
              onOpen={() => undefined}
              dragDisabled
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
