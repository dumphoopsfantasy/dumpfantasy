// ESPN-specific draft data parsers

// Known noise lines to filter out
const NOISE_PATTERNS = [
  'Fantasy Chat',
  'Copyright',
  'Terms of Use',
  'Privacy Policy',
  'Do Not Sell My Info',
  'Fantasy Basketball Support',
  'Search the full library',
  'Apollo',
  'hsb.accessibility.skipContent',
  'Fantasy Basketball Home',
  'Free Agents',
  'Standings',
  'Waiver Report',
  'Watch List',
  'ESPN BET',
  'LM Tools',
  'Reset All',
  '1 2 3 4 5 ...',
  'My Team',
  'League',
  'Opposing Teams',
  'Officially Licensed Product',
];

// NBA team codes
const NBA_TEAMS = [
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 
  'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 
  'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 
  'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'
];

// Valid positions
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'];

// Valid statuses
const STATUSES = ['O', 'DTD', 'IR', 'Q', 'SUSP', 'GTD', 'INJ', 'OUT'];

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

export interface ParsedPlayer {
  rank: number;
  playerName: string;
  team: string | null;
  position: string | null;
  status: string | null;
  avgPick?: number;
  rostPct?: number;
  stats?: PlayerStats;
}

export interface ParseResult {
  players: ParsedPlayer[];
  errors: string[];
}

// Filter noise lines
function isNoiseLine(line: string): boolean {
  const lowerLine = line.toLowerCase();
  return NOISE_PATTERNS.some(pattern => 
    lowerLine.includes(pattern.toLowerCase())
  );
}

// Normalize whitespace
function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/**
 * Fix ESPN copy/paste doubling issues
 * e.g., "Giannis AntetokounmpoGiannis Antetokounmpo" or "Joel Embiid Joel Embiid"
 */
function fixDuplicatePlayerName(name: string): string {
  const trimmed = name.trim();
  
  // Check if the string is exactly two identical halves (no space between)
  // e.g., "Giannis AntetokounmpoGiannis Antetokounmpo"
  if (trimmed.length % 2 === 0) {
    const half = trimmed.length / 2;
    const firstHalf = trimmed.slice(0, half);
    const secondHalf = trimmed.slice(half);
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
      return firstHalf;
    }
  }
  
  // Check for immediate duplicate tokens
  // e.g., "Joel Embiid Joel Embiid"
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 4 && tokens.length % 2 === 0) {
    const half = tokens.length / 2;
    const firstHalf = tokens.slice(0, half).join(' ').toLowerCase();
    const secondHalf = tokens.slice(half).join(' ').toLowerCase();
    if (firstHalf === secondHalf) {
      return tokens.slice(0, half).join(' ');
    }
  }
  
  return trimmed;
}

// Extract team code from text
function extractTeam(text: string): string | null {
  const upper = text.toUpperCase();
  for (const team of NBA_TEAMS) {
    if (upper === team) return team;
  }
  return null;
}

// Extract position(s) from text
function extractPosition(text: string): string | null {
  const upper = text.toUpperCase().replace(/,/g, ', ');
  const parts = upper.split(/[,\\s]+/).filter(p => p);
  const validPositions = parts.filter(p => POSITIONS.includes(p));
  return validPositions.length > 0 ? validPositions.join(', ') : null;
}

// Extract status from text
function extractStatus(text: string): string | null {
  const upper = text.toUpperCase();
  return STATUSES.includes(upper) ? upper : null;
}

/**
 * Deduplicate players within a parsed result (same name + team = keep first)
 */
export function dedupePlayersByNameAndTeam(players: ParsedPlayer[]): ParsedPlayer[] {
  const seen = new Map<string, ParsedPlayer>();
  
  for (const player of players) {
    const key = `${player.playerName.toLowerCase().replace(/\s+/g, '_')}_${(player.team || 'unknown').toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, player);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Parse ESPN ADP Trends data (token stream approach)
 * Format: Rank Player Team Pos AvgPick RostPct
 */
export function parseEspnAdp(rawData: string, rankOffset = 0): ParseResult {
  const lines = rawData.split('\n');
  const players: ParsedPlayer[] = [];
  const errors: string[] = [];
  
  for (const line of lines) {
    if (!line.trim() || isNoiseLine(line)) continue;
    
    const normalized = normalizeLine(line);
    const tokens = normalized.split(/\t|\s{2,}|\s/).filter(t => t);
    
    if (tokens.length === 0) continue;
    
    // Skip header lines
    if (tokens[0].toLowerCase() === 'rank' || 
        normalized.toLowerCase().includes('espn live draft trends')) {
      continue;
    }
    
    // Try to find a rank at the start
    const rankMatch = tokens[0].match(/^(\d+)\.?$/);
    if (!rankMatch) continue;
    
    const rank = parseInt(rankMatch[1], 10) + rankOffset;
    let playerName = '';
    let team: string | null = null;
    let position: string | null = null;
    let status: string | null = null;
    let avgPick: number | undefined;
    let rostPct: number | undefined;
    
    // Process remaining tokens
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      
      // Check for status first (single letter statuses)
      const statusMatch = extractStatus(token);
      if (statusMatch && !status) {
        status = statusMatch;
        continue;
      }
      
      // Check for team
      const teamMatch = extractTeam(token);
      if (teamMatch && !team) {
        team = teamMatch;
        continue;
      }
      
      // Check for position
      const posMatch = extractPosition(token);
      if (posMatch && !position) {
        position = posMatch;
        continue;
      }
      
      // Check for numeric values (avgPick, rostPct)
      const numMatch = token.match(/^(\d+\.?\d*)%?$/);
      if (numMatch) {
        const val = parseFloat(numMatch[1]);
        if (!avgPick && val > 0 && val < 300) {
          avgPick = val;
        } else if (!rostPct) {
          rostPct = val;
        }
        continue;
      }
      
      // Otherwise it's part of the player name
      if (!token.match(/^(Rank|Player|Team|Pos|Avg|Pick|Rost|%|\d+\.\d+)$/i)) {
        playerName += (playerName ? ' ' : '') + token;
      }
    }
    
    // Clean up player name and fix duplicates
    playerName = playerName.replace(/^\d+\s*/, '').trim();
    playerName = fixDuplicatePlayerName(playerName);
    
    if (playerName && playerName.length > 2) {
      players.push({
        rank,
        playerName,
        team,
        position,
        status,
        avgPick,
        rostPct,
      });
    }
  }
  
  return { players, errors };
}

/**
 * Parse ESPN stats table data (row block approach)
 * Format: Player Team Pos MIN FGM/FGA FG% ... PTS
 */
export function parseEspnStatsTable(rawData: string, rankOffset = 0): ParseResult {
  const lines = rawData.split('\n');
  const players: ParsedPlayer[] = [];
  const errors: string[] = [];
  let lineRank = rankOffset;
  
  for (const line of lines) {
    if (!line.trim() || isNoiseLine(line)) continue;
    
    const normalized = normalizeLine(line);
    
    // Skip header lines
    if (normalized.match(/\b(MIN|FGM|FGA|FG%|FTM|FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS)\b/i)) {
      continue;
    }
    
    const tokens = normalized.split(/\t|\s{2,}/).filter(t => t);
    if (tokens.length === 0) continue;
    
    // Look for player data
    let playerName = '';
    let team: string | null = null;
    let position: string | null = null;
    let status: string | null = null;
    let foundStats = false;
    
    for (const token of tokens) {
      const parts = token.split(/\s+/);
      
      for (const part of parts) {
        // Skip numeric stat values
        if (part.match(/^\d+\.?\d*$/) || part.match(/^\.\d+$/) || part.match(/^\d+\/\d+$/)) {
          foundStats = true;
          continue;
        }
        
        // Check status
        const statusMatch = extractStatus(part);
        if (statusMatch && !status) {
          status = statusMatch;
          continue;
        }
        
        // Check team
        const teamMatch = extractTeam(part);
        if (teamMatch && !team) {
          team = teamMatch;
          continue;
        }
        
        // Check position
        const posMatch = extractPosition(part);
        if (posMatch && !position) {
          position = posMatch;
          continue;
        }
        
        // Skip column headers and noise
        if (part.match(/^(Rank|Player|Team|Pos|MIN|FGM|FGA|FG%|FTM|FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|GP|MPG|#)$/i)) {
          continue;
        }
        
        // If we haven't found stats yet, this is likely player name
        if (!foundStats && part.length > 1 && !part.match(/^\d+$/)) {
          playerName += (playerName ? ' ' : '') + part;
        }
      }
    }
    
    // Clean player name and fix duplicates
    playerName = playerName.replace(/^\d+\s*\.?\s*/, '').trim();
    playerName = fixDuplicatePlayerName(playerName);
    
    if (playerName && playerName.length > 2) {
      lineRank++;
      players.push({
        rank: lineRank,
        playerName,
        team,
        position,
        status,
      });
    }
  }
  
  // Dedupe within source
  return { players: dedupePlayersByNameAndTeam(players), errors };
}

/**
 * Generic ranking parser (fallback)
 */
export function parseGenericRankings(rawData: string, rankOffset = 0): ParseResult {
  const lines = rawData.split('\n').map(l => l.trim()).filter(l => l);
  const players: ParsedPlayer[] = [];
  const errors: string[] = [];
  
  for (const line of lines) {
    if (isNoiseLine(line)) continue;
    
    const parts = line.split(/\t|\s{2,}/).map(p => p.trim()).filter(p => p);
    if (parts.length === 0) continue;
    
    let rank: number | null = null;
    let playerName = '';
    let team: string | null = null;
    let position: string | null = null;
    let status: string | null = null;
    
    for (const part of parts) {
      const tokens = part.split(/\s+/);
      
      for (const token of tokens) {
        // Check for rank
        const rankMatch = token.match(/^(\d+)\.?$/);
        if (rankMatch && rank === null) {
          rank = parseInt(rankMatch[1], 10) + rankOffset;
          continue;
        }
        
        // Check status
        if (extractStatus(token) && !status) {
          status = extractStatus(token);
          continue;
        }
        
        // Check team
        if (extractTeam(token) && !team) {
          team = extractTeam(token);
          continue;
        }
        
        // Check position
        if (extractPosition(token) && !position) {
          position = extractPosition(token);
          continue;
        }
        
        // Skip headers and numbers
        if (!token.match(/^(Rank|Player|Team|Pos|Status|ADP|CRIS|wCRI|Last|Year|#|\d+\.\d+)$/i)) {
          if (token.length > 1) {
            playerName += (playerName ? ' ' : '') + token;
          }
        }
      }
    }
    
    playerName = playerName.replace(/^\d+\s*\.?\s*/, '').trim();
    
    if (playerName && playerName.length > 2 && rank !== null) {
      players.push({
        rank,
        playerName,
        team,
        position,
        status,
      });
    }
  }
  
  return { players, errors };
}

/**
 * Auto-detect and parse data based on content
 */
export function parseRankingData(
  rawData: string, 
  sourceType: 'cris' | 'adp' | 'lastYear',
  rankOffset = 0
): ParseResult {
  const lowerData = rawData.toLowerCase();
  
  // Detect ESPN ADP format
  if (lowerData.includes('espn live draft trends') || 
      lowerData.includes('avg pick') ||
      lowerData.includes('rost %')) {
    return parseEspnAdp(rawData, rankOffset);
  }
  
  // Detect ESPN stats table format
  if (lowerData.includes('fgm/fga') || 
      lowerData.includes('fg%') ||
      (lowerData.includes('min') && lowerData.includes('pts'))) {
    return parseEspnStatsTable(rawData, rankOffset);
  }
  
  // Use ADP parser for adp source, stats for others
  if (sourceType === 'adp') {
    return parseEspnAdp(rawData, rankOffset);
  }
  
  // Default to generic parser
  return parseGenericRankings(rawData, rankOffset);
}
