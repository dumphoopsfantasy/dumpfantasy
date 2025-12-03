// CRIS (Category Ranking Index Standing) Utilities
// Higher CRIS = better overall category performance

export interface CategoryStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

export const CRIS_WEIGHTS = {
  fgPct: 0.65,
  ftPct: 0.60,
  threepm: 0.85,
  rebounds: 0.80,
  assists: 0.75,
  steals: 0.45,
  blocks: 0.55,
  turnovers: 0.35,
  points: 1.00,
};

export const CATEGORIES = [
  { key: 'fgPct', label: 'FG%', format: 'pct' },
  { key: 'ftPct', label: 'FT%', format: 'pct' },
  { key: 'threepm', label: '3PM', format: 'num' },
  { key: 'rebounds', label: 'REB', format: 'num' },
  { key: 'assists', label: 'AST', format: 'num' },
  { key: 'steals', label: 'STL', format: 'num' },
  { key: 'blocks', label: 'BLK', format: 'num' },
  { key: 'turnovers', label: 'TO', format: 'num' },
  { key: 'points', label: 'PTS', format: 'num' },
] as const;

/**
 * Calculate CRIS for a list of items with stats
 * Steps:
 * 1. For each category, rank all items (rank 1 = best)
 * 2. Invert ranking: inverted_rank = (N + 1) - rank
 * 3. CRIS = sum of all inverted_ranks
 * 
 * CRIS is always a positive number (minimum is 9 for a roster of 1)
 */
export function calculateCRISForAll<T extends CategoryStats>(
  items: T[],
  useWeighted = false
): (T & { cris: number; wCris: number })[] {
  if (items.length === 0) return [];
  
  const N = items.length;
  const categoryRanks: Record<string, number[]> = {};
  
  // Calculate ranks for each category
  CATEGORIES.forEach(cat => {
    // For turnovers, lower is better
    const isLowerBetter = cat.key === 'turnovers';
    const sorted = items
      .map((item, idx) => ({ idx, value: item[cat.key as keyof CategoryStats] }))
      .sort((a, b) => isLowerBetter ? a.value - b.value : b.value - a.value);
    
    categoryRanks[cat.key] = new Array(N).fill(0);
    sorted.forEach((item, rank) => {
      categoryRanks[cat.key][item.idx] = rank + 1;
    });
  });
  
  // Calculate CRIS and wCRIS for each item
  return items.map((item, idx) => {
    let cris = 0;
    let wCris = 0;
    
    CATEGORIES.forEach(cat => {
      const rank = categoryRanks[cat.key][idx];
      const invertedRank = (N + 1) - rank;
      cris += invertedRank;
      wCris += invertedRank * CRIS_WEIGHTS[cat.key as keyof typeof CRIS_WEIGHTS];
    });
    
    return { ...item, cris, wCris };
  });
}

/**
 * Format percentage to thousandths place (.485)
 */
export function formatPct(value: number): string {
  if (value >= 1) return `${value.toFixed(1)}%`;
  return `.${value.toFixed(3).slice(2)}`;
}

/**
 * Format stat value based on type
 */
export function formatStat(value: number, format: 'pct' | 'num'): string {
  if (format === 'pct') return formatPct(value);
  return value % 1 === 0 ? value.toString() : value.toFixed(1);
}
