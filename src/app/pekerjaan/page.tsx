'use client';

import React, { useState, useMemo } from 'react';
import {
  EMPLOYEES,
  SECTIONS,
  INITIAL_TASKS,
  Employee,
  Task,
  TaskStatus,
  Priority,
  DurationType,
} from '@/services/local/seed';
import {
  Plus,
  Filter,
  AlertTriangle,
  Paperclip,
  Archive,
  ChevronDown,
  UserCheck,
  User,
  Calendar,
  X,
  CheckCircle2,
  Users
} from 'lucide-react';

const CURRENT_USER_ID = 'emp-thoriq';

export default function PekerjaanPage() {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);

  // Filter States
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDuration, setSelectedDuration] = useState<string>('ALL');
  const [selectedDueDate, setSelectedDueDate] = useState<string>('ALL');
  const [filterHasAttachment, setFilterHasAttachment] = useState<boolean>(false);
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  // Modal Pekerjaan Baru States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<'MANDIRI' | 'DISPOSISI'>('MANDIRI');
  const [assignedPicId, setAssignedPicId] = useState(CURRENT_USER_ID);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>('SEDANG');
  const [durationType, setDurationType] = useState<DurationType>('JANGKA_PENDEK');
  const [dueDate, setDueDate] = useState('');

  // ---------------------------------------------------------------------------
  // LOGIKA 1: FILTERING TEPAT
  // ---------------------------------------------------------------------------
  const filteredTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tasks.filter((task) => {
      // Filter Status
      if (selectedStatus !== 'ALL' && task.status !== selectedStatus) return false;

      // Filter Durasi
      if (selectedDuration !== 'ALL' && task.durationType !== selectedDuration) return false;

      // Filter Lampiran
      if (filterHasAttachment && (!task.attachments || task.attachments.length === 0)) return false;

      // Filter Tenggat Waktu (Due Date)
      if (selectedDueDate !== 'ALL') {
        if (!task.dueDate) return selectedDueDate === 'NO_DATES';

        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);

        const diffTime = taskDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (selectedDueDate === 'NO_DATES') return false;
        if (selectedDueDate === 'OVERDUE') return diffDays < 0 && task.status !== 'DONE';
        if (selectedDueDate === 'NEXT_DAY') return diffDays >= 0 && diffDays <= 1;
        if (selectedDueDate === 'NEXT_WEEK') return diffDays >= 0 && diffDays <= 7;
        if (selectedDueDate === 'NEXT_MONTH') return diffDays >= 0 && diffDays <= 30;
      }

      return true;
    });
  }, [tasks, selectedStatus, selectedDuration, selectedDueDate, filterHasAttachment]);

  // Cek Status Terlambat (Overdue)
  const checkIsOverdue = (dueDateStr?: string, status?: TaskStatus) => {
    if (!dueDateStr || status === 'DONE') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dueDateStr);
    target.setHours(0, 0, 0, 0);
    return target < today;
  };

  // ---------------------------------------------------------------------------
  // LOGIKA 2: URUTAN VISUAL KARTU BOARD (Tinggi -> Sedang -> Rendah)
  // ---------------------------------------------------------------------------
  const getTasksGroupedByPriority = (taskList: Task[]) => {
    const tinggi = taskList.filter((t) => t.priority === 'TINGGI');
    const sedang = taskList.filter((t) => t.priority === 'SEDANG');
    const rendah = taskList.filter((t) => t.priority === 'RENDAH');
    return { tinggi, sedang, rendah };
  };

  // ---------------------------------------------------------------------------
  // LOGIKA 3: SIMPAN PEKERJAAN BARU
  // ---------------------------------------------------------------------------
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      title,
      ownerEmployeeId: taskType === 'MANDIRI' ? CURRENT_USER_ID : assignedPicId,
      assigneeEmployeeIds: selectedTeamIds,
      status: 'TODO',
      priority,
      durationType,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      attachments: [],
    };

    setTasks([newTask, ...tasks]);
    setIsModalOpen(false);

    // Reset Form
    setTitle('');
    setTaskType('MANDIRI');
    setAssignedPicId(CURRENT_USER_ID);
    setSelectedTeamIds([]);
    setPriority('SEDANG');
    setDurationType('JANGKA_PENDEK');
    setDueDate('');
  };

  const toggleTeamMember = (empId: string) => {
    if (selectedTeamIds.includes(empId)) {
      setSelectedTeamIds(selectedTeamIds.filter((id) => id !== empId));
    } else {
      setSelectedTeamIds([...selectedTeamIds, empId]);
    }
  };

  // ---------------------------------------------------------------------------
  // LOGIKA 4: WORKLOAD / BEBAN KERJA PEGAWAI REAL-TIME
  // ---------------------------------------------------------------------------
  const workloadData = useMemo(() => {
    return EMPLOYEES.map((emp) => {
      // Hitung pekerjaan di mana pegawai ini jadi PIC Utama atau Anggota Tim & Belum Selesai
      const activeTasks = tasks.filter(
        (t) =>
          t.status !== 'DONE' &&
          (t.ownerEmployeeId === emp.id || t.assigneeEmployeeIds?.includes(emp.id))
      );
      return {
        employee: emp,
        totalTasks: activeTasks.length,
      };
    });
  }, [tasks]);

  return (
    <div className="min-h-screen bg-slate-100 p-6 flex flex-col justify-between text-slate-800">
      <div>
        {/* ==================================================================== */}
        {/* A. HEADER & POPUP FILTER                                             */}
        {/* ==================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Board Pekerjaan</h1>

            {/* POPUP FILTER MELEBAR / FLEKSIBEL */}
            <div className="relative">
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                  isFilterOpen
                    ? 'bg-blue-50 border-blue-600 text-blue-600 shadow-sm'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Filter className="w-5 h-5 text-blue-600 stroke-[2.5]" />
                <span>Filter Board</span>
                <ChevronDown className="w-4 h-4 ml-1" />
              </button>

              {/* Menu Dropdown Filter Fleksibel */}
              {isFilterOpen && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 md:w-[420px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 p-5 space-y-4">
                  <div className="flex justify-between items-center border-b pb-3">
                    <span className="font-extrabold text-slate-800 text-sm">Filter Tampilan</span>
                    <button
                      onClick={() => {
                        setSelectedStatus('ALL');
                        setSelectedDuration('ALL');
                        setSelectedDueDate('ALL');
                        setFilterHasAttachment(false);
                      }}
                      className="text-xs text-blue-600 hover:underline font-semibold"
                    >
                      Reset Semua Filter
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Filter Status */}
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="w-full p-2.5 border rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-blue-500 font-medium"
                      >
                        <option value="ALL">Semua Status</option>
                        {SECTIONS.map((sec) => (
                          <option key={sec.id} value={sec.id}>
                            {sec.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filter Durasi */}
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Durasi</label>
                      <select
                        value={selectedDuration}
                        onChange={(e) => setSelectedDuration(e.target.value)}
                        className="w-full p-2.5 border rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-blue-500 font-medium"
                      >
                        <option value="ALL">Semua Durasi</option>
                        <option value="JANGKA_PENDEK">Jangka Pendek</option>
                        <option value="JANGKA_PANJANG">Jangka Panjang</option>
                      </select>
                    </div>
                  </div>

                  {/* Filter Tenggat (Due Date) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Tenggat Waktu</label>
                    <select
                      value={selectedDueDate}
                      onChange={(e) => setSelectedDueDate(e.target.value)}
                      className="w-full p-2.5 border rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-blue-500 font-medium"
                    >
                      <option value="ALL">Semua Tenggat Waktu</option>
                      <option value="NO_DATES">Tanpa Tenggat (No dates)</option>
                      <option value="OVERDUE">Terlambat (Overdue)</option>
                      <option value="NEXT_DAY">Tenggat Besok (Next 24h)</option>
                      <option value="NEXT_WEEK">Tenggat Minggu Ini (Next week)</option>
                      <option value="NEXT_MONTH">Tenggat Bulan Ini (Next month)</option>
                    </select>
                  </div>

                  {/* Filter Lampiran */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <input
                      type="checkbox"
                      id="attachmentFilter"
                      checked={filterHasAttachment}
                      onChange={(e) => setFilterHasAttachment(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="attachmentFilter" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-slate-500" />
                      Hanya tampilkan pekerjaan yang punya Lampiran Berkas
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TOMBOL PEKERJAAN BARU MENCOLOK & KONTRAS */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all transform active:scale-95"
          >
            <Plus className="w-6 h-6 stroke-[3]" />
            <span className="text-base tracking-wide">+ Pekerjaan Baru</span>
          </button>
        </div>

        {/* ==================================================================== */}
        {/* B. KANBAN BOARD & URUTAN VISUAL PRIORITAS                            */}
        {/* ==================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {SECTIONS.map((section) => {
            const sectionTasks = filteredTasks.filter((t) => t.status === section.id);
            const { tinggi, sedang, rendah } = getTasksGroupedByPriority(sectionTasks);

            return (
              <div key={section.id} className="bg-slate-200/70 rounded-2xl p-4 flex flex-col min-h-[550px] border border-slate-300/60">
                {/* Header Kolom Kanban */}
                <div className="flex justify-between items-center mb-4 px-1">
                  <h2 className="font-black text-slate-700 text-xs tracking-wider uppercase">
                    {section.title}
                  </h2>
                  <span className="bg-slate-300 text-slate-800 text-xs font-black px-2.5 py-0.5 rounded-full">
                    {sectionTasks.length}
                  </span>
                </div>

                {/* List Kartu Berdasarkan Kelompok Prioritas Secara Visual */}
                <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                  {[
                    { label: 'Prioritas Tinggi / Sulit', items: tinggi, style: 'border-l-4 border-l-red-500 bg-red-50/40' },
                    { label: 'Prioritas Sedang', items: sedang, style: 'border-l-4 border-l-amber-500 bg-amber-50/30' },
                    { label: 'Prioritas Rendah', items: rendah, style: 'border-l-4 border-l-emerald-500 bg-emerald-50/30' },
                  ].map((group, idx) => {
                    if (group.items.length === 0) return null;

                    return (
                      <div key={idx} className="space-y-2.5">
                        {/* Sub-header Prioritas untuk Memastikan Urutan Visual */}
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 pl-1">
                          {group.label}
                        </div>

                        {group.items.map((task) => {
                          const pic = EMPLOYEES.find((e) => e.id === task.ownerEmployeeId);
                          const overdue = checkIsOverdue(task.dueDate, task.status);

                          return (
                            <div
                              key={task.id}
                              className={`bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all ${group.style}`}
                            >
                              {/* Header Card: Overdue Warning + Badges */}
                              <div className="flex justify-between items-center mb-2">
                                <span
                                  className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                                    task.priority === 'TINGGI'
                                      ? 'bg-red-100 text-red-700'
                                      : task.priority === 'SEDANG'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-700'
                                  }`}
                                >
                                  {task.priority}
                                </span>

                                {/* Indikator Peringatan Overdue */}
                                {overdue && (
                                  <span className="flex items-center gap-1 bg-red-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full animate-bounce">
                                    <AlertTriangle className="w-3 h-3" />
                                    OVERDUE
                                  </span>
                                )}
                              </div>

                              <h3 className="font-bold text-slate-900 text-sm mb-3 line-clamp-2 leading-snug">
                                {task.title}
                              </h3>

                              {/* Info Durasi Badge */}
                              <div className="mb-3">
                                <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                                  {task.durationType === 'JANGKA_PENDEK' ? '⚡ Jangka Pendek' : '⏳ Jangka Panjang'}
                                </span>
                              </div>

                              {/* Footer Card: Due Date, Lampiran & PIC */}
                              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                                <div className="flex items-center gap-2">
                                  {task.dueDate && (
                                    <span className={`flex items-center gap-1 text-[11px] font-medium ${overdue ? 'text-red-600 font-bold' : ''}`}>
                                      <Calendar className="w-3.5 h-3.5" />
                                      {new Date(task.dueDate).toLocaleDateString('id-ID', {
                                        day: 'numeric',
                                        month: 'short',
                                      })}
                                    </span>
                                  )}

                                  {task.attachments && task.attachments.length > 0 && (
                                    <span className="flex items-center gap-0.5 text-[11px] font-medium">
                                      <Paperclip className="w-3.5 h-3.5" />
                                      {task.attachments.length}
                                    </span>
                                  )}
                                </div>

                                {/* Avatar PIC Utama */}
                                {pic && (
                                  <div className="flex items-center gap-1" title={`PIC Utama: ${pic.name}`}>
                                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white">
                                      {pic.name.charAt(0)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* D. PANEL BEBAN KERJA (WORKLOAD)                                      */}
      {/* ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            Pemantauan Beban Kerja Pegawai (Workload Aktif)
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            Ditentukan berdasarkan tugas yang belum selesai
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {workloadData.map(({ employee, totalTasks }) => (
            <div key={employee.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 hover:bg-slate-100/50 transition-all">
              <p className="text-xs font-bold text-slate-700 truncate">{employee.name}</p>
              <p className="text-[10px] text-slate-400 font-medium truncate mb-2">{employee.role}</p>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900">{totalTasks}</span>
                <span className="text-[10px] font-bold text-slate-500">Tugas</span>
              </div>

              {/* Progress Bar Indikator Beban Kerja */}
              <div className="w-full bg-slate-200 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    totalTasks >= 5
                      ? 'bg-red-500'
                      : totalTasks >= 3
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min((totalTasks / 6) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* FITUR ARSIP (Diletakkan di bagian paling bawah halaman)               */}
      {/* ==================================================================== */}
      <div className="border-t border-slate-200 pt-4 flex justify-center">
        <button className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 font-bold transition-colors py-2 px-4 rounded-xl hover:bg-slate-200/60">
          <Archive className="w-4.5 h-4.5" />
          Lihat Pekerjaan di-Arsipkan
        </button>
      </div>

      {/* ==================================================================== */}
      {/* C. MODAL "PEKERJAAN BARU"                                             */}
      {/* ==================================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-black text-slate-900">Buat Pekerjaan Baru</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              {/* Judul Pekerjaan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Judul Pekerjaan <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Menyusun Laporan Keuangan"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>

              {/* Opsi Jenis Pekerjaan: Mandiri vs Disposisi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Jenis Penugasan
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setTaskType('MANDIRI');
                      setAssignedPicId(CURRENT_USER_ID);
                    }}
                    className={`p-3 border rounded-xl text-left flex items-start gap-2.5 transition-all ${
                      taskType === 'MANDIRI'
                        ? 'border-blue-600 bg-blue-50/60 text-blue-700 ring-1 ring-blue-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <User className="w-5 h-5 mt-0.5 text-blue-600" />
                    <div>
                      <div className="text-xs font-extrabold">Mandiri</div>
                      <div className="text-[10px] opacity-80">Untuk diri sendiri</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTaskType('DISPOSISI')}
                    className={`p-3 border rounded-xl text-left flex items-start gap-2.5 transition-all ${
                      taskType === 'DISPOSISI'
                        ? 'border-blue-600 bg-blue-50/60 text-blue-700 ring-1 ring-blue-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <UserCheck className="w-5 h-5 mt-0.5 text-blue-600" />
                    <div>
                      <div className="text-xs font-extrabold">Disposisi</div>
                      <div className="text-[10px] opacity-80">Tugaskan ke pegawai lain</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Pilih PIC Utama (Khusus jika Disposisi) */}
              {taskType === 'DISPOSISI' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Pilih PIC Utama
                  </label>
                  <select
                    value={assignedPicId}
                    onChange={(e) => setAssignedPicId(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  >
                    {EMPLOYEES.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tambah Anggota Tim Tambahan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  Anggota Tim Tambahan (Opsional)
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
                  {EMPLOYEES.map((emp) => {
                    // Sembunyikan PIC Utama dari daftar tim tambahan
                    if (taskType === 'DISPOSISI' && emp.id === assignedPicId) return null;
                    if (taskType === 'MANDIRI' && emp.id === CURRENT_USER_ID) return null;

                    const isChecked = selectedTeamIds.includes(emp.id);

                    return (
                      <label
                        key={emp.id}
                        onClick={() => toggleTeamMember(emp.id)}
                        className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                          isChecked ? 'bg-blue-100/60 border-blue-400 text-blue-900 font-bold' : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 text-blue-600 rounded"
                        />
                        <span className="truncate">{emp.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Prioritas & Durasi */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Prioritas
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="w-full p-3 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  >
                    <option value="TINGGI">Tinggi / Sulit</option>
                    <option value="SEDANG">Sedang</option>
                    <option value="RENDAH">Rendah</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Durasi
                  </label>
                  <select
                    value={durationType}
                    onChange={(e) => setDurationType(e.target.value as DurationType)}
                    className="w-full p-3 border border-slate-300 rounded-xl text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  >
                    <option value="JANGKA_PENDEK">Jangka Pendek</option>
                    <option value="JANGKA_PANJANG">Jangka Panjang</option>
                  </select>
                </div>
              </div>

              {/* Tenggat Waktu */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Tenggat Waktu (Due Date)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-extrabold hover:bg-blue-700 shadow-md"
                >
                  Simpan Pekerjaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}