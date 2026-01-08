/**
 * Rest of Week Start Computation Utilities
 *
 * Deterministic, integer-only start optimization used for BOTH user and opponent.
 *
 * Rules (per user requirements):
 * - NO injury weighting and NO expected-value logic (no decimals)
 * - DTD/Q/O statuses are NOT filtered (we can add injury modeling later)
 * - IR players are excluded ONLY if they are in an IR roster slot
 * - Starts are computed by maximum bipartite matching (players ↔ lineup slots)
 */

import { RosterSlot, Player } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import {
  normalizeNbaTeamCode,
  STANDARD_LINEUP_SLOTS,
  type LineupSlotConfig,
} from "@/lib/scheduleAwareProjection";

// ============================================================================
// DATE/TIME UTILITIES
// ============================================================================

/**
 * Returns today's date as YYYY-MM-DD in local time.
 */
export function getTodayDateStr(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

/**
 * Determines whether "today" should be considered elapsed (started/in-progress).
 * - If ANY game today has status 'live' or 'final', treat today as elapsed.
 * - Otherwise, check if current time >= earliest game time.
 */
export function hasTodayStarted(todayGames: NBAGame[]): boolean {
  if (!todayGames || todayGames.length === 0) return false;
  
  // Check if any game is live or final
  const hasLiveOrFinal = todayGames.some((g) => {
    const status = (g.status || "").toLowerCase();
    return status === "live" || status === "final" || status.includes("in progress");
  });
  
  if (hasLiveOrFinal) return true;
  
  // If no live/final, check if current time >= earliest game time
  const now = new Date();
  for (const g of todayGames) {
    if (g.gameTime) {
      try {
        const gameDate = new Date(g.gameTime);
        if (now >= gameDate) return true;
      } catch {
        // Invalid date, ignore
      }
    }
  }
  
  return false;
}

/**
 * Categorizes matchup dates into:
 * - elapsed: days that have already completed (past days + today if started)
 * - remaining: days that haven't started yet (future days + today if not started)
 */
export function categorizeDates(
  matchupDates: string[],
  gamesByDate: Map<string, NBAGame[]>
): { elapsed: string[]; remaining: string[] } {
  const todayStr = getTodayDateStr();
  const todayGames = gamesByDate.get(todayStr) || [];
  const todayIsElapsed = hasTodayStarted(todayGames);
  
  const elapsed: string[] = [];
  const remaining: string[] = [];
  
  for (const d of matchupDates) {
    if (d < todayStr) {
      elapsed.push(d);
    } else if (d === todayStr) {
      if (todayIsElapsed) {
        elapsed.push(d);
      } else {
        remaining.push(d);
      }
    } else {
      remaining.push(d);
    }
  }
  
  return { elapsed: elapsed.sort(), remaining: remaining.sort() };
}

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerSlotAssignment {
  playerName: string;
  playerId: string;
  assignedSlot: string;
  positions: string[];
}

export interface ExcludedPlayer {
  playerName: string;
  playerId: string;
  reason: "IR slot" | "Missing team" | "No positions";
  nbaTeam?: string | null;
  positions?: string[];
}

export interface DayStartsBreakdown {
  date: string;

  // Inputs
  slotsCount: number;
  scheduleGamesCount: number;

  // Candidates
  playersWithGame: number; // aka candidatesCount
  filteredOut: number; // excluded players (IR slot / missing team / no positions)

  // Optimization outputs (integers)
  startsUsed: number; // aka optimizedStarts
  overflow: number; // aka optimizedBenchedGames (schedule overflow)
  unusedSlots: number;

  // Debug
  missingTeamIdCount: number;
  slotAssignments: PlayerSlotAssignment[];
  excludedPlayers: ExcludedPlayer[];
}

export interface RestOfWeekStats {
  // Key metrics
  projectedStarts: number; // sum(startsUsed) across remaining days (integer)
  maxPossibleStarts: number; // slotsCount × daysRemaining
  unusedStarts: number; // maxPossible - projected

  overflowGames: number; // sum(overflow) across remaining days
  rosterGamesRemaining: number; // sum(playersWithGame) across remaining days

  daysRemaining: number;
  perDay: DayStartsBreakdown[];
}

// ============================================================================
// MATCHING / OPTIMIZATION
// ============================================================================

function hasGameOnDate(normalizedTeam: string | null, games: NBAGame[]): boolean {
  if (!normalizedTeam) return false;
  return games.some(
    (g) => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam
  );
}

/**
 * Maximum bipartite matching via DFS augmenting paths.
 * Deterministic: players are processed in stable order (id, then name).
 */
function findMaximumMatching(
  players: Array<{ id: string; name: string; positions: string[] }>,
  slots: LineupSlotConfig[]
): { matchCount: number; assignments: PlayerSlotAssignment[] } {
  const sortedPlayers = [...players].sort((a, b) =>
    a.id.localeCompare(b.id) || a.name.localeCompare(b.name)
  );

  // Build adjacency: playerIdx -> slotIdx[]
  const playerToSlots: number[][] = sortedPlayers.map((p) => {
    const playerPositions = (p.positions || []).map((x) => x.toUpperCase());
    const eligible: number[] = [];

    for (let sIdx = 0; sIdx < slots.length; sIdx++) {
      const slot = slots[sIdx];
      if (slot.eligiblePositions.some((ep) => playerPositions.includes(ep))) {
        eligible.push(sIdx);
      }
    }
    return eligible;
  });

  const slotMatch: number[] = new Array(slots.length).fill(-1); // slotIdx -> playerIdx

  function tryAugment(pIdx: number, visited: boolean[]): boolean {
    for (const sIdx of playerToSlots[pIdx]) {
      if (visited[sIdx]) continue;
      visited[sIdx] = true;

      if (slotMatch[sIdx] === -1 || tryAugment(slotMatch[sIdx], visited)) {
        slotMatch[sIdx] = pIdx;
        return true;
      }
    }
    return false;
  }

  let matchCount = 0;
  for (let pIdx = 0; pIdx < sortedPlayers.length; pIdx++) {
    const visited = new Array(slots.length).fill(false);
    if (tryAugment(pIdx, visited)) matchCount++;
  }

  const assignments: PlayerSlotAssignment[] = [];
  for (let sIdx = 0; sIdx < slots.length; sIdx++) {
    const pIdx = slotMatch[sIdx];
    if (pIdx === -1) continue;

    const p = sortedPlayers[pIdx];
    assignments.push({
      playerId: p.id,
      playerName: p.name,
      assignedSlot: slots[sIdx].slot,
      positions: p.positions,
    });
  }

  return { matchCount, assignments };
}

function calculateDayStartsOptimized(
  roster: RosterSlot[],
  games: NBAGame[],
  lineupSlots: LineupSlotConfig[]
): Omit<DayStartsBreakdown, "date"> {
  const excludedPlayers: ExcludedPlayer[] = [];
  const candidates: Array<{ id: string; name: string; positions: string[] }> = [];

  let filteredOut = 0;
  let missingTeamIdCount = 0;

  for (const slot of roster) {
    if (slot.slotType === "ir") {
      filteredOut++;
      excludedPlayers.push({
        playerId: slot.player.id,
        playerName: slot.player.name,
        reason: "IR slot",
        nbaTeam: slot.player.nbaTeam || null,
        positions: slot.player.positions || [],
      });
      continue;
    }

    const player: Player = slot.player;

    const positions = player.positions || [];
    if (positions.length === 0) {
      filteredOut++;
      excludedPlayers.push({
        playerId: player.id,
        playerName: player.name,
        reason: "No positions",
        nbaTeam: player.nbaTeam || null,
        positions,
      });
      continue;
    }

    const normalizedTeam = normalizeNbaTeamCode(player.nbaTeam);
    if (!normalizedTeam) {
      missingTeamIdCount++;
      filteredOut++;
      excludedPlayers.push({
        playerId: player.id,
        playerName: player.name,
        reason: "Missing team",
        nbaTeam: player.nbaTeam || null,
        positions,
      });
      continue;
    }

    if (!hasGameOnDate(normalizedTeam, games)) continue;

    candidates.push({
      id: player.id,
      name: player.name,
      positions,
    });
  }

  const { matchCount, assignments } = findMaximumMatching(candidates, lineupSlots);

  const playersWithGame = candidates.length;
  const startsUsed = matchCount;
  const overflow = Math.max(0, playersWithGame - startsUsed);
  const unusedSlots = Math.max(0, lineupSlots.length - startsUsed);

  return {
    slotsCount: lineupSlots.length,
    scheduleGamesCount: games.length,

    playersWithGame,
    filteredOut,

    startsUsed,
    overflow,
    unusedSlots,

    missingTeamIdCount,
    slotAssignments: assignments,
    excludedPlayers,
  };
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export interface ComputeRestOfWeekParams {
  rosterPlayers: RosterSlot[];
  matchupDates: string[];
  gamesByDate: Map<string, NBAGame[]>;

  /** Override lineup slots if league settings support it; defaults to STANDARD_LINEUP_SLOTS */
  lineupSlots?: LineupSlotConfig[];
}

export interface RestOfWeekResult {
  // Elapsed (already happened or in-progress)
  elapsedDays: number;
  elapsedStarts: number; // optimized starts on elapsed days
  elapsedPerDay: DayStartsBreakdown[];
  
  // Remaining (future)
  remainingDays: number;
  remainingStarts: number; // optimized starts on remaining days (before cap)
  remainingRosterGames: number;
  remainingOverflow: number;
  remainingUnusedSlots: number;
  remainingPerDay: DayStartsBreakdown[];
  
  // Combined
  allPerDay: DayStartsBreakdown[];
  maxPossibleStarts: number; // slots × remaining days
  
  // Today status
  todayIsElapsed: boolean;
}

export function computeRestOfWeekStarts({
  rosterPlayers,
  matchupDates,
  gamesByDate,
  lineupSlots = STANDARD_LINEUP_SLOTS,
}: ComputeRestOfWeekParams): RestOfWeekResult {
  const { elapsed, remaining } = categorizeDates(matchupDates, gamesByDate);
  const todayStr = getTodayDateStr();
  const todayGames = gamesByDate.get(todayStr) || [];
  const todayIsElapsed = hasTodayStarted(todayGames);
  
  const elapsedPerDay: DayStartsBreakdown[] = [];
  const remainingPerDay: DayStartsBreakdown[] = [];
  
  let elapsedStarts = 0;
  let remainingStarts = 0;
  let remainingRosterGames = 0;
  let remainingOverflow = 0;
  let remainingUnusedSlots = 0;

  // Compute elapsed days
  for (const dateStr of elapsed) {
    const games = gamesByDate.get(dateStr) || [];
    const dayResult = calculateDayStartsOptimized(rosterPlayers, games, lineupSlots);
    const breakdown = { ...dayResult, date: dateStr };
    elapsedPerDay.push(breakdown);
    elapsedStarts += dayResult.startsUsed;
  }

  // Compute remaining days
  for (const dateStr of remaining) {
    const games = gamesByDate.get(dateStr) || [];
    const dayResult = calculateDayStartsOptimized(rosterPlayers, games, lineupSlots);
    const breakdown = { ...dayResult, date: dateStr };
    remainingPerDay.push(breakdown);
    remainingStarts += dayResult.startsUsed;
    remainingRosterGames += dayResult.playersWithGame;
    remainingOverflow += dayResult.overflow;
    remainingUnusedSlots += dayResult.unusedSlots;
  }

  const allPerDay = [...elapsedPerDay, ...remainingPerDay].sort((a, b) => 
    a.date.localeCompare(b.date)
  );

  return {
    elapsedDays: elapsed.length,
    elapsedStarts,
    elapsedPerDay,
    
    remainingDays: remaining.length,
    remainingStarts,
    remainingRosterGames,
    remainingOverflow,
    remainingUnusedSlots,
    remainingPerDay,
    
    allPerDay,
    maxPossibleStarts: lineupSlots.length * remaining.length,
    
    todayIsElapsed,
  };
}

// Legacy compat export (deprecated - use RestOfWeekResult instead)
export interface RestOfWeekStats {
  projectedStarts: number;
  maxPossibleStarts: number;
  unusedStarts: number;
  overflowGames: number;
  rosterGamesRemaining: number;
  daysRemaining: number;
  perDay: DayStartsBreakdown[];
}
