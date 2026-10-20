import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true → tombol merah (aksi destruktif). */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Hook konfirmasi berbasis promise: `const ok = await confirm({...})`. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm harus dipakai di dalam <ConfirmProvider>');
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const close = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirmVariant: ButtonVariant = options?.danger ? 'danger' : 'primary';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={
                options?.danger
                  ? 'inline-flex size-8 items-center justify-center rounded-full bg-danger-50 text-danger-600'
                  : 'inline-flex size-8 items-center justify-center rounded-full bg-brand-50 text-brand-600'
              }
            >
              {options?.danger ? (
                <AlertTriangle className="size-4" />
              ) : (
                <HelpCircle className="size-4" />
              )}
            </span>
            {options?.title}
          </span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {options?.cancelLabel ?? 'Batal'}
            </Button>
            <Button variant={confirmVariant} onClick={() => close(true)} autoFocus>
              {options?.confirmLabel ?? 'Ya, lanjutkan'}
            </Button>
          </>
        }
      >
        {options?.description && <div className="text-sm text-slate-600">{options.description}</div>}
      </Modal>
    </ConfirmContext.Provider>
  );
}
