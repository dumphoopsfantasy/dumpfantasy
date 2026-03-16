/**
 * Matchup Week Date Utilities
 *
 * Determines the actual date range for the current fantasy matchup week.
 * Uses the imported league schedule when available (supports extended weeks
 * like All-Star break AND playoff rounds), falling back to Mon-Sun when
 * no schedule is imported.
 */

import { LeagueSchedule, ScheduleMatchup, normalizeTeamName } from '@/lib/scheduleParser';
import { devLog, devWarn } from '@/lib/devLog';

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export interface ActiveMatchupPeriod {
  week: number;
  label: string;
  type: 'regular' | 'playoff';
  isPlayoff: boolean;
  playoffRound?: number;
  dateRangeText: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  daysRemainingInclusive: number;
  currentDayIndex: number;
  start: Date;
  end: Date;
}

export interface PersistedScheduleDiagnostics {
  hasSchedule: boolean;
  regularMatchups: number;
  playoffMatchups: number;
  byeRows: number;
  weeksDetected: number;
}

function normalizeMonthToken(token: string): string {
  return token.toLowerCase().slice(0, 3);
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dayDiffInclusive(startDateKey: string, endDateKey: string): number {
  const msPerDay = 86400000;
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
}

/**
 * Parse a date range text like "Feb 9 - 22" or "Dec 29 - Jan 4"
 * into start/end Date objects.
 */
export function parseDateRangeText(
  dateRangeText: string,
  seasonYear: number
): { start?: Date; end?: Date } {
  const m = dateRangeText.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2})\s*-\s*(?:([A-Za-z]{3,9})\s+)?(\d{1,2})/
  );
  if (!m) return {};

  const startMonth = MONTH_INDEX[normalizeMonthToken(m[1])];
  const startDay = parseInt(m[2], 10);
  const endMonth = m[3] ? MONTH_INDEX[normalizeMonthToken(m[3])] : startMonth;
  const endDay = parseInt(m[4], 10);

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
  endNorm.setHours(0, 0, 0, 0);

  while (cursor <= endNorm) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

/**
 * Validate that a parsed schedule object is structurally sound.
 * Rejects schedules with no matchups or missing required fields.
 */
export function isValidSchedule(schedule: unknown): schedule is LeagueSchedule {
  if (!schedule || typeof schedule !== 'object') return false;
  const s = schedule as Partial<LeagueSchedule>;
  if (!Array.isArray(s.matchups) || s.matchups.length === 0) return false;

  return s.matchups.every(
    (m) =>
      typeof m.week === 'number' &&
      m.week > 0 &&
      typeof m.dateRangeText === 'string' &&
      m.dateRangeText.length > 0
  );
}

/**
 * Try to load the persisted league schedule from localStorage.
 * Auto-clears corrupted or invalid data to prevent downstream poisoning.
 */
function loadPersistedSchedule(): LeagueSchedule | null {
  try {
    const raw = localStorage.getItem('dumphoops-schedule.v2');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidSchedule(parsed)) {
      devWarn('[matchupWeekDates] Corrupted schedule data detected, clearing.');
      localStorage.removeItem('dumphoops-schedule.v2');
      return null;
    }
    return parsed;
  } catch {
    devWarn('[matchupWeekDates] Failed to parse schedule data, clearing.');
    localStorage.removeItem('dumphoops-schedule.v2');
    return null;
  }
}

/**
 * Extract the "spring half" year from a season string.
 * "2025-26" → 2026, "2026" → 2026.
 * NBA seasons span Oct-Apr: Oct-Dec uses firstYear, Jan-Sep uses secondYear.
 */
export function resolveSeasonYear(season: string): number {
  const parts = season.match(/^(\d{4})(?:-(\d{2,4}))?/);
  if (!parts) return new Date().getFullYear();
  const firstYear = parseInt(parts[1], 10);
  if (parts[2]) {
    const raw = parseInt(parts[2], 10);
    const secondYear = raw < 100 ? Math.floor(firstYear / 100) * 100 + raw : raw;
    return secondYear;
  }
  return firstYear;
}

function resolveWeekDateRange(
  matchup: ScheduleMatchup,
  seasonYear: number
): { startDate?: string; endDate?: string; start?: Date; end?: Date } {
  if (matchup.startDate && matchup.endDate) {
    const start = parseDateKey(matchup.startDate);
    const end = parseDateKey(matchup.endDate);
    return {
      startDate: matchup.startDate,
      endDate: matchup.endDate,
      start,
      end,
    };
  }

  const { start, end } = parseDateRangeText(matchup.dateRangeText, seasonYear);
  if (!start || !end) return {};

  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
    start,
    end,
  };
}

function buildResolvedWeeks(schedule: LeagueSchedule): ActiveMatchupPeriod[] {
  const seasonYear = resolveSeasonYear(schedule.season);
  const lastRegularWeek = schedule.lastRegularSeasonWeek;

  const resolvedWeeks: ActiveMatchupPeriod[] = [];
  const seenWeeks = new Set<number>();

  for (const matchup of schedule.matchups) {
    if (seenWeeks.has(matchup.week)) continue;
    seenWeeks.add(matchup.week);

    const range = resolveWeekDateRange(matchup, seasonYear);
    if (!range.start || !range.end || !range.startDate || !range.endDate) continue;

    const isPlayoff = !!matchup.isPlayoff || matchup.type === 'playoff';
    const playoffRound =
      matchup.playoffRound ??
      (isPlayoff && lastRegularWeek ? Math.max(1, matchup.week - lastRegularWeek) : undefined);

    const totalDays = dayDiffInclusive(range.startDate, range.endDate);

    resolvedWeeks.push({
      week: matchup.week,
      label:
        matchup.label ??
        (isPlayoff
          ? `Playoff Round ${playoffRound ?? matchup.week}`
          : `Matchup ${matchup.week}`),
      type: isPlayoff ? 'playoff' : 'regular',
      isPlayoff,
      playoffRound,
      dateRangeText: matchup.dateRangeText,
      startDate: range.startDate,
      endDate: range.endDate,
      totalDays,
      daysRemainingInclusive: totalDays,
      currentDayIndex: 1,
      start: range.start,
      end: range.end,
    });
  }

  resolvedWeeks.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.week - b.week);
  return resolvedWeeks;
}

/**
 * Resolve the active matchup period (regular or playoff) using local-day comparisons.
 */
export function resolveActiveMatchupPeriod(
  schedule?: LeagueSchedule | null,
  todayDateKey?: string
): ActiveMatchupPeriod | null {
  const sched = schedule ?? loadPersistedSchedule();
  if (!sched || sched.matchups.length === 0) return null;

  const weeks = buildResolvedWeeks(sched);
  if (weeks.length === 0) return null;

  const today = todayDateKey ?? toDateKey(new Date());

  const active = weeks.find((w) => today >= w.startDate && today <= w.endDate);
  const nextUpcoming = weeks.find((w) => w.startDate > today);
  const selected = active ?? nextUpcoming ?? weeks[weeks.length - 1] ?? null;
  if (!selected) return null;

  const currentDayIndex = today < selected.startDate
    ? 1
    : today > selected.endDate
      ? selected.totalDays
      : dayDiffInclusive(selected.startDate, today);

  const daysRemainingInclusive = today < selected.startDate
    ? selected.totalDays
    : today > selected.endDate
      ? 0
      : dayDiffInclusive(today, selected.endDate);

  const resolved: ActiveMatchupPeriod = {
    ...selected,
    currentDayIndex,
    daysRemainingInclusive,
  };

  devLog('[matchupWeekDates] Resolved active matchup period', {
    label: resolved.label,
    week: resolved.week,
    isPlayoff: resolved.isPlayoff,
    playoffRound: resolved.playoffRound,
    startDate: resolved.startDate,
    endDate: resolved.endDate,
    totalDays: resolved.totalDays,
    currentDayIndex: resolved.currentDayIndex,
    daysRemainingInclusive: resolved.daysRemainingInclusive,
  });

  return resolved;
}

export function getPersistedScheduleDiagnostics(
  schedule?: LeagueSchedule | null
): PersistedScheduleDiagnostics {
  const sched = schedule ?? loadPersistedSchedule();
  if (!sched) {
    return {
      hasSchedule: false,
      regularMatchups: 0,
      playoffMatchups: 0,
      byeRows: 0,
      weeksDetected: 0,
    };
  }

  const uniqueWeeks = new Set(sched.matchups.map((m) => m.week));
  const playoffMatchups = sched.matchups.filter((m) => m.isPlayoff || m.type === 'playoff').length;

  return {
    hasSchedule: true,
    regularMatchups: sched.matchups.length - playoffMatchups,
    playoffMatchups,
    byeRows: sched.matchups.filter((m) => !!m.isBye).length,
    weeksDetected: uniqueWeeks.size,
  };
}

/**
 * Find the current matchup week from the league schedule based on today's date.
 */
export function getCurrentMatchupWeekFromSchedule(
  schedule?: LeagueSchedule | null
): {
  week: number;
  start: Date;
  end: Date;
  dateRangeText: string;
  isPlayoff?: boolean;
  playoffRound?: number;
  label?: string;
} | null {
  const resolved = resolveActiveMatchupPeriod(schedule);
  if (!resolved) return null;

  return {
    week: resolved.week,
    start: resolved.start,
    end: resolved.end,
    dateRangeText: resolved.dateRangeText,
    isPlayoff: resolved.isPlayoff,
    playoffRound: resolved.playoffRound,
    label: resolved.label,
  };
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
  playoffRound?: number;
  label?: string;
} | null {
  if (!teamName) return null;

  const sched = schedule ?? loadPersistedSchedule();
  if (!sched || sched.matchups.length === 0) return null;

  const currentPeriod = resolveActiveMatchupPeriod(sched);
  if (!currentPeriod) {
    devWarn('[matchupWeekDates] Unable to resolve active matchup period for opponent lookup.');
    return null;
  }

  const normalizedTeam = normalizeTeamName(teamName);
  if (!normalizedTeam) return null;

  const weekMatchups = sched.matchups.filter((m) => m.week === currentPeriod.week && !m.isBye);

  for (const matchup of weekMatchups) {
    const awayNorm = normalizeTeamName(matchup.awayTeamName);
    const homeNorm = normalizeTeamName(matchup.homeTeamName);

    const awayMatch = awayNorm === normalizedTeam || awayNorm.includes(normalizedTeam) || normalizedTeam.includes(awayNorm);
    const homeMatch = homeNorm === normalizedTeam || homeNorm.includes(normalizedTeam) || normalizedTeam.includes(homeNorm);

    if (awayMatch) {
      devLog('[matchupWeekDates] Active opponent resolved', {
        team: teamName,
        opponent: matchup.homeTeamName,
        week: matchup.week,
        isPlayoff: !!matchup.isPlayoff,
        playoffRound: matchup.playoffRound,
      });

      return {
        week: matchup.week,
        dateRangeText: matchup.dateRangeText,
        opponentTeamName: matchup.homeTeamName,
        isHome: false,
        isPlayoff: !!matchup.isPlayoff,
        playoffRound: matchup.playoffRound,
        label: matchup.label,
      };
    }

    if (homeMatch) {
      devLog('[matchupWeekDates] Active opponent resolved', {
        team: teamName,
        opponent: matchup.awayTeamName,
        week: matchup.week,
        isPlayoff: !!matchup.isPlayoff,
        playoffRound: matchup.playoffRound,
      });

      return {
        week: matchup.week,
        dateRangeText: matchup.dateRangeText,
        opponentTeamName: matchup.awayTeamName,
        isHome: true,
        isPlayoff: !!matchup.isPlayoff,
        playoffRound: matchup.playoffRound,
        label: matchup.label,
      };
    }
  }

  devWarn('[matchupWeekDates] Active opponent could not be resolved from schedule week.', {
    teamName,
    week: currentPeriod.week,
    isPlayoff: currentPeriod.isPlayoff,
  });

  return null;
}

/**
 * Get the date strings (YYYY-MM-DD) for the active matchup week.
 *
 * Uses the imported league schedule when available to support variable-length
 * weeks (e.g., 14-day All-Star break weeks).
 */
export function getMatchupWeekDatesFromSchedule(): string[] {
  const sched = loadPersistedSchedule();
  if (!sched) {
    devWarn('[matchupWeekDates] No schedule found, falling back to Mon-Sun.');
    return getDefaultMonSunDates();
  }

  const currentPeriod = resolveActiveMatchupPeriod(sched);
  if (!currentPeriod) {
    devWarn('[matchupWeekDates] Unable to resolve active matchup period from imported schedule.');
    return [];
  }

  const dates = generateDateRange(currentPeriod.start, currentPeriod.end);
  devLog('[matchupWeekDates] Active matchup window:', {
    label: currentPeriod.label,
    week: currentPeriod.week,
    dateRangeText: currentPeriod.dateRangeText,
    isPlayoff: currentPeriod.isPlayoff,
    playoffRound: currentPeriod.playoffRound,
    startDate: currentPeriod.startDate,
    endDate: currentPeriod.endDate,
    totalDays: currentPeriod.totalDays,
  });

  return dates;
}

/**
 * Get remaining dates in the active matchup week (from today onward, inclusive).
 */
export function getRemainingMatchupDatesFromSchedule(): string[] {
  const allDates = getMatchupWeekDatesFromSchedule();
  if (allDates.length === 0) return [];

  const todayKey = toDateKey(new Date());
  const remaining = allDates.filter((d) => d >= todayKey);

  devLog('[matchupWeekDates] Remaining dates:', {
    today: todayKey,
    totalInWeek: allDates.length,
    remaining: remaining.length,
    totalPossibleStarts: remaining.length * 8,
    dates: remaining,
  });

  return remaining;
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
    dates.push(toDateKey(date));
  }

  return dates;
}
