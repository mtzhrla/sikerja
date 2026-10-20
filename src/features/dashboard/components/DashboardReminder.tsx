import React from 'react';
import { Calendar, Bell, MoreHorizontal } from 'lucide-react';

interface ReminderItem {
  id: string | number;
  title: string;
  date: string;
}

interface DashboardReminderWidgetProps {
  items?: ReminderItem[];
}

export function DashboardReminderWidget({ items = [] }: DashboardReminderWidgetProps) {
  // Data dummy fallback jika prop items kosong
  const defaultReminders: ReminderItem[] = [
    {
      id: 1,
      title: "Prepare Presentation for Stakeholders' Meeting",
      date: '5 May',
    },
    {
      id: 2,
      title: 'Review Quarterly PIP Program Report',
      date: '12 May',
    },
  ];

  const reminderList = items.length > 0 ? items : defaultReminders;

  return (
    <div className="space-y-3">
      {/* Header Widget */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Reminder</h3>
        <button className="text-slate-400 hover:text-slate-600 transition-colors p-1">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* List Item Reminder */}
      <div className="space-y-2.5">
        {reminderList.map((item) => (
          <div
            key={item.id}
            className="p-3 bg-slate-50/70 hover:bg-slate-100/80 rounded-xl border border-slate-100 transition-colors space-y-2"
          >
            <p className="text-xs font-semibold text-slate-800 leading-snug">
              {item.title}
            </p>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{item.date}</span>
              </div>

              {/* Pill Badge Reminder */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 font-semibold text-[10px] border border-sky-100">
                <Bell className="w-3 h-3 fill-sky-600/20" />
                Reminder
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/* Tambahkan bagian ini di paling bawah layout DashboardReminderWidget kamu */

<div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
  {/* Header Section Reminder */}
  <div className="flex items-center justify-between">
    <h3 className="text-xs font-bold text-slate-800 tracking-tight">Reminder</h3>
    <button className="text-slate-400 hover:text-slate-600 transition-colors p-0.5">
      <MoreHorizontal className="w-4 h-4" />
    </button>
  </div>

  {/* Card Item Reminder */}
  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 space-y-2.5">
    <p className="text-xs font-semibold text-slate-800 leading-snug">
      Prepare Presentation for Stakeholders' Meeting
    </p>

    <div className="flex items-center justify-between text-[11px] text-slate-400">
      <div className="flex items-center gap-1.5 font-medium">
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        <span>5 May</span>
      </div>

      {/* Pill Badge Blue Reminder */}
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 font-semibold text-[10px] border border-sky-100">
        <Bell className="w-3 h-3 fill-sky-600/20" />
        Reminder
      </span>
    </div>
  </div>
</div>