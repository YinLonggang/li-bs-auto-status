// Date-only geometry uses UTC calendar days so DST cannot shift rows or week boundaries.
export const TIMELINE_SCALE_VERSION = '1.0.0';
const DAY_MS = 86_400_000;

export type TimelineWindow = { plannedStartDate?: string; plannedEndDate?: string };

export function calendarDay(value?: string): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return null;
  return ms / DAY_MS;
}

export function dayLabel(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function monday(day: number): number {
  return day - (new Date(day * DAY_MS).getUTCDay() + 6) % 7;
}

function isoWeek(day: number): { year: number; week: number } {
  const thursday = monday(day) + 3;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const firstMonday = monday(Date.UTC(year, 0, 4) / DAY_MS);
  return { year, week: Math.floor((day - firstMonday) / 7) + 1 };
}

export function buildTimelineScale(windows: TimelineWindow[], today: string, weekWidth: number) {
  const dates = windows.flatMap(window => [calendarDay(window.plannedStartDate), calendarDay(window.plannedEndDate)])
    .filter((day): day is number => day !== null);
  const fallback = calendarDay(today) ?? 0;
  const first = dates.length ? Math.min(...dates) : fallback;
  const last = dates.length ? Math.max(...dates) : fallback + 6;
  const start = monday(first - 1);
  const end = monday(last + 1) + 7;
  const dayWidth = Math.max(56, weekWidth) / 7;
  const width = (end - start) * dayWidth;
  const weeks = [];
  const months: { label: string; left: number; width: number }[] = [];
  for (let day = start; day < end; day += 7) {
    const iso = isoWeek(day);
    const date = dayLabel(day);
    const week = `W${String(iso.week).padStart(2, '0')}`;
    weeks.push({ date, label: week, left: (day - start) * dayWidth,
      title: `${iso.year} ${week} · ${date} 至 ${dayLabel(day + 6)}` });
    // Assign a whole week to its Thursday's month, avoiding unreadable partial-month headings.
    const monthDate = new Date((day + 3) * DAY_MS);
    const label = `${monthDate.getUTCFullYear()}年${monthDate.getUTCMonth() + 1}月`;
    const previous = months[months.length - 1];
    if (previous?.label === label) previous.width += dayWidth * 7;
    else months.push({ label, left: (day - start) * dayWidth, width: dayWidth * 7 });
  }
  const todayDay = calendarDay(today);
  return {
    start, end, width, dayWidth, weeks, months,
    todayLeft: todayDay !== null && todayDay >= start && todayDay < end ? (todayDay - start + 0.5) * dayWidth : null,
    range(window: TimelineWindow) {
      const from = calendarDay(window.plannedStartDate);
      const to = calendarDay(window.plannedEndDate);
      if (from === null || to === null || to < from || to < start || from >= end) return null;
      const clippedStart = Math.max(from, start);
      const clippedEnd = Math.min(to + 1, end);
      return { left: (clippedStart - start) * dayWidth, width: (clippedEnd - clippedStart) * dayWidth };
    }
  };
}
