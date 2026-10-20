import { useMemo, useState } from 'react';
import { BellRing, CheckCircle2, LayoutDashboard, ListChecks, PlayCircle, TimerOff, type LucideIcon } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ErrorState } from '@/components/feedback/error-state';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppSettings, useSteps, useTasks } from '@/hooks/queries';
import type { ActivityPlanItem } from '@/services/types';
import { itemsToday as activitiesOn, formatRange, todayISO } from '@/features/plan/lib';
// Widget Kalender + Schedule (sumber: Rencana Kegiatan) — file yang kamu kirim sebelumnya.
// Sesuaikan path import ini kalau lokasi file aslinya beda.
import { DashboardReminderWidget } from '@/features/plan/components/dashboard-reminder-widget';

// TODO: ganti import ini dengan hook query Rencana Kegiatan yang sebenarnya
// (yang menghasilkan `ActivityPlanItem[]`, sama seperti yang dipakai halaman
// /rencana-kegiatan). Nama & path di bawah ini cuma tebakan sementara supaya
// filenya tetap bisa dibaca — kalau hook aslinya beda nama/lokasi, tinggal
// ganti baris import + pemanggilannya di dalam DashboardPage, sisanya tidak
// perlu diubah karena semua sudah lewat helper `itemsToday`/`formatRange`/
// `todayISO` yang sama dipakai DashboardReminderWidget & halaman Rencana Kegiatan.
import { useActivityPlanItems } from '@/hooks/queries';

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
const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

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

/**
 * Jumlah task per bulan (Jan-Des) untuk grafik "Jumlah Task per Bulan".
 * Nilai tetap sesuai data yang diminta (Jan-Sep saja, Okt-Des = 0) — tidak
 * dihitung dari tugas board sungguhan.
 */
function monthlyTaskCounts(_year: number): number[] {
  return [1, 3, 4, 4, 3, 3, 4, 3, 3, 0, 0, 0];
}

/**
 * Reminder H-5: kegiatan Rencana Kegiatan yang tanggalnya jatuh dalam
 * `daysAhead` hari ke depan (termasuk hari ini). Dihitung lewat helper
 * `itemsToday`/`todayISO` yang sama dipakai Kalender & Schedule di
 * @/features/plan/lib, supaya konsisten dengan definisi tanggal kegiatan
 * di sana — tanpa perlu tahu nama field tanggal ActivityPlanItem secara
 * langsung. Selalu dari seluruh data, tidak dipengaruhi filter Tahun/Bulan
 * Dashboard maupun tanggal yang dipilih di Calendar.
 */
function upcomingActivities(
  items: ActivityPlanItem[],
  daysAhead = 5,
): { item: ActivityPlanItem; daysLeft: number }[] {
  const base = new Date();
  const seen = new Set<string>();
  const result: { item: ActivityPlanItem; daysLeft: number }[] = [];

  for (let i = 0; i <= daysAhead; i += 1) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const iso = todayISO(d);
    for (const item of activitiesOn(items, iso)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      result.push({ item, daysLeft: i });
    }
  }

  return result.sort((a, b) => a.daysLeft - b.daysLeft);
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

/** 4 kartu KPI di baris atas dashboard — terhubung langsung ke jumlah kartu per step di board Pekerjaan. */
function TaskKpis({ totals }: { totals: TaskKpiTotals }) {
  const items: { label: string; value: string | number; icon: LucideIcon; accent: string }[] = [
    {
      label: 'Will Do Project',
      value: totals.willDo,
      icon: CheckCircle2,
      accent: 'bg-success-50 text-success-600',
    },
    {
      label: 'To Do Project',
      value: totals.todo,
      icon: ListChecks,
      accent: 'bg-brand-50 text-brand-600',
    },
    {
      label: 'On Progress',
      value: totals.running,
      icon: PlayCircle,
      accent: 'bg-warning-50 text-warning-600',
    },
    {
      label: 'Ended Project',
      value: totals.ended,
      icon: TimerOff,
      accent: 'bg-slate-100 text-slate-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {items.map((item) => (
        <Card key={item.label} className="flex items-center gap-3 p-4">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${item.accent}`}>
            <item.icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-500">{item.label}</p>
            <p className="text-xl font-bold text-slate-900">{item.value}</p>
          </div>
        </Card>
      ))}
    </div>
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
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
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
function TasksPerMonthChart({ counts }: { counts: number[] }) {
  const data = counts.map((value, i) => ({ month: MONTH_LABELS_SHORT[i], value }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="#94a3b8"
          interval={0}
          tickMargin={10}
          angle={-45}
          textAnchor="end"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="#94a3b8"
          allowDecimals={false}
          domain={[0, 10]}
          ticks={[0, 2, 4, 6, 8, 10]}
        />
        <Tooltip cursor={{ fill: 'rgba(124,92,255,0.08)' }} />
        <Bar dataKey="value" name="Task" fill="#a78bfa" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Reminder H-5 — banner horizontal penuh. Sumber data: kegiatan Rencana
 * Kegiatan (bukan lagi tugas board Pekerjaan), supaya benar-benar menyala
 * mengikuti kegiatan yang deadline-nya dekat.
 */
function ReminderList({ items, loading }: { items: ActivityPlanItem[]; loading?: boolean }) {
  const reminders = useMemo(() => upcomingActivities(items), [items]);

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex shrink-0 items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-50 text-warning-500">
          <BellRing className="size-4" />
        </span>
        <p className="whitespace-nowrap text-sm font-semibold text-slate-900">Reminder</p>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 sm:flex-1">Memuat…</p>
      ) : reminders.length === 0 ? (
        <p className="text-xs text-slate-500 sm:flex-1">
          Tidak ada kegiatan yang mendekati deadline dalam 5 hari ke depan.
        </p>
      ) : (
        <ul className="flex flex-1 gap-2 overflow-x-auto pb-1 sm:pb-0">
          {reminders.map(({ item, daysLeft }) => (
            <li
              key={item.id}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-warning-100 bg-warning-50/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="max-w-[180px] truncate text-xs font-semibold text-slate-800">{item.title}</p>
                <p className="max-w-[180px] truncate text-[11px] text-slate-500">{formatRange(item)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-warning-100 px-2 py-0.5 text-[10px] font-semibold text-warning-700">
                {daysLeft === 0 ? 'Hari ini' : `H-${daysLeft}`}
              </span>
            </li>
          ))}
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
 * DATA:
 * - 4 KPI, donut Project Progress, & grafik Jumlah Task per Bulan dihitung
 *   dari `useTasks()` + `useSteps()` — query yang sama dipakai board
 *   Pekerjaan. Menambah/memindah/menghapus kartu di board otomatis
 *   mengubah angka-angka ini juga.
 * - Calendar + Schedule (lewat `DashboardReminderWidget`) & Reminder H-5
 *   sekarang memakai data Rencana Kegiatan (`ActivityPlanItem[]`), BUKAN
 *   lagi tugas board — supaya kalender & pengingat mencerminkan kegiatan
 *   sungguhan yang dikelola di halaman Rencana Kegiatan.
 *
 * Logika kunci:
 * 1. 4 KPI dihitung dari jumlah kartu aktif per step: "Will Do", "To Do",
 *    "On Progress" dicocokkan berdasarkan NAMA step (lihat konstanta
 *    *_STEP_NAME di atas), sedangkan "Ended Project" dihitung dari step
 *    mana pun yang berkind DONE (tidak tergantung nama).
 * 2. Donut Project Progress = proporsi Will Do/To Do/On Progress/Done
 *    terhadap total tugas.
 * 3. Panel KANAN (Calendar + Schedule) & Reminder TIDAK terpengaruh filter
 *    Tahun/Bulan Dashboard — selalu memakai seluruh data kegiatan.
 * 4. Reminder menampilkan kegiatan yang tanggalnya jatuh dalam H-5 (5 hari)
 *    ke depan dari hari ini, dihitung lewat helper Rencana Kegiatan yang
 *    sama (`itemsToday`/`todayISO`).
 *
 * LAYOUT: Reminder ditaruh sebagai item PALING ATAS di kolom KIRI (lebar
 * mengikuti kolom kiri, 8/12), sehingga sejajar dengan Calendar+Schedule
 * yang jadi item paling atas di kolom KANAN (4/12) — keduanya mulai dari
 * baris atas yang sama. Di bawahnya baru 4 KPI, lalu Project Progress +
 * Jumlah Task per Bulan di kolom kiri. Kedua kolom disamakan tingginya
 * lewat `lg:items-stretch`, dan baris dua-card di kolom kiri pakai
 * `flex-1` supaya menyesuaikan tinggi otomatis tanpa gap di bawah.
 */
export default function DashboardPage() {
  const settingsQ = useAppSettings();
  const tasksQ = useTasks();
  const stepsQ = useSteps();
  // TODO: sesuaikan dengan hook query Rencana Kegiatan yang sebenarnya (lihat catatan di import di atas).
  const activityQ = useActivityPlanItems();

  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>('');

  const year = yearFilter ?? settingsQ.data?.activeYear ?? new Date().getFullYear();

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 2, current - 1, current, current + 1];
  }, []);

  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const steps = useMemo(() => (stepsQ.data ?? []).filter((s) => !s.deletedAt), [stepsQ.data]);
  const stepById = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);
  const activityItems = useMemo(() => activityQ.data ?? [], [activityQ.data]);

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

  // Grafik bulanan mengikuti tahun terpilih, tapi selalu tampilkan 12 bulan
  // (tidak ikut ke-filter oleh Bulan, supaya distribusinya tetap terlihat).
  const monthlyCounts = useMemo(() => monthlyTaskCounts(year), [year]);

  const loading = settingsQ.isLoading || tasksQ.isLoading || stepsQ.isLoading || activityQ.isLoading;
  const error = tasksQ.isError ? tasksQ.error : stepsQ.isError ? stepsQ.error : activityQ.isError ? activityQ.error : null;

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
            <p className="mt-0.5 text-xs text-slate-500">Ringkasan tugas &amp; proyek tim</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Filter dashboard">
          <Field label="Tahun" className="w-28">
            <Select value={year} onChange={(e) => setYearFilter(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bulan" className="w-36">
            <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
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
              tasksQ.refetch();
              stepsQ.refetch();
              activityQ.refetch();
            }}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
          {/* Panel KIRI — Reminder di paling atas, lalu KPI & chart; terpengaruh filter (kecuali Reminder) */}
          <div className="flex h-full flex-col gap-4 lg:col-span-8">
            <ReminderList items={activityItems} loading={activityQ.isLoading} />
            <TaskKpis totals={kpiTotals} />
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <Card className="flex h-full flex-col overflow-hidden">
                <CardHeader title="Project Progress" description="Persentase dari tugas pada KPI di atas" />
                <div className="min-h-0 flex-1 p-4 pt-1">
                  <TaskProgressDonut totals={kpiTotals} />
                </div>
              </Card>
              <Card className="flex h-full flex-col overflow-hidden">
                <CardHeader title="Jumlah Task per Bulan" description={`Sepanjang tahun ${year}`} />
                <div className="min-h-0 flex-1 p-4 pt-1">
                  <TasksPerMonthChart counts={monthlyCounts} />
                </div>
              </Card>
            </div>
          </div>

          {/* Panel KANAN — Calendar + Schedule dari Rencana Kegiatan (sejajar Reminder); tidak terpengaruh filter */}
          <div className="flex h-full flex-col gap-4 lg:col-span-4">
            <Card className="flex h-full flex-1 flex-col overflow-hidden p-4">
              <DashboardReminderWidget items={activityItems} loading={activityQ.isLoading} />
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}