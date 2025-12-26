/**
 * Dynamic wCRI Weight Calculation System
 * 
 * Adjusts wCRI category weights based on matchup outlook or league standings.
 * effectiveWeight[cat] = baseWeight[cat] * needMultiplier[cat]
 */

import { CRIS_WEIGHTS } from "@/lib/crisUtils";

// ============= TYPE DEFINITIONS =============

export type DynamicMode = "matchup" | "standings";
export type IntensityLevel = "low" | "medium" | "high";

export interface CategoryMargin {
  key: string;
  label: string;
  margin: number; // positive = winning, negative = losing
  confidence: "locked" | "safe" | "tossup" | "close" | "losing";
  projectedYou: number;
  projectedOpp: number;
}

export interface StandingsRank {
  key: string;
  label: string;
  rank: number;      // 1 = best
  totalTeams: number;
  distanceToNext: number; // gap to team above (negative if below)
  opportunity: "punt" | "locked" | "safe" | "opportunity" | "high-opportunity";
  seasonAvg: number;
  leagueAvg: number;
}

export interface MatchupContext {
  categoryMargins: CategoryMargin[];
  dayOfWeek: number;       // 1-7 (Mon=1, Sun=7)
  daysRemaining: number;
}

export interface StandingsContext {
  categoryRanks: StandingsRank[];
  allowPuntDetection: boolean;
}

export interface SmoothingState {
  multipliers: Record<string, number>;
  lastUpdated: string; // ISO date
}

export interface DynamicWeightResult {
  baseWeight: number;
  needMultiplier: number;
  effectiveWeight: number;
  reason: string;
  modeInput: string; // e.g., "Margin: +12.5" or "Rank: 3/12"
}

export interface EffectiveWeightsResult {
  weights: Record<string, number>;
  details: Record<string, DynamicWeightResult>;
  mode: DynamicMode;
  isActive: boolean;
  unavailableReason?: string;
}

// ============= CONSTANTS =============

// Thresholds for confidence bands (per category type)
const COUNTING_THRESHOLDS = {
  locked: 30,      // >30 ahead = locked win
  safe: 15,        // 15-30 ahead = safe
  tossup: 8,       // within 8 = tossup
  close: 0,        // negative but < threshold = close
  losing: -15,     // more than 15 behind = losing bad
};

const PERCENTAGE_THRESHOLDS = {
  locked: 0.040,   // >4% ahead = locked
  safe: 0.020,     // 2-4% ahead = safe
  tossup: 0.012,   // within 1.2% = tossup
  close: 0,        
  losing: -0.020,
};

// Multiplier values for each confidence band
const MULTIPLIER_BANDS = {
  locked: { min: 0.25, max: 0.50 },
  safe: { min: 0.60, max: 0.90 },
  tossup: { min: 1.00, max: 1.10 },
  close: { min: 1.15, max: 1.30 },
  losing: { min: 1.30, max: 1.50 },
};

// TO-specific clamps (tighter range)
const TO_CLAMP = { min: 0.50, max: 1.20 };
const GENERAL_CLAMP = { min: 0.25, max: 1.50 };

// Smoothing alpha (higher = more weight on previous)
const SMOOTHING_ALPHA = 0.7;

// Intensity exponents
const INTENSITY_EXPONENTS = {
  low: 0.5,     // Compress toward 1.0
  medium: 1.0,  // As-is
  high: 1.25,   // Expand away from 1.0
};

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  fgPct: "FG%",
  ftPct: "FT%",
  threepm: "3PM",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TO",
  points: "PTS",
};

// ============= HELPER FUNCTIONS =============

function isPercentageCategory(key: string): boolean {
  return key === "fgPct" || key === "ftPct";
}

function isTurnoverCategory(key: string): boolean {
  return key === "turnovers";
}

/**
 * Determine confidence band from margin
 */
function getConfidenceBand(
  margin: number, 
  isPercentage: boolean
): "locked" | "safe" | "tossup" | "close" | "losing" {
  const thresholds = isPercentage ? PERCENTAGE_THRESHOLDS : COUNTING_THRESHOLDS;
  
  if (margin >= thresholds.locked) return "locked";
  if (margin >= thresholds.safe) return "safe";
  if (margin >= -thresholds.tossup && margin <= thresholds.tossup) return "tossup";
  if (margin >= thresholds.losing) return "close";
  return "losing";
}

/**
 * Map confidence band to raw multiplier
 */
function bandToMultiplier(band: "locked" | "safe" | "tossup" | "close" | "losing", margin: number, isPercentage: boolean): number {
  const range = MULTIPLIER_BANDS[band];
  const thresholds = isPercentage ? PERCENTAGE_THRESHOLDS : COUNTING_THRESHOLDS;
  
  // Interpolate within the band based on margin
  let t = 0.5; // default to middle
  switch (band) {
    case "locked":
      t = Math.min(1, (margin - thresholds.locked) / (thresholds.locked * 0.5));
      break;
    case "safe":
      t = (margin - thresholds.safe) / (thresholds.locked - thresholds.safe);
      break;
    case "tossup":
      t = 0.5 + (margin / (thresholds.tossup * 2));
      break;
    case "close":
      t = 1 - Math.abs(margin) / Math.abs(thresholds.losing);
      break;
    case "losing":
      t = Math.min(1, Math.abs(margin - thresholds.losing) / Math.abs(thresholds.losing));
      break;
  }
  
  t = Math.max(0, Math.min(1, t));
  return range.min + t * (range.max - range.min);
}

/**
 * Apply intensity scaling
 */
function applyIntensity(multiplier: number, intensity: IntensityLevel): number {
  const exp = INTENSITY_EXPONENTS[intensity];
  // Scale around 1.0: if multiplier > 1, make it bigger (or smaller for low intensity)
  // if multiplier < 1, make it smaller (or closer to 1 for low intensity)
  if (multiplier >= 1) {
    return 1 + Math.pow(multiplier - 1, exp);
  } else {
    return 1 - Math.pow(1 - multiplier, exp);
  }
}

/**
 * Clamp multiplier to valid range
 */
function clampMultiplier(multiplier: number, isTurnover: boolean): number {
  const clamp = isTurnover ? TO_CLAMP : GENERAL_CLAMP;
  return Math.max(clamp.min, Math.min(clamp.max, multiplier));
}

/**
 * Apply EMA smoothing
 */
function applySmoothing(
  current: number, 
  previous: number | undefined, 
  enabled: boolean
): number {
  if (!enabled || previous === undefined) return current;
  return SMOOTHING_ALPHA * previous + (1 - SMOOTHING_ALPHA) * current;
}

// ============= MAIN FUNCTIONS =============

/**
 * Calculate need multipliers for Matchup Mode
 */
export function calculateMatchupMultipliers(
  context: MatchupContext,
  intensity: IntensityLevel,
  smoothingEnabled: boolean,
  smoothingState?: SmoothingState
): Record<string, DynamicWeightResult> {
  const results: Record<string, DynamicWeightResult> = {};
  
  for (const catMargin of context.categoryMargins) {
    const { key, margin, projectedYou, projectedOpp } = catMargin;
    const isPercentage = isPercentageCategory(key);
    const isTurnover = isTurnoverCategory(key);
    const baseWeight = CRIS_WEIGHTS[key as keyof typeof CRIS_WEIGHTS] || 1;
    
    // For turnovers, margin is already inverted (positive = good)
    const band = getConfidenceBand(margin, isPercentage);
    let rawMultiplier = bandToMultiplier(band, margin, isPercentage);
    
    // Apply intensity
    rawMultiplier = applyIntensity(rawMultiplier, intensity);
    
    // Apply smoothing
    const prevMultiplier = smoothingState?.multipliers[key];
    rawMultiplier = applySmoothing(rawMultiplier, prevMultiplier, smoothingEnabled);
    
    // Clamp
    const needMultiplier = clampMultiplier(rawMultiplier, isTurnover);
    
    const effectiveWeight = baseWeight * needMultiplier;
    
    // Format reason and mode input
    const marginStr = isPercentage 
      ? `${margin >= 0 ? "+" : ""}${(margin * 100).toFixed(1)}%`
      : `${margin >= 0 ? "+" : ""}${margin.toFixed(1)}`;
    
    results[key] = {
      baseWeight,
      needMultiplier,
      effectiveWeight,
      reason: `${band.charAt(0).toUpperCase() + band.slice(1)} (${context.daysRemaining} days left)`,
      modeInput: `Margin: ${marginStr} | You: ${isPercentage ? (projectedYou * 100).toFixed(1) + "%" : projectedYou.toFixed(1)} vs Opp: ${isPercentage ? (projectedOpp * 100).toFixed(1) + "%" : projectedOpp.toFixed(1)}`,
    };
  }
  
  return results;
}

/**
 * Calculate need multipliers for Standings Mode
 */
export function calculateStandingsMultipliers(
  context: StandingsContext,
  intensity: IntensityLevel,
  smoothingEnabled: boolean,
  smoothingState?: SmoothingState
): Record<string, DynamicWeightResult> {
  const results: Record<string, DynamicWeightResult> = {};
  
  for (const catRank of context.categoryRanks) {
    const { key, rank, totalTeams, distanceToNext, opportunity, seasonAvg, leagueAvg } = catRank;
    const isTurnover = isTurnoverCategory(key);
    const baseWeight = CRIS_WEIGHTS[key as keyof typeof CRIS_WEIGHTS] || 1;
    
    // Map opportunity to multiplier
    let rawMultiplier: number;
    switch (opportunity) {
      case "high-opportunity":
        rawMultiplier = 1.35;
        break;
      case "opportunity":
        rawMultiplier = 1.20;
        break;
      case "safe":
        rawMultiplier = 0.90;
        break;
      case "locked":
        rawMultiplier = 0.70;
        break;
      case "punt":
        rawMultiplier = context.allowPuntDetection ? 0.60 : 1.0;
        break;
      default:
        rawMultiplier = 1.0;
    }
    
    // Apply intensity
    rawMultiplier = applyIntensity(rawMultiplier, intensity);
    
    // Apply smoothing
    const prevMultiplier = smoothingState?.multipliers[key];
    rawMultiplier = applySmoothing(rawMultiplier, prevMultiplier, smoothingEnabled);
    
    // Clamp
    const needMultiplier = clampMultiplier(rawMultiplier, isTurnover);
    
    const effectiveWeight = baseWeight * needMultiplier;
    
    results[key] = {
      baseWeight,
      needMultiplier,
      effectiveWeight,
      reason: opportunity.replace("-", " ").replace(/^\w/, c => c.toUpperCase()),
      modeInput: `Rank: ${rank}/${totalTeams} | Gap: ${distanceToNext >= 0 ? "+" : ""}${distanceToNext.toFixed(1)} | Avg: ${seasonAvg.toFixed(1)} (League: ${leagueAvg.toFixed(1)})`,
    };
  }
  
  return results;
}

/**
 * Main function to get effective weights
 */
export function getEffectiveWeights(
  baseWeights: Record<string, number>,
  mode: DynamicMode,
  context: MatchupContext | StandingsContext | null,
  intensity: IntensityLevel,
  smoothingEnabled: boolean,
  smoothingState?: SmoothingState
): EffectiveWeightsResult {
  // Check if context is available
  if (!context) {
    return {
      weights: { ...baseWeights },
      details: {},
      mode,
      isActive: false,
      unavailableReason: "Required context data not available",
    };
  }
  
  // Calculate multipliers based on mode
  let details: Record<string, DynamicWeightResult>;
  
  if (mode === "matchup" && "categoryMargins" in context) {
    details = calculateMatchupMultipliers(context, intensity, smoothingEnabled, smoothingState);
  } else if (mode === "standings" && "categoryRanks" in context) {
    details = calculateStandingsMultipliers(context, intensity, smoothingEnabled, smoothingState);
  } else {
    return {
      weights: { ...baseWeights },
      details: {},
      mode,
      isActive: false,
      unavailableReason: `Invalid context for ${mode} mode`,
    };
  }
  
  // Apply base weights with multipliers
  const effectiveWeights: Record<string, number> = {};
  for (const [key, baseWeight] of Object.entries(baseWeights)) {
    if (details[key]) {
      // Use custom base weight, not default
      const customMultiplier = details[key].needMultiplier;
      effectiveWeights[key] = baseWeight * customMultiplier;
      // Update detail with custom base weight
      details[key] = {
        ...details[key],
        baseWeight,
        effectiveWeight: baseWeight * customMultiplier,
      };
    } else {
      effectiveWeights[key] = baseWeight;
    }
  }
  
  return {
    weights: effectiveWeights,
    details,
    mode,
    isActive: true,
  };
}

/**
 * Build MatchupContext from projection data
 */
export function buildMatchupContext(
  projectedMy: Record<string, number>,
  projectedOpp: Record<string, number>,
  currentMy?: Record<string, number>,
  currentOpp?: Record<string, number>,
  daysRemaining: number = 7
): MatchupContext {
  const categoryKeys = Object.keys(CRIS_WEIGHTS);
  const categoryMargins: CategoryMargin[] = [];
  
  for (const key of categoryKeys) {
    const isPercentage = isPercentageCategory(key);
    const isTurnover = isTurnoverCategory(key);
    
    // Use current + projected or just projected
    const myVal = (currentMy?.[key] ?? 0) + (projectedMy[key] ?? 0);
    const oppVal = (currentOpp?.[key] ?? 0) + (projectedOpp[key] ?? 0);
    
    // Calculate margin (for turnovers, invert so positive = good)
    let margin: number;
    if (isTurnover) {
      margin = oppVal - myVal; // Lower is better, so opponent having more is good
    } else {
      margin = myVal - oppVal;
    }
    
    const band = getConfidenceBand(margin, isPercentage);
    
    categoryMargins.push({
      key,
      label: CATEGORY_LABELS[key] || key,
      margin,
      confidence: band,
      projectedYou: myVal,
      projectedOpp: oppVal,
    });
  }
  
  return {
    categoryMargins,
    dayOfWeek: new Date().getDay() || 7, // Convert 0 (Sunday) to 7
    daysRemaining,
  };
}

/**
 * Build StandingsContext from league standings data
 */
export function buildStandingsContext(
  userCategoryAvgs: Record<string, number>,
  leagueCategoryAvgs: Record<string, number>,
  categoryRanks: Record<string, { rank: number; total: number; gap: number }>,
  allowPuntDetection: boolean = true
): StandingsContext {
  const categoryKeys = Object.keys(CRIS_WEIGHTS);
  const ranksResult: StandingsRank[] = [];
  
  for (const key of categoryKeys) {
    const rankData = categoryRanks[key] || { rank: 6, total: 12, gap: 0 };
    const userAvg = userCategoryAvgs[key] ?? 0;
    const leagueAvg = leagueCategoryAvgs[key] ?? 0;
    
    // Determine opportunity based on rank and gap
    let opportunity: StandingsRank["opportunity"];
    const relativeRank = rankData.rank / rankData.total;
    
    if (relativeRank <= 0.17) { // Top 2 in 12-team
      opportunity = Math.abs(rankData.gap) > 5 ? "locked" : "safe";
    } else if (relativeRank <= 0.33) { // Top 4
      opportunity = "safe";
    } else if (relativeRank <= 0.67) { // Middle
      opportunity = Math.abs(rankData.gap) < 3 ? "high-opportunity" : "opportunity";
    } else if (relativeRank <= 0.83) { // Bottom 4
      opportunity = allowPuntDetection ? "punt" : "opportunity";
    } else { // Bottom 2
      opportunity = allowPuntDetection ? "punt" : "opportunity";
    }
    
    ranksResult.push({
      key,
      label: CATEGORY_LABELS[key] || key,
      rank: rankData.rank,
      totalTeams: rankData.total,
      distanceToNext: rankData.gap,
      opportunity,
      seasonAvg: userAvg,
      leagueAvg,
    });
  }
  
  return {
    categoryRanks: ranksResult,
    allowPuntDetection,
  };
}

/**
 * Update smoothing state with new multipliers
 */
export function updateSmoothingState(
  current: SmoothingState | undefined,
  newMultipliers: Record<string, number>
): SmoothingState {
  return {
    multipliers: newMultipliers,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Validate that effective weights are within expected bounds
 */
export function validateEffectiveWeights(weights: Record<string, number>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const maxEffective = 1.5 * 1.5; // base max * clamp max = 2.25
  
  for (const [key, value] of Object.entries(weights)) {
    if (value < 0) {
      errors.push(`${key}: negative weight (${value})`);
    }
    if (value > maxEffective) {
      errors.push(`${key}: exceeds max (${value} > ${maxEffective})`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

export { CATEGORY_LABELS };
