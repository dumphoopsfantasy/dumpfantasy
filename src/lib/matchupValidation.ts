/**
 * Matchup Validation & Confidence System
 * 
 * Centralized validation for detecting data completeness issues
 * across all matchup projection cards. Instead of silently showing
 * zeros or misleading projections, surfaces honest warnings.
 */

import { RosterSlot } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { normalizeNbaTeamCode } from "@/lib/scheduleAwareProjection";

// ============================================================================
// TYPES
// ============================================================================

export type ConfidenceLevel = 'high' | 'moderate' | 'fragile' | 'incomplete';

export interface DataHealthCheck {
  // Schedule
  scheduleLoaded: boolean;
  scheduleDatesCount: number;
  gamesFoundCount: number;
  futureDatesWithGames: number;
  
  // Team mapping
  myTeamMappingCoverage: number; // 0-1
  oppTeamMappingCoverage: number; // 0-1
  myUnmappedPlayers: string[];
  oppUnmappedPlayers: string[];
  
  // Roster
  myRosterSize: number;
  oppRosterSize: number;
  oppRosterImported: boolean;
  
  // Projections
  myProjectedStarts: number;
  oppProjectedStarts: number;
  daysRemaining: number;
  
  // Overall
  confidence: ConfidenceLevel;
  warnings: DataWarning[];
  isValid: boolean;
}

export interface DataWarning {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  detail?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateMatchupData({
  myRoster,
  oppRoster,
  matchupDates,
  gamesByDate,
  myProjectedStarts,
  oppProjectedStarts,
  daysRemaining,
}: {
  myRoster: RosterSlot[];
  oppRoster: RosterSlot[];
  matchupDates: string[];
  gamesByDate: Map<string, NBAGame[]>;
  myProjectedStarts: number;
  oppProjectedStarts: number;
  daysRemaining: number;
}): DataHealthCheck {
  const warnings: DataWarning[] = [];
  
  // Schedule health
  const todayStr = new Date().toISOString().slice(0, 10);
  const futureDates = matchupDates.filter(d => d >= todayStr);
  let gamesFoundCount = 0;
  let futureDatesWithGames = 0;
  
  for (const d of futureDates) {
    const games = gamesByDate.get(d) || [];
    gamesFoundCount += games.length;
    if (games.length > 0) futureDatesWithGames++;
  }
  
  const scheduleLoaded = gamesByDate.size > 0;
  
  if (!scheduleLoaded) {
    warnings.push({
      code: 'NO_SCHEDULE',
      severity: 'error',
      message: 'NBA schedule not loaded',
      detail: 'Schedule data is required for projections.',
    });
  } else if (futureDatesWithGames === 0 && futureDates.length > 0) {
    warnings.push({
      code: 'NO_FUTURE_GAMES',
      severity: 'warning',
      message: 'No NBA games found for remaining matchup dates',
      detail: `Checked ${futureDates.length} future dates but found 0 games. Schedule may be loading.`,
    });
  }
  
  // Team mapping
  const checkMapping = (roster: RosterSlot[], label: string) => {
    const active = roster.filter(s => s.slotType !== 'ir');
    if (active.length === 0) return { coverage: 0, unmapped: [] as string[] };
    
    const mapped = active.filter(s => !!normalizeNbaTeamCode(s.player.nbaTeam));
    const unmapped = active
      .filter(s => !normalizeNbaTeamCode(s.player.nbaTeam))
      .map(s => s.player.name);
    
    const coverage = mapped.length / active.length;
    
    if (coverage < 0.7) {
      warnings.push({
        code: `LOW_MAPPING_${label.toUpperCase()}`,
        severity: 'warning',
        message: `${label} team mapping incomplete (${Math.round(coverage * 100)}%)`,
        detail: `${unmapped.length} players missing NBA team: ${unmapped.slice(0, 3).join(', ')}${unmapped.length > 3 ? '...' : ''}`,
      });
    }
    
    return { coverage, unmapped };
  };
  
  const myMapping = checkMapping(myRoster, 'Your');
  const oppMapping = checkMapping(oppRoster, 'Opponent');
  
  // Roster checks
  const oppRosterImported = oppRoster.length > 0;
  if (!oppRosterImported) {
    warnings.push({
      code: 'OPP_ROSTER_MISSING',
      severity: 'warning',
      message: 'Opponent roster not imported',
      detail: 'Schedule-aware projections require opponent roster data.',
    });
  }
  
  // Projection sanity
  if (daysRemaining > 0 && myProjectedStarts === 0 && myRoster.length > 0 && scheduleLoaded) {
    warnings.push({
      code: 'ZERO_STARTS_WITH_DAYS',
      severity: 'error',
      message: 'Projected starts = 0 but days remain',
      detail: `${daysRemaining} days remaining but 0 projected starts. Schedule data may not cover matchup dates.`,
    });
  }
  
  // Confidence
  let confidence: ConfidenceLevel = 'high';
  const hasErrors = warnings.some(w => w.severity === 'error');
  const hasWarnings = warnings.some(w => w.severity === 'warning');
  
  if (hasErrors) {
    confidence = 'incomplete';
  } else if (hasWarnings) {
    confidence = myMapping.coverage < 0.8 || !oppRosterImported ? 'fragile' : 'moderate';
  }
  
  return {
    scheduleLoaded,
    scheduleDatesCount: matchupDates.length,
    gamesFoundCount,
    futureDatesWithGames,
    myTeamMappingCoverage: myMapping.coverage,
    oppTeamMappingCoverage: oppMapping.coverage,
    myUnmappedPlayers: myMapping.unmapped,
    oppUnmappedPlayers: oppMapping.unmapped,
    myRosterSize: myRoster.length,
    oppRosterSize: oppRoster.length,
    oppRosterImported,
    myProjectedStarts,
    oppProjectedStarts,
    daysRemaining,
    confidence,
    warnings,
    isValid: !hasErrors,
  };
}

// ============================================================================
// CONFIDENCE DISPLAY HELPERS
// ============================================================================

export function getConfidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return 'High confidence';
    case 'moderate': return 'Moderate confidence';
    case 'fragile': return 'Fragile projection';
    case 'incomplete': return 'Incomplete data';
  }
}

export function getConfidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return 'text-stat-positive';
    case 'moderate': return 'text-primary';
    case 'fragile': return 'text-amber-400';
    case 'incomplete': return 'text-stat-negative';
  }
}

// ============================================================================
// CATEGORY CLASSIFICATION
// ============================================================================

export type CategoryOutlook = 'lock_win' | 'lean_win' | 'coin_flip' | 'lean_loss' | 'lock_loss';

export interface CategoryAnalysis {
  key: string;
  label: string;
  outlook: CategoryOutlook;
  myValue: number;
  oppValue: number;
  delta: number; // positive = you lead
  margin: number; // absolute margin as % of average
  flipProbability: number; // 0-100, rough estimate
  lowerBetter: boolean;
  strategy: 'protect' | 'attack' | 'reinforce' | 'punt';
}

export function classifyCategoryOutlook(
  delta: number,
  margin: number,
  _lowerBetter: boolean,
): CategoryOutlook {
  // margin = |delta| / avg, normalized
  if (margin > 0.25) return delta > 0 ? 'lock_win' : 'lock_loss';
  if (margin > 0.10) return delta > 0 ? 'lean_win' : 'lean_loss';
  return 'coin_flip';
}

export function estimateFlipProbability(margin: number): number {
  // Simple sigmoid-like: tight margins = high flip chance
  if (margin > 0.30) return 5;
  if (margin > 0.20) return 15;
  if (margin > 0.10) return 30;
  if (margin > 0.05) return 50;
  return 70;
}

export function classifyStrategy(
  outlook: CategoryOutlook,
  flipProb: number,
): 'protect' | 'attack' | 'reinforce' | 'punt' {
  if (outlook === 'lock_win' || outlook === 'lean_win') {
    return flipProb > 30 ? 'reinforce' : 'protect';
  }
  if (outlook === 'coin_flip') return 'attack';
  if (outlook === 'lean_loss') return flipProb > 40 ? 'attack' : 'punt';
  return 'punt';
}

export function getOutlookLabel(outlook: CategoryOutlook): string {
  switch (outlook) {
    case 'lock_win': return 'Lock Win';
    case 'lean_win': return 'Lean Win';
    case 'coin_flip': return 'Coin Flip';
    case 'lean_loss': return 'Lean Loss';
    case 'lock_loss': return 'Lock Loss';
  }
}

export function getOutlookColor(outlook: CategoryOutlook): string {
  switch (outlook) {
    case 'lock_win': return 'text-stat-positive';
    case 'lean_win': return 'text-stat-positive/70';
    case 'coin_flip': return 'text-amber-400';
    case 'lean_loss': return 'text-stat-negative/70';
    case 'lock_loss': return 'text-stat-negative';
  }
}

export function getStrategyLabel(strategy: 'protect' | 'attack' | 'reinforce' | 'punt'): string {
  switch (strategy) {
    case 'protect': return 'Protect';
    case 'attack': return 'Attack';
    case 'reinforce': return 'Reinforce';
    case 'punt': return 'Punt';
  }
}

export function getStrategyColor(strategy: 'protect' | 'attack' | 'reinforce' | 'punt'): string {
  switch (strategy) {
    case 'protect': return 'text-stat-positive bg-stat-positive/10';
    case 'attack': return 'text-amber-400 bg-amber-400/10';
    case 'reinforce': return 'text-primary bg-primary/10';
    case 'punt': return 'text-muted-foreground bg-muted/30';
  }
}

const STAT_CATEGORIES = [
  { key: 'fgPct', label: 'FG%', lowerBetter: false, isPercentage: true },
  { key: 'ftPct', label: 'FT%', lowerBetter: false, isPercentage: true },
  { key: 'threepm', label: '3PM', lowerBetter: false, isPercentage: false },
  { key: 'rebounds', label: 'REB', lowerBetter: false, isPercentage: false },
  { key: 'assists', label: 'AST', lowerBetter: false, isPercentage: false },
  { key: 'steals', label: 'STL', lowerBetter: false, isPercentage: false },
  { key: 'blocks', label: 'BLK', lowerBetter: false, isPercentage: false },
  { key: 'turnovers', label: 'TO', lowerBetter: true, isPercentage: false },
  { key: 'points', label: 'PTS', lowerBetter: false, isPercentage: false },
] as const;

export function analyzeCategoriesFromTotals(
  myTotals: Record<string, number>,
  oppTotals: Record<string, number>,
): CategoryAnalysis[] {
  return STAT_CATEGORIES.map(cat => {
    const myVal = myTotals[cat.key] ?? 0;
    const oppVal = oppTotals[cat.key] ?? 0;
    
    // For lower-better (TO), flip the delta
    const rawDelta = cat.lowerBetter ? (oppVal - myVal) : (myVal - oppVal);
    const avg = (Math.abs(myVal) + Math.abs(oppVal)) / 2;
    const margin = avg > 0 ? Math.abs(rawDelta) / avg : 0;
    
    const outlook = classifyCategoryOutlook(rawDelta, margin, cat.lowerBetter);
    const flipProb = estimateFlipProbability(margin);
    const strategy = classifyStrategy(outlook, flipProb);
    
    return {
      key: cat.key,
      label: cat.label,
      outlook,
      myValue: myVal,
      oppValue: oppVal,
      delta: rawDelta,
      margin,
      flipProbability: flipProb,
      lowerBetter: cat.lowerBetter,
      strategy,
    };
  });
}
