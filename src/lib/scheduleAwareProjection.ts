/**
 * Schedule-Aware Projection Engine
 * 
 * Projects weekly fantasy totals based on:
 * - Each player's scheduled games for the matchup week
 * - Lineup slot constraints (PG/SG/SF/PF/C/G/F/C UTIL)
 * - Injury status multipliers (O/IR = 0, DTD = 0.6)
 * - Shrinkage blending for partial/missing stats
 */

import { RosterSlot, Player } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { devLog, devWarn } from "@/lib/devLog";

// ============================================================================
// TYPES
// ============================================================================

export interface ProjectedStats {
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
}

export interface PlayerProjection {
  playerId: string;
  playerName: string;
  nbaTeam: string;
  positions: string[];
  status: string;
  injuryMultiplier: number;
  scheduledGames: number;      // Games this week where team plays
  expectedStartedGames: number; // After lineup slot constraints & injury multiplier
  benchedGames: number;         // Games player couldn't start (slot overflow)
  projectedStats: ProjectedStats;
  usedShrinkage: boolean;       // True if shrinkage blend was applied
}

export interface WeekProjectionResult {
  totalStats: ProjectedStats;
  totalStartedGames: number;
  totalBenchOverflow: number;
  playerProjections: PlayerProjection[];
  emptySlotDays: number;        // Days where we had fewer players than slots
  warnings: string[];
}

export interface LineupSlotConfig {
  slot: string;
  eligiblePositions: string[]; // e.g., ['PG'] for PG slot, ['PG', 'SG'] for G slot
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Standard 8-slot fantasy lineup
export const STANDARD_LINEUP_SLOTS: LineupSlotConfig[] = [
  { slot: 'PG', eligiblePositions: ['PG'] },
  { slot: 'SG', eligiblePositions: ['SG'] },
  { slot: 'SF', eligiblePositions: ['SF'] },
  { slot: 'PF', eligiblePositions: ['PF'] },
  { slot: 'C', eligiblePositions: ['C'] },
  { slot: 'G', eligiblePositions: ['PG', 'SG'] },
  { slot: 'F', eligiblePositions: ['SF', 'PF'] },
  { slot: 'UTIL', eligiblePositions: ['PG', 'SG', 'SF', 'PF', 'C'] },
];

// Shrinkage constant K (higher = more conservative, blend toward fallback)
const SHRINKAGE_K = 10;

// League average stats per game by position (fallback for missing data)
const POSITION_AVERAGES: Record<string, Partial<ProjectedStats>> = {
  PG: { points: 14.5, rebounds: 3.5, assists: 6.0, steals: 1.2, blocks: 0.3, threepm: 2.0, turnovers: 2.5, fgPct: 0.44, ftPct: 0.82, fga: 12, fgm: 5.3, fta: 3.5, ftm: 2.9 },
  SG: { points: 15.0, rebounds: 3.8, assists: 3.5, steals: 1.0, blocks: 0.4, threepm: 2.2, turnovers: 2.0, fgPct: 0.45, ftPct: 0.80, fga: 13, fgm: 5.9, fta: 3.0, ftm: 2.4 },
  SF: { points: 13.5, rebounds: 5.5, assists: 2.5, steals: 0.9, blocks: 0.5, threepm: 1.8, turnovers: 1.8, fgPct: 0.46, ftPct: 0.78, fga: 11, fgm: 5.1, fta: 2.8, ftm: 2.2 },
  PF: { points: 12.5, rebounds: 6.5, assists: 2.0, steals: 0.7, blocks: 0.8, threepm: 1.2, turnovers: 1.5, fgPct: 0.48, ftPct: 0.75, fga: 10, fgm: 4.8, fta: 2.5, ftm: 1.9 },
  C: { points: 11.0, rebounds: 8.0, assists: 1.5, steals: 0.5, blocks: 1.2, threepm: 0.5, turnovers: 1.5, fgPct: 0.55, ftPct: 0.70, fga: 8, fgm: 4.4, fta: 2.8, ftm: 2.0 },
};

const DEFAULT_AVERAGES: ProjectedStats = {
  points: 13.0, rebounds: 5.0, assists: 3.0, steals: 0.9, blocks: 0.6, 
  threepm: 1.5, turnovers: 1.8, fgPct: 0.46, ftPct: 0.77,
  fga: 11, fgm: 5.1, fta: 3.0, ftm: 2.3
};

// ============================================================================
// INJURY STATUS HANDLING
// ============================================================================

export function getInjuryMultiplier(status?: string): number {
  if (!status) return 1.0;
  const s = status.toUpperCase().trim();
  
  // Out / IR / Suspended = 0 games expected
  if (s === 'O' || s === 'OUT' || s === 'IR' || s === 'SUSP' || 
      s.includes('(O)') || s.includes('INJ (O)')) {
    return 0;
  }
  
  // Day-to-day = 60% expected games
  if (s === 'DTD' || s.includes('DTD')) {
    return 0.6;
  }
  
  // Questionable = 70%
  if (s === 'Q' || s === 'QUESTIONABLE') {
    return 0.7;
  }
  
  // Game-time decision / Probable = 85%
  if (s === 'GTD' || s === 'P' || s === 'PROBABLE') {
    return 0.85;
  }
  
  return 1.0;
}

export function getInjuryStatusLabel(multiplier: number): string {
  if (multiplier === 0) return 'OUT';
  if (multiplier <= 0.6) return 'DTD (60%)';
  if (multiplier <= 0.7) return 'Q (70%)';
  if (multiplier <= 0.85) return 'GTD (85%)';
  return 'Active';
}

// ============================================================================
// SCHEDULE UTILITIES
// ============================================================================

// ESPN (and some user inputs) sometimes use non-standard team codes.
// Our schedule feed uses standard 2–3 letter NBA abbreviations.
const TEAM_CODE_ALIASES: Record<string, string> = {
  UTAH: 'UTA',
  GS: 'GSW',
  NY: 'NYK',
  SA: 'SAS',
  NO: 'NOP',
};

export function normalizeNbaTeamCode(team?: string | null): string | null {
  if (!team) return null;

  const raw = team.toUpperCase().trim();
  if (!raw) return null;

  // Common case: already a clean abbreviation.
  if (/^[A-Z]{2,3}$/.test(raw)) return TEAM_CODE_ALIASES[raw] ?? raw;

  // Robust case: extract the first contiguous 2–4 letter block (handles "UTAH•", "UTAH ", etc.)
  const extracted = raw.match(/^[A-Z]{2,4}/)?.[0] ?? raw.match(/[A-Z]{2,4}/)?.[0];
  if (!extracted) return null;

  if (TEAM_CODE_ALIASES[extracted]) return TEAM_CODE_ALIASES[extracted];
  if (/^[A-Z]{2,3}$/.test(extracted)) return extracted;

  return null;
}

/**
 * Get the number of games a team has in the given date range
 */
export function getTeamGamesInRange(
  teamCode: string,
  gamesByDate: Map<string, NBAGame[]>
): number {
  const upperTeam = normalizeNbaTeamCode(teamCode);
  if (!upperTeam) return 0;

  let count = 0;
  gamesByDate.forEach((games) => {
    if (games.some((g) => g.homeTeam === upperTeam || g.awayTeam === upperTeam)) {
      count++;
    }
  });

  return count;
}

/**
 * Get dates when a team plays
 */
export function getTeamGameDates(
  teamCode: string,
  gamesByDate: Map<string, NBAGame[]>
): string[] {
  const upperTeam = normalizeNbaTeamCode(teamCode);
  if (!upperTeam) return [];

  const dates: string[] = [];
  gamesByDate.forEach((games, date) => {
    if (games.some((g) => g.homeTeam === upperTeam || g.awayTeam === upperTeam)) {
      dates.push(date);
    }
  });

  return dates;
}

// ============================================================================
// SHRINKAGE BLENDING FOR PARTIAL STATS
// ============================================================================

/**
 * Apply shrinkage blend to handle partial/missing stats
 * perGame = w * observed + (1-w) * fallback
 * where w = gamesPlayed / (gamesPlayed + K)
 */
export function applyShrinkageBlend(
  observedValue: number | null | undefined,
  fallbackValue: number,
  gamesPlayed: number
): { value: number; usedShrinkage: boolean } {
  // If no observed value, use fallback
  if (observedValue === null || observedValue === undefined || isNaN(observedValue)) {
    return { value: fallbackValue, usedShrinkage: true };
  }
  
  // If we have a good sample (>= K games), trust the observed value
  if (gamesPlayed >= SHRINKAGE_K) {
    return { value: observedValue, usedShrinkage: false };
  }
  
  // Blend based on sample size
  const w = gamesPlayed / (gamesPlayed + SHRINKAGE_K);
  const blended = w * observedValue + (1 - w) * fallbackValue;
  
  return { value: blended, usedShrinkage: gamesPlayed < SHRINKAGE_K };
}

/**
 * Get fallback stats for a player based on their position
 */
function getPositionFallback(positions: string[]): ProjectedStats {
  // Use primary position, or average of eligible positions
  const primary = positions[0]?.toUpperCase();
  if (primary && POSITION_AVERAGES[primary]) {
    return { ...DEFAULT_AVERAGES, ...POSITION_AVERAGES[primary] };
  }
  return DEFAULT_AVERAGES;
}

/**
 * Get per-game stats with shrinkage blending for partial data
 */
export function getBlendedPerGameStats(
  player: Player,
  gamesPlayed: number = 10 // Default to assuming decent sample
): { stats: ProjectedStats; usedShrinkage: boolean } {
  const fallback = getPositionFallback(player.positions || []);
  let anyUsedShrinkage = false;

  // If we have "real" production but 0 shooting volume, that almost always means
  // the roster row had partial/misaligned shooting stats (e.g., '--' parsed as 0).
  // In that case, treat FGM/FGA/FTM/FTA as missing so shrinkage can fall back.
  const hasAnyProduction =
    (Number.isFinite(player.minutes) && player.minutes > 0) ||
    (Number.isFinite(player.points) && player.points > 0) ||
    (Number.isFinite(player.rebounds) && player.rebounds > 0) ||
    (Number.isFinite(player.assists) && player.assists > 0) ||
    (Number.isFinite(player.threepm) && player.threepm > 0);

  const missingFGVolume =
    hasAnyProduction &&
    (!Number.isFinite(player.fga) || player.fga <= 0) &&
    (!Number.isFinite(player.fgm) || player.fgm <= 0);

  const missingFTVolume =
    hasAnyProduction &&
    (!Number.isFinite(player.fta) || player.fta <= 0) &&
    (!Number.isFinite(player.ftm) || player.ftm <= 0);

  const blend = (observed: number | undefined, fallbackVal: number): number => {
    const result = applyShrinkageBlend(observed, fallbackVal, gamesPlayed);
    if (result.usedShrinkage) anyUsedShrinkage = true;
    return result.value;
  };

  const observedFgm = missingFGVolume ? undefined : player.fgm;
  const observedFga = missingFGVolume ? undefined : player.fga;
  const observedFgPct = missingFGVolume ? undefined : player.fgPct;

  const observedFtm = missingFTVolume ? undefined : player.ftm;
  const observedFta = missingFTVolume ? undefined : player.fta;
  const observedFtPct = missingFTVolume ? undefined : player.ftPct;

  return {
    stats: {
      fgm: blend(observedFgm, fallback.fgm),
      fga: blend(observedFga, fallback.fga),
      fgPct: blend(observedFgPct, fallback.fgPct),
      ftm: blend(observedFtm, fallback.ftm),
      fta: blend(observedFta, fallback.fta),
      ftPct: blend(observedFtPct, fallback.ftPct),
      threepm: blend(player.threepm, fallback.threepm),
      rebounds: blend(player.rebounds, fallback.rebounds),
      assists: blend(player.assists, fallback.assists),
      steals: blend(player.steals, fallback.steals),
      blocks: blend(player.blocks, fallback.blocks),
      turnovers: blend(player.turnovers, fallback.turnovers),
      points: blend(player.points, fallback.points),
    },
    usedShrinkage: anyUsedShrinkage,
  };
}

// ============================================================================
// LINEUP SLOT FILLING (GREEDY ALGORITHM)
// ============================================================================

interface PlayerWithPriority {
  playerId: string;
  positions: string[];
  eligibleSlots: number; // Fewer = more constrained = higher priority
}

/**
 * Fill lineup slots for a single day using greedy algorithm
 * Prioritizes players with fewer eligible positions (more constrained)
 */
export function fillLineupsForDay(
  availablePlayers: Array<{ playerId: string; positions: string[]; injuryMultiplier: number }>,
  lineupSlots: LineupSlotConfig[] = STANDARD_LINEUP_SLOTS
): Map<string, number> {
  // Map: playerId -> fractional games started (considering injury multiplier)
  const startedGames = new Map<string, number>();
  
  // Calculate eligibility for each player
  const playersWithPriority: PlayerWithPriority[] = availablePlayers
    .filter(p => p.injuryMultiplier > 0)
    .map(p => {
      let eligibleSlots = 0;
      for (const slot of lineupSlots) {
        if (p.positions.some(pos => slot.eligiblePositions.includes(pos.toUpperCase()))) {
          eligibleSlots++;
        }
      }
      return { playerId: p.playerId, positions: p.positions, eligibleSlots };
    })
    // Sort by eligibility (most constrained first)
    .sort((a, b) => a.eligibleSlots - b.eligibleSlots);
  
  const usedSlots = new Set<string>();
  const usedPlayers = new Set<string>();
  
  // Fill slots greedily
  for (const player of playersWithPriority) {
    if (usedPlayers.has(player.playerId)) continue;
    
    // Find first available slot this player is eligible for
    for (const slot of lineupSlots) {
      if (usedSlots.has(slot.slot)) continue;
      
      const isEligible = player.positions.some(pos => 
        slot.eligiblePositions.includes(pos.toUpperCase())
      );
      
      if (isEligible) {
        // Get the injury multiplier for this player
        const playerData = availablePlayers.find(p => p.playerId === player.playerId);
        const multiplier = playerData?.injuryMultiplier ?? 1.0;
        
        startedGames.set(player.playerId, multiplier);
        usedSlots.add(slot.slot);
        usedPlayers.add(player.playerId);
        break;
      }
    }
  }
  
  return startedGames;
}

// ============================================================================
// MAIN PROJECTION ENGINE
// ============================================================================

export interface ProjectWeekInput {
  roster: RosterSlot[];
  weekDates: string[];           // ['2026-01-06', '2026-01-07', ...]
  gamesByDate: Map<string, NBAGame[]>;
  lineupSlots?: LineupSlotConfig[];
}

/**
 * Project week totals for a fantasy team
 * 
 * Pure function that:
 * 1. For each date, filters players with a game that day
 * 2. Fills lineup slots using greedy algorithm (most constrained first)
 * 3. Applies injury multipliers to expected games
 * 4. Sums perGame stats × expectedStartedGames for each player
 * 5. Computes FG%/FT% via sum(makes)/sum(attempts)
 */
export function projectWeek(input: ProjectWeekInput): WeekProjectionResult {
  const { roster, weekDates, gamesByDate, lineupSlots = STANDARD_LINEUP_SLOTS } = input;
  
  devLog('[projectWeek] Starting projection for', weekDates.length, 'days');
  
  const warnings: string[] = [];
  const playerGameCounts = new Map<string, { started: number; benched: number; scheduled: number }>();
  let totalEmptySlotDays = 0;
  
  // Initialize player game counts
  for (const slot of roster) {
    if (slot.slotType === 'ir') continue; // Skip IR players
    playerGameCounts.set(slot.player.id, { started: 0, benched: 0, scheduled: 0 });
  }
  
  // Process each day
  for (const date of weekDates) {
    const games = gamesByDate.get(date) || [];
    
    // Find players with games today (excluding IR)
    const playersWithGamesToday = roster
      .filter(slot => {
        if (slot.slotType === 'ir') return false;
        const teamCode = normalizeNbaTeamCode(slot.player.nbaTeam);
        if (!teamCode) return false;
        return games.some(g => g.homeTeam === teamCode || g.awayTeam === teamCode);
      })
      .map(slot => ({
        playerId: slot.player.id,
        positions: slot.player.positions || [],
        injuryMultiplier: getInjuryMultiplier(slot.player.status),
      }));
    
    // Update scheduled counts
    for (const p of playersWithGamesToday) {
      const counts = playerGameCounts.get(p.playerId);
      if (counts) counts.scheduled++;
    }
    
    // Fill lineup slots for this day
    const startedToday = fillLineupsForDay(playersWithGamesToday, lineupSlots);
    
    // Check for empty slots
    const slotsFilled = startedToday.size;
    if (slotsFilled < lineupSlots.length) {
      totalEmptySlotDays++;
      devLog(`[projectWeek] ${date}: Only ${slotsFilled}/${lineupSlots.length} slots filled`);
    }
    
    // Update player started/benched counts
    for (const p of playersWithGamesToday) {
      const counts = playerGameCounts.get(p.playerId);
      if (!counts) continue;
      
      const startedValue = startedToday.get(p.playerId) || 0;
      if (startedValue > 0) {
        counts.started += startedValue;
      } else {
        // Player had a game but couldn't fit in lineup
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
  let totalBenchOverflow = 0;
  
  for (const slot of roster) {
    if (slot.slotType === 'ir') continue;
    
    const player = slot.player;
    const counts = playerGameCounts.get(player.id) || { started: 0, benched: 0, scheduled: 0 };
    const injuryMultiplier = getInjuryMultiplier(player.status);
    
    // Get blended per-game stats (handles partial data)
    const gamesPlayed = player.gamesPlayed || 10;
    const { stats: perGameStats, usedShrinkage } = getBlendedPerGameStats(player, gamesPlayed);
    
    // Project totals for this player
    const expectedGames = counts.started; // Already multiplied by injury factor in fillLineupsForDay
    
    const projectedStats: ProjectedStats = {
      fgm: perGameStats.fgm * expectedGames,
      fga: perGameStats.fga * expectedGames,
      fgPct: 0, // Computed after summing
      ftm: perGameStats.ftm * expectedGames,
      fta: perGameStats.fta * expectedGames,
      ftPct: 0, // Computed after summing
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
    
    // Warn about significant shrinkage usage
    if (usedShrinkage) {
      warnings.push(`${player.name}: Using blended stats (limited sample)`);
    }
  }
  
  // Compute final percentages from makes/attempts
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
  
  devLog('[projectWeek] Projection complete:', {
    totalStartedGames,
    totalBenchOverflow,
    emptySlotDays: totalEmptySlotDays,
    playerCount: playerProjections.length,
  });
  
  return {
    totalStats,
    totalStartedGames,
    totalBenchOverflow,
    playerProjections,
    emptySlotDays: totalEmptySlotDays,
    warnings,
  };
}

// ============================================================================
// MATCHUP WEEK DATES UTILITY
// ============================================================================

/**
 * Get dates for the current fantasy matchup week (Mon-Sun)
 */
export function getMatchupWeekDates(): string[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Find Monday of current week
  const monday = new Date(now);
  if (dayOfWeek === 0) {
    // Sunday: go back 6 days
    monday.setDate(now.getDate() - 6);
  } else {
    // Other days: go back to Monday
    monday.setDate(now.getDate() - (dayOfWeek - 1));
  }
  
  // Generate Mon-Sun dates
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  
  return dates;
}

/**
 * Get remaining dates in the matchup week (from today onward)
 */
export function getRemainingMatchupDates(): string[] {
  const allDates = getMatchupWeekDates();
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  return allDates.filter(d => d >= todayStr);
}
