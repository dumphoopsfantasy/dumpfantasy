/**
 * Monte Carlo Matchup Simulation Engine
 * 
 * Runs N simulations of a 9-cat H2H matchup.
 * Each simulation adds Gaussian noise to projected totals,
 * then tallies category wins → matchup outcome.
 * 
 * Variance model:
 *   - FG%/FT% (ratio stats): higher relative variance (more volatile week-to-week)
 *   - Counting stats (3PM, REB, AST, STL, BLK, TO, PTS): moderate variance
 *   - Turnovers: lower-is-better (handled in comparison)
 */

import { TeamTotalsWithPct } from '@/lib/teamTotals';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MonteCarloResult {
  /** Probability (0–1) that "my team" wins the matchup */
  winProbability: number;
  /** Probability (0–1) of a tie */
  tieProbability: number;
  /** Probability (0–1) that opponent wins */
  lossProbability: number;
  /** Number of simulations run */
  simulations: number;
  /** Average projected category wins for my team */
  avgWins: number;
  /** Average projected category losses */
  avgLosses: number;
  /** Per-category win probability (0–1) */
  categoryWinProbabilities: CategoryWinProb[];
}

export interface CategoryWinProb {
  key: string;
  label: string;
  winProb: number;   // 0–1
  tieProb: number;   // 0–1
  lossProb: number;  // 0–1
}

// ── Variance Configuration ─────────────────────────────────────────────────

/**
 * Coefficient of variation (σ / μ) per category.
 * These represent typical week-to-week variability in fantasy basketball.
 * 
 * Percentage stats are inherently more volatile in H2H because
 * the denominator (attempts) also varies.
 * 
 * Rare-event stats (STL, BLK) have higher CV because small totals swing more.
 */
const CATEGORY_CV: Record<string, number> = {
  fgPct: 0.06,       // FG% swings ±3–4% commonly
  ftPct: 0.08,       // FT% even more volatile (fewer attempts)
  threepm: 0.18,     // 3PM: moderate variance
  rebounds: 0.12,     // REB: relatively stable
  assists: 0.14,      // AST: moderate
  steals: 0.22,       // STL: high variance (low totals, fluky)
  blocks: 0.24,       // BLK: highest variance among counting
  turnovers: 0.15,    // TO: moderate
  points: 0.10,       // PTS: most stable counting stat
};

/**
 * Minimum absolute standard deviation per category.
 * Prevents degenerate cases where projected value is near 0.
 */
const MIN_SIGMA: Record<string, number> = {
  fgPct: 0.008,      // ~0.8% floor
  ftPct: 0.012,      // ~1.2% floor
  threepm: 2,
  rebounds: 5,
  assists: 3,
  steals: 1.5,
  blocks: 1.5,
  turnovers: 2,
  points: 8,
};

// ── Categories ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'fgPct', label: 'FG%', lowerBetter: false, isPct: true },
  { key: 'ftPct', label: 'FT%', lowerBetter: false, isPct: true },
  { key: 'threepm', label: '3PM', lowerBetter: false, isPct: false },
  { key: 'rebounds', label: 'REB', lowerBetter: false, isPct: false },
  { key: 'assists', label: 'AST', lowerBetter: false, isPct: false },
  { key: 'steals', label: 'STL', lowerBetter: false, isPct: false },
  { key: 'blocks', label: 'BLK', lowerBetter: false, isPct: false },
  { key: 'turnovers', label: 'TO', lowerBetter: true, isPct: false },
  { key: 'points', label: 'PTS', lowerBetter: false, isPct: false },
] as const;

// ── RNG helpers ────────────────────────────────────────────────────────────

/**
 * Box-Muller transform: generates a standard normal random variate.
 */
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Generates a noisy value given mean and coefficient of variation.
 * Clamps percentage stats to [0, 1].
 */
function noisyValue(mean: number, key: string): number {
  const cv = CATEGORY_CV[key] ?? 0.15;
  const minSig = MIN_SIGMA[key] ?? 1;
  const sigma = Math.max(Math.abs(mean) * cv, minSig);
  const noisy = mean + gaussianRandom() * sigma;

  // Clamp percentages to [0, 1]
  if (key === 'fgPct' || key === 'ftPct') {
    return Math.max(0, Math.min(1, noisy));
  }
  // Counting stats can't go below 0
  return Math.max(0, noisy);
}

// ── Core Simulation ────────────────────────────────────────────────────────

/**
 * Runs a Monte Carlo simulation of a 9-category H2H matchup.
 *
 * @param myTotals   - Projected totals for my team
 * @param oppTotals  - Projected totals for opponent
 * @param numSims    - Number of simulations (default 10,000)
 * @returns MonteCarloResult with win/loss/tie probabilities
 */
export function runMonteCarloSimulation(
  myTotals: TeamTotalsWithPct,
  oppTotals: TeamTotalsWithPct,
  numSims: number = 10_000,
): MonteCarloResult {
  // Track outcomes
  let matchupWins = 0;
  let matchupLosses = 0;
  let matchupTies = 0;
  let totalCatWins = 0;
  let totalCatLosses = 0;

  // Per-category tracking
  const catWins = new Float64Array(CATEGORIES.length);
  const catTies = new Float64Array(CATEGORIES.length);
  const catLosses = new Float64Array(CATEGORIES.length);

  // Pre-extract projected values
  const myValues = CATEGORIES.map(c => (myTotals as any)[c.key] as number);
  const oppValues = CATEGORIES.map(c => (oppTotals as any)[c.key] as number);

  for (let sim = 0; sim < numSims; sim++) {
    let wins = 0;
    let losses = 0;

    for (let i = 0; i < CATEGORIES.length; i++) {
      const cat = CATEGORIES[i];
      const myNoisy = noisyValue(myValues[i], cat.key);
      const oppNoisy = noisyValue(oppValues[i], cat.key);

      let myWin: boolean;
      let tie: boolean;

      // Use a small epsilon for tie detection
      const diff = myNoisy - oppNoisy;
      const epsilon = cat.isPct ? 0.0005 : 0.5;

      if (Math.abs(diff) < epsilon) {
        tie = true;
        myWin = false;
      } else if (cat.lowerBetter) {
        tie = false;
        myWin = diff < 0;
      } else {
        tie = false;
        myWin = diff > 0;
      }

      if (tie) {
        catTies[i]++;
      } else if (myWin) {
        wins++;
        catWins[i]++;
      } else {
        losses++;
        catLosses[i]++;
      }
    }

    totalCatWins += wins;
    totalCatLosses += losses;

    if (wins > losses) matchupWins++;
    else if (losses > wins) matchupLosses++;
    else matchupTies++;
  }

  const categoryWinProbabilities: CategoryWinProb[] = CATEGORIES.map((cat, i) => ({
    key: cat.key,
    label: cat.label,
    winProb: catWins[i] / numSims,
    tieProb: catTies[i] / numSims,
    lossProb: catLosses[i] / numSims,
  }));

  return {
    winProbability: matchupWins / numSims,
    tieProbability: matchupTies / numSims,
    lossProbability: matchupLosses / numSims,
    simulations: numSims,
    avgWins: totalCatWins / numSims,
    avgLosses: totalCatLosses / numSims,
    categoryWinProbabilities,
  };
}
