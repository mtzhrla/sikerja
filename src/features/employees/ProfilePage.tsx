import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  IdCard,
  KeyRound,
  ListChecks,
  OctagonAlert,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DefaultAvatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatRelative, todayISO } from '@/lib/format';
import { employeeProfilePath, ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import type { ProfileTaskFilter, Task } from '@/services/types';
import { AvatarCropperDialog } from '@/features/admin/sections/AvatarCropperDialog';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { useSessionStore } from '@/features/auth/session-store';
import {
  useEmployeeAccounts,
  useEmployeeProfileTasks,
  useEmployeePhotos,
  useEmployees,
  useRecentActivity,
} from '@/hooks/queries';

function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'brand',
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  icon: typeof ListChecks;
  tone?: 'brand' | 'success' | 'danger' | 'warning';
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-emerald-50 text-emerald-700',
    danger: 'bg-danger-50 text-danger-600',
    warning: 'bg-amber-50 text-amber-700',
  } as const;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="pressable flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left"
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
          tones[tone],
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg leading-tight font-extrabold text-slate-900">{value}</span>
        <span className="block truncate text-xs font-medium text-slate-500">{label}</span>
      </span>
    </button>
  );
}

function ProfilePagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  const visible = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...visible]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  const btn =
    'pressable inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav aria-label="Navigasi halaman pekerjaan" className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className={cn(btn, 'border-slate-200 bg-white text-slate-600 hover:bg-brand-50')}
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Halaman sebelumnya"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      {pages.map((number, index) => (
        <span key={number} className="contents">
          {index > 0 && number - pages[index - 1]! > 1 && (
            <span className="inline-flex min-h-10 min-w-6 items-center justify-center text-sm text-slate-400">
              &hellip;
            </span>
          )}
          <button
            type="button"
            aria-label={`Halaman ${number}`}
            aria-current={number === page ? 'page' : undefined}
            onClick={() => onPage(number)}
            className={cn(
              btn,
              number === page
                ? 'border-transparent bg-(image:--gradient-brand) text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-brand-50 hover:text-brand-700',
            )}
          >
            {number}
          </button>
        </span>
      ))}
      <button
        type="button"
        className={cn(btn, 'border-slate-200 bg-white text-slate-600 hover:bg-brand-50')}
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        aria-label="Halaman berikutnya"
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  );
}

function InfoRow({
  label,
  value,
  /** Nilai numerik panjang (mis. NIP): satu baris, angka tabular, tidak dipecah. */
  numeric,
}: {
  label: string;
  value: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-2 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={cn(
          'min-w-0 font-semibold text-slate-800',
          numeric ? 'tnum overflow-x-auto text-xs whitespace-nowrap' : 'break-words',
        )}
      >
        {value || '—'}
      </dd>
    </div>
  );
}

/**
 * Profil Pegawai (§N) & Profil Saya (§O).
 *
 * Halaman ini dibuka lewat foto/nama pegawai atau avatar header — bukan menu
 * sidebar. Tidak menampilkan ranking maupun skor kinerja.
 */
export default function ProfilePage({ self = false }: { self?: boolean }) {
  const params = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const { role, accountEmployeeId, actorId } = useSessionStore();
  const employeesQ = useEmployees(true);
  const activityQ = useRecentActivity(50);
  const accountsQ = useEmployeeAccounts(role === 'ADMIN');

  const employeeId = self ? accountEmployeeId : (params.id ?? null);
  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);
  const employee = employees.find((e) => e.id === employeeId) ?? null;
  const { data: photos } = useEmployeePhotos(employee ? [employee] : []);

  const [filter, setFilter] = useState<ProfileTaskFilter>('SEMUA');
  const [page, setPage] = useState(1);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const relatedRef = useRef<HTMLDivElement | null>(null);

  const isSelf = Boolean(employeeId && employeeId === accountEmployeeId);
  const isAdmin = role === 'ADMIN';
  const today = todayISO();
  const profileTasksQ = useEmployeeProfileTasks(employeeId, filter, page, today, isSelf || isAdmin);
  const summary = profileTasksQ.data?.summary ?? null;
  const relatedTasks = profileTasksQ.data?.items ?? [];

  useEffect(() => {
    if (profileTasksQ.data && profileTasksQ.data.page !== page) {
      setPage(profileTasksQ.data.page);
    }
  }, [page, profileTasksQ.data]);

  const activities = useMemo(
    () => (activityQ.data ?? []).filter((a) => a.employeeId === employeeId).slice(0, 10),
    [activityQ.data, employeeId],
  );

  const account = accountsQ.data?.find((a) => a.employeeId === employeeId) ?? null;
  const supervisor = employee?.supervisorId
    ? (employees.find((e) => e.id === employee.supervisorId) ?? null)
    : null;

  if (employeesQ.isError || profileTasksQ.isError) {
    return (
      <Card>
        <ErrorState
          error={employeesQ.error ?? profileTasksQ.error}
          onRetry={() => void (employeesQ.isError ? employeesQ.refetch() : profileTasksQ.refetch())}
        />
      </Card>
    );
  }

  if (employeesQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!employee) {
    return (
      <Card>
        <EmptyState
          icon={UserRound}
          title={self ? 'Akun ini belum terhubung ke data pegawai' : 'Pegawai tidak ditemukan'}
          description={
            self
              ? 'Profil pribadi hanya tersedia untuk akun pegawai. Hubungi Admin bila ini keliru.'
              : 'Data pegawai mungkin sudah dihapus atau tautan tidak lagi berlaku.'
          }
          action={
            <Button variant="secondary" onClick={() => navigate(ROUTES.pegawai)}>
              Buka Daftar Pegawai
            </Button>
          }
        />
      </Card>
    );
  }

  const photoUrl = photos?.[employee.avatarPath ?? ''] ?? null;

  async function handlePhoto(blob: Blob) {
    const ctx = actorId ? { employeeId: actorId } : null;
    if (!ctx || !employee) {
      notify.warning('Pilih pegawai pelaku terlebih dahulu.');
      return;
    }
    try {
      await getDataService().employees.setPhoto(employee.id, blob, ctx);
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'employees' });
      notify.success('Foto profil diperbarui.');
    } catch (err) {
      notify.error('Gagal memperbarui foto', errorMessage(err));
    }
  }

  async function handleRemovePhoto() {
    const ctx = actorId ? { employeeId: actorId } : null;
    if (!ctx || !employee) return;
    const ok = await confirm({
      title: 'Hapus foto profil?',
      description: 'Avatar bawaan akan dipakai kembali.',
      confirmLabel: 'Hapus foto',
      danger: true,
    });
    if (!ok) return;
    try {
      await getDataService().employees.removePhoto(employee.id, ctx);
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'employees' });
      notify.success('Foto profil dihapus.');
    } catch (err) {
      notify.error('Gagal menghapus foto', errorMessage(err));
    }
  }

  function selectSummaryFilter(next: Exclude<ProfileTaskFilter, 'SEMUA'>) {
    setFilter(next);
    setPage(1);
    requestAnimationFrame(() => {
      relatedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function selectPage(next: number) {
    setPage(next);
    requestAnimationFrame(() => {
      relatedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" aria-hidden />
          Kembali
        </Button>
        <h1 className="text-lg font-bold text-slate-900">
          {self ? 'Profil Saya' : 'Profil Pegawai'}
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        {/* ---------------------------------------------------------- Identitas */}
        <Card className="p-5">
          <div className="flex flex-col items-center text-center">
            <span className="relative inline-flex size-28 items-center justify-center overflow-hidden rounded-3xl bg-slate-100">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={`Foto ${employee.fullName}`}
                  className="size-full object-cover"
                />
              ) : (
                <DefaultAvatar seed={employee.displayName} color={employee.color} />
              )}
            </span>
            <p className="mt-3 text-base leading-tight font-bold text-slate-900">
              {employee.fullName}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {employee.position || 'Jabatan belum diisi'}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              <Badge tone={employee.level === 'LEADER' ? 'brand' : 'neutral'}>
                {employee.level === 'LEADER' ? 'Pimpinan' : 'Staf'}
              </Badge>
              {!employee.active && <Badge tone="warning">Pegawai nonaktif</Badge>}
              {account && (
                <Badge tone={account.isActive ? 'success' : 'warning'}>
                  {account.hasAccount
                    ? account.isActive
                      ? 'Akun aktif'
                      : 'Akun nonaktif'
                    : 'Belum punya akun'}
                </Badge>
              )}
            </div>

            {(isSelf || isAdmin) && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) setCropFile(file);
                    e.target.value = '';
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Camera className="size-4" aria-hidden />
                  Ganti foto
                </Button>
                {employee.avatarPath && (
                  <Button variant="ghost" size="sm" onClick={() => void handleRemovePhoto()}>
                    <Trash2 className="size-4" aria-hidden />
                    Hapus foto
                  </Button>
                )}
              </div>
            )}
            {isSelf && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setPasswordOpen(true)}
              >
                <KeyRound className="size-4" aria-hidden />
                Ganti password
              </Button>
            )}
          </div>

          <dl className="mt-5 divide-y divide-slate-100 border-t border-slate-100 pt-3">
            <InfoRow
              numeric={!!employee.nip}
              label="NIP"
              value={employee.nip ?? <span className="text-amber-600">Perlu dilengkapi</span>}
            />
            <InfoRow
              label="Username"
              value={employee.username ?? <span className="text-amber-600">Perlu dilengkapi</span>}
            />
            <InfoRow label="Unit / Tim" value={employee.team} />
            <InfoRow
              label="Atasan langsung"
              value={
                supervisor ? (
                  isAdmin ? (
                    <Link
                      to={employeeProfilePath(supervisor.id)}
                      className="text-brand-700 underline-offset-2 hover:underline"
                    >
                      {supervisor.fullName}
                    </Link>
                  ) : (
                    supervisor.fullName
                  )
                ) : (
                  <span className="text-slate-400">Belum ditetapkan</span>
                )
              }
            />
            {account?.lastLoginAt && (
              <InfoRow label="Terakhir masuk" value={formatDateTime(account.lastLoginAt)} />
            )}
            {account?.mustChangePassword && (
              <InfoRow
                label="Status password"
                value={<Badge tone="warning">Wajib diganti</Badge>}
              />
            )}
          </dl>

          {(isSelf || isAdmin) && (
            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              NIP, jabatan, unit, tingkat Pimpinan/Staf, atasan langsung, dan hak akses hanya dapat
              diubah Admin lewat Pusat Admin.
            </p>
          )}
        </Card>

        {/* --------------------------------------------------- Ringkasan & tugas */}
        <div className="space-y-4">
          <Card className="p-4">
            <CardHeader
              title="Ringkasan pekerjaan"
              description="Untuk pemantauan pekerjaan — bukan penilaian kinerja."
            />
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Pekerjaan aktif"
                value={summary?.active ?? 0}
                icon={ListChecks}
                active={filter === 'AKTIF'}
                onClick={() => selectSummaryFilter('AKTIF')}
              />
              <StatTile
                label="Selesai"
                value={summary?.done ?? 0}
                icon={CheckCircle2}
                tone="success"
                active={filter === 'SELESAI'}
                onClick={() => selectSummaryFilter('SELESAI')}
              />
              <StatTile
                label="Terlambat"
                value={summary?.overdue ?? 0}
                icon={Clock}
                tone="danger"
                active={filter === 'TERLAMBAT'}
                onClick={() => selectSummaryFilter('TERLAMBAT')}
              />
              <StatTile
                label="Terhambat"
                value={summary?.blocked ?? 0}
                icon={OctagonAlert}
                tone="warning"
                active={filter === 'TERHAMBAT'}
                onClick={() => selectSummaryFilter('TERHAMBAT')}
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={summary?.completionPercent ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Persentase penyelesaian"
              >
                <div
                  className="h-full rounded-full bg-(image:--gradient-brand)"
                  style={{ width: `${summary?.completionPercent ?? 0}%` }}
                />
              </div>
              <span className="tnum text-sm font-bold text-slate-700">
                {summary?.completionPercent ?? 0}%
              </span>
            </div>
          </Card>

          <div ref={relatedRef} className="scroll-mt-4">
            <Card className="p-4">
              <CardHeader title="Pekerjaan terkait" />

              {profileTasksQ.isLoading ? (
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((item) => (
                    <Skeleton key={item} className="h-14 rounded-xl" />
                  ))}
                </div>
              ) : relatedTasks.length === 0 ? (
                <EmptyState
                  compact
                  icon={ListChecks}
                  title="Tidak ada pekerjaan pada saringan ini"
                />
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {relatedTasks.map((task: Task) => (
                    <li key={task.id}>
                      <Link
                        to={`${ROUTES.pekerjaan}?task=${task.id}`}
                        className="pressable flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-brand-50/60"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">
                            {task.title}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {task.dueDate ? `Tenggat ${task.dueDate}` : 'Tanpa tenggat'}
                            {task.archivedAt ? ' · diarsipkan' : ''}
                            {task.taskType === 'DISPOSISI' ? ' · disposisi' : ''}
                          </span>
                        </span>
                        <Badge tone={task.priority === 'TINGGI' ? 'danger' : 'neutral'}>
                          {task.priority}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {profileTasksQ.data && profileTasksQ.data.total > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <p className="tnum text-sm text-slate-500" aria-live="polite">
                    Menampilkan {profileTasksQ.data.from}&ndash;{profileTasksQ.data.to} dari{' '}
                    {profileTasksQ.data.total} pekerjaan
                  </p>
                  <ProfilePagination
                    page={profileTasksQ.data.page}
                    totalPages={profileTasksQ.data.totalPages}
                    onPage={selectPage}
                  />
                </div>
              )}
            </Card>
          </div>

          <Card className="p-4">
            <CardHeader title="Aktivitas terakhir" />
            {activities.length === 0 ? (
              <EmptyState compact icon={IdCard} title="Belum ada aktivitas tercatat" />
            ) : (
              <ul className="mt-2 space-y-1.5">
                {activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <span
                      aria-hidden
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400"
                    />
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-800">{a.title}</span>
                      {a.detail && <span className="text-slate-500"> · {a.detail}</span>}
                      <span className="block text-xs text-slate-400">{formatRelative(a.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <AvatarCropperDialog
        open={cropFile !== null}
        file={cropFile}
        onOpenChange={(open) => {
          if (!open) setCropFile(null);
        }}
        onConfirm={(blob) => {
          setCropFile(null);
          void handlePhoto(blob);
        }}
      />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
