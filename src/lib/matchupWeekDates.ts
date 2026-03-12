/**
 * Matchup Week Date Utilities
 * 
 * Determines the actual date range for the current fantasy matchup week.
 * Uses the imported league schedule when available (supports extended weeks
 * like All-Star break), falling back to Mon-Sun when no schedule is imported.
 */

import { LeagueSchedule, normalizeTeamName } from '@/lib/scheduleParser';
import { normalizeSeasonString, inferSeasonFromMonths, yearForMonth, type SeasonYears } from '@/lib/seasonUtils';
import { devLog, devWarn } from '@/lib/devLog';

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse a season string like "2025-26" into { startYear, endYear }.
 * Now delegates to centralised normalizeSeasonString with safe fallback.
 */
export function parseSeasonYears(seasonStr: string): { startYear: number; endYear: number } {
  const result = normalizeSeasonString(seasonStr);
  if (result) return result;
  // Fallback: infer from current date
  return inferSeasonFromMonths([]);
}

/**
 * Parse a date range text like "Feb 9 - 22" or "Dec 29 - Jan 4"
 * into start/end Date objects.
 *
 * FIXED: Previously derived seasonYear from season.slice(0,4) which gave 2025
 * for "2025-26", causing Jan-Aug dates to parse as 2025 instead of 2026.
 * Now accepts { startYear, endYear } so Oct-Dec → startYear, Jan-Aug → endYear.
 */
export function parseDateRangeText(
  dateRangeText: string,
  seasonYear: number,
  /** End year of the season (e.g. 2026 for "2025-26"). If provided, Jan-Aug use this. */
  seasonEndYear?: number
): { start?: Date; end?: Date } {
  const m = dateRangeText.match(/^(\w{3})\s+(\d{1,2})\s*-\s*(?:(\w{3})\s+)?(\d{1,2})/);
  if (!m) return {};

  const startMonth = MONTH_INDEX[m[1].toLowerCase()];
  const startDay = parseInt(m[2]);
  const endMonth = m[3] ? MONTH_INDEX[m[3].toLowerCase()] : startMonth;
  const endDay = parseInt(m[4]);

  if (startMonth === undefined || endMonth === undefined) return {};

  // NBA fantasy seasons span year boundary:
  //   Oct-Dec (months 9-11) → startYear (e.g. 2025)
  //   Jan-Aug (months 0-8)  → endYear   (e.g. 2026)
  // Use yearForMonth from seasonUtils when we have both years; otherwise legacy fallback.
  if (seasonEndYear) {
    const season: SeasonYears = { startYear: seasonEndYear - 1, endYear: seasonEndYear };
    const startYear = yearForMonth(startMonth, season);
    const endYear2 = yearForMonth(endMonth, season);
    const start = new Date(startYear, startMonth, startDay);
    const end = new Date(endYear2, endMonth, endDay);
    return { start, end };
  }
  // Legacy path (no seasonEndYear provided)
  const startYear = startMonth >= 9 ? seasonYear - 1 : seasonYear;
  const endYear2 = endMonth >= 9 ? seasonYear - 1 : seasonYear;

  const start = new Date(startYear, startMonth, startDay);
  const end = new Date(endYear2, endMonth, endDay);

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
  try {
    const sched = schedule ?? loadPersistedSchedule();
    if (!sched || sched.matchups.length === 0) return null;

    // Use centralized season parsing — never fatal
    const { startYear, endYear } = parseSeasonYears(sched.season);
    const seasonYear = endYear;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    devLog('[matchupWeekDates] Season parsed:', { raw: sched.season, startYear, endYear });

    // Build unique weeks with parsed date ranges — skip bad weeks instead of failing
    const weeksWithDates: Array<{ week: number; start: Date; end: Date; dateRangeText: string; isPlayoff?: boolean }> = [];
    const seenWeeks = new Set<number>();
    let skippedWeeks = 0;

    for (const m of sched.matchups) {
      if (seenWeeks.has(m.week)) continue;
      seenWeeks.add(m.week);

      try {
        const { start, end } = parseDateRangeText(m.dateRangeText, seasonYear, endYear);
        if (!start || !end) {
          skippedWeeks++;
          devWarn(`[matchupWeekDates] Skipping week ${m.week}: could not parse "${m.dateRangeText}"`);
          continue;
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        weeksWithDates.push({ week: m.week, start, end, dateRangeText: m.dateRangeText });
      } catch (e) {
        skippedWeeks++;
        devWarn(`[matchupWeekDates] Error parsing week ${m.week}:`, e);
      }
    }

    if (skippedWeeks > 0) {
      devWarn(`[matchupWeekDates] Skipped ${skippedWeeks} malformed weeks, ${weeksWithDates.length} valid`);
    }

    if (weeksWithDates.length === 0) return null;

    weeksWithDates.sort((a, b) => a.week - b.week);

    devLog('[matchupWeekDates] Parsed weeks:', weeksWithDates.map(w => ({
      week: w.week,
      range: `${w.start.toLocaleDateString()} - ${w.end.toLocaleDateString()}`,
    })));

    // Find the week containing today
    for (const w of weeksWithDates) {
      if (today >= w.start && today <= w.end) {
        devLog('[matchupWeekDates] Active week:', w.week, w.dateRangeText);
        return w;
      }
    }

    // If today is between two weeks (gap), return the next upcoming week
    for (const w of weeksWithDates) {
      if (w.start > today) return w;
    }

    // Return last week as fallback
    return weeksWithDates[weeksWithDates.length - 1] ?? null;
  } catch (e) {
    // Total parser failure — never crash, just return null
    devWarn('[matchupWeekDates] getCurrentMatchupWeekFromSchedule failed:', e);
    return null;
  }
}

/**
 * Find the current-week scheduled matchup for a specific fantasy team.
 * Returns null when the team has a bye (or no current week is available).
 */
export function getCurrentWeekMatchupForTeam(
  teamName: string,
  schedule?: LeagueSchedule | null
): {
  week: number;
  dateRangeText: string;
  opponentTeamName: string;
  isHome: boolean;
  isPlayoff: boolean;
} | null {
  if (!teamName) return null;

  const sched = schedule ?? loadPersistedSchedule();
  if (!sched || sched.matchups.length === 0) return null;

  const currentWeek = getCurrentMatchupWeekFromSchedule(sched);
  if (!currentWeek) return null;

  const normalizedTeam = normalizeTeamName(teamName);
  if (!normalizedTeam) return null;

  const weekMatchups = sched.matchups.filter((m) => m.week === currentWeek.week);

  for (const matchup of weekMatchups) {
    const awayNorm = normalizeTeamName(matchup.awayTeamName);
    const homeNorm = normalizeTeamName(matchup.homeTeamName);

    if (awayNorm === normalizedTeam) {
      return {
        week: matchup.week,
        dateRangeText: matchup.dateRangeText,
        opponentTeamName: matchup.homeTeamName,
        isHome: false,
        isPlayoff: !!matchup.isPlayoff,
      };
    }

    if (homeNorm === normalizedTeam) {
      return {
        week: matchup.week,
        dateRangeText: matchup.dateRangeText,
        opponentTeamName: matchup.awayTeamName,
        isHome: true,
        isPlayoff: !!matchup.isPlayoff,
      };
    }
  }

  return null;
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
