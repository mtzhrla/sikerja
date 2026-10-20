import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { notify } from '@/components/feedback/toaster';
import { ROUTES } from '@/lib/routes';
import { getDataService } from '@/services';
import { useSessionStore } from '@/features/auth/session-store';

/**
 * Jembatan realtime → cache query.
 * Setiap ChangeEvent menginvalidasi query dengan prefix topik yang sama,
 * sehingga perubahan tampil tanpa reload penuh.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const session = useSessionStore((s) => s.session);

  useEffect(() => {
    if (!session) return undefined;
    const service = getDataService();
    const unsubscribe = service.realtime.subscribe((event) => {
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === event.topic,
      });
      if (event.topic === 'sessions') {
        const store = useSessionStore.getState();
        const own = store.session;
        void store.onSessionsChanged(event.revokedSessionId).then(() => {
          const after = useSessionStore.getState().session;
          if (own && !after) {
            notify.warning('Sesi Anda telah dicabut Admin.', 'Silakan masuk kembali.');
            navigate(ROUTES.login, { replace: true });
          }
        });
      }
    });
    return unsubscribe;
  }, [queryClient, navigate, session]);

  return null;
}
