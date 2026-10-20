import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';
import type { ProjectStatusBucket } from '../lib';

interface ProjectStatusKpisProps {
  buckets: ProjectStatusBucket[];
}

/**
 * 4 kartu KPI status pekerjaan — pengganti KPI penyaluran PIP pada
 * Dashboard. Klik membuka Board dengan filter step terkait (Will Do/To Do)
 * atau tanpa filter untuk bucket gabungan (Running/Ended).
 */
export function ProjectStatusKpis({ buckets }: ProjectStatusKpisProps) {
  const navigate = useNavigate();
  let delay = 0;
  const nextDelay = () => (delay += 40);

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {buckets.map((b) => (
        <button
          key={b.key}
          type="button"
          aria-label={`Buka Pekerjaan — ${b.label}`}
          onClick={() => navigate(b.stepId ? `${ROUTES.pekerjaan}?step=${b.stepId}` : ROUTES.pekerjaan)}
          style={{ animationDelay: `${nextDelay()}ms` }}
          className={cn(
            'liftable pressable animate-fade-in-up group relative flex min-h-28 cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-(--shadow-card) 2xl:min-h-32',
          )}
        >
          <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: b.color }} />
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-bold tracking-wide text-slate-500 uppercase">{b.label}</p>
            <ArrowUpRight
              aria-hidden
              className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-500"
            />
          </div>
          <p
            className="tnum mt-auto pt-2 text-3xl leading-none font-extrabold text-slate-900 2xl:text-4xl"
            style={{ color: b.color }}
          >
            {b.count}
          </p>
        </button>
      ))}
    </div>
  );
}
