/**
 * Schedule Parser for ESPN Fantasy Basketball League Schedule
 * Uses a known-team whitelist approach: only accepts team names that match imported standings.
 */

import { normalizeName } from "./nameNormalization";

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
  debugInfo?: ScheduleDebugInfo;
};

export type WeekDebugInfo = {
  week: number;
  dateRange: string;
  teamsFound: string[];
  matchupsCreated: number;
  errors: string[];
};

export type ScheduleDebugInfo = {
  weeksDetected: number;
  totalMatchups: number;
  weekDetails: WeekDebugInfo[];
  knownTeamsUsed: string[];
};

/**
 * Normalize a team name for matching purposes
 * - lowercase
 * - remove punctuation except apostrophes
 * - collapse whitespace
 * - remove trailing "You" (ESPN adds this to user's team)
 * - remove parenthetical records like (7-2-0)
 */
export function normalizeTeamName(input: string): string {
  if (!input) return "";

  let normalized = input
    .toLowerCase()
    .trim()
    // Remove parenthetical records like (7-2-0)
    .replace(/\(\d+-\d+-\d+\)/g, "")
    // Normalize curly quotes
    .replace(/[''‛❛❜]/g, "'")
    .replace(/[""]/g, '"')
    // Remove punctuation except apostrophes
    .replace(/[^\w\s']/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();

  // Remove trailing "you" (ESPN marker for user's team)
  normalized = normalized.replace(/\s*you$/i, "").trim();

  return normalized;
}

/**
 * Check if a line looks like a week header
 * Example: "Matchup 1 (Oct 21 - 26)" or "Matchup 11 (Dec 29 - Jan 4)"
 */
function parseWeekHeader(line: string): { week: number; dateRange: string } | null {
  const match = line.match(/^Matchup\s+(\d+)\s*\(([^)]+)\)/i);
  if (match) {
    return {
      week: parseInt(match[1], 10),
      dateRange: match[2].trim(),
    };
  }
  return null;
}

/**
 * Check if we should stop parsing (playoff section)
 */
function isPlayoffSection(line: string): boolean {
  return /playoff\s+round/i.test(line) || /matchups\s+to\s+be\s+determined/i.test(line);
}

/**
 * Check if a string looks like a record (e.g., "7-2-0", "(6-3-0)")
 */
function looksLikeRecord(str: string): boolean {
  return /^\(?\d+-\d+-\d+\)?$/.test(str.trim());
}

/**
 * Check if a string looks like a score (e.g., "6-3-0", "1-8-0")
 */
function looksLikeScore(str: string): boolean {
  return /^\d+-\d+-\d+$/.test(str.trim());
}

/**
 * Main parser function using known-team whitelist approach
 */
export function parseScheduleData(
  data: string,
  knownTeams: string[] = []
): ScheduleParseResult {
  const warnings: string[] = [];
  const debugInfo: ScheduleDebugInfo = {
    weeksDetected: 0,
    totalMatchups: 0,
    weekDetails: [],
    knownTeamsUsed: [...knownTeams],
  };

  // Build normalized known teams map: normalizedName -> canonicalName
  const knownTeamMap = new Map<string, string>();
  knownTeams.forEach((team) => {
    const normalized = normalizeTeamName(team);
    if (normalized) {
      knownTeamMap.set(normalized, team);
    }
  });

  // If no known teams provided, fall back to legacy behavior with warning
  if (knownTeamMap.size === 0) {
    warnings.push(
      "No standings imported. Import league standings first for accurate schedule parsing."
    );
  }

  // Detect season from year mention
  const seasonMatch = data.match(/20\d{2}(?:-\d{2})?/);
  const season = seasonMatch ? seasonMatch[0] : new Date().getFullYear().toString();

  // Split into lines
  const lines = data
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);

  const matchups: ScheduleMatchup[] = [];
  const teamsSet = new Map<string, ScheduleTeam>();

  let currentWeek = 0;
  let currentDateRange = "";
  let teamsFoundInWeek: string[] = [];
  let weekDebug: WeekDebugInfo | null = null;

  const finalizeWeek = () => {
    if (currentWeek === 0 || teamsFoundInWeek.length === 0) return;

    // Create matchups by pairing teams: (0,1), (2,3), (4,5), etc.
    const weekMatchups: ScheduleMatchup[] = [];
    for (let i = 0; i < teamsFoundInWeek.length - 1; i += 2) {
      const away = teamsFoundInWeek[i];
      const home = teamsFoundInWeek[i + 1];
      
      weekMatchups.push({
        week: currentWeek,
        dateRangeText: currentDateRange,
        awayTeamName: away,
        homeTeamName: home,
      });

      // Register teams
      if (!teamsSet.has(away)) teamsSet.set(away, { teamName: away });
      if (!teamsSet.has(home)) teamsSet.set(home, { teamName: home });
    }

    matchups.push(...weekMatchups);

    if (weekDebug) {
      weekDebug.teamsFound = [...teamsFoundInWeek];
      weekDebug.matchupsCreated = weekMatchups.length;
      
      // Check for expected matchup count (5 for 10-team league)
      const expectedMatchups = Math.floor(knownTeamMap.size / 2) || 5;
      if (weekMatchups.length !== expectedMatchups && knownTeamMap.size > 0) {
        weekDebug.errors.push(
          `Expected ${expectedMatchups} matchups, found ${weekMatchups.length}`
        );
      }
      
      debugInfo.weekDetails.push(weekDebug);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Stop at playoff section
    if (isPlayoffSection(line)) {
      break;
    }

    // Check for week header
    const weekHeader = parseWeekHeader(line);
    if (weekHeader) {
      // Finalize previous week
      finalizeWeek();

      // Start new week
      currentWeek = weekHeader.week;
      currentDateRange = weekHeader.dateRange;
      teamsFoundInWeek = [];
      weekDebug = {
        week: currentWeek,
        dateRange: currentDateRange,
        teamsFound: [],
        matchupsCreated: 0,
        errors: [],
      };
      debugInfo.weeksDetected++;
      continue;
    }

    if (currentWeek === 0) continue;

    // Skip obvious non-team lines
    if (looksLikeRecord(line) || looksLikeScore(line)) continue;
    if (/^(Edit|AWAY|HOME|TEAM|Score|MANAGER)$/i.test(line)) continue;
    if (/^(AWAY\s+TEAM|HOME\s+TEAM|TEAM\s+MANAGER)/i.test(line)) continue;

    // Try to match against known teams
    const normalized = normalizeTeamName(line);
    if (!normalized || normalized.length < 2) continue;

    // Check for exact match
    const matchedTeam = knownTeamMap.get(normalized);
    if (matchedTeam) {
      // Avoid consecutive duplicates
      if (teamsFoundInWeek[teamsFoundInWeek.length - 1] !== matchedTeam) {
        teamsFoundInWeek.push(matchedTeam);
      }
      continue;
    }

    // Check for partial/fuzzy match (team name might have extra suffix)
    for (const [knownNorm, canonicalName] of knownTeamMap.entries()) {
      // Check if line starts with known team name
      if (normalized.startsWith(knownNorm) || knownNorm.startsWith(normalized)) {
        if (teamsFoundInWeek[teamsFoundInWeek.length - 1] !== canonicalName) {
          teamsFoundInWeek.push(canonicalName);
        }
        break;
      }
    }
  }

  // Finalize last week
  finalizeWeek();

  debugInfo.totalMatchups = matchups.length;

  // Guardrail: check for reasonable matchup count
  const maxExpectedMatchups = 25 * 5; // 25 weeks * 5 matchups = 125 max
  if (matchups.length > maxExpectedMatchups) {
    warnings.push(
      `Parser found ${matchups.length} matchups, which exceeds expected maximum. ` +
        "This may indicate records/scores/managers are being incorrectly identified as teams."
    );
  }

  if (matchups.length === 0) {
    if (knownTeamMap.size === 0) {
      warnings.push(
        "No matchups found. Please import standings first, then paste the ESPN League Schedule page."
      );
    } else {
      warnings.push(
        "No matchups found. Make sure you're pasting the full ESPN League → Schedule page."
      );
    }
  }

  return {
    schedule: {
      season,
      teams: Array.from(teamsSet.values()),
      matchups,
    },
    warnings,
    debugInfo,
  };
}
