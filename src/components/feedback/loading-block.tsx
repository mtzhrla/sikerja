import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface LoadingBlockProps {
  label?: string;
  className?: string;
  compact?: boolean;
}

/** Blok loading berlabel — dipakai saat area konten sedang memuat data. */
export function LoadingBlock({ label = 'Memuat data…', className, compact }: LoadingBlockProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        className,
      )}
    >
      <Spinner label={label} />
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}
