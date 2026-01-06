/**
 * Slate-Aware Projection Engine
 * 
 * Handles live slate awareness to prevent double-counting:
 * - Tracks game statuses (NOT_STARTED, IN_PROGRESS, FINAL)
 * - Only includes NOT_STARTED games in remaining projection
 * - Provides slate status info for UI display
 */

import { RosterSlot, Player } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { devLog, devWarn } from "@/lib/devLog";
import { 
  normalizeNbaTeamCode, 
  getInjuryMultiplier, 
  fillLineupsForDay,
  getBlendedPerGameStats,
  STANDARD_LINEUP_SLOTS,
  ProjectedStats,
  PlayerProjection,
  WeekProjectionResult,
  ProjectionValidation,
  ProjectionError,
} from "@/lib/scheduleAwareProjection";

// ============================================================================
// GAME STATUS TYPES
// ============================================================================

export type GameStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'FINAL';

export interface GameStatusInfo {
  gameId: string;
  status: GameStatus;
  startTime?: string;
  homeTeam: string;
  awayTeam: string;
}

export interface SlateStatus {
  notStarted: number;
  inProgress: number;
  final: number;
  totalGames: number;
  asOfTime: string;
  todayHasStartedGames: boolean;
  allTodayGamesComplete: boolean;
}

export interface PlayerGameStatus {
  playerId: string;
  playerName: string;
  nbaTeam: string;
  date: string;
  gameId: string;
  status: GameStatus;
  startTime?: string;
}

// ============================================================================
// GAME STATUS PARSING
// ============================================================================

/**
 * Parse game status from ESPN API status string
 */
export function parseGameStatus(espnStatus: string): GameStatus {
  if (!espnStatus) return 'NOT_STARTED';
  
  const s = espnStatus.toLowerCase();
  
  // Final states
  if (s === 'final' || s.includes('final')) return 'FINAL';
  
  // In progress states
  if (s === 'in progress' || s.includes('qtr') || s === 'halftime' || 
      s.includes('1st') || s.includes('2nd') || s.includes('3rd') || s.includes('4th') ||
      s.includes('ot') || s.includes('overtime')) {
    return 'IN_PROGRESS';
  }
  
  // Default to not started
  return 'NOT_STARTED';
}

/**
 * Build slate status from games for a specific date
 */
export function buildSlateStatus(games: NBAGame[], dateStr: string): SlateStatus {
  let notStarted = 0;
  let inProgress = 0;
  let final = 0;
  
  for (const game of games) {
    const status = parseGameStatus(game.status);
    if (status === 'NOT_STARTED') notStarted++;
    else if (status === 'IN_PROGRESS') inProgress++;
    else if (status === 'FINAL') final++;
  }
  
  const now = new Date();
  const asOfTime = now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone: 'America/New_York'
  }) + ' ET';
  
  return {
    notStarted,
    inProgress,
    final,
    totalGames: games.length,
    asOfTime,
    todayHasStartedGames: inProgress > 0 || final > 0,
    allTodayGamesComplete: games.length > 0 && notStarted === 0 && inProgress === 0,
  };
}

/**
 * Build player game map for slate awareness
 * Maps: playerId -> array of { date, gameId, status }
 */
export function buildPlayerGameMap(
  roster: RosterSlot[],
  gamesByDate: Map<string, NBAGame[]>
): Map<string, PlayerGameStatus[]> {
  const playerGameMap = new Map<string, PlayerGameStatus[]>();
  
  for (const slot of roster) {
    if (slot.slotType === 'ir') continue;
    
    const player = slot.player;
    const teamCode = normalizeNbaTeamCode(player.nbaTeam);
    if (!teamCode) continue;
    
    const playerGames: PlayerGameStatus[] = [];
    
    gamesByDate.forEach((games, date) => {
      const game = games.find(g => g.homeTeam === teamCode || g.awayTeam === teamCode);
      if (game) {
        playerGames.push({
          playerId: player.id,
          playerName: player.name,
          nbaTeam: teamCode,
          date,
          gameId: game.gameId,
          status: parseGameStatus(game.status),
          startTime: game.gameTime,
        });
      }
    });
    
    if (playerGames.length > 0) {
      playerGameMap.set(player.id, playerGames);
    }
  }
  
  return playerGameMap;
}

/**
 * Filter to only NOT_STARTED games (for remaining projection)
 */
export function filterNotStartedGames(
  playerGameMap: Map<string, PlayerGameStatus[]>
): Map<string, PlayerGameStatus[]> {
  const filtered = new Map<string, PlayerGameStatus[]>();
  
  playerGameMap.forEach((games, playerId) => {
    const notStarted = games.filter(g => g.status === 'NOT_STARTED');
    if (notStarted.length > 0) {
      filtered.set(playerId, notStarted);
    }
  });
  
  return filtered;
}

// ============================================================================
// SLATE-AWARE PROJECTION
// ============================================================================

export interface SlateAwareProjectionInput {
  roster: RosterSlot[];
  gamesByDate: Map<string, NBAGame[]>;
  weekDates: string[];
}

export interface SlateAwareProjectionResult {
  projection: WeekProjectionResult;
  slateStatus: SlateStatus;
  todayDate: string;
  statsByDate: Map<string, ProjectedStats>;  // Per-day breakdown
  excludedStartedGames: number;
  includedNotStartedGames: number;
}

/**
 * Project remaining week totals, excluding games that have already started.
 * 
 * Core rule: Only include player-games with status == NOT_STARTED
 * This prevents double-counting since started games are in CurrentTotals.
 */
export function projectSlateAware(
  input: SlateAwareProjectionInput
): SlateAwareProjectionResult {
  const { roster, gamesByDate, weekDates } = input;
  
  // Get today's date
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // Build slate status for today
  const todayGames = gamesByDate.get(todayStr) || [];
  const slateStatus = buildSlateStatus(todayGames, todayStr);
  
  devLog('[projectSlateAware] Slate status:', slateStatus);
  
  // Build player game map
  const playerGameMap = buildPlayerGameMap(roster, gamesByDate);
  
  // Count started vs not-started
  let excludedStartedGames = 0;
  let includedNotStartedGames = 0;
  
  playerGameMap.forEach((games) => {
    for (const g of games) {
      if (g.status === 'NOT_STARTED') {
        includedNotStartedGames++;
      } else {
        excludedStartedGames++;
      }
    }
  });
  
  devLog('[projectSlateAware] Games:', { excluded: excludedStartedGames, included: includedNotStartedGames });
  
  // Process each day, only counting NOT_STARTED games
  const playerGameCounts = new Map<string, { started: number; benched: number; scheduled: number; injuryMultiplier: number }>();
  const playerStartedByDate = new Map<string, Map<string, number>>(); // date -> playerId -> games started
  let totalEmptySlotDays = 0;
  let totalEmptySlotMissedGames = 0; // Sum of unfilled slots across all days
  
  // Initialize player game counts with injury multipliers
  for (const slot of roster) {
    if (slot.slotType === 'ir') continue;
    playerGameCounts.set(slot.player.id, { 
      started: 0, 
      benched: 0, 
      scheduled: 0,
      injuryMultiplier: getInjuryMultiplier(slot.player.status)
    });
  }
  
  for (const date of weekDates) {
    const games = gamesByDate.get(date) || [];
    
    // Find players with NOT_STARTED games today
    const playersWithNotStartedGames = roster
      .filter(slot => {
        if (slot.slotType === 'ir') return false;
        const teamCode = normalizeNbaTeamCode(slot.player.nbaTeam);
        if (!teamCode) return false;
        
        const game = games.find(g => g.homeTeam === teamCode || g.awayTeam === teamCode);
        if (!game) return false;
        
        // Only include if game hasn't started
        const status = parseGameStatus(game.status);
        return status === 'NOT_STARTED';
      })
      .map(slot => ({
        playerId: slot.player.id,
        positions: slot.player.positions || [],
        injuryMultiplier: getInjuryMultiplier(slot.player.status),
      }));
    
    // Update scheduled counts (only for NOT_STARTED)
    for (const p of playersWithNotStartedGames) {
      const counts = playerGameCounts.get(p.playerId);
      if (counts) counts.scheduled++;
    }
    
    // Fill lineup slots for this day
    const startedToday = fillLineupsForDay(playersWithNotStartedGames, STANDARD_LINEUP_SLOTS);
    
    // Store per-date started info
    playerStartedByDate.set(date, startedToday);
    
    // Check for empty slots and track missed games
    const unfilledSlots = STANDARD_LINEUP_SLOTS.length - startedToday.size;
    if (unfilledSlots > 0) {
      totalEmptySlotDays++;
      totalEmptySlotMissedGames += unfilledSlots;
    }
    
    // Update player started/benched counts
    for (const p of playersWithNotStartedGames) {
      const counts = playerGameCounts.get(p.playerId);
      if (!counts) continue;
      
      const startedValue = startedToday.get(p.playerId) || 0;
      if (startedValue > 0) {
        counts.started += startedValue;
      } else {
        counts.benched += 1;
      }
    }
  }
  
  // Build player projections and sum totals
  const playerProjections: PlayerProjection[] = [];
  let totalFGM = 0, totalFGA = 0, totalFTM = 0, totalFTA = 0;
  let totalThreepm = 0, totalRebounds = 0, totalAssists = 0;
  let totalSteals = 0, totalBlocks = 0, totalTurnovers = 0, totalPoints = 0;
  let totalStartedGames = 0;
  let totalPossibleGames = 0; // Sum of scheduled games × injury multiplier
  let totalBenchOverflow = 0;
  const warnings: string[] = [];
  
  // Per-date stats accumulation
  const statsByDate = new Map<string, ProjectedStats>();
  
  // Initialize per-date accumulators
  for (const date of weekDates) {
    statsByDate.set(date, {
      fgm: 0, fga: 0, fgPct: 0,
      ftm: 0, fta: 0, ftPct: 0,
      threepm: 0, rebounds: 0, assists: 0,
      steals: 0, blocks: 0, turnovers: 0, points: 0,
    });
  }
  
  for (const slot of roster) {
    if (slot.slotType === 'ir') continue;
    
    const player = slot.player;
    const counts = playerGameCounts.get(player.id) || { started: 0, benched: 0, scheduled: 0, injuryMultiplier: 1 };
    const injuryMultiplier = counts.injuryMultiplier;
    
    // Add to totalPossibleGames (scheduled games × injury multiplier, before slot constraints)
    totalPossibleGames += counts.scheduled * injuryMultiplier;
    
    // Get blended per-game stats
    const gamesPlayed = player.gamesPlayed || 10;
    const { stats: perGameStats, usedShrinkage } = getBlendedPerGameStats(player, gamesPlayed);
    
    const expectedGames = counts.started;
    
    const projectedStats: ProjectedStats = {
      fgm: perGameStats.fgm * expectedGames,
      fga: perGameStats.fga * expectedGames,
      fgPct: 0,
      ftm: perGameStats.ftm * expectedGames,
      fta: perGameStats.fta * expectedGames,
      ftPct: 0,
      threepm: perGameStats.threepm * expectedGames,
      rebounds: perGameStats.rebounds * expectedGames,
      assists: perGameStats.assists * expectedGames,
      steals: perGameStats.steals * expectedGames,
      blocks: perGameStats.blocks * expectedGames,
      turnovers: perGameStats.turnovers * expectedGames,
      points: perGameStats.points * expectedGames,
    };
    
    // Add to totals
    totalFGM += projectedStats.fgm;
    totalFGA += projectedStats.fga;
    totalFTM += projectedStats.ftm;
    totalFTA += projectedStats.fta;
    totalThreepm += projectedStats.threepm;
    totalRebounds += projectedStats.rebounds;
    totalAssists += projectedStats.assists;
    totalSteals += projectedStats.steals;
    totalBlocks += projectedStats.blocks;
    totalTurnovers += projectedStats.turnovers;
    totalPoints += projectedStats.points;
    totalStartedGames += counts.started;
    totalBenchOverflow += counts.benched;
    
    // Accumulate per-date stats
    for (const date of weekDates) {
      const startedOnDate = playerStartedByDate.get(date)?.get(player.id) || 0;
      if (startedOnDate > 0) {
        const dateStats = statsByDate.get(date)!;
        dateStats.fgm += perGameStats.fgm * startedOnDate;
        dateStats.fga += perGameStats.fga * startedOnDate;
        dateStats.ftm += perGameStats.ftm * startedOnDate;
        dateStats.fta += perGameStats.fta * startedOnDate;
        dateStats.threepm += perGameStats.threepm * startedOnDate;
        dateStats.rebounds += perGameStats.rebounds * startedOnDate;
        dateStats.assists += perGameStats.assists * startedOnDate;
        dateStats.steals += perGameStats.steals * startedOnDate;
        dateStats.blocks += perGameStats.blocks * startedOnDate;
        dateStats.turnovers += perGameStats.turnovers * startedOnDate;
        dateStats.points += perGameStats.points * startedOnDate;
      }
    }
    
    playerProjections.push({
      playerId: player.id,
      playerName: player.name,
      nbaTeam: normalizeNbaTeamCode(player.nbaTeam) ?? player.nbaTeam,
      positions: player.positions || [],
      status: player.status || 'healthy',
      injuryMultiplier,
      scheduledGames: counts.scheduled,
      expectedStartedGames: counts.started,
      benchedGames: counts.benched,
      projectedStats,
      usedShrinkage,
    });
    
    if (usedShrinkage) {
      warnings.push(`${player.name}: Using blended stats (limited sample)`);
    }
  }
  
  // Compute derived percentages for per-date stats
  for (const [date, stats] of statsByDate) {
    stats.fgPct = stats.fga > 0 ? stats.fgm / stats.fga : 0;
    stats.ftPct = stats.fta > 0 ? stats.ftm / stats.fta : 0;
  }
  
  // Compute final percentages
  const totalStats: ProjectedStats = {
    fgm: totalFGM,
    fga: totalFGA,
    fgPct: totalFGA > 0 ? totalFGM / totalFGA : 0,
    ftm: totalFTM,
    fta: totalFTA,
    ftPct: totalFTA > 0 ? totalFTM / totalFTA : 0,
    threepm: totalThreepm,
    rebounds: totalRebounds,
    assists: totalAssists,
    steals: totalSteals,
    blocks: totalBlocks,
    turnovers: totalTurnovers,
    points: totalPoints,
  };
  
  // Add warning if we excluded started games
  if (excludedStartedGames > 0) {
    warnings.push(`Excluded ${excludedStartedGames} started/completed games from remaining projection`);
  }
  
  return {
    projection: {
      totalStats,
      totalStartedGames,
      totalBenchOverflow,
      totalPossibleGames,
      emptySlotMissedGames: totalEmptySlotMissedGames,
      playerProjections,
      emptySlotDays: totalEmptySlotDays,
      warnings,
    },
    slateStatus,
    todayDate: todayStr,
    statsByDate,
    excludedStartedGames,
    includedNotStartedGames,
  };
}

/**
 * Get a human-readable explanation of the projection data sources
 */
export function getProjectionExplanation(slateStatus: SlateStatus): string {
  if (!slateStatus.todayHasStartedGames) {
    return "Current includes through yesterday; Remaining includes today and future games.";
  }
  
  if (slateStatus.allTodayGamesComplete) {
    return "Current includes today (all games complete); Remaining includes future days only.";
  }
  
  return `Current includes live games already started; Remaining includes only games that have not started (${slateStatus.notStarted} games).`;
}
