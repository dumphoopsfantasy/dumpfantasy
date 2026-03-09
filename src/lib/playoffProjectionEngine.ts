/**
 * Playoff Projection Engine v2.1
 * 
 * Shared projection logic for the Playoff Intel dashboard.
 * Computes category confidence tiers, win probability via logistic curve,
 * CRIS-weighted edge scores, schedule density, and strategic category classification.
 */

import { LeagueTeam } from '@/types/league';
import { CATEGORIES, CRIS_WEIGHTS } from './crisUtils';
import type { ForecastSchedule, ForecastSettings } from './forecastEngine';
import { compareCategoryResults, projectWeeklyStats, type TeamStats, type CategoryResult } from './forecastEngine';

// ============================================================================
// TYPES
// ============================================================================

export type ConfidenceTier = 'Lock Win' | 'Lean Win' | 'Coinflip' | 'Lean Loss' | 'Lock Loss';
export type VolatilityLevel = 'high' | 'medium' | 'low';
export type CategoryStrategy = 'Protect' | 'Attack' | 'Reinforce' | 'Punt';

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
  /** Volatility level */
  volatility: VolatilityLevel;
  /** Raw margin for display */
  rawMargin: string;
  /** Flippability score 0-100 */
  flippability: number;
  /** Strategic classification */
  strategy: CategoryStrategy;
  /** Priority score for ranking */
  priorityScore: number;
  /** Strategy reasoning */
  strategyReason: string;
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

export interface PlayoffIdentity {
  protect: string[];
  attack: string[];
  reinforce: string[];
  punt: string[];
  summary: string;
}

export interface ByeWeekPlan {
  targetCategories: Array<{ key: string; label: string; reason: string; strategy: CategoryStrategy; priorityScore: number }>;
  streamerProfile: string[];
  rosterNotes: string[];
  identity: PlayoffIdentity;
  vulnerableToStreaming: string[];
}

// ============================================================================
// CATEGORY VOLATILITY
// ============================================================================

const CATEGORY_VOLATILITY: Record<string, number> = {
  fgPct: 0.025,
  ftPct: 0.035,
  threepm: 0.18,
  rebounds: 0.12,
  assists: 0.14,
  steals: 0.22,
  blocks: 0.25,
  turnovers: 0.15,
  points: 0.10,
};

export function getVolatilityLevel(key: string): VolatilityLevel {
  const vol = CATEGORY_VOLATILITY[key] || 0.15;
  if (vol >= 0.20) return 'high';
  if (vol >= 0.12) return 'medium';
  return 'low';
}

// ============================================================================
// LOGISTIC WIN PROBABILITY
// ============================================================================

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
// FLIPPABILITY + STRATEGY
// ============================================================================

function computeFlippability(normalizedDelta: number, volatilityKey: string, crisWeight: number): number {
  const vol = CATEGORY_VOLATILITY[volatilityKey] || 0.15;
  const absDelta = Math.abs(normalizedDelta);
  // Higher flippability when: close margin + high volatility + high CRIS weight
  const marginFactor = Math.max(0, 1 - absDelta / 2); // 1.0 at delta=0, 0 at delta=2
  const volFactor = vol / 0.25; // normalized to ~1.0 for high-vol cats
  const weightFactor = crisWeight; // 0.35–1.0
  return Math.min(100, Math.round(marginFactor * volFactor * weightFactor * 100));
}

function classifyStrategy(
  normalizedDelta: number,
  winProb: number,
  flippability: number,
  crisWeight: number,
): { strategy: CategoryStrategy; reason: string } {
  const isWinning = normalizedDelta > 0;
  
  if (isWinning && winProb >= 0.65 && crisWeight >= 0.6) {
    return { strategy: 'Protect', reason: `Strong edge (${Math.round(winProb * 100)}% win) with high CRIS weight — protect this lead` };
  }
  if (isWinning && winProb >= 0.55 && flippability >= 30) {
    return { strategy: 'Reinforce', reason: `Lean win but volatile — could flip without reinforcement` };
  }
  if (!isWinning && flippability >= 25) {
    return { strategy: 'Attack', reason: `Losing but flippable (${flippability}% flip chance) — target with streaming` };
  }
  if (!isWinning && flippability < 25) {
    return { strategy: 'Punt', reason: `Large deficit with low flip chance — ROI too low to chase` };
  }
  if (isWinning) {
    return { strategy: 'Protect', reason: `Winning this category — maintain edge` };
  }
  return { strategy: 'Punt', reason: `Not realistically flippable given current margins` };
}

// ============================================================================
// CORE PROJECTION
// ============================================================================

export function projectCategoryMatchup(
  myStats: TeamStats,
  oppStats: TeamStats,
  scale: number = 1,
  weights?: Record<string, number>,
): CategoryProjection[] {
  const myProjected = projectWeeklyStats(myStats, scale);
  const oppProjected = projectWeeklyStats(oppStats, scale);
  const catResults = compareCategoryResults(myProjected, oppProjected);
  const w = weights || CRIS_WEIGHTS;

  return catResults.map((r) => {
    const catInfo = CATEGORIES.find(c => c.key === r.category);
    const label = catInfo?.label || r.category;
    const isTO = r.category === 'turnovers';
    const isPct = r.category === 'fgPct' || r.category === 'ftPct';

    const rawDelta = isTO ? (r.oppValue - r.myValue) : (r.myValue - r.oppValue);
    const vol = CATEGORY_VOLATILITY[r.category] || 0.15;
    const avgVal = (r.myValue + r.oppValue) / 2;
    const normalizedDelta = avgVal > 0 ? rawDelta / (avgVal * vol) : 0;

    const winProb = logisticWinProb(normalizedDelta);
    const confidence = getConfidenceTier(winProb);
    const volatility = getVolatilityLevel(r.category);
    const crisWeight = w[r.category as keyof typeof CRIS_WEIGHTS] ?? 1;
    const flippability = computeFlippability(normalizedDelta, r.category, crisWeight);
    const { strategy, reason: strategyReason } = classifyStrategy(normalizedDelta, winProb, flippability, crisWeight);

    // Priority score for ranking
    const priorityScore = Math.abs(normalizedDelta) * vol * crisWeight * (strategy === 'Attack' ? 2 : strategy === 'Reinforce' ? 1.5 : 1);

    // Raw margin string
    const rawMargin = isPct
      ? `${rawDelta >= 0 ? '+' : ''}${(rawDelta * 100).toFixed(1)}%`
      : `${rawDelta >= 0 ? '+' : ''}${rawDelta.toFixed(1)}`;

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
      volatility,
      rawMargin,
      flippability,
      strategy,
      priorityScore,
      strategyReason,
    };
  });
}

/**
 * Compute overall win probability from category projections.
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
// PLAYOFF IDENTITY
// ============================================================================

export function buildPlayoffIdentity(categories: CategoryProjection[]): PlayoffIdentity {
  const protect = categories.filter(c => c.strategy === 'Protect').map(c => c.label);
  const attack = categories.filter(c => c.strategy === 'Attack').map(c => c.label);
  const reinforce = categories.filter(c => c.strategy === 'Reinforce').map(c => c.label);
  const punt = categories.filter(c => c.strategy === 'Punt').map(c => c.label);

  const parts: string[] = [];
  if (protect.length > 0) parts.push(`Lock down ${protect.join(', ')}`);
  if (attack.length > 0) parts.push(`stream for ${attack.join(', ')}`);
  if (reinforce.length > 0) parts.push(`shore up ${reinforce.join(', ')}`);
  if (punt.length > 0) parts.push(`punt ${punt.join(', ')}`);
  const summary = parts.length > 0 ? parts.join('; ') + '.' : 'No clear strategic direction — all categories competitive.';

  return { protect, attack, reinforce, punt, summary };
}

// ============================================================================
// OPPONENT STREAMING SENSITIVITY
// ============================================================================

/**
 * Simulate opponent adding streaming games and return which categories flip.
 */
export function simulateOpponentStreaming(
  categories: CategoryProjection[],
  streamingGames: number = 4,
): { flippedCats: string[]; updatedCategories: CategoryProjection[] } {
  const flippedCats: string[] = [];
  const updated = categories.map(cat => {
    // Estimate streaming impact: adds ~2% to counting stats per game, negligible for %
    const isPct = cat.key === 'fgPct' || cat.key === 'ftPct';
    if (isPct) return cat;

    const streamBoost = cat.oppValue * 0.02 * streamingGames;
    const isTO = cat.key === 'turnovers';
    const newOppValue = cat.oppValue + (isTO ? streamBoost * 0.5 : streamBoost);
    const newDelta = isTO ? (newOppValue - cat.myValue) * -1 + (cat.myValue - newOppValue) : cat.myValue - newOppValue;

    const avgVal = (cat.myValue + newOppValue) / 2;
    const vol = CATEGORY_VOLATILITY[cat.key] || 0.15;
    const newNormDelta = avgVal > 0 ? (isTO ? (newOppValue - cat.myValue) : (cat.myValue - newOppValue)) / (avgVal * vol) : 0;
    const newWinProb = logisticWinProb(newNormDelta);
    const newConf = getConfidenceTier(newWinProb);

    const wasWinning = cat.winProbability >= 0.5;
    const nowWinning = newWinProb >= 0.5;
    if (wasWinning && !nowWinning) flippedCats.push(cat.label);

    return { ...cat, confidence: newConf, winProbability: newWinProb, normalizedDelta: newNormDelta };
  });

  return { flippedCats, updatedCategories: updated };
}

// ============================================================================
// OPPONENT SCENARIOS
// ============================================================================

interface BracketSeed {
  seed: number;
  teamName: string;
  record: string;
}

// ============================================================================
// ROUND-AWARE PLAYOFF OPPONENTS
// ============================================================================

export interface PlayoffRoundInfo {
  currentPlayoffRound: number;
  roundLabel: string; // "Quarterfinal", "Semifinal", "Finals"
  totalPlayoffRounds: number;
}

export interface PlayoffAwareResult {
  roundInfo: PlayoffRoundInfo;
  confirmedOpponent: { teamName: string; seed: number; record: string; round: string; likelihood: number } | null;
  futureOpponents: Array<{ teamName: string; seed: number; record: string; round: string; likelihood: number }>;
  /** Combined list for backwards compat */
  allOpponents: Array<{ teamName: string; seed: number; record: string; round: string; likelihood: number }>;
}

function getRoundLabel(round: number, totalRounds: number): string {
  if (totalRounds === 3) {
    if (round === 1) return 'Quarterfinal';
    if (round === 2) return 'Semifinal';
    return 'Finals';
  }
  if (totalRounds === 2) {
    if (round === 1) return 'Semifinal';
    return 'Finals';
  }
  return `Round ${round}`;
}

/**
 * Round-aware opponent detection.
 * Uses actual playoff matchups from parsed schedule for current/past rounds.
 * Only generates speculative "likely" opponents for future rounds.
 */
export function getPlayoffAwareOpponents(
  userTeamName: string,
  playoffSeeds: BracketSeed[],
  numPlayoffTeams: number,
  currentWeek: number,
  lastRegularSeasonWeek: number | undefined,
  /** Resolved schedule matchups with week numbers */
  scheduleMatchups?: Array<{ week: number; awayTeam: string; homeTeam: string }>,
): PlayoffAwareResult {
  const lastRegWeek = lastRegularSeasonWeek ?? 18;
  const currentPlayoffRound = Math.max(1, currentWeek - lastRegWeek);
  
  // Determine total playoff rounds from schedule data
  const playoffWeeks = scheduleMatchups
    ? [...new Set(scheduleMatchups.filter(m => m.week > lastRegWeek).map(m => m.week))].sort((a, b) => a - b)
    : [];
  const totalPlayoffRounds = playoffWeeks.length > 0 ? playoffWeeks.length : (numPlayoffTeams === 6 ? 3 : 2);
  
  const roundLabel = getRoundLabel(currentPlayoffRound, totalPlayoffRounds);
  const roundInfo: PlayoffRoundInfo = { currentPlayoffRound, roundLabel, totalPlayoffRounds };

  const normUser = userTeamName.toLowerCase();

  // Try to find confirmed opponent for current round from schedule
  let confirmedOpponent: PlayoffAwareResult['confirmedOpponent'] = null;
  
  if (scheduleMatchups && currentWeek > lastRegWeek) {
    const currentWeekMatchups = scheduleMatchups.filter(m => m.week === currentWeek);
    const userMatchup = currentWeekMatchups.find(
      m => m.awayTeam.toLowerCase() === normUser || m.homeTeam.toLowerCase() === normUser
    );
    
    if (userMatchup) {
      const oppName = userMatchup.awayTeam.toLowerCase() === normUser
        ? userMatchup.homeTeam
        : userMatchup.awayTeam;
      const oppSeed = playoffSeeds.find(s => s.teamName.toLowerCase() === oppName.toLowerCase());
      
      // Determine bracket path: winner's bracket vs consolation
      let bracketRoundLabel = roundLabel;
      if (currentPlayoffRound >= 2 && numPlayoffTeams === 6) {
        const userSeedNum = playoffSeeds.find(s => s.teamName.toLowerCase() === normUser)?.seed || 0;
        const oppSeedNum = oppSeed?.seed || 0;
        // Winner's bracket semis involve seed 1 or 2; if neither team is top 2, it's consolation
        if (userSeedNum >= 3 && oppSeedNum >= 3 && userSeedNum <= 6 && oppSeedNum <= 6) {
          bracketRoundLabel = "Winner's Consolation";
        }
      }
      
      confirmedOpponent = {
        teamName: oppSeed?.teamName || oppName,
        seed: oppSeed?.seed || 0,
        record: oppSeed?.record || '',
        round: bracketRoundLabel,
        likelihood: 1.0,
      };
      
      // Update roundInfo label if user is in consolation bracket
      if (bracketRoundLabel !== roundLabel) {
        roundInfo.roundLabel = bracketRoundLabel;
      }
    }
  }

  // Generate future round opponents (speculative)
  const futureOpponents: PlayoffAwareResult['futureOpponents'] = [];
  
  if (currentPlayoffRound < totalPlayoffRounds) {
    // Find potential opponents for the next round(s)
    const nextRound = currentPlayoffRound + 1;
    const nextRoundLabel = getRoundLabel(nextRound, totalPlayoffRounds);
    const nextRoundWeek = lastRegWeek + nextRound;
    
    if (scheduleMatchups) {
      // Look at the other matchups in current round — winners become potential next-round opponents
      const currentRoundMatchups = scheduleMatchups.filter(m => m.week === currentWeek);
      const otherMatchups = currentRoundMatchups.filter(
        m => m.awayTeam.toLowerCase() !== normUser && m.homeTeam.toLowerCase() !== normUser
      );
      
      for (const matchup of otherMatchups) {
        const team1 = playoffSeeds.find(s => s.teamName.toLowerCase() === matchup.awayTeam.toLowerCase());
        const team2 = playoffSeeds.find(s => s.teamName.toLowerCase() === matchup.homeTeam.toLowerCase());
        
        // Higher seed gets slight likelihood edge
        if (team1) {
          futureOpponents.push({
            ...team1,
            teamName: team1.teamName,
            round: nextRoundLabel,
            likelihood: team2 ? (team1.seed < team2.seed ? 0.55 : 0.45) : 0.5,
          });
        }
        if (team2) {
          futureOpponents.push({
            ...team2,
            teamName: team2.teamName,
            round: nextRoundLabel,
            likelihood: team1 ? (team2.seed < team1.seed ? 0.55 : 0.45) : 0.5,
          });
        }
      }
    }
    
    // If no schedule data or no future opponents found, fall back to seed-based logic
    if (futureOpponents.length === 0) {
      const fallback = getLikelyOpponentsFallback(playoffSeeds.find(s => s.teamName.toLowerCase() === normUser)?.seed || 1, playoffSeeds, numPlayoffTeams);
      futureOpponents.push(...fallback.filter(o => o.round !== roundLabel));
    }
  }

  // Build combined list
  const allOpponents = [
    ...(confirmedOpponent ? [confirmedOpponent] : []),
    ...futureOpponents,
  ];

  // If no confirmed opponent and no future opponents, fall back entirely
  if (allOpponents.length === 0) {
    const userSeed = playoffSeeds.find(s => s.teamName.toLowerCase() === normUser)?.seed || 1;
    const fallback = getLikelyOpponentsFallback(userSeed, playoffSeeds, numPlayoffTeams);
    return {
      roundInfo,
      confirmedOpponent: null,
      futureOpponents: fallback,
      allOpponents: fallback,
    };
  }

  return { roundInfo, confirmedOpponent, futureOpponents, allOpponents };
}

/** Original seed-based logic as fallback */
function getLikelyOpponentsFallback(
  userSeed: number,
  playoffSeeds: BracketSeed[],
  numPlayoffTeams: number,
): Array<{ teamName: string; seed: number; record: string; round: string; likelihood: number }> {
  const opponents: Array<{ teamName: string; seed: number; record: string; round: string; likelihood: number }> = [];

  if (numPlayoffTeams === 6) {
    if (userSeed === 1) {
      const s4 = playoffSeeds.find(s => s.seed === 4);
      const s5 = playoffSeeds.find(s => s.seed === 5);
      if (s4) opponents.push({ ...s4, round: 'Semifinal', likelihood: 0.55 });
      if (s5) opponents.push({ ...s5, round: 'Semifinal', likelihood: 0.45 });
      const s2 = playoffSeeds.find(s => s.seed === 2);
      const s3 = playoffSeeds.find(s => s.seed === 3);
      const s6 = playoffSeeds.find(s => s.seed === 6);
      if (s2) opponents.push({ ...s2, round: 'Finals', likelihood: 0.35 });
      if (s3) opponents.push({ ...s3, round: 'Finals', likelihood: 0.25 });
      if (s6) opponents.push({ ...s6, round: 'Finals', likelihood: 0.10 });
    } else if (userSeed === 2) {
      const s3 = playoffSeeds.find(s => s.seed === 3);
      const s6 = playoffSeeds.find(s => s.seed === 6);
      if (s3) opponents.push({ ...s3, round: 'Semifinal', likelihood: 0.65 });
      if (s6) opponents.push({ ...s6, round: 'Semifinal', likelihood: 0.35 });
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

/** @deprecated Use getPlayoffAwareOpponents instead */
export function getLikelyOpponents(
  userSeed: number,
  playoffSeeds: BracketSeed[],
  numPlayoffTeams: number,
) {
  return getLikelyOpponentsFallback(userSeed, playoffSeeds, numPlayoffTeams);
}

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
  const { winProbability, expectedCatsWon, expectedCatsLost } = computeOverallWinProb(categories);
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
    scheduleEdge: 0,
    categories,
    weightedEdge,
    overallConfidence,
  };
}

// ============================================================================
// BYE WEEK PREP (v2.1 — with strategy + identity + vulnerability)
// ============================================================================

export function generateByeWeekPlan(
  scenarios: OpponentScenario[],
  weights?: Record<string, number>,
): ByeWeekPlan {
  if (scenarios.length === 0) {
    return {
      targetCategories: [], streamerProfile: [], rosterNotes: [],
      identity: { protect: [], attack: [], reinforce: [], punt: [], summary: '' },
      vulnerableToStreaming: [],
    };
  }

  // Use most likely first-round opponent for identity
  const primary = scenarios.reduce((best, s) => s.likelihood > best.likelihood ? s : best, scenarios[0]);
  const identity = buildPlayoffIdentity(primary.categories);
  const { flippedCats: vulnerableToStreaming } = simulateOpponentStreaming(primary.categories, 4);

  // Ranked target categories from the primary scenario
  const targetCategories = primary.categories
    .filter(c => c.strategy === 'Attack' || c.strategy === 'Reinforce')
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5)
    .map(c => ({
      key: c.key,
      label: c.label,
      reason: c.strategyReason,
      strategy: c.strategy,
      priorityScore: c.priorityScore,
    }));

  // Streamer profile
  const streamerProfile: string[] = [];
  const targetKeys = targetCategories.map(t => t.key);
  if (targetKeys.includes('threepm') || targetKeys.includes('points')) streamerProfile.push('High-volume scorers with 3PT upside');
  if (targetKeys.includes('steals') || targetKeys.includes('blocks')) streamerProfile.push('Defensive specialists (STL/BLK)');
  if (targetKeys.includes('rebounds')) streamerProfile.push('Big men with high rebound rates');
  if (targetKeys.includes('assists')) streamerProfile.push('Playmakers / high-usage guards');
  if (targetKeys.includes('fgPct')) streamerProfile.push('Efficient scorers (avoid low FG% shooters)');
  if (targetKeys.includes('ftPct')) streamerProfile.push('Strong FT shooters (guards, wings)');
  if (targetKeys.includes('turnovers')) streamerProfile.push('Low-turnover role players');
  if (streamerProfile.length === 0) streamerProfile.push('Stream for volume — maximize games played');

  const rosterNotes: string[] = [];
  if (primary.winProbability > 0.65) {
    rosterNotes.push(`Strong projection vs ${primary.teamName} — protect your edges in ${identity.protect.join(', ') || 'key categories'}`);
  } else if (primary.winProbability < 0.4) {
    rosterNotes.push(`Tough matchup vs ${primary.teamName} — aggressive streaming recommended for ${identity.attack.join(', ') || 'swing categories'}`);
  } else {
    rosterNotes.push(`Competitive matchup vs ${primary.teamName} — target swing categories to tip the scale`);
  }
  if (vulnerableToStreaming.length > 0) {
    rosterNotes.push(`⚠ Vulnerable if opponent streams: ${vulnerableToStreaming.join(', ')} could flip`);
  }

  return { targetCategories, streamerProfile, rosterNotes, identity, vulnerableToStreaming };
}
