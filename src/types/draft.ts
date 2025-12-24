// Draft Strategy Types

export interface DraftPlayer {
  playerName: string;
  team: string | null;
  position: string | null;
  status: string | null;
  
  // Rankings from different sources
  crisRank: number | null;
  adpRank: number | null;
  lastYearRank: number | null;
  
  // Computed values
  valueDelta: number | null; // adpRank - crisRank (positive = value pick)
  reachDelta: number | null; // crisRank - adpRank (positive = reach pick)
  tier: number;
  
  // Draft state
  drafted: boolean;
  draftedBy: string | null; // team name if drafted
  draftedAt: number | null; // pick number
}

export interface DraftSettings {
  format: 'snake' | 'linear';
  teams: number;
  myPickSlot: number;
  rounds: number;
}

export interface TierRange {
  tier: number;
  min: number;
  max: number;
}

export const DEFAULT_TIER_RANGES: TierRange[] = [
  { tier: 1, min: 1, max: 12 },
  { tier: 2, min: 13, max: 24 },
  { tier: 3, min: 25, max: 48 },
  { tier: 4, min: 49, max: 84 },
  { tier: 5, min: 85, max: 120 },
  { tier: 6, min: 121, max: 999 },
];

export interface DraftState {
  settings: DraftSettings;
  players: DraftPlayer[];
  currentPick: number;
  draftStarted: boolean;
}

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = {
  format: 'snake',
  teams: 10,
  myPickSlot: 1,
  rounds: 15,
};

// Parse input types
export interface ParsedRankingPlayer {
  rank: number;
  playerName: string;
  team: string | null;
  position: string | null;
  status: string | null;
}

// Tier colors for visual display
export const TIER_COLORS: Record<number, string> = {
  1: 'bg-amber-500/20 border-amber-500/50 text-amber-200',
  2: 'bg-purple-500/20 border-purple-500/50 text-purple-200',
  3: 'bg-blue-500/20 border-blue-500/50 text-blue-200',
  4: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200',
  5: 'bg-slate-500/20 border-slate-500/50 text-slate-200',
  6: 'bg-zinc-500/20 border-zinc-500/50 text-zinc-300',
};

// Calculate tier from rank
export function getTierFromRank(rank: number, tierRanges: TierRange[] = DEFAULT_TIER_RANGES): number {
  for (const range of tierRanges) {
    if (rank >= range.min && rank <= range.max) {
      return range.tier;
    }
  }
  return 6;
}

// Calculate value delta: positive means ADP is later than CRIS (value pick)
export function calculateValueDelta(adpRank: number | null, crisRank: number | null): number | null {
  if (adpRank === null || crisRank === null) return null;
  return adpRank - crisRank;
}

// Calculate reach delta: positive means CRIS is later than ADP (reach pick)
export function calculateReachDelta(crisRank: number | null, adpRank: number | null): number | null {
  if (adpRank === null || crisRank === null) return null;
  return crisRank - adpRank;
}

// Normalize player name for matching
export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get my picks based on snake draft logic
export function getMyPicks(settings: DraftSettings): number[] {
  const picks: number[] = [];
  const { format, teams, myPickSlot, rounds } = settings;
  
  for (let round = 1; round <= rounds; round++) {
    let pickInRound: number;
    
    if (format === 'snake') {
      // Snake: even rounds reverse order
      if (round % 2 === 1) {
        pickInRound = myPickSlot;
      } else {
        pickInRound = teams - myPickSlot + 1;
      }
    } else {
      // Linear: same slot every round
      pickInRound = myPickSlot;
    }
    
    const overallPick = (round - 1) * teams + pickInRound;
    picks.push(overallPick);
  }
  
  return picks;
}
