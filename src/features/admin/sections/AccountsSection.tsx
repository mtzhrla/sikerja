import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck, UserPlus, Users, UsersRound } from 'lucide-react';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/lib/format';
import { employeeProfilePath } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import type { Employee, EmployeeLevel } from '@/services/types';
import { useActorCtx } from '@/features/auth/useActorCtx';
import { useEmployeeAccounts, useEmployees } from '@/hooks/queries';

type RowFilter = 'SEMUA' | 'PUNYA_AKUN' | 'BELUM_PUNYA_AKUN' | 'PERLU_DILENGKAPI';

/** Data pegawai belum lengkap untuk dipakai login (tanpa NIP & tanpa username). */
function perluDilengkapi(employee: Employee): boolean {
  return !employee.nipNormalized && !employee.username;
}

/**
 * Pusat Admin › Pengguna & Akses (spesifikasi §F).
 *
 * Membuat akun pegawai (password sementara), mengatur username & tingkat,
 * mengaktifkan/menonaktifkan akun, dan mereset password. Password TIDAK PERNAH
 * ditampilkan maupun disimpan pada tabel aplikasi.
 */
export function AccountsSection() {
  const employeesQ = useEmployees(true);
  const accountsQ = useEmployeeAccounts(true);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const getCtx = useActorCtx();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RowFilter>('SEMUA');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [usernameDraft, setUsernameDraft] = useState<Record<string, string>>({});

  const employees = useMemo(() => employeesQ.data ?? [], [employeesQ.data]);
  const accounts = useMemo(
    () => new Map((accountsQ.data ?? []).map((a) => [a.employeeId, a])),
    [accountsQ.data],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      const account = accounts.get(e.id);
      if (filter === 'PUNYA_AKUN' && !account?.hasAccount) return false;
      if (filter === 'BELUM_PUNYA_AKUN' && account?.hasAccount) return false;
      if (filter === 'PERLU_DILENGKAPI' && !perluDilengkapi(e)) return false;
      if (
        q &&
        !e.fullName.toLowerCase().includes(q) &&
        !(e.username ?? '').includes(q) &&
        !(e.nip ?? '').includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [employees, accounts, search, filter]);

  const tanpaAkun = employees.filter((e) => e.active && !accounts.get(e.id)?.hasAccount).length;

  async function refresh() {
    await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'accounts' });
    await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'employees' });
  }

  async function run(id: string, action: () => Promise<unknown>, successMessage: string) {
    setBusyId(id);
    try {
      await action();
      await refresh();
      notify.success(successMessage);
    } catch (err) {
      notify.error('Tindakan gagal', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleProvisionAll() {
    const ok = await confirm({
      title: 'Buat akun untuk seluruh pegawai aktif?',
      description:
        'Pegawai yang sudah memiliki akun dilewati (proses aman diulang). Akun baru memakai password sementara dan wajib diganti pada login pertama.',
      confirmLabel: 'Buat akun',
    });
    if (!ok) return;
    setBusyId('ALL');
    try {
      const result = await getDataService().accounts.provisionAll();
      await refresh();
      notify.success(
        `${result.created} akun dibuat.`,
        `${result.skipped} pegawai sudah punya akun${
          result.failed.length > 0 ? ` · gagal: ${result.failed.join(', ')}` : ''
        }`,
      );
    } catch (err) {
      notify.error('Provisioning gagal', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReset(employee: Employee) {
    const ok = await confirm({
      title: `Reset password ${employee.displayName}?`,
      description:
        'Password kembali ke password sementara, wajib diganti pada login berikutnya, dan seluruh sesi lama dicabut.',
      confirmLabel: 'Reset password',
      danger: true,
    });
    if (!ok) return;
    await run(
      employee.id,
      () => getDataService().accounts.resetPassword(employee.id),
      'Password direset ke password sementara.',
    );
  }

  async function handleUsername(employee: Employee) {
    const value = (usernameDraft[employee.id] ?? '').trim().toLowerCase();
    const ctx = getCtx();
    if (!ctx) return;
    if (value && !/^[a-z0-9][a-z0-9._-]{1,31}$/.test(value)) {
      notify.error(
        'Username tidak valid',
        'Gunakan 2–32 karakter: huruf kecil, angka, titik, garis bawah, atau strip — tanpa spasi.',
      );
      return;
    }
    await run(
      employee.id,
      () =>
        getDataService().employees.update(employee.id, { username: value || null }, ctx),
      'Username diperbarui.',
    );
    setUsernameDraft((d) => {
      const next = { ...d };
      delete next[employee.id];
      return next;
    });
  }

  async function handleLevel(employee: Employee, level: EmployeeLevel) {
    const ctx = getCtx();
    if (!ctx) return;
    await run(
      employee.id,
      () => getDataService().employees.update(employee.id, { level }, ctx),
      level === 'LEADER' ? 'Ditetapkan sebagai Pimpinan.' : 'Ditetapkan sebagai Staf.',
    );
  }

  async function handleSupervisor(employee: Employee, supervisorId: string) {
    const ctx = getCtx();
    if (!ctx) return;
    await run(
      employee.id,
      () =>
        getDataService().employees.update(
          employee.id,
          { supervisorId: supervisorId || null },
          ctx,
        ),
      'Atasan langsung diperbarui.',
    );
  }

  if (employeesQ.isError || accountsQ.isError) {
    return (
      <ErrorState
        error={employeesQ.error ?? accountsQ.error}
        onRetry={() => void accountsQ.refetch()}
      />
    );
  }

  const leaders = employees.filter((e) => e.active && e.level === 'LEADER');

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardHeader
          title="Pengguna & Akses"
          description="Setiap pegawai aktif memiliki satu akun pribadi. Password awal bersifat sementara dan wajib diganti saat login pertama."
          actions={
            <Button onClick={() => void handleProvisionAll()} loading={busyId === 'ALL'}>
              <UsersRound className="size-4" aria-hidden />
              Buat akun untuk semua pegawai aktif
            </Button>
          }
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <p className="text-lg font-extrabold text-slate-900">{employees.length}</p>
            <p className="text-xs text-slate-500">Pegawai terdata</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <p className="text-lg font-extrabold text-slate-900">
              {[...accounts.values()].filter((a) => a.hasAccount).length}
            </p>
            <p className="text-xs text-slate-500">Sudah punya akun</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3">
            <p className="text-lg font-extrabold text-amber-600">{tanpaAkun}</p>
            <p className="text-xs text-slate-500">Pegawai aktif tanpa akun</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, username, NIP…"
            aria-label="Cari pegawai"
            className="h-10 w-64"
          />
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value as RowFilter)}
            aria-label="Saring akun"
            className="h-10 w-56"
          >
            <option value="SEMUA">Semua pegawai</option>
            <option value="PUNYA_AKUN">Sudah punya akun</option>
            <option value="BELUM_PUNYA_AKUN">Belum punya akun</option>
            <option value="PERLU_DILENGKAPI">Perlu dilengkapi</option>
          </Select>
        </div>

        {accountsQ.isLoading ? (
          <LoadingBlock />
        ) : rows.length === 0 ? (
          <EmptyState compact icon={Users} title="Tidak ada pegawai pada saringan ini" />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-500 uppercase">
                  <th className="py-2 pr-3">Pegawai</th>
                  <th className="py-2 pr-3">NIP</th>
                  <th className="py-2 pr-3">Username</th>
                  <th className="py-2 pr-3">Tingkat</th>
                  <th className="py-2 pr-3">Atasan langsung</th>
                  <th className="py-2 pr-3">Status akun</th>
                  <th className="py-2 pr-3">Terakhir masuk</th>
                  <th className="py-2 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((employee) => {
                  const account = accounts.get(employee.id);
                  const busy = busyId === employee.id;
                  return (
                    <tr key={employee.id} className={cn(busy && 'opacity-60')}>
                      <td className="py-2.5 pr-3">
                        <Link
                          to={employeeProfilePath(employee.id)}
                          className="font-semibold text-slate-800 hover:text-brand-700 hover:underline"
                        >
                          {employee.fullName}
                        </Link>
                        <p className="text-xs text-slate-400">{employee.position || '—'}</p>
                      </td>
                      <td className="tnum py-2.5 pr-3 text-slate-600">
                        {employee.nip ?? (
                          <Badge tone="warning">Perlu dilengkapi</Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1">
                          <Input
                            value={usernameDraft[employee.id] ?? employee.username ?? ''}
                            onChange={(e) =>
                              setUsernameDraft((d) => ({ ...d, [employee.id]: e.target.value }))
                            }
                            aria-label={`Username ${employee.fullName}`}
                            className="h-8 w-32"
                            placeholder="username"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleUsername(employee)}
                          >
                            Simpan
                          </Button>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Select
                          value={employee.level}
                          disabled={busy}
                          aria-label={`Tingkat ${employee.fullName}`}
                          className="h-8 w-28"
                          onChange={(e) =>
                            void handleLevel(employee, e.target.value as EmployeeLevel)
                          }
                        >
                          <option value="STAFF">Staf</option>
                          <option value="LEADER">Pimpinan</option>
                        </Select>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Select
                          value={employee.supervisorId ?? ''}
                          disabled={busy}
                          aria-label={`Atasan langsung ${employee.fullName}`}
                          className="h-8 w-40"
                          onChange={(e) => void handleSupervisor(employee, e.target.value)}
                        >
                          <option value="">— belum ditetapkan —</option>
                          {leaders
                            .filter((l) => l.id !== employee.id)
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.displayName}
                              </option>
                            ))}
                        </Select>
                      </td>
                      <td className="py-2.5 pr-3">
                        {!employee.active ? (
                          <Badge tone="neutral">Pegawai nonaktif</Badge>
                        ) : !account?.hasAccount ? (
                          <Badge tone="warning">Belum punya akun</Badge>
                        ) : account.isActive ? (
                          <div className="flex flex-wrap gap-1">
                            <Badge tone="success">Aktif</Badge>
                            {account.mustChangePassword && (
                              <Badge tone="warning">Wajib ganti password</Badge>
                            )}
                          </div>
                        ) : (
                          <Badge tone="warning">Nonaktif</Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-500">
                        {account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : 'Belum pernah'}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          {!account?.hasAccount ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy || !employee.active}
                              onClick={() =>
                                void run(
                                  employee.id,
                                  () => getDataService().accounts.provision(employee.id),
                                  `Akun ${employee.displayName} dibuat.`,
                                )
                              }
                            >
                              <UserPlus className="size-3.5" aria-hidden />
                              Buat akun
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void handleReset(employee)}
                              >
                                <KeyRound className="size-3.5" aria-hidden />
                                Reset password
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  void run(
                                    employee.id,
                                    () =>
                                      getDataService().accounts.setActive(
                                        employee.id,
                                        !account.isActive,
                                      ),
                                    account.isActive
                                      ? 'Akun dinonaktifkan.'
                                      : 'Akun diaktifkan.',
                                  )
                                }
                              >
                                <ShieldCheck className="size-3.5" aria-hidden />
                                {account.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
          Password awal setiap akun bersifat sementara dan hanya berlaku untuk masuk pertama kali.
          Aplikasi tidak pernah menampilkan atau menyimpan password pada tabel aplikasi.
        </p>
      </Card>
    </div>
  );
}
