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

export function computeRestOfWeekStarts({
  rosterPlayers,
  matchupDates,
  gamesByDate,
  lineupSlots = STANDARD_LINEUP_SLOTS,
}: ComputeRestOfWeekParams): RestOfWeekStats {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const futureDates = matchupDates
    .filter((d) => d >= todayStr)
    .slice()
    .sort();

  const perDay: DayStartsBreakdown[] = [];

  let totalProjectedStarts = 0;
  let totalOverflow = 0;
  let totalUnused = 0;
  let totalRosterGames = 0;

  for (const dateStr of futureDates) {
    const games = gamesByDate.get(dateStr) || [];

    const dayResult = calculateDayStartsOptimized(
      rosterPlayers,
      games,
      lineupSlots
    );

    perDay.push({
      ...dayResult,
      date: dateStr,
    });

    totalProjectedStarts += dayResult.startsUsed;
    totalOverflow += dayResult.overflow;
    totalUnused += dayResult.unusedSlots;
    totalRosterGames += dayResult.playersWithGame;
  }

  const maxPossibleStarts = lineupSlots.length * futureDates.length;

  return {
    projectedStarts: totalProjectedStarts,
    maxPossibleStarts,
    unusedStarts: maxPossibleStarts - totalProjectedStarts,
    overflowGames: totalOverflow,
    rosterGamesRemaining: totalRosterGames,
    daysRemaining: futureDates.length,
    perDay,
  };
}
