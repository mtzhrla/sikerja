import { CheckCircle2, CircleAlert, CircleDashed, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';
import {
  useEmployees,
  useGoogleStatus,
  useSources,
  useSyncRuns,
  useTasks,
} from '@/hooks/queries';

type Tone = 'ok' | 'warn' | 'off';

const TONE_ICON: Record<Tone, LucideIcon> = {
  ok: CheckCircle2,
  warn: CircleAlert,
  off: CircleDashed,
};

function StatusRow({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone: Tone;
  detail?: string;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4.5 shrink-0',
          tone === 'ok' && 'text-success-600',
          tone === 'warn' && 'text-warning-600',
          tone === 'off' && 'text-slate-400',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </div>
      <Badge tone={tone === 'ok' ? 'success' : tone === 'warn' ? 'warning' : 'neutral'}>
        {value}
      </Badge>
    </li>
  );
}

/**
 * Ringkasan Admin — status OPERASIONAL yang relevan bagi admin aplikasi
 * (bukan pengelola infrastruktur): koneksi Google, sinkronisasi spreadsheet,
 * isi data, dan hal yang perlu ditindaklanjuti.
 */
export function OverviewSection() {
  const { data: google } = useGoogleStatus();
  const { data: sources } = useSources({ includeInactive: true });
  const { data: runs } = useSyncRuns(undefined, 1);
  const { data: employees } = useEmployees(true);
  const { data: tasks } = useTasks();

  const activeSources = (sources ?? []).filter((s) => s.isActive && !s.deletedAt);
  const failing = activeSources.filter(
    (s) => s.lastSyncStatus === 'GAGAL' || s.lastSyncStatus === 'PERLU_VALIDASI',
  );
  const lastRun = runs?.[0] ?? null;
  const activeEmployees = (employees ?? []).filter((e) => e.active).length;
  const activeTasks = (tasks ?? []).length;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Status Integrasi"
          description="Koneksi Google dan sinkronisasi sumber spreadsheet"
        />
        <ul className="divide-y divide-slate-100 px-4 pb-2">
          {google?.accessMode === 'service_account' ? (
            <StatusRow
              label="Koneksi Google Sheets"
              detail={
                google.serviceAccountEmail
                  ? `Koneksi Sistem · bagikan spreadsheet ke ${google.serviceAccountEmail} (Viewer).`
                  : 'Koneksi Sistem membaca spreadsheet (read-only). Tidak perlu login Google.'
              }
              value="Aktif"
              tone="ok"
            />
          ) : (
            <StatusRow
              label="Akun Google"
              detail={
                google?.connected
                  ? `Terhubung sebagai ${google.email ?? '—'}${google.connectedAt ? ` · sejak ${formatRelative(google.connectedAt)}` : ''}`
                  : 'Satu akun Google dipakai untuk membaca seluruh spreadsheet.'
              }
              value={
                google?.connected
                  ? google.tokenStatus === 'AKTIF'
                    ? 'Terhubung'
                    : 'Perlu login ulang'
                  : google?.configured
                    ? 'Belum terhubung'
                    : 'Belum disiapkan'
              }
              tone={google?.connected ? (google.tokenStatus === 'AKTIF' ? 'ok' : 'warn') : 'off'}
            />
          )}
          <StatusRow
            label="Sumber spreadsheet"
            detail={
              failing.length > 0
                ? `${failing.length} sumber perlu ditindaklanjuti (gagal/perlu validasi).`
                : 'Data penyaluran & Rencana Kegiatan dibaca dari spreadsheet.'
            }
            value={`${activeSources.length} aktif`}
            tone={failing.length > 0 ? 'warn' : activeSources.length > 0 ? 'ok' : 'off'}
          />
          <StatusRow
            label="Sinkronisasi terakhir"
            detail={
              lastRun
                ? `${formatRelative(lastRun.startedAt)} · ${lastRun.rowsRead} baris dibaca${lastRun.errorMessage ? ` · ${lastRun.errorMessage}` : ''}`
                : 'Belum ada sinkronisasi tercatat.'
            }
            value={
              lastRun
                ? lastRun.status === 'BERHASIL'
                  ? 'Berhasil'
                  : lastRun.status === 'PERLU_VALIDASI'
                    ? 'Perlu Validasi'
                    : 'Gagal'
                : '—'
            }
            tone={lastRun ? (lastRun.status === 'BERHASIL' ? 'ok' : 'warn') : 'off'}
          />
          <StatusRow
            label="Pembaruan otomatis"
            detail="Perubahan data tampil langsung di seluruh perangkat tanpa muat ulang."
            value="Aktif"
            tone="ok"
          />
        </ul>
      </Card>

      <Card>
        <CardHeader title="Isi Aplikasi" description="Ringkasan data yang dikelola" />
        <dl className="grid grid-cols-2 gap-3 p-4">
          <div className="rounded-xl bg-(image:--gradient-brand-soft) p-3">
            <dt className="text-xs font-semibold text-slate-600">Pegawai aktif</dt>
            <dd className="tnum text-2xl font-extrabold text-slate-900">{activeEmployees}</dd>
          </div>
          <div className="rounded-xl bg-(image:--gradient-brand-soft) p-3">
            <dt className="text-xs font-semibold text-slate-600">Pekerjaan aktif</dt>
            <dd className="tnum text-2xl font-extrabold text-slate-900">{activeTasks}</dd>
          </div>
        </dl>
        {failing.length > 0 && (
          <p className="px-4 pb-4 text-xs leading-relaxed text-warning-600">
            Ada sumber data yang gagal disinkronkan — buka modul Integrasi Data untuk
            memeriksa dan menjalankan ulang sinkronisasi.
          </p>
        )}
      </Card>
    </div>
  );
}
