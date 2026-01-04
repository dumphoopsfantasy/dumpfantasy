// Trade Analyzer Utilities
// CRI = Category Ranking Index (unweighted)
// wCRI = Weighted CRI with configurable weights

import { CRIS_WEIGHTS, CATEGORIES } from './crisUtils';
import { normalizeMissingToken, isMissingToken, isMissingFractionToken } from './espnTokenUtils';
// Data schemas
export interface PlayerStats {
  name: string;
  team: string;
  positions: string[];
  status?: string;
  minutes: number;
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
  pr15?: number;
  rostPct?: number;
}

export interface PlayerScores extends PlayerStats {
  cri: number;
  wCri: number;
  criRank: number;
  wCriRank: number;
  marketRank?: number; // From %ROST or PR15
  valueGap?: number; // marketRank - modelRank
}

export interface TradePlayer {
  player: PlayerScores;
  side: 'give' | 'get';
}

export interface TradeScenario {
  giving: PlayerScores[];
  getting: PlayerScores[];
  replacements: PlayerScores[];
  drops: PlayerScores[];
  includeReplacement: boolean;
  assumeDrops: boolean;
}

export interface CategoryDelta {
  key: string;
  label: string;
  deltaPerGame: number;
  deltaPer40: number;
  scoreContribution: number; // CRI or wCRI contribution
  weightedContribution: number;
}

export interface TradeResult {
  // Trade-only impact
  tradeOnly: {
    deltaCRI: number;
    deltaWCRI: number;
    categoryDeltas: CategoryDelta[];
    newFgPct: number;
    newFtPct: number;
  };
  // Real impact (with replacements and drops)
  realImpact: {
    deltaCRI: number;
    deltaWCRI: number;
    categoryDeltas: CategoryDelta[];
    newFgPct: number;
    newFtPct: number;
  };
  // Fairness
  yourNetCRI: number;
  yourNetWCRI: number;
  theirNetCRI: number;
  theirNetWCRI: number;
  fairnessLabel: 'win-win' | 'you-win' | 'they-win' | 'even';
  // Verdict
  verdict: string;
  fitAnalysis: string;
  // Net players
  netPlayers: number; // positive = you receive more
}

export type ScoreMode = 'CRI' | 'wCRI';

export const DEFAULT_WEIGHTS = {
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

// Parse ESPN team page with header-driven mapping
export function parseESPNTeamPage(data: string): PlayerStats[] {
  if (!data || data.length < 100) return [];
  
  const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
  const players: PlayerStats[] = [];
  
  // Find stats header
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'MIN' && i + 1 < lines.length) {
      const nextFew = lines.slice(i, i + 15).join(' ');
      if (nextFew.includes('FG') && nextFew.includes('PTS')) {
        headerIdx = i;
        break;
      }
    }
  }
  
  if (headerIdx === -1) return [];
  
  // Build header map
  const headerMap: Record<string, number> = {};
  const knownHeaders = ['MIN', 'FGM/FGA', 'FG%', 'FTM/FTA', 'FT%', '3PM', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PTS', 'PR15', '%ROST', '+/-'];
  
  let colIdx = 0;
  for (let i = headerIdx; i < Math.min(headerIdx + 20, lines.length); i++) {
    const line = lines[i];
    if (knownHeaders.includes(line) || line === 'FGM/FGA' || line === 'FTM/FTA') {
      headerMap[line] = colIdx;
      colIdx++;
    } else if (/^\d/.test(line) || line === '--') {
      break;
    }
  }
  
  const numCols = Object.keys(headerMap).length;
  if (numCols < 10) return [];
  
  // Find where stats data begins
  let dataStartIdx = headerIdx + Object.keys(headerMap).length;
  
  // Collect stat tokens
  const statTokens: string[] = [];
  for (let i = dataStartIdx; i < lines.length; i++) {
    const raw = lines[i];
    if (/^(Username|Password|ESPN|Copyright|©)/i.test(raw)) break;

    const line = normalizeMissingToken(raw);

    // Split missing fraction (—/—, --/--) into two placeholder tokens
    if (isMissingFractionToken(line)) {
      statTokens.push('--', '--');
      continue;
    }

    // Split numeric FGM/FGA and FTM/FTA fractions
    if (/^\d+\.?\d*\/\d+\.?\d*$/.test(line)) {
      const [a, b] = line.split('/');
      statTokens.push(a, b);
      continue;
    }

    if (/^[-+]?\d+\.?\d*$/.test(line) || /^\.\d+$/.test(line) || isMissingToken(line)) {
      statTokens.push(isMissingToken(line) ? '--' : line);
    }
  }
  
  // Guardrail: truncate to prevent misaligned parsing from producing huge category numbers
  const actualCols = 17; // Standard ESPN columns after split
  const remainder = statTokens.length % actualCols;
  if (remainder !== 0) {
    console.warn(`[parseESPNTeamPage] Token count ${statTokens.length} not divisible by ${actualCols} (remainder ${remainder}). Truncating.`);
    statTokens.length = Math.floor(statTokens.length / actualCols) * actualCols;
  }
  
  // Parse player bio info before stats section
  const slotPattern = /^(PG|SG|SF|PF|C|G|F|UTIL|Bench|IR)$/i;
  const playerInfos: { name: string; team: string; positions: string[]; status?: string }[] = [];
  
  for (let i = 0; i < headerIdx; i++) {
    const line = lines[i];
    
    if (slotPattern.test(line)) {
      let name = '';
      let team = '';
      let positions: string[] = [];
      let status = '';
      
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const nextLine = lines[j];
        if (slotPattern.test(nextLine)) break;
        if (nextLine === 'MIN') break;
        
        // Status
        if (/^(O|OUT|DTD|GTD|Q|SUSP|P|IR|IL)$/i.test(nextLine)) {
          status = nextLine.toUpperCase();
          continue;
        }
        
        // Team code
        if (/^[A-Z]{2,4}$/.test(nextLine) && !team && nextLine !== 'IR' && nextLine !== 'IL') {
          team = nextLine;
          continue;
        }
        
        // Positions
        if (/^(PG|SG|SF|PF|C)(,\s*(PG|SG|SF|PF|C))*$/i.test(nextLine)) {
          positions = nextLine.toUpperCase().split(',').map(p => p.trim());
          continue;
        }
        
        // Player name (first valid non-status, non-team text)
        if (!name && nextLine.length > 3 && /^[A-Z]/.test(nextLine) && 
            !(/^(FA|WA|@|vs|MIN|Stats|Lineups)/.test(nextLine))) {
          // Check for doubled name pattern
          const collapsed = collapseDoubleName(nextLine);
          name = collapsed || nextLine;
        }
      }
      
      if (name) {
        playerInfos.push({ name, team, positions, status: status || undefined });
      }
    }
  }
  
  // Match stats to players
  const COLS_PER_ROW = numCols + (headerMap['FGM/FGA'] !== undefined ? 1 : 0) + (headerMap['FTM/FTA'] !== undefined ? 1 : 0);
  
  const numRows = Math.floor(statTokens.length / actualCols);
  
  for (let row = 0; row < Math.min(numRows, playerInfos.length); row++) {
    const base = row * actualCols;
    const parseVal = (offset: number): number => {
      const val = statTokens[base + offset];
      if (!val || val === '--') return 0;
      return parseFloat(val) || 0;
    };
    
    const info = playerInfos[row];
    const min = parseVal(0);
    if (min === 0) continue;
    
    const fgm = parseVal(1);
    const fga = parseVal(2);
    let fgPct = parseVal(3);
    if (fgPct > 1) fgPct = fgPct / (fgPct >= 100 ? 1000 : 100);
    
    const ftm = parseVal(4);
    const fta = parseVal(5);
    let ftPct = parseVal(6);
    if (ftPct > 1) ftPct = ftPct / (ftPct >= 100 ? 1000 : 100);
    
    const threepm = parseVal(7);
    const rebounds = parseVal(8);
    const assists = parseVal(9);
    const steals = parseVal(10);
    const blocks = parseVal(11);
    const turnovers = parseVal(12);
    const points = parseVal(13);
    const pr15 = parseVal(14);
    const rostPct = parseVal(15);
    
    players.push({
      name: info.name,
      team: info.team,
      positions: info.positions,
      status: info.status,
      minutes: min,
      fgm, fga, fgPct,
      ftm, fta, ftPct,
      threepm, rebounds, assists, steals, blocks, turnovers, points,
      pr15: pr15 > 0 ? pr15 : undefined,
      rostPct: rostPct > 0 ? rostPct : undefined,
    });
  }
  
  return players;
}

// Helper to collapse doubled names
function collapseDoubleName(text: string): string | null {
  const trimmed = text.trim();
  const len = trimmed.length;
  if (len < 6) return null;
  
  for (let offset = 0; offset <= 3; offset++) {
    for (const delta of [0, offset, -offset]) {
      const mid = Math.floor(len / 2) + delta;
      if (mid < 3 || mid > len - 3) continue;
      
      const first = trimmed.substring(0, mid).trim();
      const second = trimmed.substring(mid).trim();
      
      if (first === second && first.includes(' ') && /^[A-Z]/.test(first)) {
        return first;
      }
    }
  }
  return null;
}

// Calculate CRI for a pool of players (rank-based)
export function calcCRI(players: PlayerStats[]): PlayerScores[] {
  if (players.length === 0) return [];
  
  const N = players.length;
  const categoryRanks: Record<string, number[]> = {};
  
  // Calculate ranks for each category
  CATEGORIES.forEach(cat => {
    const isLowerBetter = cat.key === 'turnovers';
    const key = cat.key as keyof PlayerStats;
    
    const sorted = players
      .map((p, idx) => ({ idx, value: (p[key] as number) || 0 }))
      .sort((a, b) => isLowerBetter ? a.value - b.value : b.value - a.value);
    
    categoryRanks[cat.key] = new Array(N).fill(0);
    sorted.forEach((item, rank) => {
      categoryRanks[cat.key][item.idx] = rank + 1;
    });
  });
  
  // Calculate CRI and wCRI
  const scored: PlayerScores[] = players.map((p, idx) => {
    let cri = 0;
    let wCri = 0;
    
    CATEGORIES.forEach(cat => {
      const rank = categoryRanks[cat.key][idx];
      const invertedRank = (N + 1) - rank;
      cri += invertedRank;
      wCri += invertedRank * (CRIS_WEIGHTS[cat.key as keyof typeof CRIS_WEIGHTS] || 1);
    });
    
    return { ...p, cri, wCri, criRank: 0, wCriRank: 0 };
  });
  
  // Assign ranks
  const criSorted = [...scored].sort((a, b) => b.cri - a.cri);
  const wCriSorted = [...scored].sort((a, b) => b.wCri - a.wCri);
  
  criSorted.forEach((p, i) => { p.criRank = i + 1; });
  wCriSorted.forEach((p, i) => { p.wCriRank = i + 1; });
  
  // Calculate market rank if rostPct available
  const withRost = scored.filter(p => p.rostPct !== undefined && p.rostPct > 0);
  if (withRost.length > 0) {
    const rostSorted = [...scored].sort((a, b) => (b.rostPct || 0) - (a.rostPct || 0));
    rostSorted.forEach((p, i) => {
      if (p.rostPct !== undefined && p.rostPct > 0) {
        p.marketRank = i + 1;
      }
    });
  }
  
  // Calculate value gap
  scored.forEach(p => {
    if (p.marketRank !== undefined) {
      p.valueGap = p.marketRank - p.criRank; // Positive = undervalued (buy low)
    }
  });
  
  return scored;
}

// Calculate weighted CRI with custom weights
export function calcWCRI(players: PlayerStats[], weights: typeof CRIS_WEIGHTS): PlayerScores[] {
  if (players.length === 0) return [];
  
  const N = players.length;
  const categoryRanks: Record<string, number[]> = {};
  
  CATEGORIES.forEach(cat => {
    const isLowerBetter = cat.key === 'turnovers';
    const key = cat.key as keyof PlayerStats;
    
    const sorted = players
      .map((p, idx) => ({ idx, value: (p[key] as number) || 0 }))
      .sort((a, b) => isLowerBetter ? a.value - b.value : b.value - a.value);
    
    categoryRanks[cat.key] = new Array(N).fill(0);
    sorted.forEach((item, rank) => {
      categoryRanks[cat.key][item.idx] = rank + 1;
    });
  });
  
  const scored: PlayerScores[] = players.map((p, idx) => {
    let cri = 0;
    let wCri = 0;
    
    CATEGORIES.forEach(cat => {
      const rank = categoryRanks[cat.key][idx];
      const invertedRank = (N + 1) - rank;
      cri += invertedRank;
      wCri += invertedRank * (weights[cat.key as keyof typeof weights] || 1);
    });
    
    return { ...p, cri, wCri, criRank: 0, wCriRank: 0 };
  });
  
  const criSorted = [...scored].sort((a, b) => b.cri - a.cri);
  const wCriSorted = [...scored].sort((a, b) => b.wCri - a.wCri);
  
  criSorted.forEach((p, i) => { p.criRank = i + 1; });
  wCriSorted.forEach((p, i) => { p.wCriRank = i + 1; });
  
  return scored;
}

// Calculate team aggregate stats with attempt-weighted percentages
export function calcTeamAggregate(players: PlayerStats[]): {
  totals: Record<string, number>;
  fgPct: number;
  ftPct: number;
  totalFGM: number;
  totalFGA: number;
  totalFTM: number;
  totalFTA: number;
} {
  let totalFGM = 0, totalFGA = 0, totalFTM = 0, totalFTA = 0;
  const totals: Record<string, number> = {
    threepm: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    points: 0,
  };
  
  players.forEach(p => {
    totalFGM += p.fgm;
    totalFGA += p.fga;
    totalFTM += p.ftm;
    totalFTA += p.fta;
    totals.threepm += p.threepm;
    totals.rebounds += p.rebounds;
    totals.assists += p.assists;
    totals.steals += p.steals;
    totals.blocks += p.blocks;
    totals.turnovers += p.turnovers;
    totals.points += p.points;
  });
  
  return {
    totals,
    fgPct: totalFGA > 0 ? totalFGM / totalFGA : 0,
    ftPct: totalFTA > 0 ? totalFTM / totalFTA : 0,
    totalFGM,
    totalFGA,
    totalFTM,
    totalFTA,
  };
}

// Calculate trade result
export function calcTradeResult(
  scenario: TradeScenario,
  yourRoster: PlayerScores[],
  weights: typeof CRIS_WEIGHTS,
  mode: ScoreMode
): TradeResult {
  const { giving, getting, replacements, drops, includeReplacement, assumeDrops } = scenario;
  
  // Calculate current aggregate
  const currentAgg = calcTeamAggregate(yourRoster);
  
  // Trade-only: remove giving, add getting
  const tradeOnlyRoster = yourRoster.filter(p => !giving.some(g => g.name === p.name));
  tradeOnlyRoster.push(...getting);
  const tradeOnlyAgg = calcTeamAggregate(tradeOnlyRoster);
  
  // Real impact: trade + replacements - drops
  let realRoster = [...tradeOnlyRoster];
  if (includeReplacement && replacements.length > 0) {
    realRoster.push(...replacements);
  }
  if (assumeDrops && drops.length > 0) {
    realRoster = realRoster.filter(p => !drops.some(d => d.name === p.name));
  }
  const realAgg = calcTeamAggregate(realRoster);
  
  // Calculate category deltas
  const calcCategoryDeltas = (before: typeof currentAgg, after: typeof currentAgg): CategoryDelta[] => {
    return CATEGORIES.map(cat => {
      const key = cat.key;
      let deltaPerGame = 0;
      
      if (key === 'fgPct') {
        deltaPerGame = after.fgPct - before.fgPct;
      } else if (key === 'ftPct') {
        deltaPerGame = after.ftPct - before.ftPct;
      } else {
        const beforeVal = before.totals[key] || 0;
        const afterVal = after.totals[key] || 0;
        deltaPerGame = afterVal - beforeVal;
      }
      
      const deltaPer40 = key === 'fgPct' || key === 'ftPct' ? deltaPerGame : deltaPerGame * 40;
      
      // Score contribution
      const weight = weights[key as keyof typeof weights] || 1;
      const isTO = key === 'turnovers';
      const scoreContribution = isTO ? -deltaPerGame : deltaPerGame;
      const weightedContribution = scoreContribution * weight;
      
      return {
        key,
        label: cat.label,
        deltaPerGame,
        deltaPer40,
        scoreContribution,
        weightedContribution,
      };
    });
  };
  
  const tradeOnlyDeltas = calcCategoryDeltas(currentAgg, tradeOnlyAgg);
  const realDeltas = calcCategoryDeltas(currentAgg, realAgg);
  
  // Calculate CRI/wCRI deltas
  const sumCRI = (players: PlayerScores[]) => players.reduce((sum, p) => sum + p.cri, 0);
  const sumWCRI = (players: PlayerScores[]) => players.reduce((sum, p) => sum + p.wCri, 0);
  
  const givingCRI = sumCRI(giving);
  const givingWCRI = sumWCRI(giving);
  const gettingCRI = sumCRI(getting);
  const gettingWCRI = sumWCRI(getting);
  const replacementsCRI = sumCRI(replacements);
  const replacementsWCRI = sumWCRI(replacements);
  const dropsCRI = sumCRI(drops);
  const dropsWCRI = sumWCRI(drops);
  
  const tradeOnlyDeltaCRI = gettingCRI - givingCRI;
  const tradeOnlyDeltaWCRI = gettingWCRI - givingWCRI;
  
  let realDeltaCRI = tradeOnlyDeltaCRI;
  let realDeltaWCRI = tradeOnlyDeltaWCRI;
  
  if (includeReplacement) {
    realDeltaCRI += replacementsCRI;
    realDeltaWCRI += replacementsWCRI;
  }
  if (assumeDrops) {
    realDeltaCRI -= dropsCRI;
    realDeltaWCRI -= dropsWCRI;
  }
  
  // Fairness: what they lose is what you gain and vice versa
  const yourNetCRI = gettingCRI - givingCRI;
  const yourNetWCRI = gettingWCRI - givingWCRI;
  const theirNetCRI = givingCRI - gettingCRI;
  const theirNetWCRI = givingWCRI - gettingWCRI;
  
  // Determine fairness label
  const yourNet = mode === 'CRI' ? yourNetCRI : yourNetWCRI;
  const theirNet = mode === 'CRI' ? theirNetCRI : theirNetWCRI;
  const threshold = 5; // Within 5 points is "even"
  
  let fairnessLabel: TradeResult['fairnessLabel'] = 'even';
  if (yourNet > threshold && theirNet > threshold) {
    fairnessLabel = 'win-win';
  } else if (yourNet > threshold) {
    fairnessLabel = 'you-win';
  } else if (theirNet > threshold) {
    fairnessLabel = 'they-win';
  }
  
  // Generate verdict
  const improvements = realDeltas.filter(d => 
    (d.key !== 'turnovers' && d.deltaPerGame > 0) || 
    (d.key === 'turnovers' && d.deltaPerGame < 0)
  ).map(d => d.label);
  
  const hurts = realDeltas.filter(d =>
    (d.key !== 'turnovers' && d.deltaPerGame < 0) ||
    (d.key === 'turnovers' && d.deltaPerGame > 0)
  ).map(d => d.label);
  
  let verdict = '';
  if (improvements.length > 0 && hurts.length > 0) {
    verdict = `This trade improves ${improvements.slice(0, 3).join('/')} but hurts ${hurts.slice(0, 3).join('/')}`;
  } else if (improvements.length > 0) {
    verdict = `This trade improves ${improvements.slice(0, 4).join('/')}`;
  } else if (hurts.length > 0) {
    verdict = `This trade hurts ${hurts.slice(0, 4).join('/')}`;
  } else {
    verdict = 'This trade has minimal impact';
  }
  
  // Fit analysis based on weights
  const lowWeightCats = Object.entries(weights)
    .filter(([_, w]) => w < 0.5)
    .map(([k]) => CATEGORIES.find(c => c.key === k)?.label || k);
  
  const hurtingLowWeight = hurts.filter(h => lowWeightCats.includes(h));
  
  let fitAnalysis = '';
  if (hurtingLowWeight.length > 0) {
    fitAnalysis = `Fits punt ${hurtingLowWeight.join('/')} build`;
  } else if (hurts.length > 0) {
    fitAnalysis = 'May conflict with your build priorities';
  } else {
    fitAnalysis = 'Aligns well with your category priorities';
  }
  
  return {
    tradeOnly: {
      deltaCRI: tradeOnlyDeltaCRI,
      deltaWCRI: tradeOnlyDeltaWCRI,
      categoryDeltas: tradeOnlyDeltas,
      newFgPct: tradeOnlyAgg.fgPct,
      newFtPct: tradeOnlyAgg.ftPct,
    },
    realImpact: {
      deltaCRI: realDeltaCRI,
      deltaWCRI: realDeltaWCRI,
      categoryDeltas: realDeltas,
      newFgPct: realAgg.fgPct,
      newFtPct: realAgg.ftPct,
    },
    yourNetCRI,
    yourNetWCRI,
    theirNetCRI,
    theirNetWCRI,
    fairnessLabel,
    verdict,
    fitAnalysis,
    netPlayers: getting.length - giving.length,
  };
}

// Find target players based on category needs
export function findTargets(
  candidates: PlayerScores[],
  needCategory: string,
  avoidHurting: string | null,
  mode: ScoreMode,
  limit: number = 10
): PlayerScores[] {
  const needKey = CATEGORIES.find(c => c.label === needCategory)?.key || needCategory;
  const avoidKey = avoidHurting ? CATEGORIES.find(c => c.label === avoidHurting)?.key || avoidHurting : null;
  
  // Score each candidate
  const scored = candidates.map(p => {
    const needVal = p[needKey as keyof PlayerStats] as number || 0;
    const avoidVal = avoidKey ? p[avoidKey as keyof PlayerStats] as number || 0 : 0;
    const scoreCost = mode === 'CRI' ? p.cri : p.wCri;
    
    // Efficiency: need value per score cost
    const efficiency = scoreCost > 0 ? needVal / scoreCost : 0;
    
    // Penalty if hurting avoid category (for percentages, lower is worse)
    let penalty = 0;
    if (avoidKey && avoidKey.includes('Pct') && avoidVal < 0.5) {
      penalty = (0.5 - avoidVal) * 100;
    }
    
    return { player: p, score: efficiency - penalty };
  });
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.player);
}

// Sanity checks
export function validatePlayer(p: PlayerStats): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (p.fgPct < 0 || p.fgPct > 1) errors.push(`FG% out of range: ${p.fgPct}`);
  if (p.ftPct < 0 || p.ftPct > 1) errors.push(`FT% out of range: ${p.ftPct}`);
  if (p.fga > 0 && p.fga < p.fgm) errors.push('FGM > FGA');
  if (p.fta > 0 && p.fta < p.ftm) errors.push('FTM > FTA');
  if (p.points > 60) errors.push(`Points per game unrealistic: ${p.points}`);
  if (p.blocks > 10) errors.push(`Blocks per game unrealistic: ${p.blocks}`);
  if (p.threepm > 15) errors.push(`3PM per game unrealistic: ${p.threepm}`);
  
  return { valid: errors.length === 0, errors };
}

export function validateNoDuplicates(players: PlayerStats[]): boolean {
  const names = new Set<string>();
  for (const p of players) {
    if (names.has(p.name.toLowerCase())) return false;
    names.add(p.name.toLowerCase());
  }
  return true;
}
