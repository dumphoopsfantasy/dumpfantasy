/**
 * Pickup Impact Engine
 * 
 * For each free agent candidate:
 *   1. Count their remaining games this matchup week
 *   2. For each droppable roster player, simulate the swap:
 *      a. Build modified roster (remove drop candidate, add FA)
 *      b. Recompute rest-of-week starts via bipartite matching
 *      c. Project new team totals (current scoreboard + remaining projection)
 *      d. Run Monte Carlo simulation vs opponent
 *   3. Find the optimal drop (highest win probability after swap)
 *   4. Return the win probability delta (swapped - baseline)
 * 
 * Performance: Pre-filters to top ~25 FAs by (games × CRI), uses 2000 sims each.
 */

import { Player, RosterSlot } from '@/types/fantasy';
import { NBAGame } from '@/lib/nbaApi';
import { TeamTotalsWithPct } from '@/lib/teamTotals';
import { runMonteCarloSimulation, MonteCarloResult } from '@/lib/monteCarloEngine';
import {
  computeRestOfWeekStarts,
  categorizeDates,
  getTodayDateStr,
} from '@/lib/restOfWeekUtils';
import {
  normalizeNbaTeamCode,
  STANDARD_LINEUP_SLOTS,
} from '@/lib/scheduleAwareProjection';
import { computeBaselineStats, projectFromStarts, addToTotals } from '@/hooks/useMatchupModel';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PickupImpactResult {
  /** The free agent being evaluated */
  freeAgent: Player;
  /** Number of remaining games this week for the FA */
  remainingGames: number;
  /** Best roster player to drop for this FA */
  bestDrop: Player | null;
  /** Win probability WITH the swap (0–1) */
  winProbWithSwap: number;
  /** Win probability delta (swapped minus baseline) */
  winProbDelta: number;
  /** Expected category wins with swap */
  avgCatWinsWithSwap: number;
  /** Category wins delta */
  catWinsDelta: number;
  /** Full Monte Carlo result for the swapped scenario */
  mcResult: MonteCarloResult | null;
}

export interface PickupImpactConfig {
  /** Free agents to evaluate */
  freeAgents: Player[];
  /** Current roster as RosterSlots */
  currentRoster: RosterSlot[];
  /** Current matchup week dates (YYYY-MM-DD) */
  matchupDates: string[];
  /** NBA schedule: date → games */
  gamesByDate: Map<string, NBAGame[]>;
  /** Current weekly scoreboard totals for my team (already played games) */
  myCurrentTotals: TeamTotalsWithPct | null;
  /** Opponent's projected final totals for the week */
  oppTotals: TeamTotalsWithPct | null;
  /** Max FAs to run through full Monte Carlo (default 25) */
  maxCandidates?: number;
  /** Simulations per FA (default 2000) */
  simulations?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Count remaining games this matchup week for a given NBA team code.
 */
function countRemainingGames(
  nbaTeam: string | undefined,
  remainingDates: string[],
  gamesByDate: Map<string, NBAGame[]>,
): number {
  const normalized = normalizeNbaTeamCode(nbaTeam);
  if (!normalized) return 0;

  let count = 0;
  for (const dateStr of remainingDates) {
    const games = gamesByDate.get(dateStr) || [];
    if (games.some(g => g.homeTeam === normalized || g.awayTeam === normalized)) {
      count++;
    }
  }
  return count;
}

/**
 * Convert a Player into a RosterSlot for simulation purposes.
 * FAs are placed as bench players for the matching algorithm.
 */
function playerToRosterSlot(player: Player): RosterSlot {
  return {
    slot: 'Bench',
    slotType: 'bench',
    player,
  };
}

/**
 * Build a modified roster by swapping out dropPlayer and adding pickupPlayer.
 */
function buildSwappedRoster(
  currentRoster: RosterSlot[],
  dropPlayer: Player,
  pickupPlayer: Player,
): RosterSlot[] {
  const newRoster: RosterSlot[] = [];
  
  for (const slot of currentRoster) {
    if (slot.player.id === dropPlayer.id) {
      // Replace the dropped player with the pickup, keeping the same slot
      newRoster.push({
        ...slot,
        player: pickupPlayer,
      });
    } else {
      newRoster.push(slot);
    }
  }
  
  return newRoster;
}

/**
 * Compute projected final team totals for a roster over remaining matchup dates.
 * Combines current scoreboard totals with projected remaining stats.
 */
function computeProjectedTotals(
  roster: RosterSlot[],
  matchupDates: string[],
  gamesByDate: Map<string, NBAGame[]>,
  currentTotals: TeamTotalsWithPct | null,
): TeamTotalsWithPct | null {
  const baseline = computeBaselineStats(roster);
  if (!baseline) return currentTotals;

  const restOfWeek = computeRestOfWeekStarts({
    rosterPlayers: roster,
    matchupDates,
    gamesByDate,
    lineupSlots: STANDARD_LINEUP_SLOTS,
  });

  const remainingStarts = restOfWeek.remainingStarts;
  if (remainingStarts <= 0) return currentTotals;

  const remainingProjection = projectFromStarts(baseline, remainingStarts);
  return addToTotals(currentTotals, remainingProjection);
}

// ── Core Engine ────────────────────────────────────────────────────────────

/**
 * Run the full pickup impact analysis.
 * 
 * Steps:
 * 1. Compute baseline win probability (current roster, no changes)
 * 2. Pre-filter FAs by remaining games and rank by games × CRI
 * 3. For each top FA, try swapping with each droppable roster player
 * 4. Find the best swap and compute win probability delta
 */
export function computePickupImpact(config: PickupImpactConfig): {
  results: PickupImpactResult[];
  baselineWinProb: number;
  baselineAvgCatWins: number;
} {
  const {
    freeAgents,
    currentRoster,
    matchupDates,
    gamesByDate,
    myCurrentTotals,
    oppTotals,
    maxCandidates = 25,
    simulations = 2000,
  } = config;

  // ── Step 0: Get remaining dates ──────────────────────────────────
  const { remaining: remainingDates } = categorizeDates(matchupDates, gamesByDate);

  // ── Step 1: Compute baseline (current roster, no swaps) ──────────
  const baselineMyTotals = computeProjectedTotals(
    currentRoster,
    matchupDates,
    gamesByDate,
    myCurrentTotals,
  );

  let baselineWinProb = 0;
  let baselineAvgCatWins = 0;

  if (baselineMyTotals && oppTotals) {
    const baselineMC = runMonteCarloSimulation(baselineMyTotals, oppTotals, simulations);
    baselineWinProb = baselineMC.winProbability;
    baselineAvgCatWins = baselineMC.avgWins;
  }

  // ── Step 2: Pre-filter and rank FAs ──────────────────────────────
  const faWithGames = freeAgents
    .map(fa => ({
      fa,
      remainingGames: countRemainingGames(fa.nbaTeam, remainingDates, gamesByDate),
    }))
    .filter(({ remainingGames }) => remainingGames > 0) // Must have games remaining
    .sort((a, b) => {
      // Sort by (games × CRI) descending — best schedule + best player first
      const scoreA = a.remainingGames * (a.fa.cri || a.fa.wCri || 1);
      const scoreB = b.remainingGames * (b.fa.cri || b.fa.wCri || 1);
      return scoreB - scoreA;
    })
    .slice(0, maxCandidates);

  // ── Step 3: Identify droppable roster players ────────────────────
  // Only non-IR bench/starter players are droppable
  const droppablePlayers = currentRoster
    .filter(slot => slot.slotType !== 'ir')
    .map(slot => slot.player);

  if (droppablePlayers.length === 0 || !oppTotals) {
    return {
      results: faWithGames.map(({ fa, remainingGames }) => ({
        freeAgent: fa,
        remainingGames,
        bestDrop: null,
        winProbWithSwap: baselineWinProb,
        winProbDelta: 0,
        avgCatWinsWithSwap: baselineAvgCatWins,
        catWinsDelta: 0,
        mcResult: null,
      })),
      baselineWinProb,
      baselineAvgCatWins,
    };
  }

  // ── Step 4: For each FA, find optimal drop ───────────────────────
  const results: PickupImpactResult[] = faWithGames.map(({ fa, remainingGames }) => {
    let bestDrop: Player | null = null;
    let bestWinProb = -1;
    let bestAvgCatWins = 0;
    let bestMCResult: MonteCarloResult | null = null;

    for (const dropCandidate of droppablePlayers) {
      // Build swapped roster
      const swappedRoster = buildSwappedRoster(currentRoster, dropCandidate, fa);

      // Compute projected totals with swapped roster
      const swappedTotals = computeProjectedTotals(
        swappedRoster,
        matchupDates,
        gamesByDate,
        myCurrentTotals,
      );

      if (!swappedTotals) continue;

      // Run Monte Carlo
      const mcResult = runMonteCarloSimulation(swappedTotals, oppTotals, simulations);

      if (mcResult.winProbability > bestWinProb) {
        bestWinProb = mcResult.winProbability;
        bestAvgCatWins = mcResult.avgWins;
        bestDrop = dropCandidate;
        bestMCResult = mcResult;
      }
    }

    return {
      freeAgent: fa,
      remainingGames,
      bestDrop,
      winProbWithSwap: bestWinProb >= 0 ? bestWinProb : baselineWinProb,
      winProbDelta: bestWinProb >= 0 ? bestWinProb - baselineWinProb : 0,
      avgCatWinsWithSwap: bestAvgCatWins,
      catWinsDelta: bestAvgCatWins - baselineAvgCatWins,
      mcResult: bestMCResult,
    };
  });

  // Sort by win probability delta descending
  results.sort((a, b) => b.winProbDelta - a.winProbDelta);

  return {
    results,
    baselineWinProb,
    baselineAvgCatWins,
  };
}
