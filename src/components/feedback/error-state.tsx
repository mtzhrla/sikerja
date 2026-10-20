import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/services/errors';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  error,
  title = 'Terjadi kesalahan',
  onRetry,
  className,
  compact,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-1 text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mb-2 inline-flex items-center justify-center rounded-2xl bg-danger-50 text-danger-500',
          compact ? 'size-10' : 'size-14',
        )}
      >
        <AlertTriangle className={compact ? 'size-5' : 'size-7'} />
      </span>
      <p className={cn('font-bold text-slate-800', compact ? 'text-sm' : 'text-base')}>{title}</p>
      <p className="max-w-sm text-xs text-slate-500">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden />
          Coba lagi
        </Button>
      )}
    </div>
  );
}
