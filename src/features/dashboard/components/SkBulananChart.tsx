import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { JENJANG_LIST, type Jenjang } from '@/services/types';
import { CHART_INK, JENJANG_COLORS } from '../chart-tokens';
import type { SkStats } from '../lib';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

interface SkBulananChartProps {
  stats: SkStats;
}

/**
 * Penerbitan SK per bulan — bar bertumpuk per jenjang.
 * Satu nomor SK unik dihitung SATU kali pada bulan tanggal SK paling awal;
 * SK tanpa tanggal valid di luar chart (dilaporkan sebagai catatan).
 *
 * Sumbu bulan selalu Jan–Des (komposisi referensi Dashboard) — bulan tanpa SK
 * tampil bernilai 0. Warna kategorikal jenjang berurutan tetap; angka eksak per
 * jenjang selalu tersedia di tabel Detail Rekap per Jenjang (relief kontras).
 */
export function SkBulananChart({ stats }: SkBulananChartProps) {
  if (stats.totalSk === 0) {
    return (
      <EmptyState
        compact
        icon={FileText}
        title="Belum ada data nomor SK"
        description="Jumlah SK tampil setelah sinkronisasi sheet Pemberian (kolom nomor & tanggal SK)."
      />
    );
  }

  const activeJenjang = JENJANG_LIST.filter((j) =>
    stats.perMonth.some((m) => (m.perJenjang[j] ?? 0) > 0),
  );

  const data = stats.perMonth.map((m) => ({
    bulan: MONTH_LABELS[m.month - 1],
    total: m.total,
    ...Object.fromEntries(activeJenjang.map((j) => [j, m.perJenjang[j] ?? 0])),
  }));
  const peak = Math.max(...data.map((d) => d.total), 0);
  // Beri kepala ruang di atas batang tertinggi agar label total tidak terpotong.
  const yMax = peak > 0 ? Math.ceil((peak * 1.18) / 10) * 10 : 10;
  const labelHost: Jenjang | undefined = activeJenjang[activeJenjang.length - 1];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="min-h-0 flex-1"
        role="img"
        aria-label={`Grafik penerbitan SK per bulan: total ${stats.totalSk} SK unik`}
      >
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 20, right: 12, left: 4, bottom: 4 }} barCategoryGap="24%">
            <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
            <XAxis
              dataKey="bulan"
              axisLine={false}
              tickLine={false}
              interval={0}
              tickMargin={10}
              tick={{ fill: CHART_INK.axis, fontSize: 13, fontWeight: 600 }}
            />
            <YAxis
              width={34}
              domain={[0, yMax]}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tickCount={5}
              tick={{ fill: CHART_INK.axis, fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
              formatter={(value: number | string, name: string) => [`${value} SK`, name]}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
              }}
              // Teks tooltip memakai warna tinta, bukan warna seri (kontras AA);
              // identitas jenjang tetap terbawa lewat urutan & legend.
              labelStyle={{ color: CHART_INK.label, fontWeight: 700 }}
              itemStyle={{ color: CHART_INK.label }}
            />
            <Legend
              iconType="circle"
              iconSize={9}
              wrapperStyle={{ fontSize: 12, fontWeight: 600, color: CHART_INK.label, paddingTop: 6 }}
            />
            {activeJenjang.map((j) => (
              <Bar
                key={j}
                dataKey={j}
                stackId="sk"
                fill={JENJANG_COLORS[j]}
                stroke="#ffffff"
                strokeWidth={1}
                maxBarSize={56}
                isAnimationActive={false}
                radius={j === labelHost ? [4, 4, 0, 0] : undefined}
              >
                {j === labelHost && (
                  <LabelList
                    dataKey="total"
                    position="top"
                    offset={8}
                    formatter={(v: number) => (v > 0 ? v : '')}
                    style={{ fill: CHART_INK.label, fontSize: 13, fontWeight: 800 }}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {(stats.undatedSk > 0 || stats.multiDateNomor.length > 0) && (
        <p className="mt-1 shrink-0 text-[11px] text-slate-500">
          {stats.undatedSk > 0 && `${stats.undatedSk} SK tanpa tanggal valid (di luar grafik)`}
          {stats.undatedSk > 0 && stats.multiDateNomor.length > 0 && ' · '}
          {stats.multiDateNomor.length > 0 &&
            `${stats.multiDateNomor.length} SK perlu validasi tanggal (dipakai tanggal paling awal)`}
        </p>
      )}
    </div>
  );
}
