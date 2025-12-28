/**
 * Schedule Parser for ESPN Fantasy Basketball League Schedule
 * Parses the "League Schedule" page (Matchup 1, Matchup 2...) into structured matchups.
 */

import { validateParseInput, createLoopGuard } from "./parseUtils";
import {
  isProbablyPersonName,
  isProbablyRecordToken,
  makeScheduleTeamKey,
  stripRecordParens,
} from "./nameNormalization";

export type ScheduleTeam = {
  teamName: string;
  managerName?: string;
  recordText?: string;
};

export type ScheduleMatchup = {
  week: number;
  dateRangeText: string;
  awayTeamName: string;
  awayManagerName?: string;
  homeTeamName: string;
  homeManagerName?: string;
};

export type LeagueSchedule = {
  season: string;
  teams: ScheduleTeam[];
  matchups: ScheduleMatchup[];
};

export type ScheduleParseResult = {
  schedule: LeagueSchedule;
  warnings: string[];
};

const SKIP_LINE_PATTERNS: RegExp[] = [
  // playoff / bracket noise
  /projected playoff bracket/i,
  /playoff round/i,
  /matchups to be determined/i,
  /winner of/i,
  /loser of/i,
  /consolation/i,
  /championship/i,
  // navigation/footer noise
  /^ESPN$/i,
  /^Fantasy$/i,
  /fantasy basketball support/i,
  /^copyright/i,
  /^\u00a9/i,
  /^username$/i,
  /^password$/i,
  /^log\s*in$/i,
  /^sign\s*up$/i,
  // table controls / headers
  /^edit$/i,
  /^away\s*team$/i,
  /^home\s*team$/i,
  /^team\s*manager\(s\)$/i,
  /^score$/i,
];

function shouldSkipLine(line: string): boolean {
  return SKIP_LINE_PATTERNS.some((p) => p.test(line));
}

function isMatchupHeader(line: string): { week: number; dateRangeText: string } | null {
  const m = line.match(/^Matchup\s+(\d+)\s*(?:\(([^)]+)\))?$/i);
  if (!m) return null;
  const week = parseInt(m[1]);
  const dateRangeText = (m[2] || "").trim();
  return { week, dateRangeText };
}

function looksLikeColumnHeader(line: string): boolean {
  return /^(Away|Home|Away\s+Home|vs|AWAY\s*TEAM|HOME\s*TEAM|TEAM\s*MANAGER\(S\)|Score)$/i.test(line);
}

function parseTeamEntity(lines: string[], startIndex: number): { team: ScheduleTeam; nextIndex: number } | null {
  const raw = lines[startIndex];
  if (!raw) return null;
  if (shouldSkipLine(raw)) return null;
  if (looksLikeColumnHeader(raw)) return null;

  // Avoid parsing obvious non-team tokens
  if (/^Week\s+\d+$/i.test(raw)) return null;
  if (/^\d+$/.test(raw)) return null;
  if (isProbablyRecordToken(raw)) return null;

  let teamName = raw;
  let managerName: string | undefined;
  let recordText: string | undefined;

  // Handle inline record like: "Mr. Bane (7-2-0)"
  const inlineRecord = teamName.match(/^(.*)\s*\((\d+-\d+-\d+)\)\s*$/);
  if (inlineRecord) {
    teamName = inlineRecord[1].trim();
    recordText = inlineRecord[2];
  }

  // Handle inline manager like: "Mr. Bane (Demitri Voyiatzis)"
  const inlineManager = teamName.match(/^(.*)\s*\(([^)]+)\)\s*$/);
  if (inlineManager) {
    const candidate = inlineManager[2].trim();
    // Don't treat records as manager
    if (!isProbablyRecordToken(candidate) && candidate.length > 2) {
      managerName = candidate;
      teamName = inlineManager[1].trim();
    }
  }

  let i = startIndex + 1;

  // Next line might be (Manager)
  if (!managerName && i < lines.length) {
    const next = lines[i];
    const paren = next.match(/^\((.+)\)$/);
    if (paren) {
      const candidate = paren[1].trim();
      if (!isProbablyRecordToken(candidate) && candidate.length > 2) {
        managerName = candidate;
        i++;
      }
    }
  }

  // Next line might be manager without parentheses
  if (!managerName && i < lines.length) {
    const next = lines[i];
    if (isProbablyPersonName(next)) {
      managerName = next.trim();
      i++;
    }
  }

  // Next line might be record
  if (i < lines.length) {
    const next = lines[i];
    if (isProbablyRecordToken(next)) {
      recordText = stripRecordParens(next);
      i++;
    }
  }

  // Guard: teamName must be meaningful
  if (!teamName || teamName.length < 2) return null;

  return {
    team: { teamName, managerName, recordText },
    nextIndex: i,
  };
}

export function parseScheduleData(data: string): ScheduleParseResult {
  validateParseInput(data);

  const lines = data
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);

  const loopGuard = createLoopGuard();

  // Detect season from a year mention
  const seasonMatch = data.match(/20\d{2}(?:-\d{2})?/);
  const season = seasonMatch ? seasonMatch[0] : new Date().getFullYear().toString();

  let currentWeek = 0;
  let currentDateRange = "";

  const matchups: ScheduleMatchup[] = [];
  const teamMap = new Map<string, ScheduleTeam>();
  const warnings: string[] = [];

  let pendingAway: ScheduleTeam | null = null;
  let pendingHomeManagerName: string | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    loopGuard.check();
    const line = lines[idx];

    if (shouldSkipLine(line)) continue;

    const header = isMatchupHeader(line);
    if (header) {
      currentWeek = header.week;
      currentDateRange = header.dateRangeText || currentDateRange;
      pendingAway = null;
      pendingHomeManagerName = null;
      continue;
    }

    if (!currentWeek) continue;
    if (looksLikeColumnHeader(line)) continue;

    // If the date range is on the next line after "Matchup N"
    if (!currentDateRange && idx > 0 && /^Matchup\s+\d+$/i.test(lines[idx - 1])) {
      // Heuristic: date line often like "Oct 21 - 26" or "Dec 15 - 21"
      if (/^[A-Z][a-z]{2}\s+\d{1,2}\s*-/i.test(line)) {
        currentDateRange = line;
        continue;
      }
    }

    // Home manager often appears on its own line immediately before the home team.
    // Example row (scores may be present or not):
    // AwayTeam(...) -> AwayManager -> (scores...) -> HomeManager -> HomeTeam(...)
    if (pendingAway) {
      const next = lines[idx + 1];
      if (next && /\(\d+-\d+-\d+\)\s*$/.test(next) && !/\(\d+-\d+-\d+\)\s*$/.test(line)) {
        pendingHomeManagerName = line;
        continue;
      }
    }

    const parsed = parseTeamEntity(lines, idx);
    if (!parsed) continue;

    const team: ScheduleTeam = { ...parsed.team };
    idx = parsed.nextIndex - 1;

    // If we're about to use this team as the home team, attach the pending home manager.
    if (pendingAway && pendingHomeManagerName && !team.managerName) {
      team.managerName = pendingHomeManagerName;
    }

    // Register team
    const key = makeScheduleTeamKey(team.teamName, team.managerName);
    if (!teamMap.has(key)) teamMap.set(key, team);

    if (!pendingAway) {
      pendingAway = team;
      pendingHomeManagerName = null;
      continue;
    }

    // Complete matchup
    matchups.push({
      week: currentWeek,
      dateRangeText: currentDateRange || "",
      awayTeamName: pendingAway.teamName,
      awayManagerName: pendingAway.managerName,
      homeTeamName: team.teamName,
      homeManagerName: team.managerName,
    });

    pendingAway = null;
    pendingHomeManagerName = null;
  }

  if (matchups.length === 0) {
    warnings.push("No matchups found. Paste the ESPN League → Schedule page (Matchup 1, Matchup 2...).");
  }

  const uniqueWeeks = new Set(matchups.map((m) => m.week));
  if (matchups.length > 0 && uniqueWeeks.size < 5) {
    warnings.push(`Only ${uniqueWeeks.size} matchup weeks found. If this is a full season schedule, re-paste the full page.`);
  }

  return {
    schedule: {
      season,
      teams: Array.from(teamMap.values()),
      matchups,
    },
    warnings,
  };
}
