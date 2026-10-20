import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import type { ChecklistGroup, DurationType, Priority, TaskTemplate } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { qk, useCategories, useSteps } from '@/hooks/queries';
import { ChecklistEditor } from '@/features/board/components/ChecklistEditor';
import { DURATION_LABEL, PRIORITY_LABEL } from '@/features/board/lib';

export function TemplatesSection() {
  const templatesQ = useQuery({
    queryKey: qk.templates(true),
    queryFn: () => getDataService().templates.list({ includeInactive: true }),
  });
  const categoriesQ = useCategories(true);
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const confirm = useConfirm();
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  async function remove(tpl: TaskTemplate) {
    const ok = await confirm({
      title: `Hapus template "${tpl.name}"?`,
      description: 'Pekerjaan yang sudah dibuat dari template ini tidak terpengaruh.',
      confirmLabel: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      await getDataService().templates.remove(tpl.id, ctx);
      notify.success('Template dihapus.');
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    } catch (err) {
      notify.error('Gagal menghapus template', errorMessage(err));
    }
  }

  if (templatesQ.isLoading) return <LoadingBlock label="Memuat template…" />;
  const templates = templatesQ.data ?? [];
  const categories = categoriesQ.data ?? [];

  return (
    <Card>
      <CardHeader
        title="Template Pekerjaan"
        description="Cetakan pekerjaan berulang — dipakai saat membuat pekerjaan baru di board."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Tambah template
          </Button>
        }
      />
      <div className="p-4 pt-2">
        {templates.length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title="Belum ada template"
            description="Buat template untuk pekerjaan yang sering berulang."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {templates.map((tpl) => {
              const category = categories.find((c) => c.id === tpl.categoryId);
              const itemCount = tpl.checklist.reduce((a, g) => a + g.items.length, 0);
              return (
                <li key={tpl.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{tpl.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {category && (
                        <Badge tone="outline" dotColor={category.color}>
                          {category.name}
                        </Badge>
                      )}
                      <Badge tone="neutral">{PRIORITY_LABEL[tpl.priority]}</Badge>
                      <Badge tone="neutral">{DURATION_LABEL[tpl.durationType]}</Badge>
                      {itemCount > 0 && <span>{itemCount} item checklist</span>}
                      {tpl.targetOffsetDays !== null && (
                        <span>target +{tpl.targetOffsetDays} hari</span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Ubah template ${tpl.name}`}
                    onClick={() => {
                      setEditing(tpl);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Hapus template ${tpl.name}`}
                    onClick={() => void remove(tpl)}
                  >
                    <Trash2 className="size-4 text-slate-400" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <TemplateDialog open={dialogOpen} onOpenChange={setDialogOpen} template={editing} />
    </Card>
  );
}

interface TemplateForm {
  name: string;
  title: string;
  description: string;
  categoryId: string;
  durationType: DurationType;
  priority: Priority;
  initialStepId: string;
  targetOffsetDays: string;
  checklist: ChecklistGroup[];
}

function TemplateDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TaskTemplate | null;
}) {
  const stepsQ = useSteps();
  const categoriesQ = useCategories();
  const [form, setForm] = useState<TemplateForm>({
    name: '',
    title: '',
    description: '',
    categoryId: '',
    durationType: 'JANGKA_PENDEK',
    priority: 'SEDANG',
    initialStepId: '',
    targetOffsetDays: '',
    checklist: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setForm({
        name: template?.name ?? '',
        title: template?.title ?? '',
        description: template?.description ?? '',
        categoryId: template?.categoryId ?? '',
        durationType: template?.durationType ?? 'JANGKA_PENDEK',
        priority: template?.priority ?? 'SEDANG',
        initialStepId: template?.initialStepId ?? '',
        targetOffsetDays:
          template?.targetOffsetDays !== null && template?.targetOffsetDays !== undefined
            ? String(template.targetOffsetDays)
            : '',
        checklist: template?.checklist ?? [],
      });
      setError(null);
    }
  }, [open, template]);

  async function submit() {
    if (!form.name.trim() || !form.title.trim()) {
      setError('Nama template dan judul pekerjaan wajib diisi.');
      return;
    }
    const ctx = getCtx();
    if (!ctx) return;
    setBusy(true);
    try {
      await getDataService().templates.save(
        {
          id: template?.id,
          name: form.name,
          title: form.title,
          description: form.description,
          categoryId: form.categoryId || null,
          labelIds: template?.labelIds ?? [],
          durationType: form.durationType,
          priority: form.priority,
          initialStepId: form.initialStepId || null,
          targetOffsetDays: form.targetOffsetDays === '' ? null : Number(form.targetOffsetDays),
          checklist: form.checklist,
          active: template?.active ?? true,
        },
        ctx,
      );
      notify.success(template ? 'Template diperbarui.' : 'Template dibuat.', form.name);
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      onOpenChange(false);
    } catch (err) {
      notify.error('Gagal menyimpan template', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={template ? 'Ubah Template' : 'Template Baru'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="rounded-xl border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama template" required>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="cth. Rapat koordinasi"
            />
          </Field>
          <Field label="Judul pekerjaan" required hint="Boleh memakai penanda [topik] dsb.">
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="cth. Rapat koordinasi: [topik]"
            />
          </Field>
        </div>
        <Field label="Deskripsi">
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Kategori">
            <Select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            >
              <option value="">Tanpa kategori</option>
              {(categoriesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Jenis durasi">
            <Select
              value={form.durationType}
              onChange={(e) =>
                setForm((f) => ({ ...f, durationType: e.target.value as DurationType }))
              }
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
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
            >
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Step awal" hint="Kosong = step pertama board.">
            <Select
              value={form.initialStepId}
              onChange={(e) => setForm((f) => ({ ...f, initialStepId: e.target.value }))}
            >
              <option value="">Step pertama</option>
              {(stepsQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target relatif (hari)" hint="Kosong = tanpa target.">
            <Input
              type="number"
              min={0}
              value={form.targetOffsetDays}
              onChange={(e) => setForm((f) => ({ ...f, targetOffsetDays: e.target.value }))}
              placeholder="cth. 3"
            />
          </Field>
        </div>
        <Field label="Checklist bawaan">
          <ChecklistEditor
            value={form.checklist}
            onChange={(v) => setForm((f) => ({ ...f, checklist: v }))}
          />
        </Field>
      </div>
    </Modal>
  );
}
