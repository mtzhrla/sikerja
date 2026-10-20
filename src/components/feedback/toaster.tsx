import { Toaster as SonnerToaster, toast } from 'sonner';

/** Pusat notifikasi aplikasi (sukses/gagal/info). */
export function AppToaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'font-sans! rounded-xl!',
        },
      }}
    />
  );
}

/** Helper feedback konsisten. */
export const notify = {
  success(message: string, description?: string) {
    toast.success(message, { description });
  },
  error(message: string, description?: string) {
    toast.error(message, { description });
  },
  info(message: string, description?: string) {
    toast.info(message, { description });
  },
  warning(message: string, description?: string) {
    toast.warning(message, { description });
  },
};
