import type { ChecklistGroup, Task } from '@/services/types';
import { clamp } from './utils';

export interface ChecklistStats {
  done: number;
  total: number;
  /** 0–100, dibulatkan. */
  percent: number;
}

/** Statistik checklist: jumlah item selesai / keseluruhan × 100. */
export function checklistStats(groups: readonly ChecklistGroup[]): ChecklistStats {
  let done = 0;
  let total = 0;
  for (const group of groups) {
    for (const item of group.items) {
      total += 1;
      if (item.done) done += 1;
    }
  }
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}

/** Progres efektif task sesuai mode (MANUAL atau CHECKLIST). */
export function taskProgress(
  task: Pick<Task, 'progressMode' | 'manualProgress' | 'checklist'>,
): number {
  if (task.progressMode === 'CHECKLIST') {
    return checklistStats(task.checklist).percent;
  }
  return clamp(Math.round(task.manualProgress), 0, 100);
}
