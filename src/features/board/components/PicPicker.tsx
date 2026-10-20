import { useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Avatar, AvatarGroup } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { useEmployeePhotos } from '@/hooks/queries';
import { cn } from '@/lib/utils';
import type { Employee } from '@/services/types';

interface PicPickerProps {
  employees: Employee[];
  /** Nilai saat ini (termasuk PIC yang mungkin sudah nonaktif dari data lama). */
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  /** Pegawai yang disembunyikan dari daftar (mis. sudah dipilih di picker lain). */
  excludeIds?: string[];
  /** Nonaktifkan pemilihan (mis. Staf tidak boleh mengubah PIC utama). */
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/**
 * Multi-select pegawai dengan pencarian & checkbox — dipakai konsisten untuk
 * PIC utama, PIC tambahan, dan filter PIC.
 * - Dropdown tetap terbuka saat memilih beberapa pegawai; pencarian tidak reset.
 * - Pegawai nonaktif tidak dapat DITAMBAHKAN; pilihan lama tetap dipertahankan.
 * - Menampilkan foto profil mini bila tersedia (fallback inisial berwarna).
 */
export function PicPicker({
  employees,
  value,
  onChange,
  placeholder = 'Pilih pegawai…',
  excludeIds = [],
  disabled = false,
  ...aria
}: PicPickerProps) {
  const [search, setSearch] = useState('');
  const photosQ = useEmployeePhotos(employees);
  const photoUrls = photosQ.data ?? {};

  const selectable = useMemo(
    () =>
      employees.filter(
        (e) => (e.active || value.includes(e.id)) && !excludeIds.includes(e.id),
      ),
    [employees, value, excludeIds],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.displayName.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q) ||
        e.team.toLowerCase().includes(q),
    );
  }, [selectable, search]);

  const selected = value
    .map((id) => employees.find((e) => e.id === id))
    .filter((e): e is Employee => !!e);

  function toggle(emp: Employee) {
    if (value.includes(emp.id)) {
      onChange(value.filter((id) => id !== emp.id));
    } else if (emp.active) {
      onChange([...value, emp.id]);
    }
  }

  return (
    <div className="space-y-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            {...aria}
            disabled={disabled}
            aria-disabled={disabled || undefined}
            className={cn(
              'pressable flex min-h-10 w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-left text-sm shadow-sm transition-colors',
              disabled
                ? 'cursor-not-allowed bg-slate-50 opacity-70'
                : 'cursor-pointer hover:border-slate-400 focus:border-brand-500',
              aria['aria-invalid'] && 'border-danger-500',
            )}
          >
            {selected.length === 0 ? (
              <span className="flex-1 text-slate-400">{placeholder}</span>
            ) : (
              <>
                <AvatarGroup employees={selected} size="xs" max={4} photoUrls={photoUrls} />
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {selected
                    .slice(0, 3)
                    .map((e) => e.displayName)
                    .join(', ')}
                  {selected.length > 3 && ` +${selected.length - 3}`}
                </span>
              </>
            )}
            <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2">
          <div className="relative mb-2">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, jabatan, atau tag…"
              className="h-9 pl-8 text-sm"
              aria-label="Cari pegawai"
            />
          </div>
          <ul className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto">
            {filtered.map((emp) => {
              const checked = value.includes(emp.id);
              const disabled = !emp.active && !checked;
              return (
                <li key={emp.id}>
                  <label
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-brand-50/60',
                      checked && 'bg-brand-50',
                      disabled && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => toggle(emp)}
                      aria-label={emp.fullName}
                    />
                    <Avatar
                      employee={emp}
                      size="md"
                      showInactive
                      src={emp.avatarPath ? photoUrls[emp.avatarPath] : null}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-800">
                        {emp.fullName}
                        {!emp.active && (
                          <span className="ml-1 text-[10px] font-bold text-slate-400 uppercase">
                            nonaktif
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {[emp.position || null, `tag “${emp.displayName}”`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2 py-4 text-center text-xs text-slate-400">
                Pegawai tidak ditemukan.
              </li>
            )}
          </ul>
        </PopoverContent>
      </Popover>

      {/* Chip pegawai terpilih — tombol hapus per pegawai */}
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Pegawai terpilih">
          {selected.map((emp) => (
            <li key={emp.id}>
              <Tooltip content={`${emp.fullName}${emp.position ? ` — ${emp.position}` : ''}`}>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pr-1 pl-0.5">
                  <Avatar
                    employee={emp}
                    size="xs"
                    showInactive
                    src={emp.avatarPath ? photoUrls[emp.avatarPath] : null}
                  />
                  <span className="max-w-28 truncate text-xs font-semibold text-slate-700">
                    {emp.displayName}
                  </span>
                  <button
                    type="button"
                    aria-label={`Hapus ${emp.fullName}`}
                    onClick={() => onChange(value.filter((id) => id !== emp.id))}
                    className="pressable inline-flex size-5 cursor-pointer items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
