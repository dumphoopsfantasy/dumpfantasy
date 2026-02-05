/**
 * Category Specialist Tags
 * Computes up to 2 specialist tags for a player based on their stats.
 */

export interface SpecialistTag {
  key: string;
  label: string;
  score: number;  // Higher = more notable
}

interface PlayerStatInput {
  points?: number;
  threepm?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  fgPct?: number;
  ftPct?: number;
  fga?: number;
  fta?: number;
  positions?: string[];
}

// Thresholds for specialist tags
const THRESHOLDS = {
  scoring: { min: 16, label: "Scoring" },
  threes: { min: 2.0, label: "3s" },
  rebounds: { min: 6.5, label: "Reb" },
  assists: { min: 4.5, label: "Ast" },
  stocks: { min: 1.8, label: "Stocks" },  // STL + BLK
  lowTO: { maxTO: 1.6, minAST: 3, label: "Low TO" },
  fgPct: { min: 0.50, minFGA: 10, fallbackMin: 0.51, label: "FG%" },
  ftPct: { min: 0.84, minFTA: 3, fallbackMin: 0.86, label: "FT%" },
};

function isGuardEligible(positions?: string[]): boolean {
  if (!positions) return false;
  return positions.some(p => 
    p.toUpperCase().includes('G') || 
    p.toUpperCase() === 'PG' || 
    p.toUpperCase() === 'SG'
  );
}

/**
 * Build category specialist tags for a player.
 * Returns max 2 tags, prioritized by "strength score".
 */
export function buildCategoryTags(stats: PlayerStatInput): string[] {
  const candidates: SpecialistTag[] = [];

  // Scoring
  if (stats.points !== undefined && stats.points >= THRESHOLDS.scoring.min) {
    const score = (stats.points - THRESHOLDS.scoring.min) / 10;
    candidates.push({ key: "scoring", label: THRESHOLDS.scoring.label, score });
  }

  // 3s
  if (stats.threepm !== undefined && stats.threepm >= THRESHOLDS.threes.min) {
    const score = (stats.threepm - THRESHOLDS.threes.min) / 2;
    candidates.push({ key: "threes", label: THRESHOLDS.threes.label, score });
  }

  // Rebounds
  if (stats.rebounds !== undefined && stats.rebounds >= THRESHOLDS.rebounds.min) {
    const score = (stats.rebounds - THRESHOLDS.rebounds.min) / 5;
    candidates.push({ key: "rebounds", label: THRESHOLDS.rebounds.label, score });
  }

  // Assists
  if (stats.assists !== undefined && stats.assists >= THRESHOLDS.assists.min) {
    const score = (stats.assists - THRESHOLDS.assists.min) / 4;
    candidates.push({ key: "assists", label: THRESHOLDS.assists.label, score });
  }

  // Stocks (STL + BLK)
  const steals = stats.steals ?? 0;
  const blocks = stats.blocks ?? 0;
  const stocks = steals + blocks;
  if (stocks >= THRESHOLDS.stocks.min) {
    const score = (stocks - THRESHOLDS.stocks.min) / 1.5;
    candidates.push({ key: "stocks", label: THRESHOLDS.stocks.label, score });
  }

  // Low TO (only for guards or high-assist players)
  if (stats.turnovers !== undefined && stats.turnovers <= THRESHOLDS.lowTO.maxTO) {
    const qualifies = isGuardEligible(stats.positions) || (stats.assists ?? 0) >= THRESHOLDS.lowTO.minAST;
    if (qualifies) {
      const score = (THRESHOLDS.lowTO.maxTO - stats.turnovers) / 1;
      candidates.push({ key: "lowTO", label: THRESHOLDS.lowTO.label, score });
    }
  }

  // FG%
  if (stats.fgPct !== undefined) {
    const hasFGA = stats.fga !== undefined && stats.fga >= THRESHOLDS.fgPct.minFGA;
    const threshold = hasFGA ? THRESHOLDS.fgPct.min : THRESHOLDS.fgPct.fallbackMin;
    if (stats.fgPct >= threshold) {
      const score = (stats.fgPct - threshold) * 10;
      candidates.push({ key: "fgPct", label: THRESHOLDS.fgPct.label, score });
    }
  }

  // FT%
  if (stats.ftPct !== undefined) {
    const hasFTA = stats.fta !== undefined && stats.fta >= THRESHOLDS.ftPct.minFTA;
    const threshold = hasFTA ? THRESHOLDS.ftPct.min : THRESHOLDS.ftPct.fallbackMin;
    if (stats.ftPct >= threshold) {
      const score = (stats.ftPct - threshold) * 10;
      candidates.push({ key: "ftPct", label: THRESHOLDS.ftPct.label, score });
    }
  }

  // Sort by score descending and take top 2
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 2).map(t => t.label);
}
