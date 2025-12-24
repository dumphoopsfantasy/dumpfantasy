// Draft Strategy Types

export interface PlayerStats {
  min?: number;
  fgm?: number;
  fga?: number;
  fgPct?: number;
  ftm?: number;
  fta?: number;
  ftPct?: number;
  threes?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  to?: number;
  pts?: number;
}

export interface DraftPlayer {
  playerId: string;
  playerName: string;
  normalizedName: string;
  team: string | null;
  position: string | null;
  status: string | null;
  
  // Rankings from different sources
  crisRank: number | null;
  adpRank: number | null;
  lastYearRank: number | null;
  
  // Stats from sources
  crisStats: PlayerStats | null;
  lastYearStats: PlayerStats | null;
  
  // ADP-specific
  avgPick: number | null;
  rostPct: number | null;
  
  // Computed values
  valueDelta: number | null; // adpRank - crisRank (positive = value pick)
  tier: number;
  
  // Draft state
  drafted: boolean;
  draftedBy: 'me' | 'other' | null;
  draftedAt: number | null;
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
  { tier: 3, min: 25, max: 50 },
  { tier: 4, min: 51, max: 100 },
  { tier: 5, min: 101, max: 150 },
  { tier: 6, min: 151, max: 999 },
];

export interface PickHistoryEntry {
  pickNumber: number;
  playerId: string;
  playerName: string;
  draftedBy: 'me' | 'other';
}

export interface DraftState {
  settings: DraftSettings;
  players: DraftPlayer[];
  currentPick: number;
  draftStarted: boolean;
  pickHistory: PickHistoryEntry[];
}

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = {
  format: 'snake',
  teams: 10,
  myPickSlot: 1,
  rounds: 14,
};

// Parse input types
export interface ParsedRankingPlayer {
  rank: number;
  playerName: string;
  team: string | null;
  position: string | null;
  status: string | null;
  stats?: PlayerStats;
  avgPick?: number;
  rostPct?: number;
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

// Name normalization for matching
const NAME_VARIANTS: Record<string, string> = {
  "d'angelo": "dangelo",
  "de'aaron": "deaaron",
  "p.j.": "pj",
  "d.j.": "dj",
  "o.g.": "og",
  "c.j.": "cj",
  "a.j.": "aj",
  "t.j.": "tj",
  "j.r.": "jr",
};

const NAME_SUFFIXES = ['jr', 'sr', 'ii', 'iii', 'iv', 'v'];

// Normalize player name for matching
export function normalizePlayerName(name: string): string {
  let normalized = name.toLowerCase();
  
  // Apply known variants
  for (const [variant, replacement] of Object.entries(NAME_VARIANTS)) {
    normalized = normalized.replace(new RegExp(variant, 'g'), replacement);
  }
  
  // Remove punctuation
  normalized = normalized.replace(/[^a-z\s]/g, '');
  
  // Remove suffixes
  for (const suffix of NAME_SUFFIXES) {
    normalized = normalized.replace(new RegExp(`\\s+${suffix}$`), '');
  }
  
  // Collapse spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

// Generate player ID from normalized name
export function generatePlayerId(name: string): string {
  return normalizePlayerName(name).replace(/\s/g, '_');
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
