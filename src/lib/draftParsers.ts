// ESPN Draft Data Parsers - HTML Table Parsing with Text Fallback

import { ParsedPlayer, PlayerStats, normalizePlayerName } from '@/types/draft';

// ============ CONSTANTS ============
const NBA_TEAMS = new Set([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET',
  'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL',
  'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX',
  'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'
]);

const POSITIONS = new Set(['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F']);
const STATUSES = new Set(['O', 'DTD', 'IR', 'Q', 'SUSP', 'GTD', 'INJ', 'OUT', 'D']);

const NOISE_WORDS = [
  'fantasy', 'chat', 'espn', 'copyright', 'privacy', 'terms', 
  'advertisement', 'sign up', 'log in', 'follow', 'favorites'
];

// ============ PARSE RESULT ============
export interface ParseResult {
  players: ParsedPlayer[];
  errors: string[];
  stats: {
    linesProcessed: number;
    playersFound: number;
    duplicatesRemoved: number;
  };
}

// ============ HELPER FUNCTIONS ============

function extractTeam(text: string): string | null {
  const upper = text.toUpperCase().trim();
  if (NBA_TEAMS.has(upper)) return upper;
  return null;
}

function extractPositions(text: string): string[] {
  const upper = text.toUpperCase().replace(/,/g, ' ');
  const tokens = upper.split(/[\s,]+/).filter(Boolean);
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
 */
function fixDuplicatePlayerName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 4) return trimmed;
  
  // Check for exact two identical halves (no space between)
  for (let splitPoint = Math.floor(trimmed.length / 2) - 2; splitPoint <= Math.ceil(trimmed.length / 2) + 2; splitPoint++) {
    if (splitPoint > 2 && splitPoint < trimmed.length - 2) {
      const firstHalf = trimmed.slice(0, splitPoint);
      const secondHalf = trimmed.slice(splitPoint);
      if (normalizePlayerName(firstHalf) === normalizePlayerName(secondHalf)) {
        return firstHalf.trim();
      }
    }
  }
  
  // Check for space-separated duplicates
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 4 && tokens.length % 2 === 0) {
    const half = tokens.length / 2;
    const firstHalf = tokens.slice(0, half).join(' ');
    const secondHalf = tokens.slice(half).join(' ');
    if (normalizePlayerName(firstHalf) === normalizePlayerName(secondHalf)) {
      return firstHalf;
    }
  }
  
  return trimmed;
}

/**
 * Check if a name is valid (not noise)
 */
function isValidPlayerName(name: string): boolean {
  const cleaned = name.trim().toLowerCase();
  if (cleaned.length < 3) return false;
  
  // Must contain at least one space (first + last name)
  if (!cleaned.includes(' ')) return false;
  
  // Must have at least 2 letters
  const letters = cleaned.replace(/[^a-z]/g, '');
  if (letters.length < 2) return false;
  
  // Reject noise patterns
  for (const noise of NOISE_WORDS) {
    if (cleaned.includes(noise)) return false;
  }
  
  // Reject if mostly numbers
  const nums = cleaned.replace(/[^0-9]/g, '');
  if (nums.length > letters.length) return false;
  
  return true;
}

/**
 * Parse stats from column values using header mapping
 */
function parseStatsFromColumns(
  headerMap: Map<string, number>,
  cells: string[]
): PlayerStats | null {
  const stats: PlayerStats = {};
  
  const getNum = (headers: string[]): number | undefined => {
    for (const h of headers) {
      const idx = headerMap.get(h.toLowerCase());
      if (idx !== undefined && cells[idx]) {
        const val = parseFloat(cells[idx].replace('%', '').trim());
        if (!isNaN(val)) return val;
      }
    }
    return undefined;
  };
  
  stats.min = getNum(['min', 'mpg', 'mins']);
  stats.fgPct = getNum(['fg%', 'fgpct']);
  stats.ftPct = getNum(['ft%', 'ftpct']);
  stats.threes = getNum(['3pm', '3pt', 'threes', '3s']);
  stats.reb = getNum(['reb', 'rebs', 'rebounds']);
  stats.ast = getNum(['ast', 'asts', 'assists']);
  stats.stl = getNum(['stl', 'stls', 'steals']);
  stats.blk = getNum(['blk', 'blks', 'blocks']);
  stats.to = getNum(['to', 'tos', 'turnovers']);
  stats.pts = getNum(['pts', 'points']);
  
  // Convert percentages if they're whole numbers
  if (stats.fgPct && stats.fgPct > 1) stats.fgPct = stats.fgPct / 100;
  if (stats.ftPct && stats.ftPct > 1) stats.ftPct = stats.ftPct / 100;
  
  return Object.keys(stats).length >= 2 ? stats : null;
}

// ============ HTML TABLE PARSER ============

/**
 * Parse HTML table from clipboard - PRIMARY method
 */
export function parseHtmlTable(
  html: string, 
  sourceType: 'projections' | 'adp' | 'lastYear',
  rankOffset = 0
): ParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Find the largest table (most rows)
  const tables = Array.from(doc.querySelectorAll('table'));
  if (tables.length === 0) {
    return { 
      players: [], 
      errors: ['No HTML table found in pasted content'],
      stats: { linesProcessed: 0, playersFound: 0, duplicatesRemoved: 0 }
    };
  }
  
  // Sort by row count, take the largest
  tables.sort((a, b) => b.querySelectorAll('tr').length - a.querySelectorAll('tr').length);
  const table = tables[0];
  
  const rows = Array.from(table.querySelectorAll('tr'));
  if (rows.length < 2) {
    return { 
      players: [], 
      errors: ['Table has too few rows'],
      stats: { linesProcessed: rows.length, playersFound: 0, duplicatesRemoved: 0 }
    };
  }
  
  // Build header map from first row (or thead)
  const headerMap = new Map<string, number>();
  const headerRow = table.querySelector('thead tr') || rows[0];
  const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
  
  headerCells.forEach((cell, idx) => {
    const text = cell.textContent?.toLowerCase().trim() || '';
    if (text) headerMap.set(text, idx);
    
    // Also map common variations
    if (text.includes('player')) headerMap.set('player', idx);
    if (text.includes('rank') || text === '#') headerMap.set('rank', idx);
    if (text.includes('team')) headerMap.set('team', idx);
    if (text.includes('pos')) headerMap.set('pos', idx);
    if ((text.includes('avg') && text.includes('pick')) || text === 'adp') headerMap.set('avgpick', idx);
    if (text.includes('rost')) headerMap.set('rost', idx);
  });
  
  const players: ParsedPlayer[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  let duplicatesRemoved = 0;
  
  // Determine start row (skip header)
  const startIdx = headerRow === rows[0] ? 1 : 0;
  
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 2) continue;
    
    // Get cell text content
    const cellTexts = cells.map(c => c.textContent?.trim() || '');
    
    // Extract player name - try multiple strategies
    let playerName = '';
    let team: string | null = null;
    let positions: string[] = [];
    let status: string | null = null;
    let rank = rankOffset + players.length + 1;
    let avgPick: number | undefined;
    let rostPct: number | undefined;
    
    // Strategy 1: Use header map
    const playerIdx = headerMap.get('player');
    if (playerIdx !== undefined && cells[playerIdx]) {
      // Get just the first anchor or main text
      const playerCell = cells[playerIdx];
      const anchor = playerCell.querySelector('a');
      
      if (anchor) {
        playerName = anchor.textContent?.trim() || '';
      } else {
        // Get first significant text node
        const textContent = playerCell.textContent?.trim() || '';
        // Split by common delimiters and take first part
        playerName = textContent.split(/[,\n\t]|(?=[A-Z]{2,3}$)/)[0].trim();
      }
    }
    
    // Strategy 2: First cell with reasonable text
    if (!playerName) {
      for (let j = 0; j < Math.min(cells.length, 3); j++) {
        const text = cellTexts[j];
        // Skip if it looks like a rank number
        if (/^\d+$/.test(text)) {
          const parsed = parseInt(text, 10);
          if (parsed >= 1 && parsed <= 300) {
            rank = parsed + rankOffset;
            continue;
          }
        }
        // Check if this looks like a name
        if (text.length > 3 && text.includes(' ') && /[a-zA-Z]/.test(text)) {
          playerName = text.split(/[,\n\t]/)[0].trim();
          break;
        }
      }
    }
    
    // Clean up player name
    playerName = fixDuplicatePlayerName(playerName);
    
    // Skip invalid names
    if (!isValidPlayerName(playerName)) continue;
    
    // Extract rank from first numeric cell or header
    const rankIdx = headerMap.get('rank');
    if (rankIdx !== undefined && cellTexts[rankIdx]) {
      const r = parseInt(cellTexts[rankIdx], 10);
      if (r >= 1 && r <= 300) rank = r + rankOffset;
    }
    
    // Extract team and positions from remaining cells
    for (let j = 0; j < cells.length; j++) {
      const text = cellTexts[j];
      if (!text || text === playerName) continue;
      
      // Team
      if (!team) {
        const t = extractTeam(text);
        if (t) { team = t; continue; }
      }
      
      // Positions
      const pos = extractPositions(text);
      if (pos.length > 0) {
        positions = [...new Set([...positions, ...pos])];
        continue;
      }
      
      // Status
      if (!status) {
        const s = extractStatus(text);
        if (s) { status = s; continue; }
      }
    }
    
    // ADP-specific fields
    if (sourceType === 'adp') {
      const avgIdx = headerMap.get('avgpick') ?? headerMap.get('avg pick') ?? headerMap.get('avg');
      if (avgIdx !== undefined && cellTexts[avgIdx]) {
        avgPick = parseFloat(cellTexts[avgIdx]);
        if (isNaN(avgPick)) avgPick = undefined;
      }
      
      const rostIdx = headerMap.get('rost') ?? headerMap.get('rost%') ?? headerMap.get('% rost');
      if (rostIdx !== undefined && cellTexts[rostIdx]) {
        rostPct = parseFloat(cellTexts[rostIdx].replace('%', ''));
        if (isNaN(rostPct)) rostPct = undefined;
      }
    }
    
    // Extract stats for projections/lastYear
    let stats: PlayerStats | undefined;
    if (sourceType !== 'adp') {
      stats = parseStatsFromColumns(headerMap, cellTexts) || undefined;
    }
    
    // Dedup by key
    const key = `${normalizePlayerName(playerName)}|${team || ''}`.toLowerCase();
    if (seenKeys.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seenKeys.add(key);
    
    players.push({
      rank,
      playerName,
      team,
      positions,
      status,
      stats,
      avgPick,
      rostPct,
    });
  }
  
  return {
    players,
    errors,
    stats: {
      linesProcessed: rows.length - startIdx,
      playersFound: players.length,
      duplicatesRemoved,
    },
  };
}

// ============ TEXT FALLBACK PARSER ============

/**
 * Fallback text parser when no HTML table is available
 */
export function parseTextFallback(
  text: string,
  sourceType: 'projections' | 'adp' | 'lastYear',
  rankOffset = 0
): ParseResult {
  const lines = text.split('\n').filter(l => l.trim());
  const players: ParsedPlayer[] = [];
  const errors: string[] = [];
  const seenKeys = new Set<string>();
  let duplicatesRemoved = 0;
  
  // Pattern: Look for lines with player-like data
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 5) continue;
    
    // Skip obvious noise
    const lower = line.toLowerCase();
    if (NOISE_WORDS.some(n => lower.includes(n))) continue;
    if (/^(rank|player|team|pos|min|fgm|action|add|watch)/i.test(line)) continue;
    
    // Split by tabs or multiple spaces
    const parts = line.split(/\t|\s{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    
    let rank = rankOffset + players.length + 1;
    let playerName = '';
    let team: string | null = null;
    let positions: string[] = [];
    let status: string | null = null;
    let avgPick: number | undefined;
    let rostPct: number | undefined;
    
    for (const part of parts) {
      // Rank at start
      if (!playerName && /^\d+\.?$/.test(part)) {
        const r = parseInt(part, 10);
        if (r >= 1 && r <= 300) rank = r + rankOffset;
        continue;
      }
      
      // Team
      if (!team) {
        const t = extractTeam(part);
        if (t) { team = t; continue; }
      }
      
      // Positions
      const pos = extractPositions(part);
      if (pos.length > 0) {
        positions = [...new Set([...positions, ...pos])];
        continue;
      }
      
      // Status
      if (!status) {
        const s = extractStatus(part);
        if (s) { status = s; continue; }
      }
      
      // Numbers for ADP
      if (sourceType === 'adp' && /^\d+\.?\d*%?$/.test(part)) {
        const val = parseFloat(part.replace('%', ''));
        if (!avgPick && val > 0 && val < 300) avgPick = val;
        else if (!rostPct && val >= 0 && val <= 100) rostPct = val;
        continue;
      }
      
      // Accumulate player name (text before we see team/numbers)
      if (!team && part.length > 2 && /[a-zA-Z]/.test(part) && !/^\d+$/.test(part)) {
        playerName += (playerName ? ' ' : '') + part;
      }
    }
    
    playerName = fixDuplicatePlayerName(playerName);
    if (!isValidPlayerName(playerName)) continue;
    
    // Dedup
    const key = `${normalizePlayerName(playerName)}|${team || ''}`.toLowerCase();
    if (seenKeys.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seenKeys.add(key);
    
    players.push({
      rank,
      playerName,
      team,
      positions,
      status,
      avgPick,
      rostPct,
    });
  }
  
  return {
    players,
    errors,
    stats: {
      linesProcessed: lines.length,
      playersFound: players.length,
      duplicatesRemoved,
    },
  };
}

// ============ TEAM NORMALIZATION ============
const TEAM_ALIASES: Record<string, string> = {
  GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', WSH: 'WAS', BRK: 'BKN', UTAH: 'UTA', PHO: 'PHX',
};

/** Normalize ESPN team abbreviation variants (GS→GSW, NY→NYK, UTAH→UTA, ...) */
export function normalizeTeamAbbr(team: string | null | undefined): string | null {
  if (!team) return null;
  const t = team.trim().toUpperCase();
  return TEAM_ALIASES[t] ?? t;
}

/**
 * Multi-line ESPN layout: each header and each cell is on its own line.
 * A player block starts at a name line followed by a team line. Within a block,
 * the last three numeric values are ADP, %ROST, +/- (ADP = number right before %ROST).
 */
function parseAdpMultiLine(lines: string[]): ParseResult {
  const cells = lines.flatMap(l => l.split('\t')).map(c => c.trim()).filter(Boolean);
  const starts: number[] = [];
  for (let i = 0; i < cells.length - 1; i++) {
    if (/\d/.test(cells[i])) continue;
    if (extractTeam(cells[i + 1]) && isValidPlayerName(fixDuplicatePlayerName(cells[i]))) starts.push(i);
  }
  const players: ParsedPlayer[] = [];
  const seen = new Set<string>();
  let dupes = 0;
  for (let s = 0; s < starts.length; s++) {
    const block = cells.slice(starts[s], s + 1 < starts.length ? starts[s + 1] : cells.length);
    const nums = block.map(c => c.replace('%', '')).filter(c => /^[+-]?\d+(\.\d+)?$/.test(c)).map(Number);
    if (nums.length < 3) continue;
    const adp = nums[nums.length - 3];
    const rost = nums[nums.length - 2];
    if (!(adp > 0 && adp <= 300) || rost < 0 || rost > 100) continue;
    const name = fixDuplicatePlayerName(block[0]);
    const key = normalizePlayerName(name);
    if (seen.has(key)) { dupes++; continue; }
    seen.add(key);
    const team = extractTeam(block[1]);
    players.push({ rank: players.length + 1, playerName: name, team, positions: extractPositions(block[2] || ''), status: null, avgPick: adp, rostPct: rost });
  }
  return {
    players,
    errors: players.length ? [] : ['Found an ADP header but no player rows with ADP values.'],
    stats: { linesProcessed: lines.length, playersFound: players.length, duplicatesRemoved: dupes },
  };
}

/**
 * Header-mapped ADP text parser. Requires a tab-separated header row containing "ADP"
 * (or "Avg Pick"). Never guesses ADP positionally — in the ESPN free-agent table the
 * first number on a row is PR7/PR15/PR30, not ADP.
 */
export function parseAdpTextWithHeaders(text: string): ParseResult {
  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim());
  const players: ParsedPlayer[] = [];
  const isAdpHeader = (c: string) => {
    const t = c.trim().toLowerCase();
    return t === 'adp' || (t.includes('avg') && t.includes('pick'));
  };
  const headerIdx = lines.findIndex(l => l.split('\t').length > 1 && l.split('\t').some(isAdpHeader));
  if (headerIdx < 0) {
    // Multi-line header variant: "ADP" sits alone on its own line
    if (lines.some(l => isAdpHeader(l))) return parseAdpMultiLine(lines);
    const detected = lines.slice(0, 40).map(l => l.trim()).filter(l => l && l.length <= 12 && !/^[\d.\-%+]+$/.test(l));
    return {
      players: [],
      errors: [`No ADP column header found. Headers detected: ${detected.slice(0, 20).join(', ') || '(none)'}. Copy the table including its header row.`],
      stats: { linesProcessed: lines.length, playersFound: 0, duplicatesRemoved: 0 },
    };
  }
  const headers = lines[headerIdx].split('\t').map(h => h.trim().toLowerCase());
  const adpCol = headers.findIndex(isAdpHeader);
  const playerCol = headers.findIndex(h => h.includes('player'));
  const seen = new Set<string>();
  let dupes = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim());
    if (cells.length <= adpCol) continue;
    const adp = parseFloat(cells[adpCol]);
    if (isNaN(adp) || adp <= 0) continue;
    const nameCell = playerCol >= 0 ? cells[playerCol] : cells.find(c => /[a-zA-Z]{2,}\s+[a-zA-Z]/.test(c)) || '';
    const team = extractTeam(nameCell);
    let name = nameCell;
    if (team) name = name.replace(new RegExp(`\\b${team}\\b.*$`), '');
    name = fixDuplicatePlayerName(name.replace(/\s+/g, ' ').trim());
    if (!isValidPlayerName(name)) continue;
    const key = normalizePlayerName(name);
    if (seen.has(key)) { dupes++; continue; }
    seen.add(key);
    players.push({ rank: players.length + 1, playerName: name, team, positions: extractPositions(nameCell), status: null, avgPick: adp });
  }
  return { players, errors: [], stats: { linesProcessed: lines.length, playersFound: players.length, duplicatesRemoved: dupes } };
}

// ============ MAIN ENTRY POINT ============

/**
 * Parse clipboard data - prefers HTML, falls back to text
 */
export function parseClipboardData(
  html: string | null,
  text: string,
  sourceType: 'projections' | 'adp' | 'lastYear',
  rankOffset = 0,
  opts: { requireHeaders?: boolean } = {}
): ParseResult {
  // Try HTML first if it contains a table
  if (html && html.includes('<table')) {
    const result = parseHtmlTable(html, sourceType, rankOffset);
    if (result.players.length >= 10 || (opts.requireHeaders && result.players.length > 0)) {
      return result;
    }
  }

  if (opts.requireHeaders && sourceType === 'adp') {
    return parseAdpTextWithHeaders(text);
  }
  
  // Fall back to text parsing
  return parseTextFallback(text, sourceType, rankOffset);
}

/**
 * Validate parse result for ESPN data (expects 30-70 players per segment)
 */
export function validateParseResult(result: ParseResult): { valid: boolean; error?: string } {
  if (result.players.length < 20) {
    return { 
      valid: false, 
      error: `Only ${result.players.length} players found. Expected ~50 per segment. Make sure you copied the entire ESPN table.` 
    };
  }
  
  if (result.players.length > 80) {
    return { 
      valid: false, 
      error: `Found ${result.players.length} players, which is too many for one segment. Copy only 50 rows at a time.` 
    };
  }
  
  return { valid: true };
}

// ============ LEGACY EXPORT (for backwards compatibility) ============
export function parseRankingData(
  rawData: string,
  sourceType: 'projections' | 'adp' | 'lastYear',
  rankOffset = 0
): ParseResult {
  return parseTextFallback(rawData, sourceType, rankOffset);
}
