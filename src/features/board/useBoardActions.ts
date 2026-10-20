import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { notify } from '@/components/feedback/toaster';
import { errorMessage, isAppError } from '@/services/errors';
import { getDataService } from '@/services';
import type { Task } from '@/services/types';

/**
 * Aksi board dengan penanganan error konsisten.
 * Konflik (data berubah oleh pengguna lain) → beri tahu + muat data terbaru;
 * tidak pernah menimpa perubahan terbaru secara diam-diam.
 */
export function useBoardErrorHandler() {
  const queryClient = useQueryClient();
  return useCallback(
    (err: unknown, fallbackTitle: string) => {
      if (isAppError(err) && err.code === 'CONFLICT') {
        notify.warning('Data telah diubah pengguna lain', 'Menampilkan versi terbaru.');
        void queryClient.invalidateQueries();
        return;
      }
      notify.error(fallbackTitle, errorMessage(err));
    },
    [queryClient],
  );
}

/** Pindahkan kartu secara optimistik lalu commit ke service. */
export function useMoveTask() {
  const queryClient = useQueryClient();
  const onError = useBoardErrorHandler();
  return useCallback(
    async (
      taskId: string,
      to: { stepId: string; index: number },
      ctx: { employeeId: string },
    ) => {
      // Optimistik: perbarui seluruh cache query 'tasks' agar kartu langsung pindah.
      const snapshots = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData(
          key,
          data.map((t) =>
            t.id === taskId ? { ...t, stepId: to.stepId, sortOrder: to.index - 0.5 } : t,
          ),
        );
      }
      try {
        await getDataService().tasks.move(taskId, to, ctx);
      } catch (err) {
        onError(err, 'Gagal memindahkan kartu');
      } finally {
        await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
    },
    [queryClient, onError],
  );
}
