/**
 * Rest of Week Start Computation Utilities
 * 
 * Shared logic for computing projected starts for both user and opponent teams.
 * Uses identical pipeline for both to ensure consistent calculations.
 */

import { RosterSlot, Player } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { normalizeNbaTeamCode, STANDARD_LINEUP_SLOTS } from "@/lib/scheduleAwareProjection";

// ============================================================================
// TYPES
// ============================================================================

export interface DayStartsBreakdown {
  date: string;
  playersWithGame: number;
  startsUsed: number;
  overflow: number;
  unusedSlots: number;
  missingTeamIdCount: number;
  playerDetails: Array<{
    name: string;
    nbaTeam: string | null;
    normalizedTeam: string | null;
    hasGame: boolean;
    injuryMult: number;
    started: boolean;
  }>;
}

export interface RestOfWeekStats {
  projectedStarts: number;
  maxPossibleStarts: number;
  unusedStarts: number;
  overflowGames: number;
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
// SLOT FILLING
// ============================================================================

function canFillSlot(positions: string[], eligiblePositions: string[]): boolean {
  const playerPositions = positions.map((p) => p.toUpperCase());
  return eligiblePositions.some((eligible) => playerPositions.includes(eligible));
}

// ============================================================================
// CORE COMPUTATION - SAME FOR BOTH TEAMS
// ============================================================================

interface PlayerGameInfo {
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
 * Calculate starts for a single day using greedy slot filling
 * UNIFIED FUNCTION - used identically for user and opponent
 */
function calculateDayStartsUnified(
  roster: RosterSlot[],
  games: NBAGame[],
  injuryPolicy: InjuryPolicy,
  dailyActiveSlots: number = STANDARD_LINEUP_SLOTS.length
): DayStartsBreakdown & { date: string } {
  const playerDetails: DayStartsBreakdown['playerDetails'] = [];
  const playersWithGames: PlayerGameInfo[] = [];
  let missingTeamIdCount = 0;
  
  for (const slot of roster) {
    // Skip IR slots
    if (slot.slotType === 'ir') continue;
    const player = slot.player;
    
    // Skip players with 0 minutes (likely not active)
    if (!player.minutes || player.minutes <= 0) continue;
    
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
      });
      continue;
    }
    
    // Check if team has game - SAME FUNCTION for both teams
    const hasGame = hasGameOnDate(normalizedTeam, games);
    const injuryMult = getInjuryMultiplier(player.status, injuryPolicy);
    
    playerDetails.push({
      name: player.name,
      nbaTeam: player.nbaTeam || null,
      normalizedTeam,
      hasGame,
      injuryMult,
      started: false, // Will update below
    });
    
    if (!hasGame) continue;
    if (injuryMult === 0) continue;
    
    playersWithGames.push({
      player,
      normalizedTeam,
      hasGame: true,
      injuryMult,
      positions: player.positions || [],
    });
  }
  
  // Greedy slot filling: prioritize more constrained players
  const playersWithEligibility = playersWithGames.map((p) => {
    let eligibleSlots = 0;
    for (const slot of STANDARD_LINEUP_SLOTS) {
      if (canFillSlot(p.positions, slot.eligiblePositions)) eligibleSlots++;
    }
    return { ...p, eligibleSlots };
  });
  
  playersWithEligibility.sort((a, b) => a.eligibleSlots - b.eligibleSlots);
  
  const usedSlots = new Set<string>();
  const usedPlayers = new Set<string>();
  let startsUsed = 0;
  
  for (const playerInfo of playersWithEligibility) {
    if (usedPlayers.has(playerInfo.player.id)) continue;
    
    for (const slotDef of STANDARD_LINEUP_SLOTS) {
      if (usedSlots.has(slotDef.slot)) continue;
      
      if (canFillSlot(playerInfo.positions, slotDef.eligiblePositions)) {
        startsUsed += playerInfo.injuryMult;
        usedSlots.add(slotDef.slot);
        usedPlayers.add(playerInfo.player.id);
        
        // Mark player as started in details
        const detail = playerDetails.find(d => d.name === playerInfo.player.name);
        if (detail) detail.started = true;
        
        break;
      }
    }
  }
  
  const playersWithGameCount = playersWithGames.length;
  const overflow = Math.max(0, playersWithGameCount - dailyActiveSlots);
  const unusedSlots = Math.max(0, dailyActiveSlots - Math.ceil(startsUsed));
  
  return {
    date: '', // Will be set by caller
    playersWithGame: playersWithGameCount,
    startsUsed: Math.round(startsUsed * 10) / 10,
    overflow,
    unusedSlots: playersWithGameCount < dailyActiveSlots ? unusedSlots : 0,
    missingTeamIdCount,
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
  
  for (const dateStr of futureDates) {
    const games = gamesByDate.get(dateStr) || [];
    const dayResult = calculateDayStartsUnified(
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
  }
  
  const maxPossibleStarts = dailyActiveSlots * futureDates.length;
  
  return {
    projectedStarts: Math.round(totalProjectedStarts * 10) / 10,
    maxPossibleStarts,
    unusedStarts: Math.round((maxPossibleStarts - totalProjectedStarts) * 10) / 10,
    overflowGames: totalOverflow,
    daysRemaining: futureDates.length,
    perDay,
  };
}
