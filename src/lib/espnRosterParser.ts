/**
 * ESPN Roster Data Parser
 * 
 * Extracted from DataUpload.tsx for testability.
 * Parses ESPN Fantasy Basketball roster page pastes.
 */

import { PlayerStats } from "@/types/player";
import { 
  validateParseInput, 
  preprocessInput,
  createLoopGuard 
} from "@/lib/parseUtils";
import { normalizeMissingToken, isMissingFractionToken } from "@/lib/espnTokenUtils";
import { devLog, devWarn } from "@/lib/devLog";

// Known NBA team codes
const NBA_TEAMS = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'];

interface PlayerInfo {
  slot: string;
  name: string;
  team: string;
  position: string;
  status?: string;
  opponent?: string;
}

/**
 * Checks if a token is a valid stat token (number, fraction, or missing placeholder).
 */
function isValidStatToken(token: string): boolean {
  const normalized = normalizeMissingToken(token);
  
  // Accept "--" (missing single value)
  if (normalized === "--") return true;
  
  // Accept "--/--" (missing fraction value)
  if (isMissingFractionToken(normalized)) return true;
  
  // Accept numeric values (including signed and decimals)
  if (/^[-+]?\d*\.?\d+$/.test(normalized)) return true;
  
  // Accept numeric fractions like "5.3/10.6"
  if (/^\d+\.?\d*\/\d+\.?\d*$/.test(normalized)) return true;
  
  return false;
}

/**
 * Parse ESPN roster data into PlayerStats array.
 */
export function parseESPNRosterData(data: string): PlayerStats[] {
  // INPUT VALIDATION: Validate input before processing
  validateParseInput(data);
  
  devLog('Starting to parse ESPN data...');
  
  // Find the STARTERS section - this marks the beginning of roster data
  const startersIdx = data.indexOf('STARTERS');
  const slotPlayerIdx = data.indexOf('SLOT\nPlayer');
  
  // Use whichever marker we find first
  let startIdx = -1;
  if (startersIdx > -1 && slotPlayerIdx > -1) {
    startIdx = Math.min(startersIdx, slotPlayerIdx);
  } else {
    startIdx = Math.max(startersIdx, slotPlayerIdx);
  }
  
  // If no markers found, try to find the data section
  if (startIdx === -1) {
    // Look for PG, SG, etc as slot indicators
    const pgIdx = data.search(/\bPG\n/);
    if (pgIdx > -1) startIdx = pgIdx;
  }
  
  const rosterData = startIdx > -1 ? data.substring(startIdx) : data;
  const lines = preprocessInput(rosterData);
  
  const result: PlayerStats[] = [];
  const slotPatterns = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F/C', 'UTIL', 'Bench', 'IR'];
  
  const playerInfos: PlayerInfo[] = [];
  // Track if we've encountered an Empty slot (to account for it in stats matching)
  let emptySlotCount = 0;
  let currentSlot = '';
  const loopGuard = createLoopGuard();
  
  for (let i = 0; i < lines.length; i++) {
    loopGuard.check();
    const line = lines[i];
    
    // Stop at footer
    if (line.includes('ESPN.com') || line.includes('Copyright') || line.includes('Fantasy Chat')) break;
    
    // Check for slot
    if (slotPatterns.includes(line)) {
      currentSlot = line;
      continue;
    }
    
    // Check for "Empty" slot (ESPN shows empty roster slots)
    if (line === 'Empty') {
      emptySlotCount++;
      devLog(`Found Empty slot #${emptySlotCount}`);
      continue;
    }
    
    // Check for doubled player name (ESPN shows name twice like "Cade CunninghamCade Cunningham")
    const doubleNameMatch = line.match(/^([A-Z][a-zA-Z'.-]+(?:\s+[A-Za-z'.-]+)*)\1$/);
    if (doubleNameMatch) {
      const playerName = doubleNameMatch[1].trim();
      
      // Look ahead for team, position, status
      let team = '';
      let position = '';
      let status = '';
      let opponent = '';
      
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const nextLine = lines[j];
        
        // Team code (2-4 uppercase letters)
        if (!team && NBA_TEAMS.includes(nextLine.toUpperCase())) {
          team = nextLine.toUpperCase();
          continue;
        }
        
        // Position pattern (PG, SG, SF, PF, C combinations)
        if (!position && /^(PG|SG|SF|PF|C)(,\s*(PG|SG|SF|PF|C))*$/i.test(nextLine)) {
          position = nextLine.toUpperCase();
          continue;
        }
        
        // Status
        if (!status && ['DTD', 'O', 'SUSP', 'INJ', 'GTD'].includes(nextLine.toUpperCase())) {
          status = nextLine.toUpperCase();
          continue;
        }
        
        // Skip MOVE button text
        if (nextLine === 'MOVE') continue;
        
        // Skip "--" (no game indicator)
        if (nextLine === '--') continue;
        
        // Stop if we hit another slot or STATS
        if (slotPatterns.includes(nextLine) || nextLine === 'STATS') {
          break;
        }
        
        // Opponent with game time (e.g., "@Bkn", "Min", then "7:30 PM" or "8:00 PM")
        if (!opponent && team) {
          // Pattern: @Team or Team (opponent)
          const oppMatch = nextLine.match(/^(@?[A-Za-z]{2,4})$/i);
          if (oppMatch) {
            const oppTeam = oppMatch[1];
            // Make sure it's not the player's own team
            if (oppTeam.toUpperCase().replace('@', '') !== team.toUpperCase()) {
              opponent = oppTeam;
              // Look for game time on next line
              if (j + 1 < lines.length) {
                const timeLine = lines[j + 1];
                if (/^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(timeLine)) {
                  opponent = `${opponent} ${timeLine}`;
                }
              }
              continue;
            }
          }
          // Check for game time on same line as opponent
          const oppWithTime = nextLine.match(/^(@?[A-Za-z]{2,4})\s+(\d{1,2}:\d{2}\s*(AM|PM)?)/i);
          if (oppWithTime) {
            const oppTeam = oppWithTime[1];
            if (oppTeam.toUpperCase().replace('@', '') !== team.toUpperCase()) {
              opponent = `${oppTeam} ${oppWithTime[2]}`;
              continue;
            }
          }
        }
        
        // Stop if we hit another doubled name
        if (nextLine.match(/^([A-Z][a-zA-Z'.-]+(?:\s+[A-Za-z'.-]+)*)\1$/)) {
          break;
        }
      }
      
      playerInfos.push({
        slot: currentSlot || 'Bench',
        name: playerName,
        team,
        position,
        status: status || undefined,
        opponent: opponent || undefined
      });
    }
  }

  devLog(`Parsed ${playerInfos.length} player infos`);

  // Parse stats section
  const statsIdx = data.indexOf('STATS');
  if (statsIdx === -1) {
    devLog('No STATS section found');
    return playerInfos.map(p => ({
      slot: p.slot,
      player: p.name,
      team: p.team,
      position: p.position,
      opponent: p.opponent || '',
      status: p.status,
      minutes: 0, fgPct: 0, ftPct: 0, threepm: 0,
      rebounds: 0, assists: 0, steals: 0, blocks: 0,
      turnovers: 0, points: 0
    }));
  }

  // Get stats section and parse numbers
  const statsSection = data.substring(statsIdx);
  const statsLines = statsSection.split('\n').map(l => l.trim()).filter(l => l);
  
  // Collect stat tokens (skip headers)
  const statTokens: string[] = [];
  const skipPatterns = /^(STATS|Research|MIN|FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-)$/i;
  
  for (const line of statsLines) {
    if (skipPatterns.test(line)) continue;
    if (line.includes('ESPN.com') || line.includes('Copyright')) break;
    
    // Normalize unicode dashes and check if valid stat token
    const normalized = normalizeMissingToken(line);
    if (isValidStatToken(normalized)) {
      statTokens.push(normalized);
    }
  }

  devLog(`Collected ${statTokens.length} stat tokens`);

  // ESPN has 15 columns per player
  const COLUMNS_PER_PLAYER = 15;
  const remainder = statTokens.length % COLUMNS_PER_PLAYER;
  
  // Safety warning for misaligned tokens
  if (remainder !== 0) {
    devWarn(
      `Stats table misaligned! token_count=${statTokens.length}, ` +
      `computed_rows=${Math.floor(statTokens.length / COLUMNS_PER_PLAYER)}, ` +
      `remainder=${remainder}. This may cause incorrect stat mapping.`
    );
  }
  
  const statsData: number[][] = [];
  const numRows = Math.floor(statTokens.length / COLUMNS_PER_PLAYER);

  for (let row = 0; row < numRows; row++) {
    const base = row * COLUMNS_PER_PLAYER;
    const slice = statTokens.slice(base, base + COLUMNS_PER_PLAYER);
    
    const numericSlice = slice.map(token => {
      // Treat "--", "--/--", or any fraction as 0
      if (token === '--' || token === '--/--' || /\//.test(token)) return 0;
      const val = parseFloat(token.replace(/^\+/, ''));
      return isNaN(val) ? 0 : val;
    });
    
    statsData.push(numericSlice);
  }

  devLog(`Built ${statsData.length} stat rows, emptySlotCount=${emptySlotCount}`);

  // Match players with stats
  // ESPN stats section includes rows for Empty slots too (all "--")
  // We need to account for empty slots when matching stats to players
  // Stats row order: [player1, player2, ..., empty_slot (if any), ..., ir_players]
  
  // Strategy: Match stats by index, but skip stats rows that are all zeros 
  // AND correspond to empty slots (appear between bench and IR)
  
  // First, identify if there are more stat rows than players (due to Empty slots)
  const expectedStatRows = playerInfos.length + emptySlotCount;
  devLog(`Expected ${expectedStatRows} stat rows (${playerInfos.length} players + ${emptySlotCount} empty)`);
  
  // Build a mapping: for each player, find their corresponding stat row
  // Players before empty slots get their direct index
  // Players after empty slots need to account for the empty slot rows
  
  // Find where IR players start in playerInfos
  const irStartIndex = playerInfos.findIndex(p => p.slot === 'IR');
  
  for (let i = 0; i < playerInfos.length; i++) {
    const p = playerInfos[i];
    
    // Calculate the stats index - if this player is at or after IR, add empty slot offset
    let statsIndex = i;
    if (emptySlotCount > 0 && irStartIndex !== -1 && i >= irStartIndex) {
      // IR players' stats come after the empty slot rows in ESPN
      statsIndex = i + emptySlotCount;
    } else if (emptySlotCount > 0 && irStartIndex === -1) {
      // No IR players, empty slots at the end - no adjustment needed
      statsIndex = i;
    }
    
    const stats = statsData[statsIndex];
    
    if (stats) {
      result.push({
        slot: p.slot,
        player: p.name,
        team: p.team,
        position: p.position,
        opponent: p.opponent || '',
        status: p.status,
        minutes: stats[0] || 0,
        fgPct: stats[2] || 0,
        ftPct: stats[4] || 0,
        threepm: stats[5] || 0,
        rebounds: stats[6] || 0,
        assists: stats[7] || 0,
        steals: stats[8] || 0,
        blocks: stats[9] || 0,
        turnovers: stats[10] || 0,
        points: stats[11] || 0,
      });
    } else {
      // No stats row for this player
      result.push({
        slot: p.slot,
        player: p.name,
        team: p.team,
        position: p.position,
        opponent: p.opponent || '',
        status: p.status,
        minutes: 0, fgPct: 0, ftPct: 0, threepm: 0,
        rebounds: 0, assists: 0, steals: 0, blocks: 0,
        turnovers: 0, points: 0
      });
    }
  }

  devLog(`Returning ${result.length} complete player records`);
  return result;
}
