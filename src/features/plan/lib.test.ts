import { describe, expect, it } from 'vitest';
import type { ActivityPlanItem } from '@/services/types';
import {
  addDaysISO,
  applyFilters,
  DEFAULT_FILTERS,
  formatRange,
  groupByMonth,
  itemsToday,
  itemsUpcoming,
  monthMatrix,
  occursOn,
  uniqueCategories,
} from './lib';

function act(partial: Partial<ActivityPlanItem> & { id: string; startDate: string }): ActivityPlanItem {
  return {
    sourceId: null,
    year: 2026,
    title: partial.id,
    endDate: partial.startDate,
    startTime: null,
    endTime: null,
    allDay: true,
    location: '',
    category: '',
    picNames: [],
    picEmployeeIds: [],
    participants: '',
    status: 'RENCANA',
    notes: '',
    meetingLink: null,
    documentLink: null,
    sourceRowKey: partial.id,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('plan/lib', () => {
  it('occursOn: rentang tanggal inklusif', () => {
    const item = act({ id: 'a', startDate: '2026-07-10', endDate: '2026-07-12' });
    expect(occursOn(item, '2026-07-09')).toBe(false);
    expect(occursOn(item, '2026-07-10')).toBe(true);
    expect(occursOn(item, '2026-07-12')).toBe(true);
    expect(occursOn(item, '2026-07-13')).toBe(false);
  });

  it('itemsToday & itemsUpcoming memisahkan hari ini vs mendatang', () => {
    const today = '2026-07-17';
    const items = [
      act({ id: 'today', startDate: '2026-07-16', endDate: '2026-07-18' }),
      act({ id: 'soon', startDate: '2026-07-20' }),
      act({ id: 'far', startDate: '2026-09-01' }),
      act({ id: 'past', startDate: '2026-07-01' }),
    ];
    expect(itemsToday(items, today).map((i) => i.id)).toEqual(['today']);
    expect(itemsUpcoming(items, 7, today).map((i) => i.id)).toEqual(['soon']);
  });

  it('applyFilters: pencarian, kategori, PIC, status', () => {
    const items = [
      act({ id: 'a', startDate: '2026-07-01', category: 'Rapat', picEmployeeIds: ['emp-1'], status: 'SELESAI', title: 'Rapat bank penyalur' }),
      act({ id: 'b', startDate: '2026-07-02', category: 'Bimtek', picEmployeeIds: ['emp-2'], title: 'Bimtek data' }),
    ];
    expect(applyFilters(items, { ...DEFAULT_FILTERS, search: 'bank' }).map((i) => i.id)).toEqual(['a']);
    expect(applyFilters(items, { ...DEFAULT_FILTERS, category: 'Bimtek' }).map((i) => i.id)).toEqual(['b']);
    expect(applyFilters(items, { ...DEFAULT_FILTERS, picEmployeeId: 'emp-1' }).map((i) => i.id)).toEqual(['a']);
    expect(applyFilters(items, { ...DEFAULT_FILTERS, status: 'SELESAI' }).map((i) => i.id)).toEqual(['a']);
  });

  it('groupByMonth mengurutkan kunci bulan', () => {
    const items = [
      act({ id: 'sep', startDate: '2026-09-05' }),
      act({ id: 'jul', startDate: '2026-07-10' }),
    ];
    const groups = groupByMonth(items);
    expect(groups.map(([k]) => k)).toEqual(['2026-07', '2026-09']);
  });

  it('monthMatrix: minggu dimulai Senin, seluruh hari bulan tercakup', () => {
    const weeks = monthMatrix(2026, 7, [act({ id: 'x', startDate: '2026-07-17' })]);
    const all = weeks.flat();
    // Juli 2026 punya 31 hari — semuanya harus ada.
    const inMonth = all.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(all.length % 7).toBe(0);
    const cell17 = all.find((c) => c.iso === '2026-07-17');
    expect(cell17?.items.map((i) => i.id)).toEqual(['x']);
  });

  it('formatRange menampilkan rentang & waktu ringkas', () => {
    expect(formatRange(act({ id: 'a', startDate: '2026-07-10' }))).toBe('10 Jul');
    expect(formatRange(act({ id: 'b', startDate: '2026-07-10', endDate: '2026-07-12' }))).toBe('10 Jul–12 Jul');
    expect(
      formatRange(
        act({ id: 'c', startDate: '2026-07-10', allDay: false, startTime: '09:00', endTime: '12:00' }),
      ),
    ).toBe('10 Jul · 09.00–12.00');
  });

  it('addDaysISO & uniqueCategories', () => {
    expect(addDaysISO('2026-07-30', 3)).toBe('2026-08-02');
    expect(
      uniqueCategories([
        act({ id: 'a', startDate: '2026-07-01', category: 'Rapat' }),
        act({ id: 'b', startDate: '2026-07-02', category: 'Bimtek' }),
        act({ id: 'c', startDate: '2026-07-03', category: 'Rapat' }),
      ]),
    ).toEqual(['Bimtek', 'Rapat']);
  });
});
