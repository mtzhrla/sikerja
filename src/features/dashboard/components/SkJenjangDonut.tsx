import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { formatNumber, formatPercent } from '@/lib/format';
import { JENJANG_LIST, type Jenjang } from '@/services/types';
import { JENJANG_COLORS } from '../chart-tokens';

interface SkJenjangDonutProps {
  /** Jumlah nomor SK unik per jenjang (bukan jumlah siswa). */
  perJenjang: Partial<Record<Jenjang, number>>;
  /** Jumlah nomor SK unik global — SK lintas jenjang dihitung sekali. */
  totalSk: number;
}

/**
 * Jumlah SK per Jenjang — donut nomor SK UNIK per jenjang dengan daftar rinci
 * di samping (nama, jumlah SK, persentase, bar mini). Angka tengah = total SK
 * unik global; jangan tertukar dengan jumlah siswa SK Pemberian. Persentase
 * dihitung dari jumlah per jenjang (SK lintas jenjang tercatat pada tiap
 * jenjang — bila ada, dijelaskan lewat catatan kaki).
 */
export function SkJenjangDonut({ perJenjang, totalSk }: SkJenjangDonutProps) {
  const items = JENJANG_LIST.map((j) => ({ jenjang: j, value: perJenjang[j] ?? 0 })).filter(
    (d) => d.value > 0,
  );
  const sum = items.reduce((acc, d) => acc + d.value, 0);

  if (totalSk === 0 || sum === 0) {
    return (
      <EmptyState
        compact
        icon={FileText}
        title="Belum ada data nomor SK"
        description="Jumlah SK per jenjang tampil setelah sinkronisasi sheet Pemberian (kolom nomor SK)."
      />
    );
  }

  const crossJenjang = sum !== totalSk;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center gap-4">
        {/* Donut + angka tengah */}
        <div
          className="relative h-full min-h-0 flex-1"
          role="img"
          aria-label={`Total ${formatNumber(totalSk)} SK unik: ${items
            .map((d) => `${d.jenjang} ${formatNumber(d.value)} SK`)
            .join(', ')}`}
        >
          {/* aria-hidden: sektor SVG recharts diberi role="img" tanpa label;
              deskripsi lengkap sudah ada pada kontainer role="img" di atas. */}
          <div aria-hidden className="h-full w-full">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={items}
                dataKey="value"
                nameKey="jenjang"
                innerRadius="68%"
                outerRadius="96%"
                startAngle={90}
                endAngle={-270}
                stroke="#ffffff"
                strokeWidth={2}
                isAnimationActive={false}
                rootTabIndex={-1}
              >
                {items.map((d) => (
                  <Cell key={d.jenjang} fill={JENJANG_COLORS[d.jenjang]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number | string, name: string) => [
                  `${formatNumber(Number(value))} SK`,
                  name,
                ]}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                  boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
                }}
                // Teks tooltip memakai warna tinta, bukan warna seri (kontras AA).
                labelStyle={{ color: '#334155', fontWeight: 700 }}
                itemStyle={{ color: '#334155' }}
              />
            </PieChart>
          </ResponsiveContainer>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          >
            <p className="tnum text-3xl leading-none font-extrabold text-slate-900 2xl:text-4xl">
              {formatNumber(totalSk)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Total SK</p>
          </div>
        </div>

        {/* Daftar jenjang: jumlah SK, persentase, bar mini */}
        <ul className="flex w-[52%] shrink-0 flex-col justify-center gap-3 short:gap-2">
          {items.map((d) => {
            const pct = d.value / sum;
            const color = JENJANG_COLORS[d.jenjang];
            return (
              <li
                key={d.jenjang}
                className="flex items-center gap-2.5"
                aria-label={`${d.jenjang}: ${formatNumber(d.value)} SK (${formatPercent(pct)})`}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="w-10 shrink-0 text-sm font-bold text-slate-800">{d.jenjang}</span>
                <span className="tnum ml-auto shrink-0 text-sm font-bold text-slate-900">
                  {formatNumber(d.value)}
                </span>
                <span className="tnum w-13 shrink-0 text-right text-xs text-slate-500">
                  {formatPercent(pct)}
                </span>
                <span
                  aria-hidden
                  className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100 2xl:w-16"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${pct * 100}%`, backgroundColor: color }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {crossJenjang && (
        <p className="mt-1 shrink-0 text-[11px] text-slate-500">
          SK yang mencakup lebih dari satu jenjang dihitung pada tiap jenjang, namun sekali pada
          total.
        </p>
      )}
    </div>
  );
}
