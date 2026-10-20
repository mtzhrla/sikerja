import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { SquareKanban } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { formatPercent } from '@/lib/format';

interface ProjectProgressDonutProps {
  /** Rasio 0–1 pekerjaan selesai. */
  completionRate: number;
  totalAll: number;
}

/**
 * Donut "Project Progress" — persentase pekerjaan yang sudah berada di step
 * selesai (`kind` DONE) dari seluruh pekerjaan pada cakupan filter aktif.
 */
export function ProjectProgressDonut({ completionRate, totalAll }: ProjectProgressDonutProps) {
  if (totalAll === 0) {
    return (
      <EmptyState
        compact
        icon={SquareKanban}
        title="Belum ada pekerjaan"
        description="Progres tampil setelah ada pekerjaan pada Board."
      />
    );
  }

  const pct = Math.round(completionRate * 100);
  const data = [
    { name: 'Selesai', value: pct },
    { name: 'Sisa', value: 100 - pct },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center">
      <div
        className="relative h-full min-h-0 w-full max-w-52"
        role="img"
        aria-label={`Progres pekerjaan keseluruhan: ${pct}% selesai`}
      >
        <div aria-hidden className="h-full w-full">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="72%"
                outerRadius="96%"
                startAngle={90}
                endAngle={-270}
                stroke="#ffffff"
                strokeWidth={2}
                isAnimationActive={false}
                rootTabIndex={-1}
              >
                <Cell fill="#7c5cf5" />
                <Cell fill="#e2e8f0" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <p className="tnum text-3xl leading-none font-extrabold text-slate-900 2xl:text-4xl">
            {pct}%
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Progres</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-[#7c5cf5]" />
          Project Progress
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-slate-200" />
          Sisa ({formatPercent((100 - pct) / 100)})
        </span>
      </div>
    </div>
  );
}
