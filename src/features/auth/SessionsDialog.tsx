import { useState } from 'react';
import { MonitorSmartphone, ShieldOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/components/feedback/confirm-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingBlock } from '@/components/feedback/loading-block';
import { notify } from '@/components/feedback/toaster';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { formatRelative } from '@/lib/format';
import { errorMessage } from '@/services/errors';
import { getDataService } from '@/services';
import { qk, useSessions } from '@/hooks/queries';
import { useSessionStore } from './session-store';

interface SessionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Daftar sesi perangkat + pencabutan sesi (Admin). Dipakai juga di Pengaturan. */
export function SessionsDialog({ open, onOpenChange }: SessionsDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Sesi perangkat"
      description="Cabut sesi untuk memaksa perangkat keluar. Sesi User bersifat persisten sampai dicabut atau kedaluwarsa."
      size="lg"
    >
      <SessionsPanel enabled={open} />
    </Modal>
  );
}

export function SessionsPanel({ enabled = true }: { enabled?: boolean }) {
  const { session: ownSession } = useSessionStore();
  const { data: sessions, isLoading, isError, error, refetch } = useSessions(enabled);
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function revoke(id: string, label: string) {
    const ok = await confirm({
      title: 'Cabut sesi ini?',
      description: `Perangkat "${label}" akan langsung keluar dan harus login ulang.`,
      confirmLabel: 'Cabut sesi',
      danger: true,
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await getDataService().auth.revokeSession(id);
      notify.success('Sesi dicabut.');
      await queryClient.invalidateQueries({ queryKey: qk.sessions() });
    } catch (err) {
      notify.error('Gagal mencabut sesi', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) return <LoadingBlock compact label="Memuat sesi…" />;
  if (isError) return <ErrorState compact error={error} onRetry={() => void refetch()} />;
  if (!sessions || sessions.length === 0) {
    return (
      <EmptyState
        compact
        icon={MonitorSmartphone}
        title="Belum ada sesi"
        description="Sesi login perangkat akan tampil di sini."
      />
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {sessions.map((s) => {
        const isOwn = s.id === ownSession?.id;
        const revoked = !!s.revokedAt;
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <MonitorSmartphone className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800">
                {s.deviceLabel}
                <Badge tone={s.role === 'ADMIN' ? 'brand' : 'neutral'}>{s.role}</Badge>
                {isOwn && <Badge tone="success">Sesi ini</Badge>}
                {revoked && <Badge tone="danger">Dicabut</Badge>}
              </p>
              <p className="text-xs text-slate-500">
                Aktif {formatRelative(s.lastActiveAt)} · masuk {formatRelative(s.createdAt)}
              </p>
            </div>
            {!revoked && (
              <Button
                variant="outline"
                size="sm"
                loading={busyId === s.id}
                onClick={() => void revoke(s.id, s.deviceLabel)}
              >
                <ShieldOff className="size-3.5" aria-hidden />
                Cabut
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
