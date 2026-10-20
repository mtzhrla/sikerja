import { cn } from '@/lib/utils';
import { clamp } from '@/lib/utils';

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  className?: string;
  size?: 'sm' | 'md';
  /** Label aksesibilitas, mis. "Progres pekerjaan". */
  label?: string;
  showValue?: boolean;
}

export function ProgressBar({
  value,
  className,
  size = 'md',
  label = 'Progres',
  showValue = false,
}: ProgressBarProps) {
  const v = clamp(Math.round(value), 0, 100);
  const tone = v >= 100 ? 'bg-success-500' : v >= 60 ? 'bg-brand-500' : 'bg-brand-400';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'w-full overflow-hidden rounded-full bg-slate-200/80',
          size === 'sm' ? 'h-1.5' : 'h-2',
        )}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', tone)}
          style={{ width: `${v}%` }}
        />
      </div>
      {showValue && (
        <span className="tnum w-9 shrink-0 text-right text-xs font-semibold text-slate-600">
          {v}%
        </span>
      )}
    </div>
  );
}
