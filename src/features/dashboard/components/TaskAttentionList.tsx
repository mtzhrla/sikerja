import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { AvatarGroup } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { taskProgress } from '@/lib/progress';
import { ROUTES } from '@/lib/routes';
import type { Employee, Task } from '@/services/types';
import { taskPicIds } from '@/features/board/lib';
import type { AttentionReason } from '../lib';

export interface AttentionItem {
  task: Task;
  reasons: AttentionReason[];
  extraBadge?: { label: string; tone: 'info' | 'brand' } | null;
}

interface TaskAttentionListProps {
  items: AttentionItem[];
  employees: Employee[];
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon?: LucideIcon;
  limit?: number;
}

/** Daftar ringkas pekerjaan dengan alasan — dipakai "Perlu Perhatian" & "Fokus Hari Ini". */
export function TaskAttentionList({
  items,
  employees,
  emptyTitle,
  emptyDescription,
  emptyIcon = CheckCircle2,
  limit = 6,
}: TaskAttentionListProps) {
  const navigate = useNavigate();
  if (items.length === 0) {
    return (
      <EmptyState compact icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
    );
  }
  const byId = new Map(employees.map((e) => [e.id, e]));
  const shown = items.slice(0, limit);

  return (
    <ul className="divide-y divide-slate-100">
      {shown.map(({ task, reasons, extraBadge }) => {
        const pics = taskPicIds(task)
          .map((id) => byId.get(id))
          .filter((e): e is Employee => !!e);
        const progress = taskProgress(task);
        const visibleReasons = reasons.slice(0, 2);
        const more = reasons.length - visibleReasons.length;
        return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => navigate(`${ROUTES.pekerjaan}?task=${task.id}`)}
              className="w-full cursor-pointer px-1 py-2.5 text-left transition-colors hover:bg-slate-50"
            >
              <p className="truncate text-sm font-semibold text-slate-800">{task.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {extraBadge && <Badge tone={extraBadge.tone}>{extraBadge.label}</Badge>}
                {visibleReasons.map((r) => (
                  <Badge key={r.key} tone={r.tone}>
                    {r.label}
                  </Badge>
                ))}
                {more > 0 && <Badge tone="outline">+{more}</Badge>}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
                {task.dueDate && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3.5" aria-hidden />
                    {formatDate(task.dueDate)}
                  </span>
                )}
                <span className="tnum">{progress}%</span>
                <span className="ml-auto">
                  {pics.length > 0 ? (
                    <AvatarGroup employees={pics} size="xs" max={3} />
                  ) : (
                    <span className="text-slate-400 italic">Tanpa PIC</span>
                  )}
                </span>
              </div>
            </button>
          </li>
        );
      })}
      {items.length > shown.length && (
        <li className="px-1 pt-2 text-xs font-medium text-slate-400">
          +{items.length - shown.length} pekerjaan lain — buka board untuk selengkapnya.
        </li>
      )}
    </ul>
  );
}
