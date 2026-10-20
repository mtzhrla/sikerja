import { Bell, MoreHorizontal, Calendar } from 'lucide-react';

interface ReminderCardProps {
  title?: string;
  date?: string;
}

export function ReminderCard({
  title = "Prepare Presentation for Stakeholders' Meeting",
  date = "3 Sep",
}: ReminderCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-2xs space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-800 tracking-tight">Reminder</h3>
        <button className="text-slate-400 hover:text-slate-600 transition-colors p-0.5" aria-label="Opsi">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Konten Task Hari Ini */}
      <div className="p-2.5 bg-slate-50/80 rounded-lg border border-slate-100/80 space-y-2">
        <p className="text-xs font-semibold text-slate-800 leading-snug">
          {title}
        </p>

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5 font-medium">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{date}</span>
          </div>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 font-semibold text-[10px] border border-sky-100/80">
            <Bell className="w-3 h-3 fill-sky-600/20" />
            Reminder
          </span>
        </div>
      </div>
    </div>
  );
}