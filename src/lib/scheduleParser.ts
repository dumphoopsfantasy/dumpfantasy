/**
 * Schedule Parser for ESPN Fantasy Basketball League Schedule
 * Uses a known-team whitelist approach: only accepts team names that match imported standings.
 */

import { normalizeName } from "./nameNormalization";
import { devLog, devWarn } from "@/lib/devLog";

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
  isPlayoff?: boolean;
  label?: string;
  type?: "regular" | "playoff";
  weekNumber?: number;
  playoffRound?: number;
  startDate?: string;
  endDate?: string;
  isBye?: boolean;
};

export type LeagueSchedule = {
  season: string;
  teams: ScheduleTeam[];
  matchups: ScheduleMatchup[];
  lastRegularSeasonWeek?: number;
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
  byeRows: number;
  type: "regular" | "playoff";
  playoffRound?: number;
  errors: string[];
};

export type ScheduleDebugInfo = {
  weeksDetected: number;
  totalMatchups: number;
  weekDetails: WeekDebugInfo[];
  knownTeamsUsed: string[];
  regularMatchupsParsed: number;
  playoffMatchupsParsed: number;
  byeRowsParsed: number;
  playoffSectionsDetected: number;
  playoffSectionsSkipped: number;
};

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

function normalizeMonthToken(token: string): string {
  return token.toLowerCase().slice(0, 3);
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function resolveSeasonYear(season: string): number {
  const parts = season.match(/^(\d{4})(?:-(\d{2,4}))?/);
  if (!parts) return new Date().getFullYear();
  const firstYear = parseInt(parts[1], 10);
  if (!parts[2]) return firstYear;

  const raw = parseInt(parts[2], 10);
  const secondYear = raw < 100 ? Math.floor(firstYear / 100) * 100 + raw : raw;
  return secondYear;
}

function parseDateRangeTextToIso(
  dateRangeText: string,
  seasonYear: number
): { startDate?: string; endDate?: string } {
  const m = dateRangeText.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2})\s*-\s*(?:([A-Za-z]{3,9})\s+)?(\d{1,2})/
  );
  if (!m) return {};

  const startMonth = MONTH_INDEX[normalizeMonthToken(m[1])];
  const startDay = parseInt(m[2], 10);
  const endMonth = m[3] ? MONTH_INDEX[normalizeMonthToken(m[3])] : startMonth;
  const endDay = parseInt(m[4], 10);

  if (startMonth === undefined || endMonth === undefined) return {};

  const startYear = startMonth >= 9 ? seasonYear - 1 : seasonYear;
  const endYear = endMonth >= 9 ? seasonYear - 1 : seasonYear;

  const start = new Date(startYear, startMonth, startDay);
  const end = new Date(endYear, endMonth, endDay);

  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeNormalizedPhrase(line: string, phrase: string): { matched: boolean; index: number } {
  if (!line || !phrase) return { matched: false, index: -1 };
  const regex = new RegExp(`(?:^|\\s)${escapeRegExp(phrase)}(?:$|\\s)`);
  const m = regex.exec(line);
  return { matched: !!m, index: m?.index ?? -1 };
}

/**
 * Check if a line looks like a week header.
 * Supports both regular and playoff labels.
 */
function parseWeekHeader(
  line: string
):
  | {
      type: "regular" | "playoff";
      headerLabel: string;
      weekNumber?: number;
      playoffRound?: number;
      dateRange?: string;
    }
  | null {
  const matchupMatch = line.match(/^Matchup\s+(\d+)(?:\s*\(([^)]+)\))?/i);
  if (matchupMatch) {
    const weekNumber = parseInt(matchupMatch[1], 10);
    return {
      type: "regular",
      headerLabel: `Matchup ${weekNumber}`,
      weekNumber,
      dateRange: matchupMatch[2]?.trim(),
    };
  }

  const playoffMatch = line.match(/^Playoff\s+Round\s+(\d+)(?:\s*\(([^)]+)\))?/i);
  if (playoffMatch) {
    const playoffRound = parseInt(playoffMatch[1], 10);
    return {
      type: "playoff",
      headerLabel: `Playoff Round ${playoffRound}`,
      playoffRound,
      dateRange: playoffMatch[2]?.trim(),
    };
  }

  return null;
}

function extractDateRangeFromLine(line: string): string | null {
  const m = line.match(/([A-Za-z]{3,9}\s+\d{1,2}\s*-\s*(?:[A-Za-z]{3,9}\s+)?\d{1,2})/);
  return m ? m[1].trim() : null;
}

/**
 * Check if a line is a "Matchups to be determined" placeholder (skip it)
 */
function isMatchupsTBD(line: string): boolean {
  return /matchups\s+to\s+be\s+determined/i.test(line);
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

function isSkippableScheduleLine(line: string): boolean {
  if (!line) return true;
  if (isMatchupsTBD(line)) return true;
  if (/view\/edit\s+playoff\s+bracket/i.test(line)) return true;
  if (looksLikeRecord(line) || looksLikeScore(line)) return true;
  if (/^(Edit|AWAY|HOME|TEAM|Score|MANAGER|Bye)$/i.test(line)) return true;
  if (/^(AWAY\s+TEAM|HOME\s+TEAM|TEAM\s+MANAGER)$/i.test(line)) return true;
  return false;
}

function extractKnownTeamsFromLine(
  line: string,
  knownTeamEntries: Array<{ normalized: string; canonical: string }>
): string[] {
  const normalizedLine = normalizeTeamName(line);
  if (!normalizedLine) return [];

  const matches: Array<{ canonical: string; index: number; length: number }> = [];
  for (const entry of knownTeamEntries) {
    const { matched, index } = containsWholeNormalizedPhrase(normalizedLine, entry.normalized);
    if (matched) {
      matches.push({
        canonical: entry.canonical,
        index,
        length: entry.normalized.length,
      });
    }
  }

  matches.sort((a, b) => a.index - b.index || b.length - a.length);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    if (!seen.has(match.canonical)) {
      deduped.push(match.canonical);
      seen.add(match.canonical);
    }
  }

  return deduped;
}

/**
 * Main parser function using known-team whitelist approach.
 * Supports both regular season matchup headers and playoff rounds.
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
    regularMatchupsParsed: 0,
    playoffMatchupsParsed: 0,
    byeRowsParsed: 0,
    playoffSectionsDetected: 0,
    playoffSectionsSkipped: 0,
  };

  // Build normalized known teams map: normalizedName -> canonicalName
  const knownTeamMap = new Map<string, string>();
  knownTeams.forEach((team) => {
    const normalized = normalizeTeamName(team);
    if (normalized) {
      knownTeamMap.set(normalized, team);
    }
  });

  const knownTeamEntries = Array.from(knownTeamMap.entries()).map(([normalized, canonical]) => ({
    normalized,
    canonical,
  }));

  // If no known teams provided, fall back to legacy behavior with warning
  if (knownTeamMap.size === 0) {
    warnings.push(
      "No standings imported. Import league standings first for accurate schedule parsing."
    );
  }

  // Detect season from year mention
  const seasonMatch = data.match(/20\d{2}(?:-\d{2})?/);
  const season = seasonMatch ? seasonMatch[0] : new Date().getFullYear().toString();
  const seasonYear = resolveSeasonYear(season);

  // Split into lines
  const lines = data
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);

  const matchups: ScheduleMatchup[] = [];
  const teamsSet = new Map<string, ScheduleTeam>();

  let currentWeek = 0;
  let currentDateRange = "";
  let currentLabel = "";
  let currentType: "regular" | "playoff" = "regular";
  let currentPlayoffRound: number | undefined;
  let currentSectionLines: string[] = [];

  let lastMatchupWeek = 0; // highest regular season "Matchup N" week
  let detectedLastRegularWeek: number | undefined;

  const finalizeSection = () => {
    if (currentWeek === 0) return;

    const weekDebug: WeekDebugInfo = {
      week: currentWeek,
      dateRange: currentDateRange,
      teamsFound: [],
      matchupsCreated: 0,
      byeRows: 0,
      type: currentType,
      playoffRound: currentPlayoffRound,
      errors: [],
    };

    const teamsFoundInOrder: string[] = [];
    const byeTeams = new Set<string>();
    let skipTeamExtractionLines = 0;

    for (let i = 0; i < currentSectionLines.length; i++) {
      const line = currentSectionLines[i];
      if (!line) continue;

      if (/^Bye\b/i.test(line)) {
        weekDebug.byeRows += 1;

        // Parse bye team tokens safely and exclude them from pairing.
        const byeInline = line.replace(/^Bye\s*:?\s*/i, "").trim();
        extractKnownTeamsFromLine(byeInline, knownTeamEntries).forEach((team) => byeTeams.add(team));

        // ESPN sometimes puts bye team on next line.
        const nextLine = currentSectionLines[i + 1] || "";
        if (nextLine && !isSkippableScheduleLine(nextLine) && !parseWeekHeader(nextLine)) {
          extractKnownTeamsFromLine(nextLine, knownTeamEntries).forEach((team) => byeTeams.add(team));
          skipTeamExtractionLines = 1;
        }
        continue;
      }

      if (skipTeamExtractionLines > 0) {
        skipTeamExtractionLines -= 1;
        continue;
      }

      if (isSkippableScheduleLine(line)) continue;

      const foundTeams = extractKnownTeamsFromLine(line, knownTeamEntries);
      for (const team of foundTeams) {
        if (teamsFoundInOrder[teamsFoundInOrder.length - 1] !== team) {
          teamsFoundInOrder.push(team);
        }
      }
    }

    // Remove any byes from pairing candidates.
    const pairingCandidates = teamsFoundInOrder.filter((team) => !byeTeams.has(team));

    // Deduplicate while preserving first appearance order.
    const uniqueTeams: string[] = [];
    const seen = new Set<string>();
    for (const team of pairingCandidates) {
      if (!seen.has(team)) {
        uniqueTeams.push(team);
        seen.add(team);
      }
    }

    weekDebug.teamsFound = [...uniqueTeams];

    const expectedMatchups = knownTeamMap.size > 0 ? Math.floor(knownTeamMap.size / 2) : Math.floor(uniqueTeams.length / 2);
    const maxTeamsForWeek = expectedMatchups > 0 ? expectedMatchups * 2 : uniqueTeams.length;

    let teamsToPair = uniqueTeams;
    if (maxTeamsForWeek > 0 && uniqueTeams.length > maxTeamsForWeek) {
      teamsToPair = uniqueTeams.slice(0, maxTeamsForWeek);
      weekDebug.errors.push(
        `Found ${uniqueTeams.length} candidate teams; trimmed to ${maxTeamsForWeek} for pairing.`
      );
    }

    if (teamsToPair.length % 2 !== 0) {
      weekDebug.errors.push(
        `Odd number of teams in section (${teamsToPair.length}). One team could not be paired.`
      );
    }

    const { startDate, endDate } = parseDateRangeTextToIso(currentDateRange, seasonYear);

    const weekMatchups: ScheduleMatchup[] = [];
    for (let i = 0; i < teamsToPair.length - 1; i += 2) {
      const away = teamsToPair[i];
      const home = teamsToPair[i + 1];

      const matchup: ScheduleMatchup = {
        week: currentWeek,
        weekNumber: currentType === "regular" ? currentWeek : undefined,
        playoffRound: currentType === "playoff" ? currentPlayoffRound : undefined,
        label: currentLabel,
        type: currentType,
        dateRangeText: currentDateRange,
        startDate,
        endDate,
        awayTeamName: away,
        homeTeamName: home,
        isPlayoff: currentType === "playoff",
      };

      weekMatchups.push(matchup);

      if (!teamsSet.has(away)) teamsSet.set(away, { teamName: away });
      if (!teamsSet.has(home)) teamsSet.set(home, { teamName: home });
    }

    weekDebug.matchupsCreated = weekMatchups.length;
    matchups.push(...weekMatchups);

    if (currentType === "playoff") {
      debugInfo.playoffSectionsDetected += 1;
      if (weekMatchups.length === 0) {
        debugInfo.playoffSectionsSkipped += 1;
      }
    }

    debugInfo.byeRowsParsed += weekDebug.byeRows;
    debugInfo.regularMatchupsParsed += weekMatchups.filter((m) => !m.isPlayoff).length;
    debugInfo.playoffMatchupsParsed += weekMatchups.filter((m) => !!m.isPlayoff).length;
    debugInfo.weekDetails.push(weekDebug);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const weekHeader = parseWeekHeader(line);
    if (weekHeader) {
      // Finalize previous section first.
      finalizeSection();

      let dateRange = weekHeader.dateRange?.trim() || "";
      if (!dateRange) {
        // ESPN format drift: date range can appear on next lines.
        for (let lookahead = i + 1; lookahead <= Math.min(i + 3, lines.length - 1); lookahead++) {
          const detected = extractDateRangeFromLine(lines[lookahead]);
          if (detected) {
            dateRange = detected;
            break;
          }
        }
      }

      if (!dateRange) {
        warnings.push(`Could not parse date range for ${weekHeader.headerLabel}.`);
      }

      if (weekHeader.type === "playoff") {
        const playoffRound = weekHeader.playoffRound || 0;
        if (detectedLastRegularWeek === undefined) {
          detectedLastRegularWeek = lastMatchupWeek;
        }
        currentWeek = (detectedLastRegularWeek || lastMatchupWeek || 0) + playoffRound;
        currentType = "playoff";
        currentPlayoffRound = playoffRound;
      } else {
        currentWeek = weekHeader.weekNumber || 0;
        lastMatchupWeek = Math.max(lastMatchupWeek, currentWeek);
        currentType = "regular";
        currentPlayoffRound = undefined;
      }

      currentDateRange = dateRange;
      currentLabel = weekHeader.headerLabel;
      currentSectionLines = [];
      debugInfo.weeksDetected += 1;
      continue;
    }

    if (currentWeek === 0) continue;
    currentSectionLines.push(line);
  }

  // Finalize trailing section
  finalizeSection();

  debugInfo.totalMatchups = matchups.length;

  // Guardrail: check for reasonable matchup count
  const maxExpectedMatchups = 25 * 5; // 25 weeks * 5 matchups = 125 max
  if (matchups.length > maxExpectedMatchups) {
    warnings.push(
      `Parser found ${matchups.length} matchups, which exceeds expected maximum. ` +
        "This may indicate records/scores/managers are being incorrectly identified as teams."
    );
  }

  if (debugInfo.playoffSectionsDetected > 0 && debugInfo.playoffMatchupsParsed === 0) {
    warnings.push("Playoff sections were detected, but no playoff matchups were parsed.");
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

  const inferredLastRegularWeek =
    detectedLastRegularWeek ??
    (() => {
      const playoffWeeks = matchups.filter((m) => m.isPlayoff).map((m) => m.week);
      if (playoffWeeks.length === 0) return undefined;
      return Math.min(...playoffWeeks) - 1;
    })();

  devLog("[scheduleParser] Parse diagnostics", {
    regularMatchupsParsed: debugInfo.regularMatchupsParsed,
    playoffMatchupsParsed: debugInfo.playoffMatchupsParsed,
    byeRowsParsed: debugInfo.byeRowsParsed,
    playoffSectionsDetected: debugInfo.playoffSectionsDetected,
    playoffSectionsSkipped: debugInfo.playoffSectionsSkipped,
    totalMatchups: matchups.length,
  });

  if (debugInfo.playoffSectionsDetected > 0 && debugInfo.playoffSectionsSkipped > 0) {
    devWarn("[scheduleParser] Some playoff sections produced zero matchups", {
      playoffSectionsDetected: debugInfo.playoffSectionsDetected,
      playoffSectionsSkipped: debugInfo.playoffSectionsSkipped,
    });
  }

  return {
    schedule: {
      season,
      teams: Array.from(teamsSet.values()),
      matchups,
      lastRegularSeasonWeek: inferredLastRegularWeek,
    },
    warnings,
    debugInfo,
  };
}
