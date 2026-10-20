import { useEffect, useState } from 'react';
import { notify } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Step, StepKind } from '@/services/types';
import { getDataService } from '@/services';
import { useQueryClient } from '@tanstack/react-query';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { STEP_COLORS } from '../lib';
import { useBoardErrorHandler } from '../useBoardActions';

interface StepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = buat baru. */
  step: Step | null;
}

const KIND_OPTIONS: Array<{ value: StepKind; label: string; hint: string }> = [
  { value: 'NORMAL', label: 'Normal', hint: 'Step biasa.' },
  {
    value: 'BLOCKED',
    label: 'Terhambat',
    hint: 'Kartu pada step ini dianggap terhambat dan masuk "Perlu Perhatian".',
  },
  {
    value: 'DONE',
    label: 'Selesai',
    hint: 'Kartu pada step ini dianggap selesai (untuk ringkasan & aktivitas).',
  },
];

export function StepDialog({ open, onOpenChange, step }: StepDialogProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<StepKind>('NORMAL');
  const [color, setColor] = useState<string>(STEP_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const getCtx = useActorCtx();
  const onError = useBoardErrorHandler();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setName(step?.name ?? '');
      setKind(step?.kind ?? 'NORMAL');
      setColor(step?.color ?? STEP_COLORS[0]);
      setError(null);
    }
  }, [open, step]);

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Nama step wajib diisi.');
      return;
    }
    const ctx = getCtx();
    if (!ctx) return;
    setSaving(true);
    try {
      if (step) {
        await getDataService().board.updateStep(step.id, { name, kind, color }, step.version, ctx);
        notify.success('Step diperbarui.');
      } else {
        await getDataService().board.createStep({ name, kind, color }, ctx);
        notify.success('Step ditambahkan.');
      }
      await queryClient.invalidateQueries({ queryKey: ['steps'] });
      onOpenChange(false);
    } catch (err) {
      onError(err, step ? 'Gagal memperbarui step' : 'Gagal menambah step');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={step ? 'Ubah Step' : 'Tambah Step'}
      description="Nama dan urutan step mengikuti kebutuhan tim; ringkasan Dashboard menyesuaikan otomatis."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nama step" required error={error ?? undefined}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="cth. Review"
            maxLength={40}
          />
        </Field>
        <Field
          label="Perilaku step"
          hint={KIND_OPTIONS.find((k) => k.value === kind)?.hint}
        >
          <Select value={kind} onChange={(e) => setKind(e.target.value as StepKind)}>
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Warna">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Warna step">
            {STEP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Warna ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  'size-7 cursor-pointer rounded-full transition-transform hover:scale-110',
                  color === c && 'ring-2 ring-slate-900 ring-offset-2',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
