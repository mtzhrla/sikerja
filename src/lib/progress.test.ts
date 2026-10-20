import { describe, expect, it } from 'vitest';
import type { ChecklistGroup } from '@/services/types';
import { checklistStats, taskProgress } from './progress';

function groups(spec: Array<boolean[]>): ChecklistGroup[] {
  return spec.map((items, gi) => ({
    id: `g${gi}`,
    title: `Kelompok ${gi + 1}`,
    sortOrder: gi,
    items: items.map((done, ii) => ({ id: `g${gi}i${ii}`, text: `Item ${ii}`, done, sortOrder: ii })),
  }));
}

describe('checklistStats', () => {
  it('menghitung selesai/total lintas kelompok', () => {
    const stats = checklistStats(groups([[true, false], [true, true, false]]));
    expect(stats.done).toBe(3);
    expect(stats.total).toBe(5);
    expect(stats.percent).toBe(60);
  });

  it('checklist kosong = 0%', () => {
    expect(checklistStats([]).percent).toBe(0);
    expect(checklistStats(groups([[]])).percent).toBe(0);
  });
});

describe('taskProgress', () => {
  it('mode MANUAL memakai nilai manual (dibatasi 0–100)', () => {
    expect(
      taskProgress({ progressMode: 'MANUAL', manualProgress: 45, checklist: [] }),
    ).toBe(45);
    expect(
      taskProgress({ progressMode: 'MANUAL', manualProgress: 250, checklist: [] }),
    ).toBe(100);
    expect(
      taskProgress({ progressMode: 'MANUAL', manualProgress: -5, checklist: [] }),
    ).toBe(0);
  });

  it('mode CHECKLIST memakai rumus jumlah selesai / total × 100', () => {
    expect(
      taskProgress({
        progressMode: 'CHECKLIST',
        manualProgress: 10,
        checklist: groups([[true, true, false, false]]),
      }),
    ).toBe(50);
  });
});
