import { ArrowUpRight, CalendarClock, SquareKanban, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import type { WorkStatsSummary } from '../lib';

interface WorkStatsProps {
  stats: WorkStatsSummary;
  attentionCount: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  ariaLabel: string;
  onClick: () => void;
  /** Warna aksen (garis atas & angka). */
  accent?: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'brand' | 'warning';
  delay?: number;
  /** Nilai berupa teks (tanggal) — ukuran sedikit lebih kecil agar tidak terpotong. */
  compactValue?: boolean;
}

function StatCard({
  label,
  value,
  sub,
  ariaLabel,
  onClick,
  accent,
  icon,
  tone = 'default',
  delay = 0,
  compactValue = false,
}: StatCardProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        'liftable pressable animate-fade-in-up group relative flex min-h-28 cursor-pointer flex-col overflow-hidden rounded-2xl p-4 text-left shadow-(--shadow-card) 2xl:min-h-32',
        tone === 'brand'
          ? 'bg-(image:--gradient-brand) text-white'
          : 'border border-slate-200/80 bg-white',
      )}
    >
      {/* Garis aksen warna status */}
      {tone !== 'brand' && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: tone === 'warning' ? '#d97706' : (accent ?? '#cbd5e1') }}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            'text-xs font-bold tracking-wide uppercase 2xl:text-sm',
            tone === 'brand' ? 'text-white/85' : 'text-slate-500',
          )}
        >
          {label}
        </p>
        {icon ?? (
          <ArrowUpRight
            aria-hidden
            className={cn(
              'size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5',
              tone === 'brand' ? 'text-white/70' : 'text-slate-300 group-hover:text-brand-500',
            )}
          />
        )}
      </div>
      <p
        className={cn(
          'tnum mt-auto pt-2 leading-none font-extrabold',
          compactValue ? 'text-xl 2xl:text-2xl' : 'text-3xl 2xl:text-4xl',
          tone === 'brand' ? 'text-white' : 'text-slate-900',
        )}
        style={tone === 'default' && accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub && (
        <p
          className={cn(
            'mt-1 truncate text-xs font-medium 2xl:text-sm',
            tone === 'brand' ? 'text-white/80' : 'text-slate-500',
          )}
        >
          {sub}
        </p>
      )}
    </button>
  );
}

/**
 * Ringkasan eksekutif pekerjaan — kartu statistik besar yang mudah dibaca dari
 * TV. Setiap kartu membuka menu Pekerjaan dengan filter/tampilan terkait;
 * rincian (fokus, aktivitas, perlu perhatian) ada di Pekerjaan › Ringkasan.
 */
export function WorkStats({ stats, attentionCount }: WorkStatsProps) {
  const navigate = useNavigate();
  let delay = 0;
  const nextDelay = () => (delay += 40);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      <StatCard
        label="Total Pekerjaan Aktif"
        value={stats.totalActive}
        sub="Semua step, di luar selesai"
        ariaLabel="Buka menu Pekerjaan"
        onClick={() => navigate(ROUTES.pekerjaan)}
        tone="brand"
        icon={<SquareKanban aria-hidden className="size-4.5 text-white/80" />}
        delay={nextDelay()}
      />
      {stats.perStep.map(({ step, count }) => (
        <StatCard
          key={step.id}
          label={step.name}
          value={count}
          ariaLabel={`Buka board dengan filter step ${step.name}`}
          onClick={() => navigate(`${ROUTES.pekerjaan}?step=${step.id}`)}
          accent={step.color}
          delay={nextDelay()}
        />
      ))}
      <StatCard
        label="Perlu Perhatian"
        value={attentionCount}
        sub="Tenggat, PIC kosong, atau terhambat"
        ariaLabel="Buka pekerjaan yang terlambat"
        onClick={() => navigate(`${ROUTES.pekerjaan}?quick=TERLAMBAT`)}
        tone="warning"
        icon={<TriangleAlert aria-hidden className="size-4.5 text-warning-500" />}
        delay={nextDelay()}
      />
      <StatCard
        label="Jatuh Tempo Terdekat"
        value={stats.nearestDue ? formatDate(stats.nearestDue.date) : '—'}
        sub={
          stats.nearestDue
            ? `${stats.nearestDue.count} pekerjaan pada tanggal ini`
            : 'Tidak ada tenggat mendatang'
        }
        ariaLabel="Buka pekerjaan yang mendekati tenggat"
        onClick={() => navigate(`${ROUTES.pekerjaan}?quick=MENDEKATI_TENGGAT`)}
        icon={<CalendarClock aria-hidden className="size-4.5 text-slate-400" />}
        compactValue
        delay={nextDelay()}
      />
    </div>
  );
}
