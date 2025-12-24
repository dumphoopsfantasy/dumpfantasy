// Draft Strategy Types - Rebuilt for 3-Step Wizard

// ============ PLAYER STATS ============
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

// ============ SOURCE DATA ============
export interface SourceStats {
  rank: number | null;
  stats: PlayerStats | null;
  avgPick?: number;
  rostPct?: number;
}

// ============ UNIFIED PLAYER ============
export interface UnifiedPlayer {
  id: string;
  name: string;
  nameNormalized: string;
  team: string | null;
  positions: string[];
  status: string | null;
  
  // Source data
  sources: {
    projections: SourceStats | null;
    adp: { rank: number | null; avgPick: number | null; rostPct: number | null } | null;
    lastYear: SourceStats | null;
  };
  
  // Computed values
  crisRank: number | null;
  adpRank: number | null;
  lastYearRank: number | null;
  valueVsAdp: number | null;      // adpRank - crisRank (positive = undervalued)
  valueVsLastYear: number | null; // adpRank - lastYearRank
  
  // Draft state
  drafted: boolean;
  draftedBy: 'me' | number | null; // 'me' or team index (1-N)
  draftedAt: number | null;        // Overall pick number
}

// ============ DRAFT STATE ============
export interface DraftSettings {
  format: 'snake' | 'linear';
  teams: number;
  myPickSlot: number;
  rounds: number;
}

export const DEFAULT_DRAFT_SETTINGS: DraftSettings = {
  format: 'snake',
  teams: 10,
  myPickSlot: 1,
  rounds: 14,
};

export interface PickEntry {
  overallPick: number;
  round: number;
  teamIndex: number;
  playerId: string | null;
  playerName: string | null;
  timestamp: number;
}

export interface DraftState {
  settings: DraftSettings;
  players: UnifiedPlayer[];
  currentPick: number;
  draftStarted: boolean;
  picks: PickEntry[];
  currentStep: WizardStep;
}

export type WizardStep = 'import' | 'resolve' | 'draft';

// ============ IMPORT SEGMENT ============
export type SourceType = 'projections' | 'adp' | 'lastYear';

export interface ImportSegment {
  sourceType: SourceType;
  segmentIndex: number; // 0-3 for ranges 1-50, 51-100, 101-150, 151-200
  raw: string;
  status: 'empty' | 'parsed' | 'error';
  parsedCount: number;
  matchedCount: number;
  newCount: number;
  dupeCount: number;
  errors: string[];
}

export interface ImportState {
  segments: Record<string, ImportSegment>;
  activeSegmentKey: string | null;
}

export const SEGMENT_RANGES: Array<{ label: string; range: [number, number] }> = [
  { label: 'Players 1–50', range: [1, 50] },
  { label: 'Players 51–100', range: [51, 100] },
  { label: 'Players 101–150', range: [101, 150] },
  { label: 'Players 151–200', range: [151, 200] },
];

export const SOURCE_CONFIGS: Array<{ id: SourceType; label: string; description: string }> = [
  { id: 'projections', label: 'CRIS Projections', description: 'This year\'s projected stats from ESPN' },
  { id: 'adp', label: 'ADP Trends', description: 'ESPN Live Draft Trends (average pick position)' },
  { id: 'lastYear', label: 'Last Year', description: 'Last season\'s actual stats' },
];

export function getSegmentKey(sourceType: SourceType, segmentIndex: number): string {
  return `${sourceType}_${segmentIndex}`;
}

export function parseSegmentKey(key: string): { sourceType: SourceType; segmentIndex: number } | null {
  const match = key.match(/^(projections|adp|lastYear)_(\d)$/);
  if (!match) return null;
  return { sourceType: match[1] as SourceType, segmentIndex: parseInt(match[2], 10) };
}

// ============ PARSED PLAYER (from parser) ============
export interface ParsedPlayer {
  rank: number;
  playerName: string;
  team: string | null;
  positions: string[];
  status: string | null;
  stats?: PlayerStats;
  avgPick?: number;
  rostPct?: number;
}

// ============ UNMATCHED PLAYER ============
export interface UnmatchedPlayer {
  parsed: ParsedPlayer;
  sourceType: SourceType;
  suggestions: Array<{ player: UnifiedPlayer; score: number }>;
  resolved: boolean;
  resolvedTo: string | null; // player id or 'new'
}

// ============ TEAM TRACKING ============
export interface TeamComposition {
  teamIndex: number;
  playerIds: string[];
  positionCounts: Record<string, number>;
  totalCRI: number;
  avgCRI: number;
}

// ============ STAT VIEW ============
export type StatView = 'projections' | 'lastYear';

// ============ NAME NORMALIZATION ============
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
  "jr.": "",
  "sr.": "",
  "iii": "",
  "ii": "",
  "iv": "",
};

/**
 * Normalize player name for matching:
 * - lowercase, trim, collapse whitespace
 * - remove periods, apostrophes
 * - normalize hyphens
 * - remove accents
 * - apply known variants
 */
export function normalizePlayerName(name: string): string {
  let normalized = name.toLowerCase().trim();
  
  // Remove accents
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Apply known variants
  for (const [variant, replacement] of Object.entries(NAME_VARIANTS)) {
    normalized = normalized.replace(new RegExp(variant.replace(/\./g, '\\.'), 'gi'), replacement);
  }
  
  // Remove punctuation except hyphens
  normalized = normalized.replace(/['.]/g, '');
  
  // Normalize hyphens
  normalized = normalized.replace(/[-–—]/g, '-');
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Generate a canonical key for matching (normalized name + team if available)
 */
export function generateCanonicalKey(name: string, team?: string | null): string {
  const normalizedName = normalizePlayerName(name);
  if (team) {
    return `${normalizedName}_${team.toLowerCase()}`;
  }
  return normalizedName;
}

/**
 * Generate unique player ID
 */
export function generatePlayerId(name: string): string {
  return normalizePlayerName(name).replace(/\s/g, '_').replace(/-/g, '_');
}

// ============ DRAFT LOGIC ============
/**
 * Get all of "my" pick numbers based on snake draft logic
 */
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

/**
 * Get which team is picking at a given overall pick number
 */
export function getTeamForPick(pick: number, settings: DraftSettings): number {
  const { format, teams } = settings;
  const round = Math.ceil(pick / teams);
  const pickInRound = ((pick - 1) % teams) + 1;
  
  if (format === 'snake' && round % 2 === 0) {
    return teams - pickInRound + 1;
  }
  return pickInRound;
}

/**
 * Calculate value deltas
 */
export function calculateValueDelta(adpRank: number | null, otherRank: number | null): number | null {
  if (adpRank === null || otherRank === null) return null;
  return adpRank - otherRank;
}
