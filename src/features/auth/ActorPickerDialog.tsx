import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useEmployees } from '@/hooks/queries';
import { useSessionStore } from './session-store';

/**
 * Pemilih pegawai pelaku.
 * Akun User dipakai bersama, jadi setiap perangkat memilih "siapa yang bekerja"
 * — wajib sebelum melakukan perubahan; tercatat pada audit.
 */
export function ActorPickerDialog() {
  const { actorPickerOpen, closeActorPicker, setActor, actorId, session } = useSessionStore();
  const { data: employees, isLoading } = useEmployees(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!employees) return [];
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.displayName.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q) ||
        e.team.toLowerCase().includes(q),
    );
  }, [employees, search]);

  if (!session) return null;

  return (
    <Modal
      open={actorPickerOpen}
      onOpenChange={(open) => {
        if (!open) closeActorPicker();
      }}
      title="Siapa yang sedang bekerja?"
      description="Pilih nama Anda. Setiap perubahan dicatat atas nama pegawai pelaku."
      size="lg"
    >
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, jabatan, atau tim…"
          className="pl-9"
          aria-label="Cari pegawai"
        />
      </div>

      {isLoading ? (
        <LoadingBlock compact label="Memuat daftar pegawai…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          title="Pegawai tidak ditemukan"
          description="Coba kata kunci lain, atau hubungi Admin untuk menambahkan pegawai."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {filtered.map((emp) => {
            const selected = emp.id === actorId;
            return (
              <li key={emp.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActor(emp.id);
                    notify.success(`Bekerja sebagai ${emp.displayName}`);
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                    selected
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40',
                  )}
                  aria-pressed={selected}
                >
                  <Avatar employee={emp} size="lg" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {emp.fullName}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {emp.position} · {emp.team}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Anda dapat mengganti pegawai pelaku kapan saja lewat menu di kanan atas.
      </p>
    </Modal>
  );
}
