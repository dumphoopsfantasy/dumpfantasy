/**
 * Playoff Projection Engine
 * 
 * Shared projection logic for the Playoff Intel dashboard.
 * Computes category confidence tiers, win probability via logistic curve,
 * CRIS-weighted edge scores, and schedule density analysis.
 */

import { LeagueTeam } from '@/types/league';
import { CATEGORIES, CRIS_WEIGHTS } from './crisUtils';
import type { ForecastSchedule, ForecastSettings } from './forecastEngine';
import { compareCategoryResults, projectWeeklyStats, type TeamStats, type CategoryResult } from './forecastEngine';

// ============================================================================
// TYPES
// ============================================================================

export type ConfidenceTier = 'Lock Win' | 'Lean Win' | 'Coinflip' | 'Lean Loss' | 'Lock Loss';

export interface CategoryProjection {
  key: string;
  label: string;
  myValue: number;
  oppValue: number;
  delta: number;
  /** Normalized delta (positive = advantage, negative = disadvantage) */
  normalizedDelta: number;
  confidence: ConfidenceTier;
  winProbability: number;
  /** Is this a "swing" category (close margin) */
  isSwing: boolean;
  notes: string[];
}

export interface OpponentScenario {
  teamName: string;
  seed: number;
  record: string;
  /** How they'd face the user (e.g., "Quarterfinal", "Semifinal") */
  round: string;
  /** Likelihood of facing this opponent (0–1) */
  likelihood: number;
  /** Overall win probability against this opponent */
  winProbability: number;
  /** Expected categories won (e.g., 5.6) */
  expectedCatsWon: number;
  /** Expected categories lost */
  expectedCatsLost: number;
  /** Top 3 swing categories (closest margins) */
  swingCategories: string[];
  /** Schedule edge: difference in projected games */
  scheduleEdge: number;
  /** Full category breakdown */
  categories: CategoryProjection[];
  /** CRIS-weighted edge score */
  weightedEdge: number;
  /** Overall confidence label */
  overallConfidence: 'high' | 'medium' | 'low';
}

export interface ScheduleDensity {
  date: string;
  dayLabel: string;
  myGames: number;
  oppGames: number;
  isLightDay: boolean;
}

export interface ScheduleSummary {
  totalMyGames: number;
  totalOppGames: number;
  myLightDayGames: number;
  oppLightDayGames: number;
  myHeavyDayGames: number;
  oppHeavyDayGames: number;
  gameEdge: number;
  density: ScheduleDensity[];
}

export interface ByeWeekPlan {
  targetCategories: Array<{ key: string; label: string; reason: string }>;
  streamerProfile: string[];
  rosterNotes: string[];
}

// ============================================================================
// CATEGORY VOLATILITY (proxy for confidence calculation)
// ============================================================================

/** 
 * Approximate standard deviation per category as a fraction of the mean.
 * Used to normalize deltas into confidence tiers.
 * Higher = more volatile = harder to be confident about.
 */
const CATEGORY_VOLATILITY: Record<string, number> = {
  fgPct: 0.025,   // FG% swings ~2.5% week to week
  ftPct: 0.035,   // FT% slightly more volatile
  threepm: 0.18,  // 3PM ~18% variance
  rebounds: 0.12,
  assists: 0.14,
  steals: 0.22,   // STL/BLK high variance
  blocks: 0.25,
  turnovers: 0.15,
  points: 0.10,
};

// ============================================================================
// LOGISTIC WIN PROBABILITY
// ============================================================================

/**
 * Maps a normalized delta to a win probability using a logistic curve.
 * delta > 0 means advantage, delta < 0 means disadvantage.
 * k controls steepness (higher = more decisive margins).
 */
function logisticWinProb(normalizedDelta: number, k: number = 4): number {
  return 1 / (1 + Math.exp(-k * normalizedDelta));
}

// ============================================================================
// CONFIDENCE TIER
// ============================================================================

function getConfidenceTier(winProb: number): ConfidenceTier {
  if (winProb >= 0.75) return 'Lock Win';
  if (winProb >= 0.58) return 'Lean Win';
  if (winProb > 0.42) return 'Coinflip';
  if (winProb > 0.25) return 'Lean Loss';
  return 'Lock Loss';
}

// ============================================================================
// CORE PROJECTION
// ============================================================================

/**
 * Project a full category-level matchup between two teams for a given week.
 */
export function projectCategoryMatchup(
  myStats: TeamStats,
  oppStats: TeamStats,
  scale: number = 1,
  weights?: Record<string, number>,
): CategoryProjection[] {
  const myProjected = projectWeeklyStats(myStats, scale);
  const oppProjected = projectWeeklyStats(oppStats, scale);
  const catResults = compareCategoryResults(myProjected, oppProjected);

  return catResults.map((r) => {
    const catInfo = CATEGORIES.find(c => c.key === r.category);
    const label = catInfo?.label || r.category;
    const isTO = r.category === 'turnovers';

    // Compute raw delta (positive = good for "my" team)
    const rawDelta = isTO ? (r.oppValue - r.myValue) : (r.myValue - r.oppValue);

    // Normalize by volatility proxy
    const vol = CATEGORY_VOLATILITY[r.category] || 0.15;
    const avgVal = (r.myValue + r.oppValue) / 2;
    const normalizedDelta = avgVal > 0 ? rawDelta / (avgVal * vol) : 0;

    const winProb = logisticWinProb(normalizedDelta);
    const confidence = getConfidenceTier(winProb);

    const notes: string[] = [];
    if (Math.abs(normalizedDelta) < 0.5) notes.push('Very close — could go either way');
    if (vol >= 0.22) notes.push('High variance category');

    return {
      key: r.category,
      label,
      myValue: r.myValue,
      oppValue: r.oppValue,
      delta: rawDelta,
      normalizedDelta,
      confidence,
      winProbability: winProb,
      isSwing: Math.abs(normalizedDelta) < 1.0,
      notes,
    };
  });
}

/**
 * Compute overall win probability from category projections.
 * Uses expected categories won distribution.
 */
export function computeOverallWinProb(categories: CategoryProjection[]): {
  winProbability: number;
  expectedCatsWon: number;
  expectedCatsLost: number;
  coinflipCount: number;
} {
  let expectedWon = 0;
  let coinflipCount = 0;

  for (const cat of categories) {
    expectedWon += cat.winProbability;
    if (cat.confidence === 'Coinflip') coinflipCount++;
  }

  const expectedLost = categories.length - expectedWon;
  const majority = categories.length / 2;

  // Approximate overall win probability:
  // If expected cats won > 4.5 (majority of 9), increasingly likely to win
  const edge = expectedWon - majority;
  const winProbability = logisticWinProb(edge, 1.8);

  return { winProbability, expectedCatsWon: expectedWon, expectedCatsLost: expectedLost, coinflipCount };
}

/**
 * Compute CRIS-weighted edge score across categories.
 */
export function computeWeightedEdge(
  categories: CategoryProjection[],
  weights?: Record<string, number>,
): number {
  const w = weights || CRIS_WEIGHTS;
  let edge = 0;
  let totalWeight = 0;

  for (const cat of categories) {
    const weight = w[cat.key as keyof typeof CRIS_WEIGHTS] ?? 1;
    edge += weight * cat.normalizedDelta;
    totalWeight += weight;
  }

  return totalWeight > 0 ? edge / totalWeight : 0;
}

// ============================================================================
// OPPONENT SCENARIOS
// ============================================================================

interface BracketSeed {
  seed: number;
  teamName: string;
  record: string;
}

/**
 * Determine likely opponents based on bracket seeding.
 * For a 6-team bracket: seeds 1-2 get byes, 3v6 and 4v5 in round 1.
 */
export function getLikelyOpponents(
  userSeed: number,
  playoffSeeds: BracketSeed[],
  numPlayoffTeams: number,
): Array<{ teamName: string; seed: number; record: string; round: string; likelihood: number }> {
  const opponents: Array<{ teamName: string; seed: number; record: string; round: string; likelihood: number }> = [];

  if (numPlayoffTeams === 6) {
    if (userSeed === 1) {
      // Bye round 1, faces winner of 4v5 in semis
      const s4 = playoffSeeds.find(s => s.seed === 4);
      const s5 = playoffSeeds.find(s => s.seed === 5);
      if (s4) opponents.push({ ...s4, round: 'Semifinal', likelihood: 0.55 });
      if (s5) opponents.push({ ...s5, round: 'Semifinal', likelihood: 0.45 });
      // Could face seeds 2, 3, or 6 in finals
      const s2 = playoffSeeds.find(s => s.seed === 2);
      const s3 = playoffSeeds.find(s => s.seed === 3);
      const s6 = playoffSeeds.find(s => s.seed === 6);
      if (s2) opponents.push({ ...s2, round: 'Finals', likelihood: 0.35 });
      if (s3) opponents.push({ ...s3, round: 'Finals', likelihood: 0.25 });
      if (s6) opponents.push({ ...s6, round: 'Finals', likelihood: 0.10 });
    } else if (userSeed === 2) {
      // Bye round 1, faces winner of 3v6 in semis
      const s3 = playoffSeeds.find(s => s.seed === 3);
      const s6 = playoffSeeds.find(s => s.seed === 6);
      if (s3) opponents.push({ ...s3, round: 'Semifinal', likelihood: 0.65 });
      if (s6) opponents.push({ ...s6, round: 'Semifinal', likelihood: 0.35 });
      // Could face seeds 1, 4, or 5 in finals
      const s1 = playoffSeeds.find(s => s.seed === 1);
      const s4 = playoffSeeds.find(s => s.seed === 4);
      const s5 = playoffSeeds.find(s => s.seed === 5);
      if (s1) opponents.push({ ...s1, round: 'Finals', likelihood: 0.35 });
      if (s4) opponents.push({ ...s4, round: 'Finals', likelihood: 0.15 });
      if (s5) opponents.push({ ...s5, round: 'Finals', likelihood: 0.10 });
    } else if (userSeed === 3) {
      const s6 = playoffSeeds.find(s => s.seed === 6);
      if (s6) opponents.push({ ...s6, round: 'Quarterfinal', likelihood: 1.0 });
      const s2 = playoffSeeds.find(s => s.seed === 2);
      if (s2) opponents.push({ ...s2, round: 'Semifinal', likelihood: 0.65 });
    } else if (userSeed === 4) {
      const s5 = playoffSeeds.find(s => s.seed === 5);
      if (s5) opponents.push({ ...s5, round: 'Quarterfinal', likelihood: 1.0 });
      const s1 = playoffSeeds.find(s => s.seed === 1);
      if (s1) opponents.push({ ...s1, round: 'Semifinal', likelihood: 0.55 });
    } else if (userSeed === 5) {
      const s4 = playoffSeeds.find(s => s.seed === 4);
      if (s4) opponents.push({ ...s4, round: 'Quarterfinal', likelihood: 1.0 });
      const s1 = playoffSeeds.find(s => s.seed === 1);
      if (s1) opponents.push({ ...s1, round: 'Semifinal', likelihood: 0.45 });
    } else if (userSeed === 6) {
      const s3 = playoffSeeds.find(s => s.seed === 3);
      if (s3) opponents.push({ ...s3, round: 'Quarterfinal', likelihood: 1.0 });
      const s2 = playoffSeeds.find(s => s.seed === 2);
      if (s2) opponents.push({ ...s2, round: 'Semifinal', likelihood: 0.35 });
    }
  } else {
    // 4-team bracket
    if (userSeed === 1) {
      const s4 = playoffSeeds.find(s => s.seed === 4);
      if (s4) opponents.push({ ...s4, round: 'Semifinal', likelihood: 1.0 });
      const s2 = playoffSeeds.find(s => s.seed === 2);
      const s3 = playoffSeeds.find(s => s.seed === 3);
      if (s2) opponents.push({ ...s2, round: 'Finals', likelihood: 0.55 });
      if (s3) opponents.push({ ...s3, round: 'Finals', likelihood: 0.45 });
    } else if (userSeed === 2) {
      const s3 = playoffSeeds.find(s => s.seed === 3);
      if (s3) opponents.push({ ...s3, round: 'Semifinal', likelihood: 1.0 });
      const s1 = playoffSeeds.find(s => s.seed === 1);
      const s4 = playoffSeeds.find(s => s.seed === 4);
      if (s1) opponents.push({ ...s1, round: 'Finals', likelihood: 0.55 });
      if (s4) opponents.push({ ...s4, round: 'Finals', likelihood: 0.45 });
    } else if (userSeed === 3) {
      const s2 = playoffSeeds.find(s => s.seed === 2);
      if (s2) opponents.push({ ...s2, round: 'Semifinal', likelihood: 1.0 });
    } else if (userSeed === 4) {
      const s1 = playoffSeeds.find(s => s.seed === 1);
      if (s1) opponents.push({ ...s1, round: 'Semifinal', likelihood: 1.0 });
    }
  }

  return opponents;
}

/**
 * Build full opponent scenario with all projections.
 */
export function buildOpponentScenario(
  opponent: { teamName: string; seed: number; record: string; round: string; likelihood: number },
  myTeam: LeagueTeam,
  oppTeam: LeagueTeam,
  scale: number,
  weights?: Record<string, number>,
): OpponentScenario {
  const myStats: TeamStats = {
    fgPct: myTeam.fgPct, ftPct: myTeam.ftPct, threepm: myTeam.threepm,
    rebounds: myTeam.rebounds, assists: myTeam.assists, steals: myTeam.steals,
    blocks: myTeam.blocks, turnovers: myTeam.turnovers, points: myTeam.points,
  };
  const oppStats: TeamStats = {
    fgPct: oppTeam.fgPct, ftPct: oppTeam.ftPct, threepm: oppTeam.threepm,
    rebounds: oppTeam.rebounds, assists: oppTeam.assists, steals: oppTeam.steals,
    blocks: oppTeam.blocks, turnovers: oppTeam.turnovers, points: oppTeam.points,
  };

  const categories = projectCategoryMatchup(myStats, oppStats, scale, weights);
  const { winProbability, expectedCatsWon, expectedCatsLost, coinflipCount } = computeOverallWinProb(categories);
  const weightedEdge = computeWeightedEdge(categories, weights);

  const swingCategories = categories
    .filter(c => c.isSwing)
    .sort((a, b) => Math.abs(a.normalizedDelta) - Math.abs(b.normalizedDelta))
    .slice(0, 3)
    .map(c => c.label);

  const catWinMargin = Math.abs(expectedCatsWon - expectedCatsLost);
  let overallConfidence: 'high' | 'medium' | 'low' = 'low';
  if (catWinMargin >= 2.5) overallConfidence = 'high';
  else if (catWinMargin >= 1) overallConfidence = 'medium';

  return {
    teamName: opponent.teamName,
    seed: opponent.seed,
    record: opponent.record,
    round: opponent.round,
    likelihood: opponent.likelihood,
    winProbability,
    expectedCatsWon,
    expectedCatsLost,
    swingCategories,
    scheduleEdge: 0, // populated externally if schedule data available
    categories,
    weightedEdge,
    overallConfidence,
  };
}

// ============================================================================
// BYE WEEK PREP
// ============================================================================

/**
 * Generate a bye week preparation plan based on projected matchups.
 */
export function generateByeWeekPlan(
  scenarios: OpponentScenario[],
  weights?: Record<string, number>,
): ByeWeekPlan {
  if (scenarios.length === 0) {
    return { targetCategories: [], streamerProfile: [], rosterNotes: [] };
  }

  // Aggregate category data across most likely opponents
  const catScores: Record<string, { totalDelta: number; count: number; isSwingCount: number }> = {};

  for (const s of scenarios) {
    for (const cat of s.categories) {
      if (!catScores[cat.key]) catScores[cat.key] = { totalDelta: 0, count: 0, isSwingCount: 0 };
      catScores[cat.key].totalDelta += cat.normalizedDelta * s.likelihood;
      catScores[cat.key].count++;
      if (cat.isSwing) catScores[cat.key].isSwingCount++;
    }
  }

  // Target categories: ones where we're slightly behind or close (swing categories)
  const targetCategories = Object.entries(catScores)
    .filter(([_, v]) => v.totalDelta < 0.5 && v.totalDelta > -2) // Not locked losses, but improvable
    .sort((a, b) => a[1].totalDelta - b[1].totalDelta) // Worst first
    .slice(0, 4)
    .map(([key, v]) => {
      const catInfo = CATEGORIES.find(c => c.key === key);
      const label = catInfo?.label || key;
      let reason = '';
      if (v.totalDelta < -0.5) reason = 'Currently projected to lose — high impact if improved';
      else if (v.totalDelta < 0) reason = 'Slight disadvantage — winnable with a stream target';
      else reason = 'Close contest — protect this edge';
      return { key, label, reason };
    });

  // Streamer profile based on target categories
  const streamerProfile: string[] = [];
  const targetKeys = targetCategories.map(t => t.key);
  if (targetKeys.includes('threepm') || targetKeys.includes('points')) {
    streamerProfile.push('High-volume scorers with 3PT upside');
  }
  if (targetKeys.includes('steals') || targetKeys.includes('blocks')) {
    streamerProfile.push('Defensive specialists (STL/BLK)');
  }
  if (targetKeys.includes('rebounds')) {
    streamerProfile.push('Big men with high rebound rates');
  }
  if (targetKeys.includes('assists')) {
    streamerProfile.push('Playmakers / high-usage guards');
  }
  if (targetKeys.includes('fgPct')) {
    streamerProfile.push('Efficient scorers (avoid low FG% shooters)');
  }
  if (targetKeys.includes('ftPct')) {
    streamerProfile.push('Strong FT shooters (guards, wings)');
  }
  if (targetKeys.includes('turnovers')) {
    streamerProfile.push('Low-turnover role players');
  }
  if (streamerProfile.length === 0) {
    streamerProfile.push('Stream for volume — maximize games played');
  }

  const rosterNotes: string[] = [];
  const mostLikely = scenarios.reduce((best, s) => s.likelihood > best.likelihood ? s : best, scenarios[0]);
  if (mostLikely.winProbability > 0.65) {
    rosterNotes.push(`Strong projection vs ${mostLikely.teamName} — focus on protecting your edges`);
  } else if (mostLikely.winProbability < 0.4) {
    rosterNotes.push(`Tough matchup vs ${mostLikely.teamName} — consider aggressive streaming`);
  }
  if (mostLikely.swingCategories.length > 0) {
    rosterNotes.push(`Swing categories: ${mostLikely.swingCategories.join(', ')} — target these with adds`);
  }

  return { targetCategories, streamerProfile, rosterNotes };
}
