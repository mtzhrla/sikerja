import { FileText, Users, UserRoundCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatNumber, formatPercent, formatRupiahCompact } from '@/lib/format';
import type { DistributionTotals } from '../lib';

/** Bar progres berwarna khusus KPI (hijau siswa / oranye dana). */
function KpiBar({ ratio, label, barClass }: { ratio: number; label: string; barClass: string }) {
  const pct = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${barClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Empat KPI penyaluran (komposisi referensi Dashboard):
 * - Alokasi      : kuota siswa (utama) + total dana alokasi (sekunder).
 * - SK Pemberian : realisasi siswa + dana SK + badge jumlah SK unik terbit
 *                  (COUNT DISTINCT nomor SK sheet Pemberian — bukan jumlah siswa).
 * - Progres Siswa: persentase + bar + realisasi dibanding alokasi siswa.
 * - Progres Dana : persentase + bar + dana SK dibanding alokasi dana.
 */
export function DistributionKpis({
  totals,
  skCount,
}: {
  totals: DistributionTotals;
  /** Jumlah nomor SK unik; null bila detail SK belum tersedia. */
  skCount: number | null;
}) {
  const cardClass =
    'liftable flex flex-col gap-3 p-4 tall:p-3.5 short:gap-2.5 short:p-3.5';
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 short:gap-3">
      {/* Alokasi */}
      <Card className={cardClass}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 short:size-10"
          >
            <Users className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-500">Alokasi</p>
            <p className="tnum text-2xl leading-tight font-extrabold text-slate-900 lg:text-[1.375rem] min-[1600px]:text-3xl">
              {formatNumber(totals.alokasiSiswa)}{' '}
              <span className="text-sm font-bold text-slate-400">siswa</span>
            </p>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <span className="text-sm text-slate-500">Total Dana</span>
          <span className="tnum text-sm font-bold text-slate-800">
            {formatRupiahCompact(totals.alokasiAnggaran)}
          </span>
        </div>
      </Card>

      {/* SK Pemberian */}
      <Card className={cardClass}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 short:size-10"
          >
            <FileText className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-500">SK Pemberian</p>
            <p className="tnum text-2xl leading-tight font-extrabold text-slate-900 lg:text-[1.375rem] min-[1600px]:text-3xl">
              {formatNumber(totals.skSiswa)}{' '}
              <span className="text-sm font-bold text-slate-400">siswa</span>
            </p>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-slate-100 pt-2.5">
          <span className="text-sm text-slate-500">
            Total Dana{' '}
            <span className="tnum font-bold text-slate-800">
              {formatRupiahCompact(totals.skAnggaran)}
            </span>
          </span>
          {skCount !== null && (
            <span className="tnum inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
              {formatNumber(skCount)} SK terbit
            </span>
          )}
        </div>
      </Card>

      {/* Progres Siswa */}
      <Card className={cardClass}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-success-50 text-success-600 short:size-10"
          >
            <UserRoundCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-500">Progres Siswa</p>
            <p className="tnum text-2xl leading-tight font-extrabold text-success-600 lg:text-[1.375rem] min-[1600px]:text-3xl">
              {formatPercent(totals.progresSiswa, 0)}
            </p>
          </div>
        </div>
        <div className="mt-auto space-y-1.5">
          <KpiBar
            ratio={totals.progresSiswa}
            label="Progres siswa"
            barClass="bg-success-500"
          />
          <p className="tnum text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{formatNumber(totals.salurSiswa)}</span>{' '}
            dari {formatNumber(totals.alokasiSiswa)} siswa
          </p>
        </div>
      </Card>

      {/* Progres Dana */}
      <Card className={cardClass}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-700 short:size-10"
          >
            <span className="text-sm font-extrabold">Rp</span>
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-500">Progres Dana</p>
            <p className="tnum text-2xl leading-tight font-extrabold text-warning-600 lg:text-[1.375rem] min-[1600px]:text-3xl">
              {formatPercent(totals.progresDana, 0)}
            </p>
          </div>
        </div>
        <div className="mt-auto space-y-1.5">
          <KpiBar ratio={totals.progresDana} label="Progres dana" barClass="bg-warning-500" />
          <p className="tnum text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              {formatRupiahCompact(totals.salurAnggaran)}
            </span>{' '}
            dari {formatRupiahCompact(totals.alokasiAnggaran)}
          </p>
        </div>
      </Card>
    </div>
  );
}
