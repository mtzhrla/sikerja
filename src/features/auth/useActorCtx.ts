import { useCallback } from 'react';
import { notify } from '@/components/feedback/toaster';
import type { ActorContext } from '@/services/types';
import { useSessionStore } from './session-store';

/**
 * Guard pegawai pelaku: setiap mutasi wajib menyertakan pegawai pelaku.
 * Bila belum dipilih, buka dialog pemilih dan kembalikan null (aksi dibatalkan).
 */
export function useActorCtx(): () => ActorContext | null {
  const actorId = useSessionStore((s) => s.actorId);
  const openActorPicker = useSessionStore((s) => s.openActorPicker);
  return useCallback(() => {
    if (!actorId) {
      notify.warning(
        'Pilih pegawai pelaku terlebih dahulu.',
        'Perubahan dicatat atas nama pegawai pelaku.',
      );
      openActorPicker();
      return null;
    }
    return { employeeId: actorId };
  }, [actorId, openActorPicker]);
}
