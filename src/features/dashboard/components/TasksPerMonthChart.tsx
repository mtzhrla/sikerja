import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SquareKanban } from 'lucide-react';
import { EmptyState } from '@/components/feedback/empty-state';
import { CHART_INK } from '../chart-tokens';
import type { TaskMonthCount } from '../lib';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

interface TasksPerMonthChartProps {
  stats: TaskMonthCount[];
  /** Bulan terpilih (1–12) untuk disorot; null bila filter "Semua Bulan". */
  highlightMonth?: number | null;
}

/** Jumlah pekerjaan dibuat per bulan (tren tahunan) — sumbu selalu Jan–Des. */
export function TasksPerMonthChart({ stats, highlightMonth }: TasksPerMonthChartProps) {
  const total = stats.reduce((acc, m) => acc + m.count, 0);
  if (total === 0) {
    return (
      <EmptyState
        compact
        icon={SquareKanban}
        title="Belum ada pekerjaan"
        description="Grafik tampil setelah ada pekerjaan yang dibuat pada tahun ini."
      />
    );
  }

  const data = stats.map((m) => ({ bulan: MONTH_LABELS[m.month - 1], jumlah: m.count, month: m.month }));

  return (
    <div
      className="h-full min-h-0"
      role="img"
      aria-label={`Grafik jumlah pekerjaan per bulan: total ${total} pekerjaan`}
    >
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis
            dataKey="bulan"
            axisLine={false}
            tickLine={false}
            interval={0}
            tickMargin={8}
            tick={{ fill: CHART_INK.axis, fontSize: 11, fontWeight: 600 }}
          />
          <YAxis
            width={28}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: CHART_INK.axis, fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
            formatter={(value: number | string) => [`${value} pekerjaan`, 'Jumlah']}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              fontSize: 12,
              boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
            }}
            labelStyle={{ color: CHART_INK.label, fontWeight: 700 }}
            itemStyle={{ color: CHART_INK.label }}
          />
          <Bar dataKey="jumlah" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.month} fill={d.month === highlightMonth ? '#7c5cf5' : '#c4b5fd'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
