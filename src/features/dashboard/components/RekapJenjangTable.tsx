import { cn } from '@/lib/utils';
import { formatNumber, formatPercent, formatRupiahCompact } from '@/lib/format';
import type { DistributionRow, Jenjang } from '@/services/types';
import { totalsFromRows, type JenjangFilter } from '../lib';
import { JENJANG_COLORS } from '../chart-tokens';

interface RekapJenjangTableProps {
  rows: DistributionRow[];
  highlight: JenjangFilter;
  /** Jumlah SK unik per jenjang; null bila detail SK belum tersedia. */
  skPerJenjang: Partial<Record<Jenjang, number>> | null;
  /** Jumlah SK unik global (SK lintas jenjang dihitung sekali). */
  skTotal: number | null;
}

/** Bar progres mini kolom Progres % — warna mengikuti kategori jenjang. */
function MiniBar({ ratio, color }: { ratio: number; color: string }) {
  const pct = Math.min(Math.max(ratio, 0), 1) * 100;
  return (
    <span aria-hidden className="block h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <span
        className="block h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </span>
  );
}

const cellY = 'py-2.5 tall:py-2 short:py-1.5';

/**
 * Detail Rekap per Jenjang — satu-satunya sumber angka DETAIL per jenjang:
 * alokasi siswa, siswa SK Pemberian, jumlah SK unik, dana SK, dan progres.
 * Progres % = siswa SK Pemberian dibanding alokasi siswa (identik realisasi
 * pada data produksi). Kolom "Sisa" tidak diulang — tersirat dari progres.
 */
export function RekapJenjangTable({
  rows,
  highlight,
  skPerJenjang,
  skTotal,
}: RekapJenjangTableProps) {
  const total = totalsFromRows(rows);
  const totalProgres = total.alokasiSiswa > 0 ? total.skSiswa / total.alokasiSiswa : 0;
  const skSum = skPerJenjang ? Object.values(skPerJenjang).reduce((a, v) => a + (v ?? 0), 0) : 0;
  const crossJenjangNote = skTotal !== null && skPerJenjang !== null && skSum !== skTotal;
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] font-bold tracking-wide text-slate-500 uppercase">
            <th className={cn(cellY, 'pr-3')}>Jenjang</th>
            <th className={cn(cellY, 'px-3 text-right')} title="Kuota alokasi siswa tervalidasi">
              Alokasi
            </th>
            <th
              className={cn(cellY, 'px-3 text-right')}
              title="Jumlah siswa penerima pada SK Pemberian"
            >
              SK Pemberian
            </th>
            <th
              className={cn(cellY, 'px-3 text-right')}
              title="Jumlah dokumen SK unik (bukan jumlah siswa)"
            >
              Jumlah SK
            </th>
            <th className={cn(cellY, 'px-3 text-right')} title="Total dana pada SK Pemberian">
              Jumlah Dana
            </th>
            <th className={cn(cellY, 'w-52 px-3')}>Progres %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const progres = r.alokasiSiswa > 0 ? r.skSiswa / r.alokasiSiswa : 0;
            return (
              <tr
                key={r.jenjang}
                className={cn(
                  'border-b border-slate-100',
                  highlight === r.jenjang && 'bg-brand-50/60',
                )}
              >
                <td className={cn(cellY, 'pr-3 font-bold text-slate-800')}>
                  <span className="inline-flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: JENJANG_COLORS[r.jenjang] }}
                    />
                    {r.jenjang}
                  </span>
                </td>
                <td className={cn(cellY, 'tnum px-3 text-right text-slate-600')}>
                  {formatNumber(r.alokasiSiswa)}
                </td>
                <td className={cn(cellY, 'tnum px-3 text-right font-semibold text-slate-900')}>
                  {formatNumber(r.skSiswa)}
                </td>
                <td className={cn(cellY, 'tnum px-3 text-right text-slate-600')}>
                  {skPerJenjang ? formatNumber(skPerJenjang[r.jenjang] ?? 0) : '–'}
                </td>
                <td className={cn(cellY, 'tnum px-3 text-right text-slate-600')}>
                  {formatRupiahCompact(r.skAnggaran)}
                </td>
                <td className={cn(cellY, 'px-3')}>
                  <div
                    className="flex items-center gap-2.5"
                    aria-label={`Progres ${r.jenjang}: ${formatPercent(progres)}`}
                  >
                    <span className="tnum w-13 shrink-0 text-right text-xs font-semibold text-slate-700">
                      {formatPercent(progres)}
                    </span>
                    <MiniBar ratio={progres} color={JENJANG_COLORS[r.jenjang]} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50/80 text-slate-900">
            <td className={cn(cellY, 'rounded-l-lg pr-3 font-extrabold')}>Total</td>
            <td className={cn(cellY, 'tnum px-3 text-right font-bold')}>
              {formatNumber(total.alokasiSiswa)}
            </td>
            <td className={cn(cellY, 'tnum px-3 text-right font-bold')}>
              {formatNumber(total.skSiswa)}
            </td>
            <td className={cn(cellY, 'tnum px-3 text-right font-bold')}>
              {skTotal !== null ? formatNumber(skTotal) : '–'}
              {crossJenjangNote && <span aria-hidden>*</span>}
            </td>
            <td className={cn(cellY, 'tnum px-3 text-right font-bold')}>
              {formatRupiahCompact(total.skAnggaran)}
            </td>
            <td className={cn(cellY, 'rounded-r-lg px-3')}>
              <div
                className="flex items-center gap-2.5"
                aria-label={`Progres total: ${formatPercent(totalProgres)}`}
              >
                <span className="tnum w-13 shrink-0 text-right text-xs font-extrabold text-brand-700">
                  {formatPercent(totalProgres)}
                </span>
                <MiniBar ratio={totalProgres} color="var(--color-brand-600)" />
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
      {crossJenjangNote && (
        <p className="mt-1 text-[11px] text-slate-500">
          * Total menghitung nomor SK unik global; SK yang mencakup lebih dari satu jenjang dihitung
          pada tiap jenjang tetapi hanya sekali pada total.
        </p>
      )}
    </div>
  );
}
