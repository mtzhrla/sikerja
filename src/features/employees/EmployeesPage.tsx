import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BriefcaseBusiness, Search, Settings2, Users } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { DefaultAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { employeeProfilePath, ROUTES } from '@/lib/routes';
import type { Employee } from '@/services/types';
import { useSessionStore } from '@/features/auth/session-store';
import {
  useEmployeeAccounts,
  useEmployeePhotos,
  useEmployees,
  useSteps,
  useTasks,
} from '@/hooks/queries';
import { distinctTeams, tasksOfEmployee } from './lib';

type StatusFilter = 'AKTIF' | 'SEMUA' | 'NONAKTIF';
type LevelFilter = 'SEMUA' | 'LEADER' | 'STAFF';

/** Foto profil atau avatar bawaan bertema maskot. */
function EmployeePhoto({
  employee,
  url,
  className,
}: {
  employee: Employee;
  url: string | undefined;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100',
        !employee.active && 'opacity-60 grayscale',
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`Foto ${employee.fullName}`}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <DefaultAvatar seed={employee.displayName} color={employee.color} />
      )}
    </span>
  );
}

/**
 * Kartu pegawai — struktur area tetap (foto · nama · NIP · jabatan · badge ·
 * footer) sehingga seluruh kartu dalam satu baris grid sama tinggi dan sejajar.
 *
 * Mobile memakai tata letak mendatar (foto kiri, identitas kanan); mulai `sm`
 * berubah menjadi kartu vertikal terpusat.
 */
function EmployeeCard({
  employee,
  photoUrl,
  activeCount,
  accountBadge,
  index,
  onOpen,
}: {
  employee: Employee;
  photoUrl: string | undefined;
  activeCount: number;
  accountBadge: { tone: 'success' | 'warning'; label: string } | null;
  index: number;
  onOpen: () => void;
}) {
  const isLeader = employee.level === 'LEADER';
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Buka profil ${employee.fullName}`}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
      className={cn(
        'liftable pressable animate-fade-in-up group relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border text-left shadow-(--shadow-card)',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        employee.active
          ? 'border-slate-200/80 bg-white hover:border-brand-300'
          : 'border-slate-200/70 bg-slate-50/80 hover:border-slate-300',
      )}
    >
      {/* Aksen atas: gradient penuh untuk Pimpinan, versi lebih tenang untuk Staf */}
      <span
        aria-hidden
        className={cn(
          'block h-1.5 w-full shrink-0',
          !employee.active
            ? 'bg-slate-300'
            : isLeader
              ? 'bg-(image:--gradient-brand)'
              : 'bg-brand-200',
        )}
      />
      {/* Wash lembut di area foto agar kartu tidak tampil datar putih polos */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 top-1.5 h-24 bg-linear-to-b to-transparent',
          !employee.active ? 'from-slate-100' : isLeader ? 'from-brand-100/80' : 'from-brand-50',
        )}
      />

      <div className="relative flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-3 text-left sm:flex-col sm:items-center sm:gap-2.5 sm:text-center">
          <span className="relative inline-flex shrink-0">
            <span
              aria-hidden
              className="absolute -inset-1 rounded-[1.25rem] bg-(image:--gradient-brand-soft) opacity-60 transition-opacity duration-200 group-hover:opacity-100"
            />
            <EmployeePhoto
              employee={employee}
              url={photoUrl}
              className="relative size-16 ring-2 ring-white sm:size-20 2xl:size-24"
            />
          </span>

          <div className="min-w-0 flex-1 sm:w-full sm:flex-none">
            <p
              title={employee.fullName}
              className="lines-2 line-clamp-2 text-sm leading-snug font-bold text-balance text-slate-900 2xl:text-base"
            >
              {employee.fullName}
            </p>
            <p className="tnum mt-1 truncate text-[11px] whitespace-nowrap text-slate-400">
              {employee.nip ?? 'NIP belum diisi'}
            </p>
            <p
              title={employee.position || undefined}
              className="lines-2 mt-1 line-clamp-2 text-xs leading-snug text-slate-500 2xl:text-sm"
            >
              {employee.position || '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 sm:justify-center">
          <Badge tone={isLeader ? 'brand' : 'neutral'}>{isLeader ? 'Pimpinan' : 'Staf'}</Badge>
          {employee.username && <Badge tone="outline">@{employee.username}</Badge>}
          {!employee.active && <Badge tone="warning">Nonaktif</Badge>}
          {accountBadge && <Badge tone={accountBadge.tone}>{accountBadge.label}</Badge>}
        </div>

        <div className="mt-auto flex items-center gap-1.5 border-t border-slate-100 pt-2.5">
          <BriefcaseBusiness
            className={cn('size-3.5 shrink-0', activeCount > 0 ? 'text-brand-600' : 'text-slate-400')}
            aria-hidden
          />
          <span
            className={cn(
              'truncate text-xs',
              activeCount > 0 ? 'font-semibold text-slate-700' : 'text-slate-400',
            )}
          >
            {activeCount > 0 ? `${activeCount} pekerjaan aktif` : 'Belum ada pekerjaan aktif'}
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * Daftar Pegawai (spesifikasi §M).
 *
 * SATU tampilan daftar — tidak ada tab "Struktur Tim": daftar kedua hanya
 * menampilkan pegawai yang sama. Relasi Pimpinan/atasan tetap terbaca lewat
 * badge tingkat, filter tingkat, dan Profil Pegawai. Foto/nama/kartu membuka
 * Profil Pegawai.
 */
export default function EmployeesPage() {
  const employeesQ = useEmployees(true);
  const stepsQ = useSteps();
  const tasksQ = useTasks({ includeArchived: false });
  const { role, accountEmployeeId } = useSessionStore();
  const isAdmin = role === 'ADMIN';
  const accountsQ = useEmployeeAccounts(isAdmin);
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<LevelFilter>('SEMUA');
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState<StatusFilter>('AKTIF');

  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);
  const photosQ = useEmployeePhotos(employees);
  const photoUrls = photosQ.data ?? {};
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const stepKindById = useMemo(
    () => new Map((stepsQ.data ?? []).map((s) => [s.id, s.kind])),
    [stepsQ.data],
  );

  const accountByEmployee = useMemo(
    () => new Map((accountsQ.data ?? []).map((a) => [a.employeeId, a])),
    [accountsQ.data],
  );

  /** Jumlah pekerjaan aktif (belum selesai) per pegawai. */
  const activeCountById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const employee of employees) {
      const related = tasksOfEmployee(tasks, employee.id).filter(
        (t) => stepKindById.get(t.stepId) !== 'DONE',
      );
      counts.set(employee.id, related.length);
    }
    return counts;
  }, [employees, tasks, stepKindById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Non-Admin selalu melihat pegawai aktif saja.
    const effectiveStatus = isAdmin ? status : 'AKTIF';
    return employees.filter((e) => {
      if (effectiveStatus === 'AKTIF' && !e.active) return false;
      if (effectiveStatus === 'NONAKTIF' && e.active) return false;
      if (level !== 'SEMUA' && e.level !== level) return false;
      if (team && e.team !== team) return false;
      if (
        q &&
        !e.fullName.toLowerCase().includes(q) &&
        !e.displayName.toLowerCase().includes(q) &&
        !(e.username ?? '').includes(q) &&
        !e.position.toLowerCase().includes(q) &&
        !(e.nip ?? '').includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [employees, search, level, team, status, isAdmin]);

  /**
   * Filter Unit/Tim hanya berguna bila ada lebih dari satu unit. Saat ini
   * seluruh pegawai berada pada "PIP Puslapdik", jadi dropdown disembunyikan
   * tanpa menghapus field unit dari data/Admin.
   */
  const teams = useMemo(() => distinctTeams(employees), [employees]);
  const showTeamFilter = teams.length > 1;

  if (employeesQ.isError) {
    return <ErrorState error={employeesQ.error} onRetry={() => void employeesQ.refetch()} />;
  }

  function accountBadgeOf(employee: Employee) {
    if (!isAdmin) return null;
    const account = accountByEmployee.get(employee.id);
    if (!account) return null;
    if (!account.hasAccount) return { tone: 'warning' as const, label: 'Belum ada akun' };
    return account.isActive
      ? { tone: 'success' as const, label: 'Akun aktif' }
      : { tone: 'warning' as const, label: 'Akun nonaktif' };
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: pencarian dan filter di kiri, tombol kelola di kanan */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          {/* Pencarian */}
          <div className="w-full sm:w-56 lg:w-72">
            <Field label="Pencarian">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama, username, jabatan, NIP…"
                  aria-label="Cari pegawai"
                  className="h-10 w-full pl-9"
                />
              </div>
            </Field>
          </div>

          {/* Filter tingkat */}
          <Field label="Tingkat" className="w-full sm:w-40">
            <Select
              value={level}
              onChange={(e) => setLevel(e.target.value as LevelFilter)}
            >
              <option value="SEMUA">Semua</option>
              <option value="LEADER">Pimpinan</option>
              <option value="STAFF">Staf</option>
            </Select>
          </Field>

          {/* Filter unit/tim bila diperlukan */}
          {showTeamFilter && (
            <Field label="Unit / Tim" className="w-full sm:w-52">
              <Select value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">Semua unit</option>
                {teams.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {/* Filter status akun untuk Admin */}
          {isAdmin && (
            <Field label="Status akun" className="w-full sm:w-36">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
              >
                <option value="AKTIF">Aktif</option>
                <option value="SEMUA">Semua</option>
                <option value="NONAKTIF">Nonaktif</option>
              </Select>
            </Field>
          )}
        </div>

        {/* Tombol kelola pegawai di sisi kanan */}
        {isAdmin && (
          <Link
            to={`${ROUTES.admin}/pegawai`}
            className="pressable inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            <Settings2 className="size-4" aria-hidden />
            Kelola pegawai
          </Link>
        )}
      </div>

      {/* Daftar pegawai */}
      {employeesQ.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 wide:grid-cols-4 2xl:grid-cols-5">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Pegawai tidak ditemukan"
          description="Coba ubah kata kunci pencarian atau filter."
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 wide:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((emp, i) => (
              <li key={emp.id} className="flex">
                <EmployeeCard
                  employee={emp}
                  photoUrl={emp.avatarPath ? photoUrls[emp.avatarPath] : undefined}
                  activeCount={activeCountById.get(emp.id) ?? 0}
                  accountBadge={accountBadgeOf(emp)}
                  index={i}
                  onOpen={() => {
                    if (isAdmin) {
                      navigate(employeeProfilePath(emp.id));
                    } else if (emp.id === accountEmployeeId) {
                      navigate(ROUTES.profilSaya);
                    }
                  }}
                />
              </li>
            ))}
          </ul>

          <div className="pt-1">
            <p className="tnum text-sm text-slate-500" aria-live="polite">
              Menampilkan semua {filtered.length} pegawai
            </p>
          </div>
        </>
      )}
    </div>
  );
}