import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { getDataService } from '@/services';
import type {
  ChecklistGroup,
  DurationType,
  Employee,
  Priority,
  Step,
  Task,
  TaskType,
} from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useSessionStore } from '@/features/auth/session-store';
import { canDispose, canManageTask, viewerFrom } from '@/lib/permissions';
import { DURATION_LABEL, PRIORITY_LABEL } from '../lib';
import { useBoardErrorHandler } from '../useBoardActions';
import { ChecklistEditor } from './ChecklistEditor';
import { PicPicker } from './PicPicker';

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = buat baru. */
  task: Task | null;
  initialStepId?: string;
  steps: Step[];
  employees: Employee[];
}

interface FormState {
  title: string;
  activityPlan: string;
  description: string;
  stepId: string;
  durationType: DurationType;
  priority: Priority;
  categoryId: string;
  labelIds: string[];
  startDate: string;
  dueDate: string;
  progressMode: 'MANUAL' | 'CHECKLIST';
  manualProgress: number;
  picMainIds: string[];
  picIds: string[];
  isFocus: boolean;
  checklist: ChecklistGroup[];
  /** MANDIRI (untuk diri sendiri) atau DISPOSISI (ditugaskan Pimpinan). */
  taskType: TaskType;
}

function emptyForm(stepId: string): FormState {
  return {
    title: '',
    activityPlan: '',
    description: '',
    stepId,
    durationType: 'JANGKA_PENDEK',
    priority: 'SEDANG',
    categoryId: '',
    labelIds: [],
    startDate: '',
    dueDate: '',
    progressMode: 'MANUAL',
    manualProgress: 0,
    picMainIds: [],
    picIds: [],
    isFocus: false,
    checklist: [],
    taskType: 'MANDIRI',
  };
}

function formFromTask(task: Task): FormState {
  return {
    title: task.title,
    activityPlan: task.activityPlan ?? '',
    description: task.description,
    stepId: task.stepId,
    durationType: task.durationType,
    priority: task.priority,
    categoryId: task.categoryId ?? '',
    labelIds: task.labelIds,
    startDate: task.startDate ?? '',
    dueDate: task.dueDate ?? '',
    progressMode: task.progressMode,
    manualProgress: task.manualProgress,
    picMainIds: task.picMainIds,
    picIds: task.picIds,
    isFocus: task.isFocus,
    checklist: task.checklist,
    taskType: task.taskType,
  };
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  initialStepId,
  steps,
  employees,
}: TaskDialogProps) {
  const isEdit = task !== null;
  const firstStepId = steps[0]?.id ?? '';
  const [form, setForm] = useState<FormState>(() => emptyForm(initialStepId ?? firstStepId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const getCtx = useActorCtx();
  const onError = useBoardErrorHandler();
  const queryClient = useQueryClient();

  const { role, accountEmployeeId, actorId } = useSessionStore();
  const viewer = viewerFrom(role, accountEmployeeId ?? actorId, employees);
  const selfId = accountEmployeeId ?? actorId;
  const bolehDisposisi = canDispose(viewer);
  // Staf hanya dapat membuat pekerjaan MANDIRI untuk dirinya sendiri (§J).
  const kunciPicUtama = !isEdit && !bolehDisposisi;
  // Pada mode ubah, hanya pemilik/pembuat/Admin yang boleh menyunting bagian
  // kepemilikan (PIC utama, anggota, prioritas, tenggat, judul).
  const bolehKelola = !isEdit || (task !== null && canManageTask(viewer, task));

  // Reset form HANYA saat dialog dibuka atau target (task) berganti — bukan saat
  // data `steps` selesai dimuat async (mode Supabase). Tanpa penjagaan ini,
  // perubahan `firstStepId` setelah data tiba akan me-reset form & menghapus
  // judul yang sedang diketik pengguna.
  const initKey = task ? `edit:${task.id}` : 'new';
  const initedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      initedRef.current = null;
      return;
    }
    if (initedRef.current === initKey) return;
    initedRef.current = initKey;
    const fresh = task ? formFromTask(task) : emptyForm(initialStepId ?? firstStepId);
    if (!task && !bolehDisposisi && selfId) {
      // Pembuat otomatis menjadi pemilik & PIC utama pekerjaan mandiri.
      fresh.picMainIds = [selfId];
      fresh.taskType = 'MANDIRI';
    }
    setForm(fresh);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initKey, task, initialStepId, firstStepId]);

  // Buat baru: bila step default belum termuat saat dialog dibuka (data async),
  // isi stepId begitu steps tersedia — tanpa menimpa pilihan/isian pengguna.
  useEffect(() => {
    if (open && !isEdit && !initialStepId && firstStepId) {
      setForm((f) => (f.stepId ? f : { ...f, stepId: firstStepId }));
    }
  }, [open, isEdit, initialStepId, firstStepId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Judul wajib diisi.';
    if (!form.stepId) next.stepId = 'Pilih step.';
    if (form.startDate && form.dueDate && form.startDate > form.dueDate) {
      next.dueDate = 'Target selesai tidak boleh sebelum tanggal mulai.';
    }
    if (form.manualProgress < 0 || form.manualProgress > 100) {
      next.manualProgress = 'Progres 0–100.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    const ctx = getCtx();
    if (!ctx) return;
    setSaving(true);
    const payload = {
      title: form.title,
      activityPlan: form.activityPlan,
      description: form.description,
      durationType: form.durationType,
      priority: form.priority,
      categoryId: form.categoryId || null,
      labelIds: form.labelIds,
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      progressMode: form.progressMode,
      manualProgress: form.manualProgress,
      picMainIds: form.picMainIds,
      picMainId: form.picMainIds[0] ?? null,
      picIds: form.picIds.filter((id) => !form.picMainIds.includes(id)),
      checklist: form.checklist,
      isFocus: form.isFocus,
    };
    try {
      if (isEdit && task) {
        await getDataService().tasks.update(task.id, payload, task.version, ctx);
        if (form.stepId !== task.stepId) {
          await getDataService().tasks.move(task.id, { stepId: form.stepId, index: 9999 }, ctx);
        }
        notify.success('Pekerjaan diperbarui.');
      } else {
        await getDataService().tasks.create(
          { ...payload, stepId: form.stepId, taskType: form.taskType },
          ctx,
        );
        notify.success(
          form.taskType === 'DISPOSISI' ? 'Disposisi dibuat.' : 'Pekerjaan dibuat.',
          form.title,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onOpenChange(false);
    } catch (err) {
      onError(err, isEdit ? 'Gagal memperbarui pekerjaan' : 'Gagal membuat pekerjaan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={isEdit ? 'Ubah Pekerjaan' : 'Pekerjaan Baru'}
      description={
        isEdit
          ? 'Seluruh perubahan dicatat pada riwayat.'
          : 'Isi rincian pekerjaan; semua field kecuali judul bersifat opsional.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} loading={saving}>
            {isEdit ? 'Simpan perubahan' : 'Buat pekerjaan'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Judul pekerjaan" required error={errors.title}>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="cth. Rekonsiliasi penyaluran Termin 2"
            maxLength={160}
          />
        </Field>

        <Field label="Rencana Kegiatan">
          <Textarea
            value={form.activityPlan}
            onChange={(e) => set('activityPlan', e.target.value)}
            placeholder="Tulis rencana kegiatan untuk pekerjaan ini..."
          />
        </Field>

        <Field label="Deskripsi">
          <Textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Uraian, konteks, atau tautan referensi…"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Step" required error={errors.stepId}>
            <Select value={form.stepId} onChange={(e) => set('stepId', e.target.value)}>
              {steps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jenis durasi">
            <Select
              value={form.durationType}
              onChange={(e) => set('durationType', e.target.value as DurationType)}
            >
              {(Object.keys(DURATION_LABEL) as DurationType[]).map((d) => (
                <option key={d} value={d}>
                  {DURATION_LABEL[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioritas">
            <Select
              value={form.priority}
              onChange={(e) => set('priority', e.target.value as Priority)}
            >
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tanggal mulai">
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
          </Field>
          <Field label="Target selesai" error={errors.dueDate}>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
            />
          </Field>
          {/* Jenis pekerjaan — hanya Pimpinan/Admin yang dapat mendisposisikan */}
          {!isEdit && bolehDisposisi && (
            <Field
              label="Jenis pekerjaan"
              hint="Disposisi menugaskan pegawai lain sebagai PIC utama."
              className="sm:col-span-2"
            >
              <div
                role="group"
                className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1"
              >
                {(
                  [
                    { value: 'MANDIRI', label: 'Mandiri (untuk saya)' },
                    { value: 'DISPOSISI', label: 'Disposisi ke pegawai' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={form.taskType === opt.value}
                    onClick={() => {
                      set('taskType', opt.value);
                      if (opt.value === 'MANDIRI' && selfId) set('picMainIds', [selfId]);
                    }}
                    className={cn(
                      'pressable min-h-9 cursor-pointer rounded-lg px-3 text-sm font-semibold transition-colors',
                      form.taskType === opt.value
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field
            label="PIC utama"
            hint={
              kunciPicUtama
                ? 'Staf membuat pekerjaan untuk dirinya sendiri; undang rekan sebagai anggota tim.'
                : 'Bisa lebih dari satu pegawai.'
            }
            className="sm:col-span-2"
          >
            <PicPicker
              employees={employees}
              value={form.picMainIds}
              disabled={kunciPicUtama || !bolehKelola}
              onChange={(ids) => {
                set('picMainIds', ids);
                // Cegah duplikasi: pegawai yang jadi PIC utama keluar dari anggota.
                setForm((f) => ({ ...f, picIds: f.picIds.filter((id) => !ids.includes(id)) }));
              }}
              placeholder="Pilih PIC utama…"
            />
          </Field>
          <Field
            label="Anggota tim"
            hint="Rekan yang diundang dapat memperbarui progres, checklist, komentar, dan lampiran."
            className="sm:col-span-2"
          >
            <PicPicker
              employees={employees}
              value={form.picIds}
              disabled={!bolehKelola}
              onChange={(ids) => set('picIds', ids)}
              excludeIds={form.picMainIds}
              placeholder="Undang rekan sebagai anggota tim…"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Mode progres"
            hint={
              form.progressMode === 'CHECKLIST'
                ? 'Progres dihitung otomatis: item selesai / total × 100.'
                : 'Progres diisi manual (0–100).'
            }
          >
            <Select
              value={form.progressMode}
              onChange={(e) => set('progressMode', e.target.value as 'MANUAL' | 'CHECKLIST')}
            >
              <option value="MANUAL">Manual</option>
              <option value="CHECKLIST">Otomatis dari checklist</option>
            </Select>
          </Field>
          {form.progressMode === 'MANUAL' && (
            <Field label="Progres (%)" error={errors.manualProgress}>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.manualProgress}
                onChange={(e) => set('manualProgress', Number(e.target.value))}
              />
            </Field>
          )}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-slate-800">Fokus Hari Ini</p>
            <p className="text-xs text-slate-500">
              Tampilkan pekerjaan ini pada panel fokus Dashboard.
            </p>
          </div>
          <Switch
            checked={form.isFocus}
            onCheckedChange={(v) => set('isFocus', v)}
            aria-label="Tandai fokus hari ini"
          />
        </div>

        <Field label="Checklist">
          <ChecklistEditor value={form.checklist} onChange={(v) => set('checklist', v)} />
        </Field>
      </div>
    </Modal>
  );
}
