import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** Konten dapat scroll bila tinggi melebihi layar. */
  scrollBody?: boolean;
}

/** Modal standar aplikasi (Radix Dialog): fokus terkunci, Esc menutup, aksesibel. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  scrollBody = true,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in-up" />
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <DialogPrimitive.Content
            onOpenAutoFocus={(e) => {
              // Fokus ke elemen pertama yang dapat difokus di dalam konten.
              const target = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
                'input, select, textarea, button:not([data-modal-close])',
              );
              if (target) {
                e.preventDefault();
                target.focus();
              }
            }}
            className={cn(
              'flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-(--shadow-pop) outline-none sm:rounded-2xl',
              'animate-fade-in-up',
              SIZE[size],
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-base font-bold text-slate-900">
                  {title}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="mt-0.5 text-xs text-slate-500">
                    {description}
                  </DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">
                    {typeof title === 'string' ? title : 'Dialog'}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close
                data-modal-close
                aria-label="Tutup dialog"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>
            <div className={cn('px-5 py-4', scrollBody && 'scrollbar-thin overflow-y-auto')}>
              {children}
            </div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
                {footer}
              </div>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
