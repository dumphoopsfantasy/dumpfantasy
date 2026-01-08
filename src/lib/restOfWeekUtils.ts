/**
 * Rest of Week Start Computation Utilities
 * 
 * Shared logic for computing projected starts for both user and opponent teams.
 * Uses identical pipeline for both to ensure consistent calculations.
 * 
 * IMPORTANT: Uses maximum bipartite matching algorithm to maximize filled slots,
 * not a greedy approach. This ensures opponent projections are optimized even if
 * their current lineup is empty.
 */

import { RosterSlot, Player } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { normalizeNbaTeamCode, STANDARD_LINEUP_SLOTS } from "@/lib/scheduleAwareProjection";

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerSlotAssignment {
  playerName: string;
  playerId: string;
  assignedSlot: string;
  positions: string[];
}

export interface DayStartsBreakdown {
  date: string;
  playersWithGame: number;       // Raw count of players with games (roster games)
  filteredOut: number;           // O/IR etc excluded
  startsUsed: number;            // Optimized starts (matched to slots)
  overflow: number;              // Players with games that can't start (slot limits)
  unusedSlots: number;           // Slots that couldn't be filled
  missingTeamIdCount: number;
  slotAssignments: PlayerSlotAssignment[];
  playerDetails: Array<{
    name: string;
    nbaTeam: string | null;
    normalizedTeam: string | null;
    hasGame: boolean;
    injuryMult: number;
    started: boolean;
    filteredReason?: string;
  }>;
}

export interface RestOfWeekStats {
  // Key metrics
  projectedStarts: number;       // Optimized starts (slot-matched)
  maxPossibleStarts: number;     // dailySlots × daysRemaining
  unusedStarts: number;          // maxPossible - projected
  overflowGames: number;         // Games that can't start due to slot limits
  rosterGamesRemaining: number;  // Raw player-games (before slot constraints)
  daysRemaining: number;
  perDay: DayStartsBreakdown[];
}

export interface InjuryPolicy {
  excludeOut: boolean;
  applyDTDMultiplier: boolean;
}

// ============================================================================
// INJURY HANDLING
// ============================================================================

export function getInjuryMultiplier(status?: string, policy: InjuryPolicy = { excludeOut: true, applyDTDMultiplier: true }): number {
  if (!status) return 1.0;
  const s = status.toUpperCase().trim();
  
  // Out / IR / Suspended = 0 games expected
  if (s === 'O' || s === 'OUT' || s === 'IR' || s === 'SUSP' || s.includes('(O)')) {
    return policy.excludeOut ? 0 : 1.0;
  }
  
  if (!policy.applyDTDMultiplier) return 1.0;
  
  // Day-to-day = 60% expected games
  if (s === 'DTD' || s.includes('DTD')) return 0.6;
  
  // Questionable = 70%
  if (s === 'Q' || s === 'QUESTIONABLE') return 0.7;
  
  // Game-time decision / Probable = 85%
  if (s === 'GTD' || s === 'P' || s === 'PROBABLE') return 0.85;
  
  return 1.0;
}

// ============================================================================
// MAXIMUM BIPARTITE MATCHING
// ============================================================================

/**
 * Maximum Bipartite Matching using augmenting paths (Hopcroft-Karp simplified)
 * 
 * This ensures we maximize filled slots even for opponent teams with empty lineups.
 * Players are matched to slots based on position eligibility.
 */
function findMaximumMatching(
  players: Array<{ id: string; name: string; positions: string[]; injuryMult: number }>,
  slots: Array<{ slot: string; eligiblePositions: string[] }>
): { matchCount: number; assignments: PlayerSlotAssignment[] } {
  // Build adjacency: which slots can each player fill?
  const playerToSlots: Map<string, number[]> = new Map();
  
  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    const player = players[pIdx];
    const playerPositions = player.positions.map(p => p.toUpperCase());
    const eligibleSlotIndices: number[] = [];
    
    for (let sIdx = 0; sIdx < slots.length; sIdx++) {
      const slot = slots[sIdx];
      if (slot.eligiblePositions.some(ep => playerPositions.includes(ep))) {
        eligibleSlotIndices.push(sIdx);
      }
    }
    playerToSlots.set(player.id, eligibleSlotIndices);
  }
  
  // Matching state: slotMatch[slotIdx] = playerIdx or -1
  const slotMatch: number[] = new Array(slots.length).fill(-1);
  const playerMatch: number[] = new Array(players.length).fill(-1);
  
  // Try to find augmenting path from player pIdx
  function tryAugment(pIdx: number, visited: Set<number>): boolean {
    const eligibleSlots = playerToSlots.get(players[pIdx].id) || [];
    
    for (const sIdx of eligibleSlots) {
      if (visited.has(sIdx)) continue;
      visited.add(sIdx);
      
      // If slot is free, or we can reassign the current occupant
      if (slotMatch[sIdx] === -1 || tryAugment(slotMatch[sIdx], visited)) {
        slotMatch[sIdx] = pIdx;
        playerMatch[pIdx] = sIdx;
        return true;
      }
    }
    return false;
  }
  
  // Run matching for each player
  let matchCount = 0;
  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    const visited = new Set<number>();
    if (tryAugment(pIdx, visited)) {
      matchCount++;
    }
  }
  
  // Build assignment list
  const assignments: PlayerSlotAssignment[] = [];
  for (let sIdx = 0; sIdx < slots.length; sIdx++) {
    if (slotMatch[sIdx] !== -1) {
      const player = players[slotMatch[sIdx]];
      assignments.push({
        playerName: player.name,
        playerId: player.id,
        assignedSlot: slots[sIdx].slot,
        positions: player.positions,
      });
    }
  }
  
  return { matchCount, assignments };
}

// ============================================================================
// CORE COMPUTATION - SAME FOR BOTH TEAMS
// ============================================================================

interface EligiblePlayer {
  player: Player;
  normalizedTeam: string | null;
  hasGame: boolean;
  injuryMult: number;
  positions: string[];
}

/**
 * Check if a player has a game on a specific date
 * This is the SAME function used for both user and opponent teams
 */
function hasGameOnDate(
  normalizedTeam: string | null,
  games: NBAGame[]
): boolean {
  if (!normalizedTeam) return false;
  return games.some(
    (g) => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam
  );
}

/**
 * Calculate OPTIMIZED starts for a single day using maximum matching
 * UNIFIED FUNCTION - used identically for user and opponent
 * 
 * This computes the maximum possible starts from the full roster,
 * NOT based on currently-set lineup slots.
 */
function calculateDayStartsOptimized(
  roster: RosterSlot[],
  games: NBAGame[],
  injuryPolicy: InjuryPolicy,
  dailyActiveSlots: number = STANDARD_LINEUP_SLOTS.length
): Omit<DayStartsBreakdown, 'date'> {
  const playerDetails: DayStartsBreakdown['playerDetails'] = [];
  const eligiblePlayers: EligiblePlayer[] = [];
  let missingTeamIdCount = 0;
  let filteredOut = 0;
  
  for (const slot of roster) {
    // Skip IR slots
    if (slot.slotType === 'ir') {
      filteredOut++;
      playerDetails.push({
        name: slot.player.name,
        nbaTeam: slot.player.nbaTeam || null,
        normalizedTeam: normalizeNbaTeamCode(slot.player.nbaTeam),
        hasGame: false,
        injuryMult: 0,
        started: false,
        filteredReason: 'IR slot',
      });
      continue;
    }
    
    const player = slot.player;
    
    // Normalize team code - SAME FUNCTION for both teams
    const normalizedTeam = normalizeNbaTeamCode(player.nbaTeam);
    
    if (!normalizedTeam) {
      missingTeamIdCount++;
      playerDetails.push({
        name: player.name,
        nbaTeam: player.nbaTeam || null,
        normalizedTeam: null,
        hasGame: false,
        injuryMult: 1.0,
        started: false,
        filteredReason: 'Missing team ID',
      });
      continue;
    }
    
    // Check if team has game - SAME FUNCTION for both teams
    const hasGame = hasGameOnDate(normalizedTeam, games);
    const injuryMult = getInjuryMultiplier(player.status, injuryPolicy);
    
    // Check if filtered out due to injury
    if (injuryMult === 0) {
      filteredOut++;
      playerDetails.push({
        name: player.name,
        nbaTeam: player.nbaTeam || null,
        normalizedTeam,
        hasGame,
        injuryMult: 0,
        started: false,
        filteredReason: 'OUT/IR status',
      });
      continue;
    }
    
    playerDetails.push({
      name: player.name,
      nbaTeam: player.nbaTeam || null,
      normalizedTeam,
      hasGame,
      injuryMult,
      started: false, // Will update below
    });
    
    if (!hasGame) continue;
    
    eligiblePlayers.push({
      player,
      normalizedTeam,
      hasGame: true,
      injuryMult,
      positions: player.positions || [],
    });
  }
  
  // Use maximum matching to find optimal slot assignment
  const playersForMatching = eligiblePlayers.map(ep => ({
    id: ep.player.id,
    name: ep.player.name,
    positions: ep.positions,
    injuryMult: ep.injuryMult,
  }));
  
  const { matchCount, assignments } = findMaximumMatching(
    playersForMatching,
    STANDARD_LINEUP_SLOTS.slice(0, dailyActiveSlots)
  );
  
  // Calculate weighted starts (applying injury multiplier)
  let weightedStarts = 0;
  for (const assignment of assignments) {
    const player = eligiblePlayers.find(ep => ep.player.id === assignment.playerId);
    if (player) {
      weightedStarts += player.injuryMult;
      // Mark as started in details
      const detail = playerDetails.find(d => d.name === player.player.name);
      if (detail) detail.started = true;
    }
  }
  
  const playersWithGameCount = eligiblePlayers.length;
  const overflow = Math.max(0, playersWithGameCount - matchCount);
  const unusedSlots = Math.max(0, dailyActiveSlots - matchCount);
  
  return {
    playersWithGame: playersWithGameCount,
    filteredOut,
    startsUsed: Math.round(weightedStarts * 10) / 10,
    overflow,
    unusedSlots,
    missingTeamIdCount,
    slotAssignments: assignments,
    playerDetails,
  };
}

// ============================================================================
// MAIN EXPORT - COMPUTE REST OF WEEK STARTS
// ============================================================================

export interface ComputeRestOfWeekParams {
  rosterPlayers: RosterSlot[];
  matchupDates: string[];
  dailyActiveSlots?: number;
  gamesByDate: Map<string, NBAGame[]>;
  injuryPolicy?: InjuryPolicy;
}

/**
 * Compute rest-of-week starts for a team.
 * 
 * THIS IS THE UNIFIED FUNCTION used by BOTH user team AND opponent team.
 * It uses identical logic, normalization, and game lookup for consistency.
 * 
 * Uses maximum bipartite matching to OPTIMIZE lineup filling, ensuring
 * opponent projections reflect their maximum possible starts even if
 * their future lineup is currently empty.
 */
export function computeRestOfWeekStarts({
  rosterPlayers,
  matchupDates,
  dailyActiveSlots = STANDARD_LINEUP_SLOTS.length,
  gamesByDate,
  injuryPolicy = { excludeOut: true, applyDTDMultiplier: true },
}: ComputeRestOfWeekParams): RestOfWeekStats {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // Filter to non-past dates
  const futureDates = matchupDates.filter(d => d >= todayStr);
  
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
      injuryPolicy,
      dailyActiveSlots
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
  
  const maxPossibleStarts = dailyActiveSlots * futureDates.length;
  
  return {
    projectedStarts: Math.round(totalProjectedStarts * 10) / 10,
    maxPossibleStarts,
    unusedStarts: Math.round((maxPossibleStarts - totalProjectedStarts) * 10) / 10,
    overflowGames: totalOverflow,
    rosterGamesRemaining: totalRosterGames,
    daysRemaining: futureDates.length,
    perDay,
  };
}
