import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { getDataService } from '@/services';
import type { Task } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useBoardErrorHandler } from '../useBoardActions';

interface DeleteTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onDeleted?: () => void;
}

/** Hapus pekerjaan (soft delete) — wajib alasan; pemulihan & hapus permanen di Admin. */
export function DeleteTaskDialog({ open, onOpenChange, task, onDeleted }: DeleteTaskDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const getCtx = useActorCtx();
  const onError = useBoardErrorHandler();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!task) return null;

  async function handleDelete() {
    if (!task || !reason.trim()) return;
    const ctx = getCtx();
    if (!ctx) return;
    setBusy(true);
    try {
      await getDataService().tasks.softDelete(task.id, reason, ctx);
      notify.success('Pekerjaan dihapus.', 'Dapat dipulihkan Admin dari Data Terhapus.');
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      onError(err, 'Gagal menghapus pekerjaan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={`Hapus "${task.title}"?`}
      description="Pekerjaan dipindahkan ke Data Terhapus (bukan hapus permanen)."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleDelete()}
            loading={busy}
            disabled={!reason.trim()}
          >
            Hapus pekerjaan
          </Button>
        </>
      }
    >
      <Field label="Alasan penghapusan" required>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="cth. Duplikat dengan pekerjaan lain"
          rows={2}
        />
      </Field>
    </Modal>
  );
}
