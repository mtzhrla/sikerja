import {
  CheckCircle2,
  Database,
  History,
  MoveRight,
  Pencil,
  Plus,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { EmptyState } from '@/components/feedback/empty-state';
import { formatRelative } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import type { ActivityEvent, ActivityType, Employee } from '@/services/types';

const TYPE_META: Record<ActivityType, { icon: LucideIcon; className: string; verb: string }> = {
  TASK_CREATED: { icon: Plus, className: 'bg-brand-50 text-brand-600', verb: 'membuat' },
  TASK_UPDATED: { icon: Pencil, className: 'bg-slate-100 text-slate-500', verb: 'memperbarui' },
  PROGRESS_CHANGED: {
    icon: TrendingUp,
    className: 'bg-info-50 text-info-600',
    verb: 'memperbarui progres',
  },
  TASK_MOVED: { icon: MoveRight, className: 'bg-warning-50 text-warning-600', verb: 'memindahkan' },
  PIC_CHANGED: { icon: Users, className: 'bg-brand-50 text-brand-600', verb: 'mengubah PIC' },
  TASK_COMPLETED: {
    icon: CheckCircle2,
    className: 'bg-success-50 text-success-600',
    verb: 'menyelesaikan',
  },
  DISTRIBUTION_UPDATED: {
    icon: Database,
    className: 'bg-brand-50 text-brand-600',
    verb: 'memperbarui data penyaluran',
  },
};

interface ActivityFeedProps {
  events: ActivityEvent[];
  employees: Employee[];
}

/** Aktivitas terbaru — proyeksi ramah pengguna dari audit log. */
export function ActivityFeed({ events, employees }: ActivityFeedProps) {
  const navigate = useNavigate();
  if (events.length === 0) {
    return (
      <EmptyState
        compact
        icon={History}
        title="Belum ada aktivitas"
        description="Aktivitas tim akan tampil di sini."
      />
    );
  }
  const byId = new Map(employees.map((e) => [e.id, e]));
  return (
    <ul className="space-y-1">
      {events.map((evt) => {
        const meta = TYPE_META[evt.type];
        const employee = evt.employeeId ? byId.get(evt.employeeId) : null;
        const Icon = meta.icon;
        const clickable = !!evt.taskId;
        const content = (
          <>
            <span
              aria-hidden
              className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full ${meta.className}`}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-snug text-slate-700">
                <strong className="font-bold text-slate-900">
                  {employee?.displayName ?? 'Sistem'}
                </strong>{' '}
                {meta.verb}
                {evt.type !== 'DISTRIBUTION_UPDATED' && (
                  <>
                    {' '}
                    <span className="font-semibold text-slate-800">“{evt.title}”</span>
                  </>
                )}
                {evt.type === 'DISTRIBUTION_UPDATED' && (
                  <>
                    {' '}
                    <span className="font-semibold text-slate-800">{evt.title}</span>
                  </>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">
                {evt.detail && <span className="mr-2 text-slate-500">{evt.detail}</span>}
                {formatRelative(evt.at)}
              </span>
            </span>
          </>
        );
        return (
          <li key={evt.id}>
            {clickable ? (
              <button
                type="button"
                onClick={() => navigate(`${ROUTES.pekerjaan}?task=${evt.taskId}`)}
                className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-slate-50"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-start gap-2.5 px-1 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
