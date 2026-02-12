/**
 * Matchup Week Date Utilities
 * 
 * Determines the actual date range for the current fantasy matchup week.
 * Uses the imported league schedule when available (supports extended weeks
 * like All-Star break), falling back to Mon-Sun when no schedule is imported.
 */

import { LeagueSchedule } from '@/lib/scheduleParser';

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a date range text like "Feb 9 - 22" or "Dec 29 - Jan 4"
 * into start/end Date objects.
 */
export function parseDateRangeText(
  dateRangeText: string,
  seasonYear: number
): { start?: Date; end?: Date } {
  const m = dateRangeText.match(/^(\w{3})\s+(\d{1,2})\s*-\s*(?:(\w{3})\s+)?(\d{1,2})/);
  if (!m) return {};

  const startMonth = MONTH_INDEX[m[1].toLowerCase()];
  const startDay = parseInt(m[2]);
  const endMonth = m[3] ? MONTH_INDEX[m[3].toLowerCase()] : startMonth;
  const endDay = parseInt(m[4]);

  if (startMonth === undefined || endMonth === undefined) return {};

  // NBA fantasy seasons span year boundary; Oct-Dec use seasonYear-1
  const startYear = startMonth >= 9 ? seasonYear - 1 : seasonYear;
  const endYear = endMonth >= 9 ? seasonYear - 1 : seasonYear;

  const start = new Date(startYear, startMonth, startDay);
  const end = new Date(endYear, endMonth, endDay);

  return { start, end };
}

/**
 * Generate all YYYY-MM-DD date strings between start and end (inclusive).
 */
function generateDateRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endNorm = new Date(end);
  endNorm.setHours(23, 59, 59, 999);

  while (cursor <= endNorm) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, '0');
    const day = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

/**
 * Try to load the persisted league schedule from localStorage.
 */
function loadPersistedSchedule(): LeagueSchedule | null {
  try {
    const raw = localStorage.getItem('dumphoops-schedule.v2');
    if (!raw) return null;
    return JSON.parse(raw) as LeagueSchedule;
  } catch {
    return null;
  }
}

/**
 * Find the current matchup week from the league schedule based on today's date.
 * Returns the week's date range or null if no matching week found.
 */
export function getCurrentMatchupWeekFromSchedule(
  schedule?: LeagueSchedule | null
): { week: number; start: Date; end: Date; dateRangeText: string } | null {
  const sched = schedule ?? loadPersistedSchedule();
  if (!sched || sched.matchups.length === 0) return null;

  const seasonYear = parseInt(sched.season.slice(0, 4)) || new Date().getFullYear();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build unique weeks with parsed date ranges
  const weeksWithDates: Array<{ week: number; start: Date; end: Date; dateRangeText: string }> = [];
  const seenWeeks = new Set<number>();

  for (const m of sched.matchups) {
    if (seenWeeks.has(m.week)) continue;
    seenWeeks.add(m.week);

    const { start, end } = parseDateRangeText(m.dateRangeText, seasonYear);
    if (!start || !end) continue;

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    weeksWithDates.push({ week: m.week, start, end, dateRangeText: m.dateRangeText });
  }

  weeksWithDates.sort((a, b) => a.week - b.week);

  // Find the week containing today
  for (const w of weeksWithDates) {
    if (today >= w.start && today <= w.end) return w;
  }

  // If today is between two weeks (gap), return the next upcoming week
  for (const w of weeksWithDates) {
    if (w.start > today) return w;
  }

  // Return last week as fallback
  return weeksWithDates[weeksWithDates.length - 1] ?? null;
}

/**
 * Get the date strings (YYYY-MM-DD) for the current matchup week.
 * 
 * Uses the imported league schedule when available to support variable-length
 * weeks (e.g., 14-day All-Star break weeks). Falls back to Mon-Sun if no
 * schedule is imported.
 */
export function getMatchupWeekDatesFromSchedule(): string[] {
  const currentWeek = getCurrentMatchupWeekFromSchedule();

  if (currentWeek) {
    return generateDateRange(currentWeek.start, currentWeek.end);
  }

  // Fallback: standard Mon-Sun week
  return getDefaultMonSunDates();
}

/**
 * Get remaining dates in the current matchup week (from today onward).
 */
export function getRemainingMatchupDatesFromSchedule(): string[] {
  const allDates = getMatchupWeekDatesFromSchedule();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return allDates.filter(d => d >= todayStr);
}

/**
 * Default Mon-Sun date generation (fallback when no schedule is imported).
 */
function getDefaultMonSunDates(): string[] {
  const now = new Date();
  const dayOfWeek = now.getDay();

  const monday = new Date(now);
  if (dayOfWeek === 0) {
    monday.setDate(now.getDate() - 6);
  } else {
    monday.setDate(now.getDate() - (dayOfWeek - 1));
  }

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }

  return dates;
}
