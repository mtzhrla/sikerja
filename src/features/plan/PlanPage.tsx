import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  Clock3,
  ExternalLink,
  ListTodo,
  MapPin,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Modal } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/features/auth/session-store';
import { useEmployees } from '@/hooks/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import type {
  ActivityPlanItem,
  ActivityStatus,
} from '@/services/types';
import {
  applyFilters,
  DEFAULT_FILTERS,
  formatRange,
  groupByMonth,
  itemsToday,
  itemsUpcoming,
  monthMatrix,
  monthName,
  STATUS_META,
  todayISO,
  type ActivityFilters,
  uniqueCategories,
} from './lib';
type PlanView = 'ringkasan' | 'kalender' | 'daftar';
const VIEWS: Array<{
  id: PlanView;
  label: string;
  icon: typeof ListTodo;
}> = [
    {
      id: 'ringkasan',
      label: 'Ringkasan',
      icon: ListTodo,
    },

    {
      id: 'kalender',
      label: 'Kalender',
      icon: CalendarDays,
    },

    {
      id: 'daftar',
      label: 'Daftar',
      icon: CalendarRange,
    },
  ];

/* -------------------------------------------------------------------------- */
/* DATA PRESENTASI                                                            */
/* -------------------------------------------------------------------------- */

const PRESENTATION_YEARS = [2026, 2027];

type PresentationPic = {
  id: string;
  name: string;
};

const PRESENTATION_CATEGORIES = [
  'Administrasi',
  'Koordinasi',
  'Verifikasi',
  'Monitoring',
  'Evaluasi',
  'Pelaporan',
  'Pengembangan',
];

const PRESENTATION_TEMPLATES = [
  {
    title: 'Koordinasi Persiapan Program Kerja',
    category: 'Koordinasi',
    location: 'Ruang Rapat PIP',
    notes:
      'Pembahasan kesiapan pelaksanaan program, pembagian tugas, dan penyelarasan jadwal kegiatan antarunit.',
  },

  {
    title: 'Pemutakhiran Data Kegiatan',
    category: 'Administrasi',
    location: 'Ruang Administrasi',
    notes:
      'Pemutakhiran data kegiatan dan penyesuaian informasi pelaksanaan berdasarkan dokumen pendukung terbaru.',
  },

  {
    title: 'Monitoring Pelaksanaan Kegiatan',
    category: 'Monitoring',
    location: 'Lokasi Kegiatan',
    notes:
      'Pemantauan pelaksanaan kegiatan untuk memastikan tahapan pekerjaan berjalan sesuai rencana dan jadwal.',
  },

  {
    title: 'Evaluasi Capaian Kegiatan',
    category: 'Evaluasi',
    location: 'Ruang Evaluasi',
    notes:
      'Evaluasi capaian kegiatan, identifikasi kendala pelaksanaan, serta penyusunan tindak lanjut perbaikan.',
  },

  {
    title: 'Penyusunan Laporan Pelaksanaan',
    category: 'Pelaporan',
    location: 'Ruang Administrasi',
    notes:
      'Penyusunan laporan pelaksanaan kegiatan berdasarkan hasil dokumentasi, capaian, dan data pendukung.',
  },

  {
    title: 'Pengembangan Sistem Administrasi',
    category: 'Pengembangan',
    location: 'Ruang Tim Teknologi',
    notes:
      'Pembahasan pengembangan fitur administrasi dan penyempurnaan alur pengelolaan data pada sistem.',
  },

  {
    title: 'Verifikasi Dokumen Kegiatan',
    category: 'Verifikasi',
    location: 'Ruang Verifikasi',
    notes:
      'Pemeriksaan kelengkapan dan kesesuaian dokumen kegiatan sebagai bagian dari proses validasi administrasi.',
  },
];

/**
 * Membuat tanggal ISO.
 */

function makeDate(year: number, month: number, day: number): string {
  return [
    String(year),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

/**
 * Menentukan jumlah hari pada bulan tertentu.
 */

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Menentukan tanggal yang aman untuk setiap bulan.
 */

function safeDay(
  year: number,
  month: number,
  desiredDay: number,
): number {
  return Math.min(
    desiredDay,
    getDaysInMonth(year, month),
  );
}

/**
 * Status dummy agar data presentasi terasa realistis.
 */

function presentationStatus(
  year: number,
  month: number,
  index: number,
): ActivityStatus {
  if (year === 2026 && month === 10) {
    if (index === 0) return 'BERLANGSUNG';
    if (index === 1) return 'TERJADWAL';
    return 'RENCANA';
  }

  const value = (year + month + index) % 5;
  if (value === 0) return 'SELESAI';
  if (value === 1) return 'TERJADWAL';
  if (value === 2) return 'RENCANA';
  if (value === 3) return 'SELESAI';

  return 'TERJADWAL';

}

function createPresentationActivities(pics: PresentationPic[]): ActivityPlanItem[] {
  const items: ActivityPlanItem[] = [];
  for (const year of PRESENTATION_YEARS) {
    for (let month = 1; month <= 12; month += 1) {
      const templateIndex =
        (year + month) % PRESENTATION_TEMPLATES.length;

      const template =
        PRESENTATION_TEMPLATES[templateIndex];

      const pic =
        pics[(year + month) % pics.length];

      const day = safeDay(
        year,
        month,
        5 + ((month * 2) % 20),
      );

      const startDate = makeDate(year, month, day);
      items.push({
        id: `presentasi-${year}-${String(month).padStart(2, '0')}-01`,
        sourceId: null,
        year,
        title: template.title,
        startDate,
        endDate: startDate,
        startTime: '09:00',
        endTime: '11:00',
        allDay: false,
        location: template.location,
        category: template.category,
        picNames: [pic.name],
        picEmployeeIds: [pic.id],
        participants: 'Tim terkait',
        status: presentationStatus(
          year,
          month,
          0,
        ),

        notes: template.notes,
        meetingLink: null,
        documentLink: null,
        sourceRowKey: `presentasi-${year}-${month}-01`,
        createdAt: `${year}-01-02T08:00:00.000Z`,
        updatedAt: `${year}-01-02T08:00:00.000Z`,
      });

      /*
       * Kegiatan kedua setiap bulan supaya kalender dan daftar
       * tidak terlihat kosong saat presentasi.
       */

      const secondTemplate =
        PRESENTATION_TEMPLATES[
        (templateIndex + 2) %
        PRESENTATION_TEMPLATES.length
        ];

      const secondPic =
        pics[
        (year + month + 2) %
        pics.length
        ];

      const secondDay = safeDay(
        year,
        month,
        18 + (month % 7),
      );

      const secondDate = makeDate(
        year,
        month,
        secondDay,
      );

      items.push({
        id: `presentasi-${year}-${String(month).padStart(2, '0')}-02`,
        sourceId: null,
        year,
        title: secondTemplate.title,
        startDate: secondDate,
        endDate: secondDate,
        startTime: '13:30',
        endTime: '15:30',
        allDay: false,
        location: secondTemplate.location,
        category: secondTemplate.category,
        picNames: [secondPic.name],
        picEmployeeIds: [secondPic.id],
        participants: 'Tim terkait',
        status: presentationStatus(
          year,
          month,
          1,
        ),

        notes: secondTemplate.notes,
        meetingLink: null,
        documentLink: null,
        sourceRowKey: `presentasi-${year}-${month}-02`,
        createdAt: `${year}-01-02T08:00:00.000Z`,
        updatedAt: `${year}-01-02T08:00:00.000Z`,
      });
    }
  }

  /*
   * ------------------------------------------------------------------------
   * AGENDA KHUSUS OKTOBER 2026
   * ------------------------------------------------------------------------
   *
   * Ini sengaja dibuat eksplisit karena akan dipakai untuk bahan presentasi.
   */

  const verificationDates = [
    {
      day: 8,
      title: 'Agenda Verifikasi Data Kegiatan',
      location: 'Ruang Verifikasi PIP',
      pic: pics[0] ?? { id: '', name: '' },
      status: 'BERLANGSUNG' as ActivityStatus,
      notes:
        'Verifikasi kesesuaian data kegiatan dengan dokumen pendukung serta pengecekan kelengkapan informasi sebelum data digunakan dalam pelaporan.',
    },

    {
      day: 15,
      title: 'Verifikasi Dokumen Pelaksanaan',
      location: 'Ruang Rapat PIP',
      pic: pics[1] ?? { id: '', name: '' },
      status: 'TERJADWAL' as ActivityStatus,
      notes:
        'Pemeriksaan dokumen pelaksanaan kegiatan, pencocokan data administrasi, dan pencatatan hasil verifikasi untuk tindak lanjut.',
    },

    {
      day: 22,
      title: 'Verifikasi Hasil Monitoring',
      location: 'Ruang Evaluasi',
      pic: pics[2] ?? { id: '', name: '' },
      status: 'RENCANA' as ActivityStatus,
      notes:
        'Penelaahan hasil monitoring dan validasi temuan lapangan sebagai dasar penyusunan tindak lanjut kegiatan.',
    },

    {
      day: 29,
      title: 'Rekapitulasi Hasil Verifikasi Oktober',
      location: 'Ruang Administrasi',
      pic: pics[3] ?? { id: '', name: '' },
      status: 'RENCANA' as ActivityStatus,
      notes:
        'Penyusunan rekapitulasi hasil verifikasi bulan Oktober dan penyampaian catatan perbaikan kepada unit terkait.',
    },
  ];

  for (const agenda of verificationDates) {
    const date = makeDate(
      2026,
      10,
      agenda.day,
    );

    items.push({
      id: `agenda-verifikasi-oktober-2026-${agenda.day}`,
      sourceId: null,
      year: 2026,
      title: agenda.title,
      startDate: date,
      endDate: date,
      startTime: '09:00',
      endTime: '11:30',
      allDay: false,
      location: agenda.location,
      category: 'Verifikasi',
      picNames: [agenda.pic.name],
      picEmployeeIds: [agenda.pic.id],
      participants: 'Tim Verifikasi dan unit terkait',
      status: agenda.status,
      notes: agenda.notes,
      meetingLink: null,
      documentLink: null,
      sourceRowKey: `agenda-verifikasi-oktober-2026-${agenda.day}`,
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z',
    });
  }

  return items.sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
}

/* -------------------------------------------------------------------------- */
/* PAGE                                                                       */
/* -------------------------------------------------------------------------- */

export default function PlanPage() {
  const { role } = useSessionStore();

  /*
   * Tetap mengikuti aturan aplikasi:
   * tombol pembuatan hanya muncul untuk ADMIN.
   */

  const canCreate = role === 'ADMIN';

  /*
   * PIC selalu diambil dari data Daftar Pegawai.
   */
  const employeesQ = useEmployees(true);

  const presentationPics = useMemo<PresentationPic[]>(
    () =>
      (employeesQ.data ?? []).map((employee) => ({
        id: employee.id,
        name: employee.displayName?.trim() || employee.fullName,
      })),
    [employeesQ.data],
  );

  const [items, setItems] = useState<ActivityPlanItem[]>([]);

  useEffect(() => {
    if (presentationPics.length === 0) return;
    setItems(createPresentationActivities(presentationPics));
  }, [presentationPics]);

  const initialNow = useMemo(

    () => new Date(),

    [],

  );

  /*
   * Untuk presentasi, default diarahkan ke 2026
   * karena agenda verifikasi Oktober 2026 adalah agenda utama.
   */

  const [year, setYear] = useState<number>(2026);

  const [month, setMonth] = useState<number>(

    10,

  );

  const [view, setView] =
    useState<PlanView>('ringkasan');

  const [filters, setFilters] =
    useState<ActivityFilters>({
      ...DEFAULT_FILTERS,
    });

  const [detail, setDetail] =
    useState<ActivityPlanItem | null>(null);

  const [createOpen, setCreateOpen] =
    useState(false);

  /*
   * Filter langsung aktif terhadap data dummy.
   */
  const filtered = useMemo(

    () =>
      applyFilters(
        items.filter(
          (item) => item.year === year,
        ),
        filters,
      ),
    [items, year, filters],
  );

  /*
   * Tahun tersedia langsung dari data dummy.
   */

  const yearOptions = useMemo(() => {
    return [...PRESENTATION_YEARS].sort(
      (a, b) => b - a,
    );
  }, []);
  /*
   * Kategori mengikuti data pada tahun yang sedang dipilih.
   */

  const categoryOptions = useMemo(
    () =>
      uniqueCategories(
        items.filter(
          (item) => item.year === year,
        ),
      ),
    [items, year],
  );

  /*
   * Default bulan mengikuti tahun presentasi.
   */
  useMemo(() => {
    if (
      year === 2026 &&
      initialNow.getFullYear() === 2026
    ) {
      setMonth(10);
    }
  }, [year, initialNow]);

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Rencana Kegiatan"
        description="Jadwal rencana kegiatan tim yang disusun untuk kebutuhan monitoring, verifikasi, dan pelaporan."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={() =>
                  setCreateOpen(true)
                }

                className="pressable inline-flex h-10 items-center gap-2 rounded-xl bg-(image:--gradient-brand) px-4 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              >

                <Plus
                  className="size-4"
                  aria-hidden
                />
                Rencana Kegiatan Baru
              </button>
            )}

            <div
              role="group"
              aria-label="Pilih tampilan"
              className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
            >

              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() =>
                    setView(v.id)
                  }

                  aria-pressed={
                    view === v.id
                  }

                  className={cn(
                    'pressable inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold',
                    view === v.id
                      ? 'bg-(image:--gradient-brand) text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                  )}
                >
                  <v.icon
                    className="size-4"
                    aria-hidden
                  />
                  {v.label}
                </button>
              ))}

            </div>
          </div>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* FILTER                                                            */}
      {/* ------------------------------------------------------------------ */}

      <div className="mb-4 flex w-full items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">
            Cari kegiatan
          </span>

          <span className="relative block">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            />

            <Input
              value={filters.search}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  search: e.target.value,
                }))
              }

              placeholder="Cari kegiatan atau lokasi…"
              className="pl-9"
            />
          </span>
        </label>

        {/* TAHUN */}
        <label className="w-[180px] shrink-0">
          <span className="sr-only">
            Tahun
          </span>

          <Select
            value={year}
            onChange={(e) => {
              setYear(
                Number(e.target.value),
              );
              setFilters((current) => ({
                ...current,
                search: '',
                category: 'ALL',
                status: 'ALL',
              }));
            }}
          >
            {yearOptions.map((optionYear) => (
              <option
                key={optionYear}
                value={optionYear}
              >
                {optionYear}
              </option>
            ))}

          </Select>
        </label>

        {/* KATEGORI */}
        <label className="w-[250px] shrink-0">
          <span className="sr-only">
            Kategori
          </span>

          <Select
            value={filters.category}
            onChange={(e) =>
              setFilters((current) => ({
                ...current,
                category:
                  e.target.value,
              }))
            }
          >

            <option value="ALL">
              Semua Kategori
            </option>

            {categoryOptions.map(
              (category) => (
                <option

                  key={category}
                  value={category}

                >

                  {category}
                </option>
              ),
            )}

          </Select>
        </label>

        {/* STATUS */}
        <label className="w-[250px] shrink-0">
          <span className="sr-only">
            Status
          </span>

          <Select
            value={filters.status}
            onChange={(e) =>
              setFilters((current) => ({
                ...current,
                status:
                  e.target.value as ActivityFilters['status'],
              }))
            }
          >

            <option value="ALL">
              Semua Status
            </option>

            {Object.entries(
              STATUS_META,
            ).map(
              ([status, meta]) => (
                <option

                  key={status}
                  value={status}

                >

                  {meta.label}
                </option>
              ),
            )}

          </Select>
        </label>

      </div>

      {/* ------------------------------------------------------------------ */}
      {/* INFO PRESENTASI                                                   */}
      {/* ------------------------------------------------------------------ */}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="brand">
          Data Presentasi
        </Badge>

        <span>
          Menampilkan data dummy tahun{' '}
          <strong className="text-slate-700">
            {year}
          </strong>
        </span>

        <span>
          • {filtered.length} kegiatan
          sesuai filter
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CONTENT                                                           */}
      {/* ------------------------------------------------------------------ */}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarRange}
            title="Tidak ada kegiatan"
            description="Tidak ada data kegiatan yang sesuai dengan filter yang dipilih."
          />

        </Card>
      ) : (
        <>
          {view === 'ringkasan' && (
            <SummaryView
              items={filtered}
              onOpen={setDetail}
            />
          )}

          {view === 'kalender' && (
            <CalendarView
              items={filtered}
              year={year}
              month={month}
              onMonthChange={setMonth}
              onOpen={setDetail}
            />
          )}

          {view === 'daftar' && (
            <ListView
              items={filtered}
              onOpen={setDetail}
            />
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CREATE                                                             */}
      {/* ------------------------------------------------------------------ */}

      <CreateActivityModal
        open={createOpen}
        year={year}
        pending={false}
        onOpenChange={setCreateOpen}
        onSubmit={async (input) => {
          const newItem: ActivityPlanItem = {
            id: `manual-${Date.now()}`,
            sourceId: null,
            year: input.year,
            title: input.title,
            startDate:
              input.startDate,
            endDate:
              input.endDate,
            startTime: null,
            endTime: null,
            allDay: true,
            location: 'Ruang Rapat PIP',
            category: 'Administrasi',
            picNames: presentationPics[0] ? [presentationPics[0].name] : [],
            picEmployeeIds: presentationPics[0] ? [presentationPics[0].id] : [],
            participants:
              'Tim terkait',
            status: 'RENCANA',
            notes:
              input.notes ||
              'Kegiatan baru yang ditambahkan melalui menu Rencana Kegiatan.',
            meetingLink: null,
            documentLink: null,
            sourceRowKey: `manual-${Date.now()}`,
            createdAt:
              new Date().toISOString(),
            updatedAt:
              new Date().toISOString(),
          };

          setItems((current) =>
            [...current, newItem].sort(
              (a, b) =>
                a.startDate.localeCompare(
                  b.startDate,
                ),
            ),
          );

          setYear(input.year);
          setMonth(
            Number(
              input.startDate.slice(
                5,
                7,
              ),
            ),
          );



          setCreateOpen(false);

        }}

      />



      {/* ------------------------------------------------------------------ */}

      {/* DETAIL                                                             */}

      {/* ------------------------------------------------------------------ */}



      <Modal

        open={detail !== null}

        onOpenChange={(open) =>

          !open && setDetail(null)

        }

        title={

          <span className="text-xl leading-tight font-bold text-slate-900 sm:text-2xl">

            {detail?.title ?? ''}

          </span>

        }

        description={

          detail ? (

            <span className="text-sm text-slate-500 sm:text-base">

              {formatRange(detail)}

            </span>

          ) : undefined

        }

        size="lg"

      >

        {detail && (

          <div className="space-y-4 text-[15px]">

            <div className="flex flex-wrap items-center gap-2">

              <Badge

                tone={

                  STATUS_META[

                    detail.status

                  ].tone === 'brand'

                    ? 'brand'

                    : STATUS_META[

                      detail.status

                    ].tone

                }

              >

                {

                  STATUS_META[

                    detail.status

                  ].label

                }

              </Badge>



              {detail.category && (

                <Badge tone="outline">

                  {detail.category}

                </Badge>

              )}



              {detail.allDay && (

                <Badge tone="neutral">

                  Sepanjang hari

                </Badge>

              )}

            </div>



            <dl className="space-y-3">

              <DetailRow

                icon={CalendarDays}

                label="Tanggal"

              >

                {formatDate(

                  detail.startDate,

                )}



                {detail.endDate !==

                  detail.startDate && (

                    <>

                      {' '}

                      —{' '}

                      {formatDate(

                        detail.endDate,

                      )}

                    </>

                  )}

              </DetailRow>



              {!detail.allDay &&

                detail.startTime && (

                  <DetailRow

                    icon={Clock3}

                    label="Waktu"

                  >

                    {detail.startTime}



                    {detail.endTime

                      ? `–${detail.endTime}`

                      : ''}{' '}

                    WIB

                  </DetailRow>

                )}



              {detail.location && (

                <DetailRow

                  icon={MapPin}

                  label="Lokasi"

                >

                  {detail.location}

                </DetailRow>

              )}



              {detail.picNames.length >

                0 && (

                  <DetailRow

                    icon={Users}

                    label="PIC"

                  >

                    <span className="flex flex-wrap gap-1">

                      {detail.picNames.map(

                        (name) => (

                          <Badge

                            key={name}

                            tone="brand"

                          >

                            {name}

                          </Badge>

                        ),

                      )}

                    </span>

                  </DetailRow>

                )}



              {detail.participants && (

                <DetailRow

                  icon={Users}

                  label="Peserta"

                >

                  {detail.participants}

                </DetailRow>

              )}



              {detail.meetingLink && (

                <DetailRow

                  icon={ExternalLink}

                  label="Link rapat"

                >

                  <SafeLink

                    href={

                      detail.meetingLink

                    }

                  />

                </DetailRow>

              )}



              {detail.documentLink && (

                <DetailRow

                  icon={ExternalLink}

                  label="Dokumen"

                >

                  <SafeLink

                    href={

                      detail.documentLink

                    }

                  />

                </DetailRow>

              )}

            </dl>



            {detail.notes && (

              <div>

                <p className="mb-1 text-[11px] font-semibold text-slate-400 uppercase">

                  Substansi

                </p>



                <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-[15px] leading-relaxed text-slate-600">

                  {detail.notes}

                </p>

              </div>

            )}



            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">

              <span>

                Terakhir diperbarui:{' '}

                {formatDateTime(

                  detail.updatedAt,

                )}{' '}

                WIB

              </span>



              <Badge tone="outline">

                Sumber: Data Presentasi

              </Badge>

            </div>

          </div>

        )}

      </Modal>

    </div>

  );

}



/* -------------------------------------------------------------------------- */

/* CREATE MODAL                                                              */

/* -------------------------------------------------------------------------- */



function CreateActivityModal({

  open,

  year,

  pending,

  onOpenChange,

  onSubmit,

}: {

  open: boolean;

  year: number;

  pending: boolean;

  onOpenChange: (

    open: boolean,

  ) => void;

  onSubmit: (input: {

    year: number;

    title: string;

    startDate: string;

    endDate: string;

    notes: string;

  }) => Promise<void>;

}) {

  const today = new Date();



  const [form, setForm] = useState({

    date: String(

      today.getDate(),

    ),

    month: String(

      today.getMonth() + 1,

    ),

    year: String(year),

    title: '',

    notes: '',

  });



  const selectedYear = Number(

    form.year,

  );



  const selectedMonth = Number(

    form.month,

  );



  const maxDay = getDaysInMonth(

    selectedYear,

    selectedMonth,

  );



  const selectedDay = Math.min(

    Number(form.date) || 1,

    maxDay,

  );



  const resetForm = () => {

    setForm({

      date: '8',

      month: '10',

      year: String(year),

      title: '',

      notes: '',

    });

  };



  const changeMonth = (

    value: string,

  ) => {

    const nextMonth = Number(value);



    const nextMaxDay =

      getDaysInMonth(

        selectedYear,

        nextMonth,

      );



    setForm((current) => ({

      ...current,

      month: value,

      date: String(

        Math.min(

          Number(current.date) ||

          1,

          nextMaxDay,

        ),

      ),

    }));

  };



  const changeYear = (

    value: string,

  ) => {

    const nextYear = Number(value);



    const nextMaxDay =

      getDaysInMonth(

        nextYear,

        selectedMonth,

      );



    setForm((current) => ({

      ...current,

      year: value,

      date: String(

        Math.min(

          Number(current.date) ||

          1,

          nextMaxDay,

        ),

      ),

    }));

  };



  const submit = async (

    e: React.FormEvent,

  ) => {

    e.preventDefault();



    if (!form.title.trim()) {

      return;

    }



    const startDate = makeDate(

      selectedYear,

      selectedMonth,

      selectedDay,

    );



    await onSubmit({

      year: selectedYear,

      title: form.title.trim(),

      startDate,

      endDate: startDate,

      notes: form.notes.trim(),

    });



    resetForm();

  };



  return (

    <Modal

      open={open}

      onOpenChange={onOpenChange}

      title="Rencana Kegiatan Baru"

      description="Tambahkan kegiatan baru untuk kebutuhan presentasi dan perencanaan."

      size="md"

    >

      <form

        onSubmit={submit}

        className="space-y-4"

      >

        {/* TANGGAL */}

        <div className="grid grid-cols-3 gap-3">

          <label className="space-y-1.5">

            <span className="text-xs font-semibold text-slate-500">

              Tanggal

            </span>



            <Select

              value={String(

                selectedDay,

              )}

              onChange={(e) =>

                setForm(

                  (current) => ({

                    ...current,

                    date: e.target.value,

                  }),

                )

              }

            >

              {Array.from(

                {

                  length: maxDay,

                },

                (_, index) =>

                  index + 1,

              ).map((day) => (

                <option

                  key={day}

                  value={day}

                >

                  {day}

                </option>

              ))}

            </Select>

          </label>



          {/* BULAN */}

          <label className="space-y-1.5">

            <span className="text-xs font-semibold text-slate-500">

              Bulan

            </span>



            <Select

              value={form.month}

              onChange={(e) =>

                changeMonth(

                  e.target.value,

                )

              }

            >

              {Array.from(

                { length: 12 },

                (_, index) =>

                  index + 1,

              ).map(

                (monthNumber) => (

                  <option

                    key={

                      monthNumber

                    }

                    value={

                      monthNumber

                    }

                  >

                    {monthName(

                      monthNumber,

                    )}

                  </option>

                ),

              )}

            </Select>

          </label>



          {/* TAHUN */}

          <label className="space-y-1.5">

            <span className="text-xs font-semibold text-slate-500">

              Tahun

            </span>



            <Select

              value={form.year}

              onChange={(e) =>

                changeYear(

                  e.target.value,

                )

              }

            >

              {PRESENTATION_YEARS.map(

                (yearOption) => (

                  <option

                    key={

                      yearOption

                    }

                    value={

                      yearOption

                    }

                  >

                    {yearOption}

                  </option>

                ),

              )}

            </Select>

          </label>

        </div>



        {/* NAMA */}

        <label className="block space-y-1.5">

          <span className="text-xs font-semibold text-slate-500">

            Nama kegiatan

          </span>



          <Input

            value={form.title}

            onChange={(e) =>

              setForm(

                (current) => ({

                  ...current,

                  title:

                    e.target.value,

                }),

              )

            }

            placeholder="Masukkan nama kegiatan"

            required

          />

        </label>



        {/* SUBSTANSI */}

        <label className="block space-y-1.5">

          <span className="text-xs font-semibold text-slate-500">

            Substansi

          </span>



          <textarea

            value={form.notes}

            onChange={(e) =>

              setForm(

                (current) => ({

                  ...current,

                  notes:

                    e.target.value,

                }),

              )

            }

            placeholder="Tuliskan uraian singkat kegiatan"

            rows={4}

            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"

          />

        </label>



        {/* TOMBOL */}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">

          <button

            type="button"

            onClick={() =>

              onOpenChange(false)

            }

            disabled={pending}

            className="pressable rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"

          >

            Batal

          </button>



          <button

            type="submit"

            disabled={

              pending ||

              !form.title.trim()

            }

            className="pressable rounded-xl bg-(image:--gradient-brand) px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"

          >

            {pending

              ? 'Menyimpan…'

              : 'Simpan Rencana Kegiatan'}

          </button>

        </div>

      </form>

    </Modal>

  );

}



/* -------------------------------------------------------------------------- */

/* DETAIL ROW                                                                */

/* -------------------------------------------------------------------------- */



function DetailRow({

  icon: Icon,

  label,

  children,

}: {

  icon: typeof MapPin;

  label: string;

  children: React.ReactNode;

}) {

  return (

    <div className="flex items-start gap-3">

      <Icon

        className="mt-0.5 size-4.5 shrink-0 text-slate-400"

        aria-hidden

      />



      <div className="min-w-0">

        <dt className="text-[11px] font-semibold text-slate-400 uppercase">

          {label}

        </dt>



        <dd className="text-[15px] leading-relaxed text-slate-700">

          {children}

        </dd>

      </div>

    </div>

  );

}



/* -------------------------------------------------------------------------- */

/* SAFE LINK                                                                 */

/* -------------------------------------------------------------------------- */



function SafeLink({

  href,

}: {

  href: string;

}) {

  let valid = false;



  try {

    const url = new URL(href);



    valid =

      url.protocol === 'https:' ||

      url.protocol === 'http:';

  } catch {

    valid = false;

  }



  if (!valid) {

    return (

      <span className="text-slate-500">

        {href}

      </span>

    );

  }



  return (

    <a

      href={href}

      target="_blank"

      rel="noopener noreferrer"

      className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"

    >

      {href.length > 48

        ? `${href.slice(

          0,

          48,

        )}…`

        : href}

    </a>

  );

}



/* -------------------------------------------------------------------------- */

/* ACTIVITY CARD                                                             */

/* -------------------------------------------------------------------------- */



function ActivityCard({

  item,

  onOpen,

  showDate = true,

}: {

  item: ActivityPlanItem;

  onOpen: (

    item: ActivityPlanItem,

  ) => void;

  showDate?: boolean;

}) {

  const meta =

    STATUS_META[item.status];



  return (

    <button

      type="button"

      onClick={() => onOpen(item)}

      className={cn(

        'liftable pressable w-full cursor-pointer rounded-xl border border-slate-200/80 bg-white p-3 text-left shadow-sm',

        (item.status ===

          'DIBATALKAN' ||

          item.status ===

          'DITUNDA') &&

        'opacity-75',

      )}

    >

      <div className="flex items-start justify-between gap-2">

        <p

          className={cn(

            'min-w-0 text-sm leading-snug font-semibold text-slate-800',

            item.status ===

            'DIBATALKAN' &&

            'line-through',

          )}

        >

          {item.title}

        </p>



        <Badge

          tone={

            meta.tone === 'brand'

              ? 'brand'

              : meta.tone

          }

        >

          {meta.label}

        </Badge>

      </div>



      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">

        {showDate && (

          <span className="tnum inline-flex items-center gap-1">

            <CalendarDays

              className="size-3.5"

              aria-hidden

            />

            {formatRange(item)}

          </span>

        )}



        {item.location && (

          <span className="inline-flex min-w-0 items-center gap-1">

            <MapPin

              className="size-3.5 shrink-0"

              aria-hidden

            />



            <span className="truncate">

              {item.location}

            </span>

          </span>

        )}



        {item.picNames.length >

          0 && (

            <span className="inline-flex items-center gap-1">

              <Users

                className="size-3.5"

                aria-hidden

              />



              {item.picNames

                .slice(0, 3)

                .join(', ')}



              {item.picNames.length >

                3 &&

                ` +${item.picNames.length -

                3

                }`}

            </span>

          )}

      </div>

    </button>

  );

}



/* -------------------------------------------------------------------------- */

/* RINGKASAN                                                                 */

/* -------------------------------------------------------------------------- */



function SummaryView({

  items,

  onOpen,

}: {

  items: ActivityPlanItem[];

  onOpen: (

    item: ActivityPlanItem,

  ) => void;

}) {

  /*

   * Untuk presentasi, ringkasan menggunakan

   * tanggal sistem. Pada 8 Oktober 2026,

   * agenda verifikasi Oktober akan muncul

   * di bagian Hari Ini.

   */

  const iso = todayISO();



  const today = itemsToday(

    items,

    iso,

  );



  const week = itemsUpcoming(

    items,

    7,

    iso,

  );



  const later = itemsUpcoming(

    items,

    60,

    iso,

  )

    .filter(

      (item) => !week.includes(item),

    )

    .slice(0, 6);



  return (

    <div className="grid gap-4 xl:grid-cols-3">

      {/* HARI INI */}

      <Card className="xl:col-span-1">

        <CardHeader

          title="Hari Ini"

          description={formatDate(iso)}

        />



        <div className="space-y-2 p-4">

          {today.length === 0 ? (

            <EmptyState

              compact

              icon={CalendarDays}

              title="Tidak ada kegiatan hari ini"

            />

          ) : (

            today.map((item) => (

              <ActivityCard

                key={item.id}

                item={item}

                onOpen={onOpen}

              />

            ))

          )}

        </div>

      </Card>



      {/* 7 HARI */}

      <Card className="xl:col-span-1">

        <CardHeader

          title="7 Hari ke Depan"

          description="Kegiatan terdekat minggu ini"

        />



        <div className="space-y-2 p-4">

          {week.length === 0 ? (

            <EmptyState

              compact

              icon={CalendarRange}

              title="Belum ada kegiatan minggu ini"

            />

          ) : (

            week.map((item) => (

              <ActivityCard

                key={item.id}

                item={item}

                onOpen={onOpen}

              />

            ))

          )}

        </div>

      </Card>



      {/* MENDATANG */}

      <Card className="xl:col-span-1">

        <CardHeader

          title="Mendatang"

          description="Setelah minggu ini"

        />



        <div className="space-y-2 p-4">

          {later.length === 0 ? (

            <EmptyState

              compact

              icon={CalendarRange}

              title="Belum ada kegiatan berikutnya"

            />

          ) : (

            later.map((item) => (

              <ActivityCard

                key={item.id}

                item={item}

                onOpen={onOpen}

              />

            ))

          )}

        </div>

      </Card>

    </div>

  );

}



/* -------------------------------------------------------------------------- */

/* KALENDER                                                                   */

/* -------------------------------------------------------------------------- */



const DAY_NAMES = [

  'Sen',

  'Sel',

  'Rab',

  'Kam',

  'Jum',

  'Sab',

  'Min',

];



function CalendarView({

  items,

  year,

  month,

  onMonthChange,

  onOpen,

}: {

  items: ActivityPlanItem[];

  year: number;

  month: number;

  onMonthChange: (

    month: number,

  ) => void;

  onOpen: (

    item: ActivityPlanItem,

  ) => void;

}) {

  const weeks = useMemo(

    () =>

      monthMatrix(

        year,

        month,

        items,

      ),

    [year, month, items],

  );



  const iso = todayISO();



  return (

    <Card>

      <CardHeader

        title={`${monthName(month)} ${year}`}

        description="Klik kegiatan untuk melihat detail"

        actions={

          <label className="w-[250px] shrink-0">

            <span className="sr-only">

              Bulan

            </span>



            <Select

              value={month}

              onChange={(e) =>

                onMonthChange(

                  Number(

                    e.target.value,

                  ),

                )

              }

            >

              {Array.from(

                { length: 12 },

                (_, i) => (

                  <option

                    key={i + 1}

                    value={i + 1}

                  >

                    {monthName(

                      i + 1,

                    )}

                  </option>

                ),

              )}

            </Select>

          </label>

        }

      />



      <div className="overflow-x-auto p-4">

        <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-1">

          <thead>

            <tr>

              {DAY_NAMES.map(

                (day) => (

                  <th

                    key={day}

                    className="pb-1 text-center text-[11px] font-semibold text-slate-400"

                  >

                    {day}

                  </th>

                ),

              )}

            </tr>

          </thead>



          <tbody>

            {weeks.map(

              (week, weekIndex) => (

                <tr key={weekIndex}>

                  {week.map(

                    (cell) => (

                      <td

                        key={

                          cell.iso

                        }

                        className={cn(

                          'h-24 rounded-xl border border-slate-100 bg-white/60 p-1.5 align-top',

                          !cell.inMonth &&

                          'opacity-40',

                          cell.iso ===

                          iso &&

                          'border-brand-300 bg-brand-50/60',

                        )}

                      >

                        <p

                          className={cn(

                            'tnum mb-1 text-xs font-semibold',

                            cell.iso ===

                              iso

                              ? 'text-brand-700'

                              : 'text-slate-500',

                          )}

                        >

                          {Number(

                            cell.iso.slice(

                              8,

                              10,

                            ),

                          )}

                        </p>



                        <div className="space-y-1">

                          {cell.items

                            .slice(

                              0,

                              3,

                            )

                            .map(

                              (

                                item,

                              ) => (

                                <button

                                  key={

                                    item.id

                                  }

                                  type="button"

                                  onClick={() =>

                                    onOpen(

                                      item,

                                    )

                                  }

                                  title={

                                    item.title

                                  }

                                  className={cn(

                                    'pressable block w-full cursor-pointer truncate rounded-md px-1.5 py-0.5 text-left text-[11px] leading-4 font-semibold',

                                    item.status ===

                                      'DIBATALKAN'

                                      ? 'bg-slate-100 text-slate-400 line-through'

                                      : item.status ===

                                        'BERLANGSUNG'

                                        ? 'bg-(image:--gradient-brand) text-white'

                                        : 'bg-brand-100 text-brand-800 hover:bg-brand-200',

                                  )}

                                >

                                  {

                                    item.title

                                  }

                                </button>

                              ),

                            )}



                          {cell.items

                            .length >

                            3 && (

                              <p className="px-1 text-[10px] font-semibold text-slate-400">

                                +

                                {cell

                                  .items

                                  .length -

                                  3}{' '}

                                lainnya

                              </p>

                            )}

                        </div>

                      </td>

                    ),

                  )}

                </tr>

              ),

            )}

          </tbody>

        </table>

      </div>

    </Card>

  );

}

/* -------------------------------------------------------------------------- */
/* DAFTAR KEGIATAN                                                            */
/* -------------------------------------------------------------------------- */

function ListView({
  items,
  onOpen,
}: {
  items: ActivityPlanItem[];
  onOpen: (item: ActivityPlanItem) => void;
}) {
  const groups = groupByMonth(items);

  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleMonth = (key: string) => {
    setExpandedMonths((previous) => {
      const next = new Set(previous);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarRange}
          title="Tidak ada kegiatan yang cocok dengan filter"
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([key, list]) => {
        const [y = 0, m = 1] = key.split('-').map(Number);
        const isExpanded = expandedMonths.has(key);
        const visibleItems = isExpanded ? list : list.slice(0, 2);
        const hiddenCount = Math.max(0, list.length - 2);

        return (
          <section
            key={key}
            aria-label={`${monthName(m)} ${y}`}
            className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
          >
            {/* Header bulan */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <CalendarDays className="size-5" aria-hidden />
                </div>

                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800">
                    {monthName(m)} {y}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Agenda kegiatan bulanan
                  </p>
                </div>
              </div>

              <Badge tone="outline">
                {list.length} kegiatan
              </Badge>
            </div>

            {/* Daftar kegiatan: tetap vertikal seperti desain asli */}
            <div className="divide-y divide-slate-100 px-3 sm:px-5">
              {visibleItems.map((item) => {
                const meta = STATUS_META[item.status];

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpen(item)}
                    className="group flex w-full min-w-0 flex-col gap-3 py-4 text-left transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-5"
                  >
                    {/* Tanggal */}
                    <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500 sm:w-40">
                      <CalendarDays
                        className="size-4 shrink-0 text-brand-600"
                        aria-hidden
                      />
                      <span className="tnum">
                        {formatRange(item)}
                      </span>
                    </div>

                    {/* Informasi kegiatan */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'break-words text-sm font-semibold leading-5 text-slate-800 transition-colors group-hover:text-brand-700',
                          item.status === 'DIBATALKAN' &&
                          'line-through text-slate-400',
                        )}
                      >
                        {item.title}
                      </p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                        {item.location && (
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <MapPin
                              className="size-3.5 shrink-0"
                              aria-hidden
                            />
                            <span className="break-words">
                              {item.location}
                            </span>
                          </span>
                        )}

                        {item.category && (
                          <span className="inline-flex items-center gap-1.5">
                            <ListTodo
                              className="size-3.5 shrink-0"
                              aria-hidden
                            />
                            {item.category}
                          </span>
                        )}

                        {item.picNames.length > 0 && (
                          <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Users
                              className="size-3.5 shrink-0"
                              aria-hidden
                            />
                            <span className="break-words">
                              {item.picNames.join(', ')}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status dan indikator */}
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <Badge
                        tone={
                          meta.tone === 'brand'
                            ? 'brand'
                            : meta.tone
                        }
                      >
                        {meta.label}
                      </Badge>

                      <ExternalLink
                        className="size-4 text-slate-300 transition-colors group-hover:text-brand-600"
                        aria-hidden
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Tombol tampilkan kegiatan lainnya */}
            {list.length > 2 && (
              <div className="border-t border-slate-100 px-3 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => toggleMonth(key)}
                  aria-expanded={isExpanded}
                  className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {isExpanded
                    ? 'Tampilkan lebih sedikit'
                    : `Tampilkan ${hiddenCount} kegiatan lainnya`}
                </button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}