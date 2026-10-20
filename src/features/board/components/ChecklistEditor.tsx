import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { arrayMove, uid } from '@/lib/utils';
import type { ChecklistGroup } from '@/services/types';

interface ChecklistEditorProps {
  value: ChecklistGroup[];
  onChange: (groups: ChecklistGroup[]) => void;
}

/** Editor checklist: beberapa kelompok; tambah/ubah/urutkan/centang/hapus item. */
export function ChecklistEditor({ value, onChange }: ChecklistEditorProps) {
  const [newGroupTitle, setNewGroupTitle] = useState('');

  function updateGroup(groupId: string, patch: Partial<ChecklistGroup>) {
    onChange(value.map((g) => (g.id === groupId ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    const title = newGroupTitle.trim() || `Kelompok ${value.length + 1}`;
    onChange([
      ...value,
      { id: uid('clg'), title, sortOrder: value.length, items: [] },
    ]);
    setNewGroupTitle('');
  }

  function removeGroup(groupId: string) {
    onChange(value.filter((g) => g.id !== groupId));
  }

  function addItem(groupId: string, text: string) {
    if (!text.trim()) return;
    const group = value.find((g) => g.id === groupId);
    if (!group) return;
    updateGroup(groupId, {
      items: [
        ...group.items,
        { id: uid('cli'), text: text.trim(), done: false, sortOrder: group.items.length },
      ],
    });
  }

  return (
    <div className="space-y-3">
      {value.map((group) => (
        <GroupEditor
          key={group.id}
          group={group}
          onUpdate={(patch) => updateGroup(group.id, patch)}
          onRemove={() => removeGroup(group.id)}
          onAddItem={(text) => addItem(group.id, text)}
        />
      ))}
      <div className="flex items-center gap-2">
        <Input
          value={newGroupTitle}
          onChange={(e) => setNewGroupTitle(e.target.value)}
          placeholder="Nama kelompok checklist baru…"
          className="h-9 text-sm"
          aria-label="Nama kelompok checklist baru"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addGroup();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addGroup}>
          <Plus className="size-3.5" aria-hidden />
          Kelompok
        </Button>
      </div>
    </div>
  );
}

function GroupEditor({
  group,
  onUpdate,
  onRemove,
  onAddItem,
}: {
  group: ChecklistGroup;
  onUpdate: (patch: Partial<ChecklistGroup>) => void;
  onRemove: () => void;
  onAddItem: (text: string) => void;
}) {
  const [newItem, setNewItem] = useState('');

  function moveItem(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= group.items.length) return;
    onUpdate({
      items: arrayMove(group.items, index, to).map((it, i) => ({ ...it, sortOrder: i })),
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Input
          value={group.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="h-8 flex-1 border-transparent bg-transparent px-1 text-sm font-bold shadow-none hover:border-slate-300"
          aria-label={`Nama kelompok ${group.title}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Hapus kelompok ${group.title}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4 text-slate-400" aria-hidden />
        </Button>
      </div>
      <ul className="space-y-1">
        {group.items.map((item, i) => (
          <li key={item.id} className="group flex items-center gap-2">
            <Checkbox
              checked={item.done}
              onCheckedChange={(v) =>
                onUpdate({
                  items: group.items.map((it) =>
                    it.id === item.id ? { ...it, done: v === true } : it,
                  ),
                })
              }
              aria-label={`Tandai ${item.text}`}
            />
            <Input
              value={item.text}
              onChange={(e) =>
                onUpdate({
                  items: group.items.map((it) =>
                    it.id === item.id ? { ...it, text: e.target.value } : it,
                  ),
                })
              }
              className="h-8 flex-1 border-transparent bg-transparent px-1 text-sm shadow-none hover:border-slate-300"
              aria-label={`Ubah item ${item.text}`}
            />
            <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Naikkan item"
                disabled={i === 0}
                onClick={() => moveItem(i, -1)}
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Turunkan item"
                disabled={i === group.items.length - 1}
                onClick={() => moveItem(i, 1)}
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Hapus item ${item.text}`}
                onClick={() =>
                  onUpdate({ items: group.items.filter((it) => it.id !== item.id) })
                }
              >
                <Trash2 className="size-3.5 text-slate-400" aria-hidden />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Tambah item…"
          className="h-8 flex-1 text-sm"
          aria-label={`Tambah item pada ${group.title}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAddItem(newItem);
              setNewItem('');
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onAddItem(newItem);
            setNewItem('');
          }}
        >
          <Plus className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
