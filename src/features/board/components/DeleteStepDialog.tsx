import { useEffect, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { getDataService } from '@/services';
import type { Step, Task } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useBoardErrorHandler } from '../useBoardActions';

interface DeleteStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: Step | null;
  steps: Step[];
  tasks: Task[];
}

/**
 * Pengamanan hapus step:
 * - step kosong → konfirmasi, lalu soft delete;
 * - step berisi kartu → wajib pilih step tujuan; seluruh kartu dipindahkan
 *   lebih dulu sehingga tidak ada kartu yang hilang.
 */
export function DeleteStepDialog({ open, onOpenChange, step, steps, tasks }: DeleteStepDialogProps) {
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const getCtx = useActorCtx();
  const onError = useBoardErrorHandler();
  const queryClient = useQueryClient();

  const cardCount = useMemo(
    () => (step ? tasks.filter((t) => t.stepId === step.id && !t.deletedAt).length : 0),
    [step, tasks],
  );
  const targets = useMemo(
    () => steps.filter((s) => s.id !== step?.id && !s.deletedAt),
    [steps, step],
  );

  useEffect(() => {
    if (open) setTargetId('');
  }, [open]);

  if (!step) return null;

  async function handleDelete() {
    if (!step) return;
    if (cardCount > 0 && !targetId) return;
    const ctx = getCtx();
    if (!ctx) return;
    setBusy(true);
    try {
      await getDataService().board.deleteStep(
        step.id,
        cardCount > 0 ? { moveCardsToStepId: targetId } : {},
        ctx,
      );
      notify.success(
        `Step "${step.name}" dihapus.`,
        cardCount > 0
          ? `${cardCount} kartu dipindahkan ke "${targets.find((t) => t.id === targetId)?.name}".`
          : 'Step dapat dipulihkan Admin dari Data Terhapus.',
      );
      await queryClient.invalidateQueries({ queryKey: ['steps'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onOpenChange(false);
    } catch (err) {
      onError(err, 'Gagal menghapus step');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={`Hapus step "${step.name}"?`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={() => void handleDelete()}
            loading={busy}
            disabled={cardCount > 0 && !targetId}
          >
            {cardCount > 0 ? 'Pindahkan & hapus' : 'Hapus step'}
          </Button>
        </>
      }
    >
      {cardCount === 0 ? (
        <p className="text-sm text-slate-600">
          Step ini kosong. Step yang dihapus dapat dipulihkan Admin dari Data Terhapus.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-warning-100 bg-warning-50 px-3 py-2.5 text-sm text-warning-700">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Step ini berisi <strong>{cardCount} kartu</strong>. Kartu tidak boleh hilang — pilih
              step tujuan pemindahan terlebih dahulu.
            </p>
          </div>
          <Field label="Pindahkan seluruh kartu ke" required>
            <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Pilih step tujuan…</option>
              {targets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
