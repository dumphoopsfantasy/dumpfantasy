// ESPN Draft Data Parsers - Robust noise filtering and stat extraction

import { ParsedPlayer, PlayerStats, normalizePlayerName } from '@/types/draft';

// ============ NOISE FILTERING ============
const NOISE_PATTERNS = [
  'fantasy chat',
  'fantasy basketball',
  'espn live draft',
  'copyright',
  'terms of use',
  'privacy policy',
  'do not sell',
  'fantasy support',
  'search the full library',
  'apollo',
  'hsb.accessibility',
  'free agents',
  'waiver report',
  'watch list',
  'espn bet',
  'lm tools',
  'reset all',
  '1 2 3 4 5',
  'opposing teams',
  'officially licensed',
  'skip to main',
  'skip to navigation',
  'sign up',
  'log in',
  'create account',
  'advertisement',
  'ad choices',
  'espn sites',
  'espn apps',
  'follow espn',
  'quick links',
  'favorites',
  'customized bracket',
  'nba teams',
  'fantasy games',
  'more sports',
  'espn+',
  'soccer scores',
  'fantasy tools',
  'players add',
  'filter',
  'action add',
  'add watch',
  'total adds',
  'showing',
  'table settings',
];

const HEADER_PATTERNS = [
  /^rank$/i,
  /^player$/i,
  /^team$/i,
  /^pos$/i,
  /^position$/i,
  /^min$/i,
  /^fgm$/i,
  /^fga$/i,
  /^fg%$/i,
  /^ftm$/i,
  /^fta$/i,
  /^ft%$/i,
  /^3pm$/i,
  /^reb$/i,
  /^ast$/i,
  /^stl$/i,
  /^blk$/i,
  /^to$/i,
  /^pts$/i,
  /^status$/i,
  /^avg pick$/i,
  /^rost %$/i,
  /^avg$/i,
  /^pick$/i,
  /^rost$/i,
  /^gp$/i,
  /^mpg$/i,
  /^fgm\/fga$/i,
  /^ftm\/fta$/i,
];

const NBA_TEAMS = new Set([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET',
  'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL',
  'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX',
  'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'
]);

const POSITIONS = new Set(['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F']);
const STATUSES = new Set(['O', 'DTD', 'IR', 'Q', 'SUSP', 'GTD', 'INJ', 'OUT', 'D']);

// ============ HELPER FUNCTIONS ============

function isNoiseLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (lower.length < 3) return true;
  if (lower.length > 500) return true; // Very long lines are usually noise
  
  return NOISE_PATTERNS.some(pattern => lower.includes(pattern));
}

function isHeaderLine(line: string): boolean {
  const tokens = line.split(/\s+/);
  const headerCount = tokens.filter(t => 
    HEADER_PATTERNS.some(p => p.test(t))
  ).length;
  return headerCount >= 2;
}

function extractTeam(text: string): string | null {
  const upper = text.toUpperCase().trim();
  if (NBA_TEAMS.has(upper)) return upper;
  return null;
}

function extractPositions(text: string): string[] {
  const upper = text.toUpperCase().replace(/,/g, ' ');
  const tokens = upper.split(/\s+/).filter(Boolean);
  return tokens.filter(t => POSITIONS.has(t));
}

function extractStatus(text: string): string | null {
  const upper = text.toUpperCase().trim();
  if (STATUSES.has(upper)) return upper;
  return null;
}

/**
 * Fix ESPN copy/paste name duplication issues.
 * e.g., "Giannis AntetokounmpoGiannis Antetokounmpo" → "Giannis Antetokounmpo"
 * e.g., "Joel Embiid Joel Embiid" → "Joel Embiid"
 */
function fixDuplicatePlayerName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 4) return trimmed;
  
  // Check for exact two identical halves (no space between)
  // e.g., "LeBron JamesLeBron James"
  for (let splitPoint = Math.floor(trimmed.length / 2) - 2; splitPoint <= Math.ceil(trimmed.length / 2) + 2; splitPoint++) {
    if (splitPoint > 2 && splitPoint < trimmed.length - 2) {
      const firstHalf = trimmed.slice(0, splitPoint);
      const secondHalf = trimmed.slice(splitPoint);
      if (normalizePlayerName(firstHalf) === normalizePlayerName(secondHalf)) {
        return firstHalf.trim();
      }
    }
  }
  
  // Check for immediate duplicate tokens with space
  // e.g., "Joel Embiid Joel Embiid"
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 4 && tokens.length % 2 === 0) {
    const half = tokens.length / 2;
    const firstHalf = tokens.slice(0, half).join(' ');
    const secondHalf = tokens.slice(half).join(' ');
    if (normalizePlayerName(firstHalf) === normalizePlayerName(secondHalf)) {
      return firstHalf;
    }
  }
  
  // Check for partial repeats like "LeBron James James"
  if (tokens.length >= 3) {
    const lastToken = tokens[tokens.length - 1].toLowerCase();
    const secondLastToken = tokens[tokens.length - 2]?.toLowerCase();
    if (lastToken === secondLastToken) {
      return tokens.slice(0, -1).join(' ');
    }
  }
  
  return trimmed;
}

/**
 * Parse stats from a sequence of numeric tokens.
 * Expected order (ESPN typical): MIN, FGM/FGA, FG%, FTM/FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS
 */
function parseStatsFromTokens(tokens: string[]): PlayerStats | null {
  // Filter to only numeric tokens
  const nums: number[] = [];
  
  for (const t of tokens) {
    // Handle FGM/FGA format
    const slashMatch = t.match(/^(\d+)\/(\d+)$/);
    if (slashMatch) {
      nums.push(parseFloat(slashMatch[1]), parseFloat(slashMatch[2]));
      continue;
    }
    
    // Handle percentages like .456 or 45.6% or 0.456
    if (t.match(/^\.?\d+\.?\d*%?$/)) {
      let val = parseFloat(t.replace('%', ''));
      // If it looks like a decimal percentage (0.456), convert
      if (val < 1 && val > 0) {
        val = val; // Keep as decimal
      } else if (val > 1) {
        val = val / 100; // Convert percentage
      }
      nums.push(val);
      continue;
    }
    
    // Regular numbers
    if (t.match(/^\d+\.?\d*$/)) {
      nums.push(parseFloat(t));
    }
  }
  
  // Need at least a few stats to be meaningful
  if (nums.length < 5) return null;
  
  // Try to map to stats based on typical order
  // MIN, FGM, FGA, FG%, FTM, FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS
  const stats: PlayerStats = {};
  
  // Heuristic: find the pattern
  let idx = 0;
  
  // Look for MIN (usually 15-40)
  if (nums[idx] >= 10 && nums[idx] <= 42) {
    stats.min = nums[idx++];
  }
  
  // FGM (usually 2-15)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 15) {
    stats.fgm = nums[idx++];
  }
  
  // FGA (usually 5-25)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 30) {
    stats.fga = nums[idx++];
  }
  
  // FG% (usually 0.35-0.65 or already normalized)
  if (idx < nums.length && ((nums[idx] >= 0.3 && nums[idx] <= 0.7) || (nums[idx] >= 30 && nums[idx] <= 70))) {
    stats.fgPct = nums[idx] > 1 ? nums[idx] / 100 : nums[idx];
    idx++;
  }
  
  // FTM (usually 1-12)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 15) {
    stats.ftm = nums[idx++];
  }
  
  // FTA (usually 1-15)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 18) {
    stats.fta = nums[idx++];
  }
  
  // FT% (usually 0.6-0.95)
  if (idx < nums.length && ((nums[idx] >= 0.5 && nums[idx] <= 1) || (nums[idx] >= 50 && nums[idx] <= 100))) {
    stats.ftPct = nums[idx] > 1 ? nums[idx] / 100 : nums[idx];
    idx++;
  }
  
  // 3PM (usually 0-5)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 8) {
    stats.threes = nums[idx++];
  }
  
  // REB (usually 2-15)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 18) {
    stats.reb = nums[idx++];
  }
  
  // AST (usually 1-12)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 15) {
    stats.ast = nums[idx++];
  }
  
  // STL (usually 0.3-2.5)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 4) {
    stats.stl = nums[idx++];
  }
  
  // BLK (usually 0.1-3)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 5) {
    stats.blk = nums[idx++];
  }
  
  // TO (usually 0.5-5)
  if (idx < nums.length && nums[idx] >= 0 && nums[idx] <= 6) {
    stats.to = nums[idx++];
  }
  
  // PTS (usually 5-35)
  if (idx < nums.length && nums[idx] >= 3 && nums[idx] <= 40) {
    stats.pts = nums[idx++];
  }
  
  // If we didn't get pts but have a high number at the end, that's probably pts
  if (!stats.pts && nums.length > 0) {
    const lastNum = nums[nums.length - 1];
    if (lastNum >= 5 && lastNum <= 40) {
      stats.pts = lastNum;
    }
  }
  
  return Object.keys(stats).length >= 3 ? stats : null;
}

// ============ MAIN PARSERS ============

export interface ParseResult {
  players: ParsedPlayer[];
  errors: string[];
  stats: {
    linesProcessed: number;
    playersFound: number;
    duplicatesRemoved: number;
  };
}

/**
 * Parse ESPN ADP Trends data
 * Format: Rank Player Team Pos AvgPick RostPct
 */
export function parseEspnAdp(rawData: string, rankOffset = 0): ParseResult {
  const lines = rawData.split('\n');
  const players: ParsedPlayer[] = [];
  const errors: string[] = [];
  let linesProcessed = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isNoiseLine(trimmed)) continue;
    if (isHeaderLine(trimmed)) continue;
    
    linesProcessed++;
    
    const tokens = trimmed.split(/\t|\s{2,}|\s/).filter(Boolean);
    if (tokens.length < 2) continue;
    
    // Look for rank at start
    const rankMatch = tokens[0].match(/^(\d+)\.?$/);
    if (!rankMatch) continue;
    
    const rank = parseInt(rankMatch[1], 10) + rankOffset;
    let playerName = '';
    let team: string | null = null;
    const positions: string[] = [];
    let status: string | null = null;
    let avgPick: number | undefined;
    let rostPct: number | undefined;
    
    // Process remaining tokens
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Status
      const statusMatch = extractStatus(token);
      if (statusMatch && !status) {
        status = statusMatch;
        continue;
      }
      
      // Team
      const teamMatch = extractTeam(token);
      if (teamMatch && !team) {
        team = teamMatch;
        continue;
      }
      
      // Positions
      const posMatches = extractPositions(token);
      if (posMatches.length > 0) {
        positions.push(...posMatches);
        continue;
      }
      
      // Numeric: avg pick or rost %
      const numMatch = token.match(/^(\d+\.?\d*)%?$/);
      if (numMatch) {
        const val = parseFloat(numMatch[1]);
        if (!avgPick && val > 0 && val < 300) {
          avgPick = val;
        } else if (!rostPct && val >= 0 && val <= 100) {
          rostPct = val;
        }
        continue;
      }
      
      // Skip known headers/noise
      if (token.match(/^(Rank|Player|Team|Pos|Avg|Pick|Rost|%|Add|Watch)$/i)) {
        continue;
      }
      
      // Accumulate player name
      if (token.length > 1 && !token.match(/^\d+$/)) {
        playerName += (playerName ? ' ' : '') + token;
      }
    }
    
    // Clean up player name
    playerName = playerName.replace(/^\d+\s*\.?\s*/, '').trim();
    playerName = fixDuplicatePlayerName(playerName);
    
    if (playerName && playerName.length > 2) {
      players.push({
        rank,
        playerName,
        team,
        positions: [...new Set(positions)],
        status,
        avgPick,
        rostPct,
      });
    }
  }
  
  // Dedupe by name+team
  const dedupedPlayers = dedupeByNameAndTeam(players);
  
  return {
    players: dedupedPlayers,
    errors,
    stats: {
      linesProcessed,
      playersFound: dedupedPlayers.length,
      duplicatesRemoved: players.length - dedupedPlayers.length,
    },
  };
}

/**
 * Parse ESPN Stats Table (projections or last year)
 * Format: Player Team Pos Stats...
 */
export function parseEspnStatsTable(rawData: string, rankOffset = 0): ParseResult {
  const lines = rawData.split('\n');
  const players: ParsedPlayer[] = [];
  const errors: string[] = [];
  let linesProcessed = 0;
  let lineRank = rankOffset;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isNoiseLine(trimmed)) continue;
    if (isHeaderLine(trimmed)) continue;
    
    linesProcessed++;
    
    // Split by tabs or multiple spaces
    const segments = trimmed.split(/\t|\s{3,}/).filter(Boolean);
    if (segments.length === 0) continue;
    
    let playerName = '';
    let team: string | null = null;
    const positions: string[] = [];
    let status: string | null = null;
    let statsTokens: string[] = [];
    let foundPlayer = false;
    
    for (const segment of segments) {
      const tokens = segment.split(/\s+/).filter(Boolean);
      
      for (const token of tokens) {
        // Check if we've hit stats (lots of numbers)
        if (token.match(/^\d+\.?\d*$/) || token.match(/^\d+\/\d+$/) || token.match(/^\.?\d+%?$/)) {
          statsTokens.push(token);
          continue;
        }
        
        // Status
        const statusMatch = extractStatus(token);
        if (statusMatch && !status) {
          status = statusMatch;
          continue;
        }
        
        // Team
        const teamMatch = extractTeam(token);
        if (teamMatch && !team) {
          team = teamMatch;
          foundPlayer = true;
          continue;
        }
        
        // Positions
        const posMatches = extractPositions(token);
        if (posMatches.length > 0) {
          positions.push(...posMatches);
          continue;
        }
        
        // Skip headers and noise
        if (token.match(/^(Rank|Player|Team|Pos|MIN|FGM|FGA|FG%|FTM|FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|GP|MPG|#|Action|Add|Watch)$/i)) {
          continue;
        }
        
        // Accumulate player name (before we see stats)
        if (statsTokens.length === 0 && token.length > 1 && !token.match(/^\d+\.?$/)) {
          playerName += (playerName ? ' ' : '') + token;
          foundPlayer = true;
        }
      }
    }
    
    // Clean up name
    playerName = playerName.replace(/^\d+\s*\.?\s*/, '').trim();
    playerName = fixDuplicatePlayerName(playerName);
    
    // Parse stats
    const stats = parseStatsFromTokens(statsTokens);
    
    if (playerName && playerName.length > 2 && foundPlayer) {
      lineRank++;
      players.push({
        rank: lineRank,
        playerName,
        team,
        positions: [...new Set(positions)],
        status,
        stats: stats || undefined,
      });
    }
  }
  
  // Dedupe
  const dedupedPlayers = dedupeByNameAndTeam(players);
  
  return {
    players: dedupedPlayers,
    errors,
    stats: {
      linesProcessed,
      playersFound: dedupedPlayers.length,
      duplicatesRemoved: players.length - dedupedPlayers.length,
    },
  };
}

/**
 * Deduplicate players by normalized name + team
 */
function dedupeByNameAndTeam(players: ParsedPlayer[]): ParsedPlayer[] {
  const seen = new Map<string, ParsedPlayer>();
  
  for (const player of players) {
    const normalized = normalizePlayerName(player.playerName);
    const key = player.team 
      ? `${normalized}_${player.team.toLowerCase()}`
      : normalized;
    
    if (!seen.has(key)) {
      seen.set(key, player);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Auto-detect format and parse
 */
export function parseRankingData(
  rawData: string,
  sourceType: 'projections' | 'adp' | 'lastYear',
  rankOffset = 0
): ParseResult {
  const lower = rawData.toLowerCase();
  
  // Detect ADP format
  if (lower.includes('avg pick') || lower.includes('rost %') || lower.includes('espn live draft')) {
    return parseEspnAdp(rawData, rankOffset);
  }
  
  // Detect stats table format
  if (lower.includes('fgm') || lower.includes('fg%') || lower.includes('ftm') || 
      (lower.includes('min') && lower.includes('pts'))) {
    return parseEspnStatsTable(rawData, rankOffset);
  }
  
  // Default based on source type
  if (sourceType === 'adp') {
    return parseEspnAdp(rawData, rankOffset);
  }
  
  return parseEspnStatsTable(rawData, rankOffset);
}
