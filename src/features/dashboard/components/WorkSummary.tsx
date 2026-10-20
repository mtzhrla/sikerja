import { ChevronRight, SquareKanban } from 'lucide-react';
import { useNavigate } from 'react-router';
import { EmptyState } from '@/components/feedback/empty-state';
import { ROUTES } from '@/lib/routes';
import type { Step, Task } from '@/services/types';

interface WorkSummaryProps {
  steps: Step[];
  tasks: Task[];
}

/**
 * Ringkasan pekerjaan — mengikuti step board secara dinamis (nama & urutan
 * dari board, tidak hard-coded). Klik membuka board dengan filter step.
 */
export function WorkSummary({ steps, tasks }: WorkSummaryProps) {
  const navigate = useNavigate();
  if (steps.length === 0) {
    return (
      <EmptyState
        compact
        icon={SquareKanban}
        title="Belum ada step"
        description="Step board akan tampil di sini."
      />
    );
  }
  const counts = new Map<string, number>();
  for (const t of tasks) {
    counts.set(t.stepId, (counts.get(t.stepId) ?? 0) + 1);
  }
  return (
    <ul className="divide-y divide-slate-100">
      {steps.map((step) => (
        <li key={step.id}>
          <button
            type="button"
            onClick={() => navigate(`${ROUTES.pekerjaan}?step=${step.id}`)}
            className="group flex w-full cursor-pointer items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-slate-50"
            aria-label={`Buka board dengan filter step ${step.name}`}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: step.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">
              {step.name}
            </span>
            <span className="tnum rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
              {counts.get(step.id) ?? 0}
            </span>
            <ChevronRight
              aria-hidden
              className="size-4 text-slate-300 transition-colors group-hover:text-slate-500"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
