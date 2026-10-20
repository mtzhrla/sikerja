import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { arrayMove, cn } from '@/lib/utils';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import type { Category, Label } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useCategories, useLabels } from '@/hooks/queries';

const PRESET_COLORS = [
  '#2361e3', '#0284c7', '#0d9488', '#059669', '#d97706', '#e11d48', '#7c3aed', '#64748b', '#b91c1c',
];

type Item = Category | Label;
type Kind = 'category' | 'label';

export function TaxonomySection() {
  const categoriesQ = useCategories(true);
  const labelsQ = useLabels(true);

  if (categoriesQ.isLoading || labelsQ.isLoading) {
    return <LoadingBlock label="Memuat kategori & label…" />;
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <TaxonomyCard
        kind="category"
        title="Kategori"
        description="Pengelompokan utama pekerjaan."
        items={categoriesQ.data ?? []}
      />
      <TaxonomyCard
        kind="label"
        title="Label"
        description="Penanda tambahan (boleh lebih dari satu per pekerjaan)."
        items={labelsQ.data ?? []}
      />
    </div>
  );
}

function TaxonomyCard({
  kind,
  title,
  description,
  items,
}: {
  kind: Kind;
  title: string;
  description: string;
  items: Item[];
}) {
  const [editing, setEditing] = useState<Item | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [kind === 'category' ? 'categories' : 'labels'] });

  async function toggleActive(item: Item) {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const svc = getDataService().taxonomy;
      const input = { id: item.id, name: item.name, color: item.color, active: !item.active };
      if (kind === 'category') await svc.saveCategory(input, ctx);
      else await svc.saveLabel(input, ctx);
      await invalidate();
    } catch (err) {
      notify.error('Gagal mengubah status', errorMessage(err));
    }
  }

  async function move(item: Item, dir: -1 | 1) {
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(item.id);
    const to = from + dir;
    if (to < 0 || to >= ids.length) return;
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const svc = getDataService().taxonomy;
      const ordered = arrayMove(ids, from, to);
      if (kind === 'category') await svc.reorderCategories(ordered, ctx);
      else await svc.reorderLabels(ordered, ctx);
      await invalidate();
    } catch (err) {
      notify.error('Gagal mengubah urutan', errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            Tambah
          </Button>
        }
      />
      <ul className="divide-y divide-slate-100 p-4 pt-2">
        {items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-3 py-2">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
              {item.name}
              {!item.active && (
                <Badge tone="neutral" className="ml-2">
                  Nonaktif
                </Badge>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Naikkan ${item.name}`}
              disabled={i === 0}
              onClick={() => void move(item, -1)}
            >
              <ChevronUp className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Turunkan ${item.name}`}
              disabled={i === items.length - 1}
              onClick={() => void move(item, 1)}
            >
              <ChevronDown className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Ubah ${item.name}`}
              onClick={() => {
                setEditing(item);
                setDialogOpen(true);
              }}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Switch
              checked={item.active}
              onCheckedChange={() => void toggleActive(item)}
              aria-label={`Status aktif ${item.name}`}
            />
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-4 text-center text-xs text-slate-400">Belum ada data.</li>
        )}
      </ul>
      <TaxonomyDialog
        kind={kind}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
      />
    </Card>
  );
}

function TaxonomyDialog({
  kind,
  open,
  onOpenChange,
  item,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Item | null;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]!);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const getCtx = useActorCtx();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setName(item?.name ?? '');
      setColor(item?.color ?? PRESET_COLORS[0]!);
      setError(null);
    }
  }, [open, item]);

  async function submit() {
    if (!name.trim()) {
      setError('Nama wajib diisi.');
      return;
    }
    const ctx = getCtx();
    if (!ctx) return;
    setBusy(true);
    try {
      const svc = getDataService().taxonomy;
      const input = { id: item?.id, name, color };
      if (kind === 'category') await svc.saveCategory(input, ctx);
      else await svc.saveLabel(input, ctx);
      notify.success(item ? 'Perubahan disimpan.' : 'Berhasil ditambahkan.', name);
      await queryClient.invalidateQueries({
        queryKey: [kind === 'category' ? 'categories' : 'labels'],
      });
      onOpenChange(false);
    } catch (err) {
      notify.error('Gagal menyimpan', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const kindLabel = kind === 'category' ? 'Kategori' : 'Label';

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={item ? `Ubah ${kindLabel}` : `Tambah ${kindLabel}`}
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
        <Field label={`Nama ${kindLabel.toLowerCase()}`} required error={error ?? undefined}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            maxLength={40}
          />
        </Field>
        <Field label="Warna">
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Warna">
            {PRESET_COLORS.map((c) => (
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
