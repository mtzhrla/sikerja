import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileClock, XCircle } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatDateTime } from '@/lib/format';
import { getDataService } from '@/services';
import type { AuditAction, AuditEntityType, AuditFilter } from '@/services/types';
import { qk, useEmployees } from '@/hooks/queries';

const PAGE_SIZE = 30;

const ACTIONS: AuditAction[] = [
  'CREATE', 'UPDATE', 'MOVE', 'ARCHIVE', 'UNARCHIVE', 'SOFT_DELETE', 'RESTORE',
  'PERMANENT_DELETE', 'IMPORT', 'ACTIVATE', 'DEACTIVATE', 'CORRECTION', 'LOGIN',
  'LOGIN_FAILED', 'LOGOUT', 'REVOKE_SESSION', 'SETTINGS_UPDATE', 'PASSWORD_CHANGE',
  'BACKUP', 'RESTORE_BACKUP',
];

const ENTITIES: AuditEntityType[] = [
  'TASK', 'STEP', 'BOARD', 'COMMENT', 'ATTACHMENT', 'EMPLOYEE', 'CATEGORY', 'LABEL',
  'TEMPLATE', 'SNAPSHOT', 'SETTINGS', 'SESSION', 'AUTH',
];

/** Audit Log — hanya Admin; mencatat pelaku, sebelum/sesudah, status, dan sesi. */
export function AuditSection() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const employeesQ = useEmployees(true);
  const byId = useMemo(
    () => new Map((employeesQ.data ?? []).map((e) => [e.id, e])),
    [employeesQ.data],
  );

  const filter: AuditFilter = useMemo(
    () => ({
      action: (action || undefined) as AuditAction | undefined,
      entityType: (entityType || undefined) as AuditEntityType | undefined,
      employeeId: employeeId || undefined,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [action, entityType, employeeId, search, dateFrom, dateTo, page],
  );

  const auditQ = useQuery({
    queryKey: qk.auditList(filter),
    queryFn: () => getDataService().audit.list(filter),
  });

  const total = auditQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPage() {
    setPage(0);
  }

  return (
    <Card>
      <CardHeader
        title="Audit Log"
        description="Jejak seluruh perubahan penting: pegawai pelaku, waktu, nilai sebelum/sesudah, dan sesi. Tidak dapat diubah."
      />
      <div className="space-y-3 p-4 pt-2">
        {/* Filter */}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <Field label="Aksi">
            <Select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                resetPage();
              }}
            >
              <option value="">Semua aksi</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Entitas">
            <Select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                resetPage();
              }}
            >
              <option value="">Semua entitas</option>
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pegawai pelaku">
            <Select
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                resetPage();
              }}
            >
              <option value="">Semua pegawai</option>
              {(employeesQ.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dari tanggal">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                resetPage();
              }}
            />
          </Field>
          <Field label="Sampai tanggal">
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                resetPage();
              }}
            />
          </Field>
          <Field label="Cari">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="Label entitas / akun…"
            />
          </Field>
        </div>

        {auditQ.isLoading ? (
          <LoadingBlock compact label="Memuat audit…" />
        ) : auditQ.isError ? (
          <ErrorState compact error={auditQ.error} onRetry={() => void auditQ.refetch()} />
        ) : (auditQ.data?.entries.length ?? 0) === 0 ? (
          <EmptyState compact icon={FileClock} title="Tidak ada entri sesuai filter" />
        ) : (
          <>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] font-bold text-slate-500 uppercase">
                    <th className="w-6 py-2" aria-label="Detail" />
                    <th className="py-2 pr-3">Waktu</th>
                    <th className="px-3 py-2">Pelaku</th>
                    <th className="px-3 py-2">Aksi</th>
                    <th className="px-3 py-2">Entitas</th>
                    <th className="px-3 py-2">Keterangan</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(auditQ.data?.entries ?? []).map((entry) => {
                    const emp = entry.employeeId ? byId.get(entry.employeeId) : null;
                    const isOpen = expanded === entry.id;
                    return (
                      <Fragment key={entry.id}>
                        <tr
                          className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                          onClick={() => setExpanded(isOpen ? null : entry.id)}
                        >
                          <td className="py-2 text-slate-400">
                            {isOpen ? (
                              <ChevronDown className="size-4" aria-hidden />
                            ) : (
                              <ChevronRight className="size-4" aria-hidden />
                            )}
                          </td>
                          <td className="tnum py-2 pr-3 text-xs whitespace-nowrap text-slate-500">
                            {formatDateTime(entry.at)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-semibold text-slate-700">
                              {emp?.displayName ?? entry.actorAccount}
                            </span>
                            <Badge tone={entry.actorRole === 'ADMIN' ? 'brand' : 'neutral'} className="ml-1.5">
                              {entry.actorRole}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs font-bold text-slate-600">
                            {entry.action}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500">{entry.entityType}</td>
                          <td className="max-w-64 truncate px-3 py-2 text-xs text-slate-600">
                            {entry.entityLabel ?? '–'}
                          </td>
                          <td className="px-3 py-2">
                            {entry.success ? (
                              <Badge tone="success">Berhasil</Badge>
                            ) : (
                              <Badge tone="danger">
                                <XCircle className="mr-0.5 size-3" aria-hidden /> Gagal
                              </Badge>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-slate-100 bg-slate-50/60">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="grid gap-3 text-xs lg:grid-cols-2">
                                <div>
                                  <p className="mb-1 font-bold text-slate-500 uppercase">Sebelum</p>
                                  <pre className="scrollbar-thin max-h-40 overflow-auto rounded-lg bg-white p-2 text-[11px] whitespace-pre-wrap text-slate-600">
                                    {entry.before ? JSON.stringify(entry.before, null, 2) : '–'}
                                  </pre>
                                </div>
                                <div>
                                  <p className="mb-1 font-bold text-slate-500 uppercase">Sesudah</p>
                                  <pre className="scrollbar-thin max-h-40 overflow-auto rounded-lg bg-white p-2 text-[11px] whitespace-pre-wrap text-slate-600">
                                    {entry.after ? JSON.stringify(entry.after, null, 2) : '–'}
                                  </pre>
                                </div>
                              </div>
                              <p className="mt-2 text-[11px] text-slate-400">
                                Akun: {entry.actorAccount} · Sesi: {entry.sessionId ?? '–'} ·
                                Perangkat: {entry.deviceLabel ?? '–'}
                                {entry.errorMessage && ` · Error: ${entry.errorMessage}`}
                              </p>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="tnum">
                {total} entri · halaman {page + 1}/{pageCount}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
