import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string | undefined;
  required?: boolean;
  className?: string;
}

interface InjectedControlProps {
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Pembungkus kontrol form: label, petunjuk, dan pesan error dengan
 * pengait aria otomatis (aksesibilitas).
 */
export function Field({ label, children, hint, error, required, className }: FieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  const describedBy = error || hint ? descId : undefined;

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<InjectedControlProps>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-slate-700">
        {label}
        {required && (
          <span aria-hidden className="text-danger-600">
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {(error || hint) && (
        <p
          id={descId}
          role={error ? 'alert' : undefined}
          className={cn('text-xs', error ? 'text-danger-600' : 'text-slate-500')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
