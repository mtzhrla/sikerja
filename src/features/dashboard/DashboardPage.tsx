import { useMemo, useState, type ReactNode } from 'react';
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ErrorState } from '@/components/feedback/error-state';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessionStore } from '@/features/auth/session-store';
import { useActivities, useAppSettings, useSteps, useTasks } from '@/hooks/queries';
import { isAssignedToViewer } from '@/lib/permissions';
import type { ActivityPlanItem } from '@/services/types';
import { formatRange, occursOn, STATUS_META, todayISO } from '@/features/plan/lib';
import { taskCountsByStartMonth } from './lib';

/* ========================================================================
 * TIPE DATA
 * ==================================================================== */

interface TaskKpiTotals {
  totalTasks: number;
  /** Jumlah tugas pada step bernama "To Do". */
  todo: number;
  /** Jumlah tugas pada step bernama "On Progress". */
  running: number;
  /** Jumlah tugas pada step berkind DONE (mis. "Done"). */
  ended: number;
  /** Will Do Project — jumlah tugas pada step bernama "Will Do". */
  willDo: number;
  /** 0-100, dipakai juga untuk donut Project Progress (ended / totalTasks). */
  completionRate: number;
}

/** Bentuk tugas yang sudah disederhanakan untuk widget Calendar/Schedule/Reminder & grafik bulanan. */
interface ScheduleTask {
  id: string;
  title: string;
  /** ISO date (yyyy-MM-dd) — sama seperti `Task.dueDate` di board. */
  dueDate: string;
  stepName: string;
  isDone: boolean;
}

const MONTH_OPTIONS = [
  { value: '', label: 'Semua Bulan' },
  { value: '0', label: 'Januari' },
  { value: '1', label: 'Februari' },
  { value: '2', label: 'Maret' },
  { value: '3', label: 'April' },
  { value: '4', label: 'Mei' },
  { value: '5', label: 'Juni' },
  { value: '6', label: 'Juli' },
  { value: '7', label: 'Agustus' },
  { value: '8', label: 'September' },
  { value: '9', label: 'Oktober' },
  { value: '10', label: 'November' },
  { value: '11', label: 'Desember' },
];
const MONTH_LABELS_SHORT = [
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
const MONTH_LABELS_LONG = [
  'jan',
  'feb',
  'mar',
  'apr',
  'mei',
  'jun',
  'jul',
  'agu',
  'sep',
  'okt',
  'nov',
  'des',
];
const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
/** Warna tiap kategori donut "Project Progress", urutan sama seperti legend-nya. */
const PROGRESS_COLORS = {
  willDo: '#7c5cff',
  todo: '#22c55e',
  running: '#f59e0b',
  done: '#64748b',
};

/**
 * Nama step (kolom board) yang dipetakan ke tiap KPI. Dicocokkan
 * case-insensitive & trim, supaya sedikit variasi kapitalisasi di board
 * tetap terhitung. Kalau nama kolom di board Pekerjaan kamu diganti,
 * sesuaikan juga daftar ini agar KPI tetap akurat.
 */
const WILL_DO_STEP_NAME = 'will do';
const TODO_STEP_NAME = 'to do';
const RUNNING_STEP_NAME = 'on progress';

/* ========================================================================
 * HELPER LOGIC
 * ==================================================================== */

function parseLocalDate(dateStr: string): Date {
  const dateOnly = dateStr.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(dateStr);
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Tugas dengan deadline pada tanggal tertentu — dasar isi Schedule. Selalu dari seluruh data (tanpa filter). */
function tasksDueOn(tasks: ScheduleTask[], date: Date): ScheduleTask[] {
  return tasks
    .filter((t) => isSameDay(parseLocalDate(t.dueDate), date))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Reminder H-5: tugas yang BELUM selesai (step-nya bukan kind DONE) dan
 * deadline-nya jatuh dalam `daysAhead` hari ke depan dari hari ini. Selalu
 * dari seluruh data — TIDAK dipengaruhi filter Tahun/Bulan maupun tanggal
 * yang dipilih di Calendar.
 */
function upcomingReminders(
  tasks: ScheduleTask[],
  today: Date = new Date(),
  daysAhead = 5,
): ScheduleTask[] {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const limit = new Date(startOfToday);
  limit.setDate(limit.getDate() + daysAhead);

  return tasks
    .filter((t) => {
      if (t.isDone) return false;
      const dueDay = parseLocalDate(t.dueDate);
      return dueDay >= startOfToday && dueDay <= limit;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function daysLeft(dateStr: string): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueDay = parseLocalDate(dateStr);
  return Math.round((dueDay.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function dateKey(date: Date): string {
  return todayISO(date);
}

/* ========================================================================
 * SUB-KOMPONEN
 * ==================================================================== */

function SectionSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-8">
        <Skeleton className="h-16" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:col-span-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

/** Angka kartu disamakan dengan rekap pada desain dashboard yang diminta. */
function DistributionKpis() {
  const cards: Array<{
    title: string;
    students: string;
    fundText: string;
    subline: string;
    icon: LucideIcon;
    iconClass: string;
  }> = [
    {
      title: 'Alokasi',
      students: '19.482.627',
      fundText: 'Rp13.763.606.100.000',
      subline: 'Total Dana',
      icon: UsersRound,
      iconClass: 'bg-blue-50 text-blue-500',
    },
    {
      title: 'SK Pemberian',
      students: '13.629.840',
      fundText: 'Rp9.463.746.600.000',
      subline: 'Total Dana',
      icon: FileText,
      iconClass: 'bg-blue-50 text-blue-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      {cards.map((card, index) => (
        <Card key={card.title} className="min-h-[140px] min-w-0 rounded-2xl p-4 sm:p-[18px]">
          <div className="flex items-center gap-3">
            <span
              className={`flex size-12 shrink-0 items-center justify-center rounded-full ${card.iconClass}`}
            >
              <card.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-medium text-slate-500">{card.title}</p>
              <p className="truncate text-2xl leading-tight font-bold tracking-tight text-slate-900 sm:text-[28px]">
                {card.students}
                <span className="ml-1.5 text-base font-semibold tracking-normal text-slate-500">
                  siswa
                </span>
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
            <span className="shrink-0 text-sm text-slate-500">{card.subline}</span>
            <span className="truncate text-sm font-bold text-slate-800">{card.fundText}</span>
            {index === 1 && (
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                16 SK terbit
              </span>
            )}
          </div>
        </Card>
      ))}

      <ProgressSummary
        title="Progres Siswa"
        icon={UserRoundCheck}
        iconClass="bg-emerald-50 text-emerald-600"
        value="69,96%"
        progress={69.96}
        amountText="13.629.840 dari 19.482.627 siswa"
        barClass="bg-emerald-500"
      />
      <ProgressSummary
        title="Progres Dana"
        icon={FileText}
        iconLabel="Rp"
        iconClass="bg-amber-50 text-amber-700"
        value="68,76%"
        progress={68.76}
        amountText="Rp9.463.746.600.000 dari Rp13.763.606.100.000"
        barClass="bg-amber-500"
      />
    </div>
  );
}

function ProgressSummary({
  title,
  icon: Icon,
  iconLabel,
  iconClass,
  value,
  progress,
  amountText,
  barClass,
}: {
  title: string;
  icon: LucideIcon;
  iconLabel?: string;
  iconClass: string;
  value: string;
  progress: number;
  amountText: string;
  barClass: string;
}) {
  return (
    <Card className="min-h-[140px] min-w-0 rounded-2xl p-4 sm:p-[18px]">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-full ${iconClass}`}
        >
          {iconLabel ? (
            <span className="text-lg font-bold">{iconLabel}</span>
          ) : (
            <Icon className="size-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-slate-500">{title}</p>
          <p
            className={`text-2xl leading-tight font-bold tracking-tight sm:text-[28px] ${
              title === 'Progres Siswa' ? 'text-emerald-600' : 'text-amber-600'
            }`}
          >
            {value}
          </p>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <p className="mt-1.5 truncate text-xs text-slate-500">{amountText}</p>
    </Card>
  );
}

/**
 * Donut "Project Progress" — 4 kategori (Will Do, To Do, On Progress, Done)
 * dari KPI di atas, ditampilkan sebagai proporsi terhadap total tugas.
 * Tengahnya tetap bolong (donut, bukan pie penuh) dan menampilkan total
 * tugas; rincian persentase tiap kategori ada di legend sebelah kanan.
 */
function TaskProgressDonut({ totals }: { totals: TaskKpiTotals }) {
  const segments = [
    { name: 'Will Do', value: totals.willDo, color: PROGRESS_COLORS.willDo },
    { name: 'To Do', value: totals.todo, color: PROGRESS_COLORS.todo },
    { name: 'On Progress', value: totals.running, color: PROGRESS_COLORS.running },
    { name: 'Done', value: totals.ended, color: PROGRESS_COLORS.done },
  ];
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const chartData = total > 0 ? segments : [{ name: 'Kosong', value: 1, color: '#e2e8f0' }];

  return (
    <div className="flex h-full w-full items-center justify-center gap-4">
      <div className="relative aspect-square w-36 shrink-0 sm:w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="65%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [`${value}`, name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-slate-900">{total}</span>
          <span className="text-[10px] text-slate-500">Total Task</span>
        </div>
      </div>

      <ul className="flex shrink-0 flex-col gap-2">
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.name} className="flex items-center gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate">{s.name}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-slate-900">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Grafik "jumlah task tiap bulan" — selalu menampilkan 12 bulan pada tahun terpilih. */
function TasksPerMonthChart({ counts, monthFilter }: { counts: number[]; monthFilter: string }) {
  const selectedMonth = monthFilter === '' ? null : Number(monthFilter);
  const data =
    selectedMonth === null
      ? counts.map((value, i) => ({ month: MONTH_LABELS_SHORT[i], value }))
      : [{ month: MONTH_LABELS_SHORT[selectedMonth] ?? '', value: counts[selectedMonth] ?? 0 }];
  const axisMax = Math.max(10, Math.ceil(Math.max(0, ...data.map(({ value }) => value)) / 2) * 2);
  const ticks = Array.from({ length: axisMax / 2 + 1 }, (_, index) => index * 2);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke="#edf1f7" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          interval={0}
          tickMargin={8}
          angle={-40}
          textAnchor="end"
        />
        <YAxis
          width={28}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          allowDecimals={false}
          domain={[0, axisMax]}
          ticks={ticks}
        />
        <Tooltip
          cursor={{ fill: 'rgba(167,139,250,0.08)' }}
          formatter={(value: number) => [`${value} pekerjaan`, 'Jumlah']}
        />
        <Bar
          dataKey="value"
          name="Pekerjaan"
          fill="#a78bfa"
          radius={[5, 5, 0, 0]}
          maxBarSize={20}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface CalendarWidgetProps {
  viewDate: Date;
  selectedDate: Date;
  tasksByDay: Set<string>;
  activitiesByDay: Set<string>;
  onSelectDate: (date: Date) => void;
  onChangeMonth: (direction: 1 | -1) => void;
}

/**
 * Kalender panel kanan. Otomatis menunjukkan hari ini saat dibuka
 * (lihat default state di komponen induk), dan memilih tanggal lain
 * memicu `onSelectDate` untuk memperbarui Schedule. Tidak terpengaruh
 * filter Tahun/Bulan.
 */
function CalendarWidget({
  viewDate,
  selectedDate,
  tasksByDay,
  activitiesByDay,
  onSelectDate,
  onChangeMonth,
}: CalendarWidgetProps) {
  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const list: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i += 1) list.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) list.push(new Date(year, month, d));
    return list;
  }, [viewDate]);

  const today = new Date();

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-slate-900">Calendar</p>
        <button
          type="button"
          onClick={() => onSelectDate(new Date())}
          className="text-[11px] font-medium text-brand-600 hover:underline"
        >
          Hari ini
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChangeMonth(-1)}
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Bulan sebelumnya"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-xs font-medium text-slate-600">
          {MONTH_LABELS_LONG[viewDate.getMonth()]} {viewDate.getFullYear()}
        </p>
        <button
          type="button"
          onClick={() => onChangeMonth(1)}
          className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Bulan berikutnya"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-y-1 text-center text-[10px] font-medium text-slate-400">
        {DAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {cells.map((date, idx) => {
          if (!date) return <span key={`empty-${idx}`} />;
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const key = dateKey(date);
          const hasTask = tasksByDay.has(key);
          const hasActivity = activitiesByDay.has(key);

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDate(date)}
              className={[
                'relative mx-auto flex size-7 items-center justify-center rounded-full transition',
                isSelected
                  ? 'bg-brand-600 font-semibold text-white'
                  : isToday
                    ? 'font-semibold text-brand-600 ring-1 ring-brand-200'
                    : 'text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              {date.getDate()}
              {(hasTask || hasActivity) && !isSelected && (
                <span className="absolute bottom-0.5 flex items-center gap-0.5">
                  {hasTask && <span className="size-1 rounded-full bg-brand-500" />}
                  {hasActivity && <span className="size-1 rounded-full bg-amber-500" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** Menampilkan pekerjaan dan rencana kegiatan yang berlaku pada tanggal terpilih. */
function ScheduleList({
  date,
  tasks,
  activities,
  periodLabel,
}: {
  date: Date;
  tasks: ScheduleTask[];
  activities: ActivityPlanItem[];
  periodLabel?: string;
}) {
  const label =
    periodLabel ??
    date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <Card className="flex min-h-56 flex-1 flex-col overflow-hidden p-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-slate-900">Jadwal</p>
        <span className="text-[11px] text-slate-400">{label}</span>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto pr-1">
        <ScheduleSection title="Pekerjaan" emptyLabel="Tidak ada pekerjaan">
          {tasks.map((task) => {
            const accent = task.isDone
              ? 'border-slate-200 bg-slate-50'
              : task.stepName.toLowerCase().includes('progress')
                ? 'border-amber-200 bg-amber-50/70'
                : 'border-emerald-200 bg-emerald-50/70';
            return (
              <li key={task.id} className={`rounded-lg border p-2 ${accent}`}>
                <p className="text-xs font-semibold text-slate-800">{task.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{task.stepName}</p>
              </li>
            );
          })}
        </ScheduleSection>
        <ScheduleSection title="Rencana Kegiatan" emptyLabel="Tidak ada rencana kegiatan">
          {activities.map((activity) => {
            const color = ACTIVITY_COLORS[activity.status];
            return (
              <li key={activity.id} className={`rounded-lg border p-2 ${color.card}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">{activity.title}</p>
                  <span className={`shrink-0 text-[10px] font-semibold ${color.label}`}>
                    {STATUS_META[activity.status].label}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {[formatRange(activity), activity.location].filter(Boolean).join(' · ')}
                </p>
              </li>
            );
          })}
        </ScheduleSection>
      </div>
    </Card>
  );
}

const ACTIVITY_COLORS: Record<ActivityPlanItem['status'], { card: string; label: string }> = {
  RENCANA: { card: 'border-slate-200 bg-slate-50', label: 'text-slate-600' },
  TERJADWAL: { card: 'border-blue-200 bg-blue-50/70', label: 'text-blue-700' },
  BERLANGSUNG: { card: 'border-violet-200 bg-violet-50/70', label: 'text-violet-700' },
  SELESAI: { card: 'border-emerald-200 bg-emerald-50/70', label: 'text-emerald-700' },
  DITUNDA: { card: 'border-amber-200 bg-amber-50/70', label: 'text-amber-700' },
  DIBATALKAN: { card: 'border-rose-200 bg-rose-50/70', label: 'text-rose-700' },
};

function ScheduleSection({
  title,
  emptyLabel,
  children,
}: {
  title: string;
  emptyLabel: string;
  children: ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section className="mb-3 last:mb-0">
      <h3 className="mb-1.5 text-[11px] font-semibold text-slate-600">{title}</h3>
      {hasItems ? (
        <ul className="space-y-1.5">{children}</ul>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 px-2 py-2 text-[11px] text-slate-400">
          {emptyLabel}
        </p>
      )}
    </section>
  );
}

/** Reminder tugas belum selesai dengan deadline H-5 — selalu dari seluruh data, tanpa filter. Ditampilkan sebagai banner horizontal penuh di atas dashboard. */
function ReminderList({
  tasks,
  onSelectDate,
}: {
  tasks: ScheduleTask[];
  onSelectDate: (date: Date) => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-500">
          <BellRing className="size-4" />
        </span>
        <p className="text-sm font-semibold whitespace-nowrap text-slate-900">Reminder</p>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-slate-500 sm:flex-1">
          Tidak ada tugas yang mendekati deadline dalam 5 hari ke depan.
        </p>
      ) : (
        <ul className="flex flex-1 gap-2 overflow-x-auto pb-1 sm:pb-0">
          {tasks.map((t) => {
            const left = daysLeft(t.dueDate);
            return (
              <li
                key={t.id}
                className="shrink-0"
              >
                <button
                  type="button"
                  onClick={() => onSelectDate(parseLocalDate(t.dueDate))}
                  aria-label={`${t.title}, deadline ${parseLocalDate(t.dueDate).toLocaleDateString('id-ID')}. Tampilkan tanggal di kalender.`}
                  className="flex items-center gap-2 rounded-lg border border-warning-100 bg-warning-50/60 px-3 py-2 text-left transition hover:border-warning-300 hover:bg-warning-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-400"
                >
                  <div className="min-w-0">
                    <p className="max-w-[160px] truncate text-xs font-semibold text-slate-800">
                      {t.title}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Deadline{' '}
                      {parseLocalDate(t.dueDate).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-warning-100 px-2 py-0.5 text-[10px] font-semibold text-warning-700">
                    {left <= 0 ? 'Hari ini' : `H-${left}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ========================================================================
 * HALAMAN UTAMA
 * ==================================================================== */

/**
 * Dashboard Tugas & Proyek.
 *
 * Data ringkasan penyaluran dibaca dari snapshot aktif; donut dan grafik
 * pekerjaan tetap memakai query Board yang sama dengan halaman Pekerjaan.
 * Kalender dan jadwal menggabungkan tenggat pekerjaan dengan Rencana Kegiatan.
 *
 * Logika kunci:
 * 1. Empat kartu atas menampilkan alokasi, SK Pemberian, dan progres
 *    siswa/dana berdasarkan snapshot penyaluran aktif untuk tahun terpilih.
 * 2. Donut Project Progress tetap menghitung komposisi pekerjaan berdasarkan
 *    step Board; grafik bulanan memakai tanggal mulai pekerjaan.
 * 3. Kalender menandai tenggat pekerjaan dan rentang Rencana Kegiatan;
 *    Jadwal menampilkan keduanya dalam dua bagian terpisah.
 * 4. Reminder tetap menampilkan tugas yang belum selesai dengan tenggat H-5.
 *
 * 5. Donut Project Progress = persentase kartu di step DONE terhadap
 *    seluruh kartu aktif.
 * Panel agenda tidak terpengaruh filter tahun/bulan.
 *
 * LAYOUT: Reminder ditaruh sebagai item PALING ATAS di kolom KIRI (lebar
 * mengikuti kolom kiri, 8/12), sehingga sejajar dengan Calendar yang jadi
 * item paling atas di kolom KANAN (4/12) — keduanya mulai dari baris atas
 * yang sama, Reminder tidak melebar sampai menutupi Calendar. Di bawahnya
 * baru empat kartu penyaluran, lalu Project Progress + Jumlah Task per Bulan
 * di kolom kiri; Jadwal di kolom kanan. Kedua kolom disamakan tingginya lewat
 * `lg:items-stretch`, dan baris dua-card + Schedule pakai `flex-1` supaya
 * saling menyesuaikan tinggi otomatis tanpa gap di bawah.
 */
export default function DashboardPage() {
  const settingsQ = useAppSettings();
  const tasksQ = useTasks();
  const stepsQ = useSteps();
  const { role, accountEmployeeId } = useSessionStore();

  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [monthlyScheduleMode, setMonthlyScheduleMode] = useState(false);

  const year = yearFilter ?? settingsQ.data?.activeYear ?? new Date().getFullYear();
  const activitiesQ = useActivities();

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 2, current - 1, current, current + 1];
  }, []);

  const tasks = useMemo(() => {
    const allTasks = tasksQ.data ?? [];
    if (role === 'EMPLOYEE') {
      if (!accountEmployeeId) return [];
      const viewer = { accountType: role, employeeId: accountEmployeeId, level: null };
      return allTasks.filter((task) => isAssignedToViewer(viewer, task));
    }
    // Tunggu identitas sesi agar akun pegawai tidak sempat melihat agregat global.
    if (role === null) return [];
    return allTasks;
  }, [tasksQ.data, role, accountEmployeeId]);
  const steps = useMemo(() => (stepsQ.data ?? []).filter((s) => !s.deletedAt), [stepsQ.data]);
  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);

  // ---------- 4 KPI + donut — dihitung langsung dari kartu & step board ----------
  const kpiTotals = useMemo<TaskKpiTotals>(() => {
    const countByStepName = (name: string) =>
      tasks.filter((t) => stepById.get(t.stepId)?.name.trim().toLowerCase() === name).length;

    const willDo = countByStepName(WILL_DO_STEP_NAME);
    const todo = countByStepName(TODO_STEP_NAME);
    const running = countByStepName(RUNNING_STEP_NAME);
    const ended = tasks.filter((t) => stepById.get(t.stepId)?.kind === 'DONE').length;
    const totalTasks = tasks.length;
    const completionRate = totalTasks > 0 ? Math.round((ended / totalTasks) * 100) : 0;

    return { totalTasks, todo, running, ended, willDo, completionRate };
  }, [tasks, stepById]);

  // ---------- Bentuk ringkas untuk grafik bulanan & panel kanan ----------
  const scheduleTasksAll = useMemo<ScheduleTask[]>(() => {
    return tasks
      .filter((t): t is typeof t & { dueDate: string } => Boolean(t.dueDate))
      .map((t) => {
        const step = stepById.get(t.stepId);
        return {
          id: t.id,
          title: t.title,
          // Normalisasi juga timestamp lama ke tanggal lokal yang sama
          // dengan yang ditampilkan di Kalender dan Reminder.
          dueDate: todayISO(parseLocalDate(t.dueDate)),
          stepName: step?.name ?? '—',
          isDone: step?.kind === 'DONE',
        };
      });
  }, [tasks, stepById]);

  // Grafik menampilkan satu bulan jika filter bulan dipilih, atau distribusi
  // setahun penuh jika Semua Bulan dipilih.
  const monthlyCounts = useMemo(() => taskCountsByStartMonth(tasks, year), [tasks, year]);

  // ---------- Kalender dan jadwal mengikuti filter; reminder tetap global ----------
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const tasksByDay = useMemo(() => {
    const set = new Set<string>();
    const monthPrefix = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}-`;
    for (const t of scheduleTasksAll) {
      if (!t.dueDate.startsWith(monthPrefix)) continue;
      set.add(dateKey(parseLocalDate(t.dueDate)));
    }
    return set;
  }, [scheduleTasksAll, viewDate]);

  const activities = useMemo(() => activitiesQ.data ?? [], [activitiesQ.data]);
  const activitiesByDay = useMemo(() => {
    const set = new Set<string>();
    const monthStart = todayISO(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1));
    const monthEnd = todayISO(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0));
    for (const activity of activities) {
      const firstDay = activity.startDate > monthStart ? activity.startDate : monthStart;
      const lastDay = activity.endDate < monthEnd ? activity.endDate : monthEnd;
      if (firstDay > lastDay) continue;
      const cursor = parseLocalDate(firstDay);
      const end = parseLocalDate(lastDay);
      while (cursor <= end) {
        set.add(dateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return set;
  }, [activities, viewDate]);

  const scheduleTasks = useMemo(() => {
    if (!monthlyScheduleMode) return tasksDueOn(scheduleTasksAll, selectedDate);
    const monthStart = `${year}-${String(Number(monthFilter) + 1).padStart(2, '0')}-01`;
    const monthEnd = todayISO(new Date(year, Number(monthFilter) + 1, 0));
    return scheduleTasksAll.filter(
      (task) => task.dueDate >= monthStart && task.dueDate <= monthEnd,
    );
  }, [scheduleTasksAll, selectedDate, monthlyScheduleMode, year, monthFilter]);
  const scheduleActivities = useMemo(() => {
    const matching = monthlyScheduleMode
      ? activities.filter((activity) => {
          const monthStart = `${year}-${String(Number(monthFilter) + 1).padStart(2, '0')}-01`;
          const monthEnd = todayISO(new Date(year, Number(monthFilter) + 1, 0));
          return activity.startDate <= monthEnd && activity.endDate >= monthStart;
        })
      : activities.filter((activity) => occursOn(activity, dateKey(selectedDate)));
    return matching.sort(
      (left, right) =>
        left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title),
    );
  }, [activities, selectedDate, monthlyScheduleMode, year, monthFilter]);
  const reminders = useMemo(() => upcomingReminders(scheduleTasksAll), [scheduleTasksAll]);

  function handleYearChange(nextYear: number) {
    setYearFilter(nextYear);
    const nextMonth = monthFilter === '' ? viewDate.getMonth() : Number(monthFilter);
    const nextDate = new Date(nextYear, nextMonth, 1);
    setViewDate(nextDate);
    setSelectedDate(nextDate);
    setMonthlyScheduleMode(monthFilter !== '');
  }

  function handleMonthChange(nextMonthFilter: string) {
    setMonthFilter(nextMonthFilter);
    const nextMonth = nextMonthFilter === '' ? new Date().getMonth() : Number(nextMonthFilter);
    const nextDate = new Date(year, nextMonth, 1);
    setViewDate(nextDate);
    setSelectedDate(nextDate);
    setMonthlyScheduleMode(nextMonthFilter !== '');
  }

  function handleSelectCalendarDate(date: Date) {
    setSelectedDate(date);
    setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
    setYearFilter(date.getFullYear());
    setMonthFilter(String(date.getMonth()));
    setMonthlyScheduleMode(false);
  }

  function handleChangeMonth(direction: 1 | -1) {
    const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + direction, 1);
    setViewDate(nextDate);
    setSelectedDate(nextDate);
    setYearFilter(nextDate.getFullYear());
    setMonthFilter(String(nextDate.getMonth()));
    setMonthlyScheduleMode(true);
  }

  const loading =
    settingsQ.isLoading || tasksQ.isLoading || stepsQ.isLoading || activitiesQ.isLoading;
  const error = settingsQ.isError
    ? settingsQ.error
    : tasksQ.isError
      ? tasksQ.error
      : stepsQ.isError
        ? stepsQ.error
        : activitiesQ.isError
          ? activitiesQ.error
          : null;

  return (
    <section aria-labelledby="judul-dashboard" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-(image:--gradient-brand) text-white shadow-(--shadow-lift) sm:inline-flex"
          >
            <LayoutDashboard className="size-5" />
          </span>
          <div>
            <h2 id="judul-dashboard" className="text-lg font-bold tracking-tight text-slate-900">
              Dashboard
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Ringkasan penyaluran, pekerjaan, dan rencana kegiatan
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Filter dashboard">
          <Field label="Tahun" className="w-28">
            <Select value={year} onChange={(e) => handleYearChange(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bulan" className="w-36">
            <Select value={monthFilter} onChange={(e) => handleMonthChange(e.target.value)}>
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {loading ? (
        <SectionSkeleton />
      ) : error ? (
        <Card>
          <ErrorState
            error={error}
            onRetry={() => {
              settingsQ.refetch();
              tasksQ.refetch();
              stepsQ.refetch();
              activitiesQ.refetch();
            }}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
          {/* Panel KIRI — Reminder di paling atas, lalu KPI & chart; terpengaruh filter (kecuali Reminder) */}
          <div className="flex h-full flex-col gap-4 lg:col-span-8">
            <ReminderList
              tasks={reminders}
              onSelectDate={handleSelectCalendarDate}
            />
            <DistributionKpis />
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <Card className="flex h-full flex-col overflow-hidden">
                <CardHeader title="Project Progress" description="Komposisi status pekerjaan tim" />
                <div className="min-h-0 flex-1 p-4 pt-1">
                  <TaskProgressDonut totals={kpiTotals} />
                </div>
              </Card>
              <Card className="flex h-full flex-col overflow-hidden">
                <CardHeader
                  title="Jumlah Task per Bulan"
                  description={
                    monthFilter === ''
                      ? `Berdasarkan tanggal mulai pekerjaan · ${year}`
                      : `Pekerjaan dimulai pada ${MONTH_OPTIONS[Number(monthFilter) + 1]?.label} ${year}`
                  }
                />
                <div className="min-h-0 flex-1 p-4 pt-1">
                  <TasksPerMonthChart counts={monthlyCounts} monthFilter={monthFilter} />
                </div>
              </Card>
            </div>
          </div>

          {/* Panel KANAN — Calendar di paling atas (sejajar Reminder), lalu Schedule; tidak terpengaruh filter */}
          <div className="flex h-full flex-col gap-4 lg:col-span-4">
            <CalendarWidget
              viewDate={viewDate}
              selectedDate={selectedDate}
              tasksByDay={tasksByDay}
              activitiesByDay={activitiesByDay}
              onSelectDate={handleSelectCalendarDate}
              onChangeMonth={handleChangeMonth}
            />
            <ScheduleList
              date={selectedDate}
              tasks={scheduleTasks}
              activities={scheduleActivities}
              periodLabel={
                monthlyScheduleMode
                  ? `${MONTH_OPTIONS[Number(monthFilter) + 1]?.label} ${year}`
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </section>
  );
}
