/**
 * useMatchupModel - Shared computed model for the 4-card Matchup view
 * 
 * This hook computes all matchup projections ONCE and provides them to:
 * 1. Baseline (X40) card
 * 2. Schedule-Aware (Current → Final) card
 * 3. Today Impact (Current → After Today → Final) card
 * 4. Pace vs Baseline (X40) card
 * 
 * Critical rules:
 * A) Today detection: hasGameToday = (opp field is not "--") AND has game time
 * B) "After today" uses optimized lineup for today only
 * C) Baseline x40 uses roster-wide average (all non-IR players)
 * D) Schedule-aware = current + remaining projection (integer starts only)
 */

import { useMemo } from "react";
import { RosterSlot, Player } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { TeamTotalsWithPct } from "@/lib/teamTotals";
import {
  computeRestOfWeekStarts,
  RestOfWeekResult,
  getTodayDateStr,
  categorizeDates,
  DayStartsBreakdown,
} from "@/lib/restOfWeekUtils";
import {
  normalizeNbaTeamCode,
  STANDARD_LINEUP_SLOTS,
  ProjectedStats,
} from "@/lib/scheduleAwareProjection";

// ============================================================================
// TYPES
// ============================================================================

export interface BaselineStats {
  // Per-game averages (used to compute x40)
  fgm: number;
  fga: number;
  fgPct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
  // Player count used for baseline
  playerCount: number;
}

export interface MatchupModelResult {
  // Baseline (X40) - roster-average × 40
  myBaseline: BaselineStats | null;
  oppBaseline: BaselineStats | null;
  
  // Current totals (from weekly scoreboard)
  myCurrentTotals: TeamTotalsWithPct | null;
  oppCurrentTotals: TeamTotalsWithPct | null;
  
  // Schedule-aware
  myRemainingStarts: number;
  oppRemainingStarts: number;
  myRemainingProjection: ProjectedStats | null;
  oppRemainingProjection: ProjectedStats | null;
  myFinalProjection: TeamTotalsWithPct | null;
  oppFinalProjection: TeamTotalsWithPct | null;
  remainingDays: number;
  
  // Today impact
  myTodayStarts: number;
  oppTodayStarts: number;
  myTodayProjection: ProjectedStats | null;
  oppTodayProjection: ProjectedStats | null;
  myAfterTodayProjection: TeamTotalsWithPct | null;
  oppAfterTodayProjection: TeamTotalsWithPct | null;
  
  // Pace (current rate × 40)
  myPaceStats: BaselineStats | null;
  oppPaceStats: BaselineStats | null;
  myStartsSoFar: number;
  oppStartsSoFar: number;
  
  // Rest of week breakdown
  myRestOfWeek: RestOfWeekResult | null;
  oppRestOfWeek: RestOfWeekResult | null;
  
  // Debug info
  matchupDates: string[];
  todayDate: string;
  hasTodayGames: boolean;
}

export interface UseMatchupModelParams {
  myRoster: RosterSlot[];
  oppRoster: RosterSlot[];
  myCurrentTotals: TeamTotalsWithPct | null;
  oppCurrentTotals: TeamTotalsWithPct | null;
  matchupDates: string[];
  gamesByDate: Map<string, NBAGame[]>;
}

// ============================================================================
// HELPER: hasGameToday - CRITICAL FIX
// ============================================================================

/**
 * Determines if a player has a game TODAY based on opponent field.
 * 
 * CRITICAL: Do NOT rely on lineup slot. A player can be in a starting slot
 * but have opp = "--" (no game today). They should NOT count as a start.
 * 
 * Rule:
 * hasGameToday = (opp field is not "--" or empty) AND (game time exists OR opponent code exists)
 */
export function playerHasGameToday(player: Player, todayGames: NBAGame[]): boolean {
  // Method 1: Check player.opponent field (ESPN provides this)
  const opp = (player.opponent || "").trim();
  
  // If opponent is "--" or empty, no game today
  if (!opp || opp === "--") {
    // Fallback: check NBA schedule directly
    const normalizedTeam = normalizeNbaTeamCode(player.nbaTeam);
    if (!normalizedTeam || todayGames.length === 0) return false;
    
    return todayGames.some(
      (g) => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam
    );
  }
  
  // Has a valid opponent string - check for game patterns
  const hasGamePattern = /^@?[A-Za-z]{2,4}/.test(opp) || /\d{1,2}:\d{2}/.test(opp);
  return hasGamePattern;
}

/**
 * Filters roster to only players with games today (non-IR).
 */
export function getPlayersWithGamesToday(
  roster: RosterSlot[],
  todayGames: NBAGame[]
): RosterSlot[] {
  return roster.filter((slot) => {
    // Exclude IR players
    if (slot.slotType === "ir") return false;
    
    return playerHasGameToday(slot.player, todayGames);
  });
}

// ============================================================================
// BASELINE CALCULATION - roster-wide average
// ============================================================================

/**
 * Computes baseline per-game stats from the entire roster (excluding IR).
 * Uses minutes-weighted averages for counting stats.
 * Uses makes/attempts ratio for percentages.
 */
export function computeBaselineStats(roster: RosterSlot[]): BaselineStats | null {
  // Filter to non-IR players only
  const activePlayers = roster.filter((slot) => slot.slotType !== "ir");
  
  if (activePlayers.length === 0) return null;
  
  let totalMinutes = 0;
  let totalFGM = 0, totalFGA = 0;
  let totalFTM = 0, totalFTA = 0;
  let total3PM = 0;
  let totalREB = 0, totalAST = 0, totalSTL = 0, totalBLK = 0, totalTO = 0, totalPTS = 0;
  
  for (const slot of activePlayers) {
    const p = slot.player;
    const min = p.minutes || 0;
    
    // Weight by minutes for per-game calculation
    totalMinutes += min;
    
    // Accumulate makes/attempts (per game)
    totalFGM += p.fgm || 0;
    totalFGA += p.fga || 0;
    totalFTM += p.ftm || 0;
    totalFTA += p.fta || 0;
    
    // Counting stats (per game)
    total3PM += p.threepm || 0;
    totalREB += p.rebounds || 0;
    totalAST += p.assists || 0;
    totalSTL += p.steals || 0;
    totalBLK += p.blocks || 0;
    totalTO += p.turnovers || 0;
    totalPTS += p.points || 0;
  }
  
  const n = activePlayers.length;
  
  // Per-game average across roster (simple average, each player = 1 game)
  const fgm = totalFGM / n;
  const fga = totalFGA / n;
  const ftm = totalFTM / n;
  const fta = totalFTA / n;
  
  // Percentages from makes/attempts
  const fgPct = fga > 0 ? fgm / fga : 0;
  const ftPct = fta > 0 ? ftm / fta : 0;
  
  return {
    fgm,
    fga,
    fgPct,
    ftm,
    fta,
    ftPct,
    threepm: total3PM / n,
    rebounds: totalREB / n,
    assists: totalAST / n,
    steals: totalSTL / n,
    blocks: totalBLK / n,
    turnovers: totalTO / n,
    points: totalPTS / n,
    playerCount: n,
  };
}

/**
 * Converts per-game baseline to X40 projection.
 * Counting stats are multiplied by 40.
 * Percentages remain as-is.
 */
export function baselineToX40(baseline: BaselineStats): TeamTotalsWithPct {
  return {
    fgm: baseline.fgm * 40,
    fga: baseline.fga * 40,
    fgPct: baseline.fgPct,
    ftm: baseline.ftm * 40,
    fta: baseline.fta * 40,
    ftPct: baseline.ftPct,
    threepm: baseline.threepm * 40,
    rebounds: baseline.rebounds * 40,
    assists: baseline.assists * 40,
    steals: baseline.steals * 40,
    blocks: baseline.blocks * 40,
    turnovers: baseline.turnovers * 40,
    points: baseline.points * 40,
  };
}

// ============================================================================
// PROJECTION CALCULATION
// ============================================================================

/**
 * Projects stats for a set of starts using roster-average per-start line.
 */
export function projectFromStarts(
  baseline: BaselineStats,
  starts: number
): ProjectedStats {
  return {
    fgm: baseline.fgm * starts,
    fga: baseline.fga * starts,
    fgPct: baseline.fgPct, // Keep percentage as-is
    ftm: baseline.ftm * starts,
    fta: baseline.fta * starts,
    ftPct: baseline.ftPct, // Keep percentage as-is
    threepm: baseline.threepm * starts,
    rebounds: baseline.rebounds * starts,
    assists: baseline.assists * starts,
    steals: baseline.steals * starts,
    blocks: baseline.blocks * starts,
    turnovers: baseline.turnovers * starts,
    points: baseline.points * starts,
  };
}

/**
 * Adds projection to current totals.
 */
export function addToTotals(
  current: TeamTotalsWithPct | null,
  projection: ProjectedStats | null
): TeamTotalsWithPct | null {
  if (!current) return projection ? projectionToTotals(projection) : null;
  if (!projection) return current;
  
  const fgm = (current.fgm || 0) + projection.fgm;
  const fga = (current.fga || 0) + projection.fga;
  const ftm = (current.ftm || 0) + projection.ftm;
  const fta = (current.fta || 0) + projection.fta;
  
  return {
    fgm,
    fga,
    fgPct: fga > 0 ? fgm / fga : 0,
    ftm,
    fta,
    ftPct: fta > 0 ? ftm / fta : 0,
    threepm: (current.threepm || 0) + projection.threepm,
    rebounds: (current.rebounds || 0) + projection.rebounds,
    assists: (current.assists || 0) + projection.assists,
    steals: (current.steals || 0) + projection.steals,
    blocks: (current.blocks || 0) + projection.blocks,
    turnovers: (current.turnovers || 0) + projection.turnovers,
    points: (current.points || 0) + projection.points,
  };
}

function projectionToTotals(proj: ProjectedStats): TeamTotalsWithPct {
  return {
    fgm: proj.fgm,
    fga: proj.fga,
    fgPct: proj.fgPct,
    ftm: proj.ftm,
    fta: proj.fta,
    ftPct: proj.ftPct,
    threepm: proj.threepm,
    rebounds: proj.rebounds,
    assists: proj.assists,
    steals: proj.steals,
    blocks: proj.blocks,
    turnovers: proj.turnovers,
    points: proj.points,
  };
}

// ============================================================================
// PACE CALCULATION
// ============================================================================

/**
 * Computes "pace" - what the rate of production would project to X40.
 * pace_stat = (current_total / starts_so_far) * 40
 */
export function computePaceStats(
  currentTotals: TeamTotalsWithPct | null,
  startsSoFar: number
): BaselineStats | null {
  if (!currentTotals || startsSoFar <= 0) return null;
  
  const scale = 40 / startsSoFar;
  
  // For counting stats, scale up
  const fgm = (currentTotals.fgm || 0) * scale;
  const fga = (currentTotals.fga || 0) * scale;
  const ftm = (currentTotals.ftm || 0) * scale;
  const fta = (currentTotals.fta || 0) * scale;
  
  return {
    fgm,
    fga,
    fgPct: fga > 0 ? fgm / fga : 0,
    ftm,
    fta,
    ftPct: fta > 0 ? ftm / fta : 0,
    threepm: (currentTotals.threepm || 0) * scale,
    rebounds: (currentTotals.rebounds || 0) * scale,
    assists: (currentTotals.assists || 0) * scale,
    steals: (currentTotals.steals || 0) * scale,
    blocks: (currentTotals.blocks || 0) * scale,
    turnovers: (currentTotals.turnovers || 0) * scale,
    points: (currentTotals.points || 0) * scale,
    playerCount: 0, // Not applicable for pace
  };
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useMatchupModel({
  myRoster,
  oppRoster,
  myCurrentTotals,
  oppCurrentTotals,
  matchupDates,
  gamesByDate,
}: UseMatchupModelParams): MatchupModelResult {
  return useMemo(() => {
    const todayDate = getTodayDateStr();
    const todayGames = gamesByDate.get(todayDate) || [];
    const hasTodayGames = todayGames.length > 0;
    
    // ========================================
    // 1. BASELINE (X40) - roster-wide average
    // ========================================
    const myBaseline = computeBaselineStats(myRoster);
    const oppBaseline = computeBaselineStats(oppRoster);
    
    // ========================================
    // 2. REST OF WEEK OPTIMIZATION
    // ========================================
    const myRestOfWeek = myRoster.length > 0 
      ? computeRestOfWeekStarts({
          rosterPlayers: myRoster,
          matchupDates,
          gamesByDate,
          lineupSlots: STANDARD_LINEUP_SLOTS,
        })
      : null;
      
    const oppRestOfWeek = oppRoster.length > 0
      ? computeRestOfWeekStarts({
          rosterPlayers: oppRoster,
          matchupDates,
          gamesByDate,
          lineupSlots: STANDARD_LINEUP_SLOTS,
        })
      : null;
    
    // ========================================
    // 3. TODAY IMPACT
    // ========================================
    // Get today's breakdown from rest of week
    const myTodayBreakdown = myRestOfWeek?.allPerDay.find(d => d.date === todayDate);
    const oppTodayBreakdown = oppRestOfWeek?.allPerDay.find(d => d.date === todayDate);
    
    const myTodayStarts = myTodayBreakdown?.startsUsed ?? 0;
    const oppTodayStarts = oppTodayBreakdown?.startsUsed ?? 0;
    
    // Project today's contribution
    const myTodayProjection = myBaseline && myTodayStarts > 0
      ? projectFromStarts(myBaseline, myTodayStarts)
      : null;
    const oppTodayProjection = oppBaseline && oppTodayStarts > 0
      ? projectFromStarts(oppBaseline, oppTodayStarts)
      : null;
    
    // After today = current + today projection
    const myAfterTodayProjection = addToTotals(myCurrentTotals, myTodayProjection);
    const oppAfterTodayProjection = addToTotals(oppCurrentTotals, oppTodayProjection);
    
    // ========================================
    // 4. SCHEDULE-AWARE (REMAINING)
    // ========================================
    const myRemainingStarts = myRestOfWeek?.remainingStarts ?? 0;
    const oppRemainingStarts = oppRestOfWeek?.remainingStarts ?? 0;
    const remainingDays = myRestOfWeek?.remainingDays ?? 0;
    
    // Project remaining contribution
    const myRemainingProjection = myBaseline && myRemainingStarts > 0
      ? projectFromStarts(myBaseline, myRemainingStarts)
      : null;
    const oppRemainingProjection = oppBaseline && oppRemainingStarts > 0
      ? projectFromStarts(oppBaseline, oppRemainingStarts)
      : null;
    
    // Final = current + remaining
    const myFinalProjection = addToTotals(myCurrentTotals, myRemainingProjection);
    const oppFinalProjection = addToTotals(oppCurrentTotals, oppRemainingProjection);
    
    // ========================================
    // 5. PACE vs BASELINE
    // ========================================
    // Starts so far = elapsed starts from rest of week
    const myStartsSoFar = myRestOfWeek?.elapsedStarts ?? 0;
    const oppStartsSoFar = oppRestOfWeek?.elapsedStarts ?? 0;
    
    const myPaceStats = computePaceStats(myCurrentTotals, myStartsSoFar);
    const oppPaceStats = computePaceStats(oppCurrentTotals, oppStartsSoFar);
    
    return {
      // Baseline
      myBaseline,
      oppBaseline,
      
      // Current totals (passed through)
      myCurrentTotals,
      oppCurrentTotals,
      
      // Schedule-aware
      myRemainingStarts,
      oppRemainingStarts,
      myRemainingProjection,
      oppRemainingProjection,
      myFinalProjection,
      oppFinalProjection,
      remainingDays,
      
      // Today impact
      myTodayStarts,
      oppTodayStarts,
      myTodayProjection,
      oppTodayProjection,
      myAfterTodayProjection,
      oppAfterTodayProjection,
      
      // Pace
      myPaceStats,
      oppPaceStats,
      myStartsSoFar,
      oppStartsSoFar,
      
      // Rest of week
      myRestOfWeek,
      oppRestOfWeek,
      
      // Debug
      matchupDates,
      todayDate,
      hasTodayGames,
    };
  }, [myRoster, oppRoster, myCurrentTotals, oppCurrentTotals, matchupDates, gamesByDate]);
}
