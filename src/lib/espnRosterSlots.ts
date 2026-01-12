import { RosterSlot, Player } from "@/types/fantasy";
import { preprocessInput, createLoopGuard } from "@/lib/parseUtils";
import { parsePositions } from "@/lib/playerUtils";
import { normalizeNbaTeamCode } from "@/lib/scheduleAwareProjection";
import { devLog, devWarn } from "@/lib/devLog";
import { normalizeMissingToken, isMissingToken, isMissingFractionToken } from "@/lib/espnTokenUtils";

/**
 * Sanity check for parsed player stats - catches column misalignment issues.
 * Returns null if valid, or an error message if invalid.
 */
export function validatePlayerStats(player: Player): string | null {
  // BLK per game should be 0-10 (NBA record is ~5.6 by Manute Bol)
  if (player.blocks > 10) {
    return `BLK=${player.blocks} is unrealistic (max ~5-6)`;
  }
  // STL per game should be 0-5 (NBA record is ~3.7)
  if (player.steals > 6) {
    return `STL=${player.steals} is unrealistic (max ~4)`;
  }
  // FG% must be 0-1
  if (player.fgPct > 1 || player.fgPct < 0) {
    return `FG%=${player.fgPct} out of range [0,1]`;
  }
  // FT% must be 0-1
  if (player.ftPct > 1 || player.ftPct < 0) {
    return `FT%=${player.ftPct} out of range [0,1]`;
  }
  // Points per game should be 0-60 (Wilt record ~50)
  if (player.points > 60) {
    return `PTS=${player.points} is unrealistic`;
  }
  // Minutes per game 0-48 (OT can push higher but not by much)
  if (player.minutes > 55) {
    return `MIN=${player.minutes} is unrealistic`;
  }
  return null;
}

/**
 * Parse an ESPN Fantasy Basketball team page (Ctrl+A copy) into normalized RosterSlot[]
 * so schedule-aware projections can map players to the NBA schedule.
 * 
 * Key insight: ESPN "Last 15" table has these columns:
 * MIN | FGM/FGA | FG% | FTM/FTA | FT% | 3PM | REB | AST | STL | BLK | TO | PTS | PR15 | %ROST | +/-
 * 
 * FGM/FGA and FTM/FTA are slash-separated in the same cell.
 * We parse them together to avoid index shifting.
 */
export function parseEspnRosterSlotsFromTeamPage(data: string): RosterSlot[] {
  if (!data?.trim()) return [];

  const lines = preprocessInput(data);
  const loopGuard = createLoopGuard();

  // 1) Find the stats section header row (MIN is the first stat column)
  let statsStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    loopGuard.check();
    if (lines[i] === "MIN") {
      const nextFew = lines.slice(i, i + 14).join(" ");
      if (/(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS)/i.test(nextFew)) {
        statsStartIdx = i;
        break;
      }
    }
  }
  if (statsStartIdx === -1) return [];

  // 2) Skip past header tokens to reach actual data
  let dataStartIdx = statsStartIdx + 1;
  while (
    dataStartIdx < lines.length &&
    /^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|MIN)$/i.test(
      lines[dataStartIdx]
    )
  ) {
    dataStartIdx++;
  }

  // 3) Parse stat rows - keeping fractions together as single cells
  // Each player row has 15 logical columns:
  // 0:MIN, 1:FGM/FGA, 2:FG%, 3:FTM/FTA, 4:FT%, 5:3PM, 6:REB, 7:AST, 8:STL, 9:BLK, 10:TO, 11:PTS, 12:PR15, 13:%ROST, 14:+/-
  interface StatRow {
    min: number;
    fgm: number;
    fga: number;
    fgPct: number;
    ftm: number;
    fta: number;
    ftPct: number;
    threepm: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    to: number;
    pts: number;
  }

  const statRows: StatRow[] = [];
  let i = dataStartIdx;
  
  // Helper to parse next token as number
  const parseNext = (): { value: number; advance: number } => {
    if (i >= lines.length) return { value: 0, advance: 0 };

    const token = normalizeMissingToken(lines[i]);

    // Footer detection
    if (/^(ESPN\.com|Copyright|Fantasy Chat)/i.test(token)) {
      return { value: 0, advance: 0 };
    }

    // Missing value
    if (isMissingToken(token)) {
      return { value: 0, advance: 1 };
    }

    // Slash fraction (FGM/FGA or FTM/FTA)
    if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(token)) {
      const [a] = token.split("/");
      // Return just the first value, we'll handle specially
      return { value: parseFloat(a), advance: 1 };
    }

    // Regular number
    if (/^[-+]?\d+(?:\.\d+)?$/.test(token) || /^\.\d+$/.test(token)) {
      const val = parseFloat(token.replace(/^\+/, ""));
      return { value: Number.isFinite(val) ? val : 0, advance: 1 };
    }

    // Not a stat token - end of data
    return { value: 0, advance: 0 };
  };
  
  // Parse fraction specially to get both values
  const parseFraction = (): { made: number; attempted: number; advance: number } => {
    if (i >= lines.length) return { made: 0, attempted: 0, advance: 0 };

    const token = normalizeMissingToken(lines[i]);

    if (isMissingFractionToken(token) || isMissingToken(token)) {
      return { made: 0, attempted: 0, advance: 1 };
    }

    if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(token)) {
      const [a, b] = token.split("/");
      return {
        made: parseFloat(a) || 0,
        attempted: parseFloat(b) || 0,
        advance: 1,
      };
    }

    // Missing fraction - skip
    return { made: 0, attempted: 0, advance: 0 };
  };

  // Parse stat rows until we hit footer or non-stat content
  while (i < lines.length) {
    loopGuard.check();
    
    const startI = i;
    const token = normalizeMissingToken(lines[i]);
    
    // Stop conditions
    if (/^(ESPN\.com|Copyright|Fantasy Chat)/i.test(token)) break;
    if (!token) break;
    
    // A stat row starts with MIN (a number or missing token)
    const isStatStart = /^[-+]?\d+(?:\.\d+)?$/.test(token) || isMissingToken(token);
    if (!isStatStart) {
      i++;
      continue;
    }
    
    // Try to parse a full 15-column row
    const row: Partial<StatRow> = {};
    
    // 0: MIN
    const minResult = parseNext();
    if (minResult.advance === 0) break;
    row.min = minResult.value;
    i += minResult.advance;
    
    // 1: FGM/FGA (fraction)
    const fgResult = parseFraction();
    if (fgResult.advance === 0) { i = startI + 1; continue; }
    row.fgm = fgResult.made;
    row.fga = fgResult.attempted;
    i += fgResult.advance;
    
    // 2: FG%
    const fgPctResult = parseNext();
    if (fgPctResult.advance === 0) { i = startI + 1; continue; }
    row.fgPct = fgPctResult.value;
    i += fgPctResult.advance;
    
    // 3: FTM/FTA (fraction)
    const ftResult = parseFraction();
    if (ftResult.advance === 0) { i = startI + 1; continue; }
    row.ftm = ftResult.made;
    row.fta = ftResult.attempted;
    i += ftResult.advance;
    
    // 4: FT%
    const ftPctResult = parseNext();
    if (ftPctResult.advance === 0) { i = startI + 1; continue; }
    row.ftPct = ftPctResult.value;
    i += ftPctResult.advance;
    
    // 5-11: 3PM, REB, AST, STL, BLK, TO, PTS (7 values)
    const countingStats: number[] = [];
    for (let j = 0; j < 7; j++) {
      const r = parseNext();
      if (r.advance === 0) break;
      countingStats.push(r.value);
      i += r.advance;
    }
    
    if (countingStats.length < 7) {
      i = startI + 1;
      continue;
    }
    
    row.threepm = countingStats[0];
    row.reb = countingStats[1];
    row.ast = countingStats[2];
    row.stl = countingStats[3];
    row.blk = countingStats[4];
    row.to = countingStats[5];
    row.pts = countingStats[6];
    
    // 12-14: PR15, %ROST, +/- (skip these, just advance past)
    for (let j = 0; j < 3; j++) {
      if (i >= lines.length) break;
      const t = normalizeMissingToken(lines[i]);
      if (/^[-+]?\d+(?:\.\d+)?$/.test(t) || isMissingToken(t)) {
        i++;
      } else {
        break;
      }
    }
    
    // Normalize percentages (ESPN shows .427 for 42.7%)
    if (row.fgPct > 1) row.fgPct = row.fgPct / (row.fgPct >= 100 ? 1000 : 100);
    if (row.ftPct > 1) row.ftPct = row.ftPct / (row.ftPct >= 100 ? 1000 : 100);
    
    statRows.push(row as StatRow);
  }

  // 4) Extract player info block (slot -> name/team/positions/opponent/status)
  const slotPattern = /^(PG|SG|SF|PF|C|G|F\/C|UTIL|Bench|IR)$/i;
  const statusPattern = /^(O|OUT|DTD|GTD|Q|SUSP|P|IR)$/i;
  
  // Tokens that should NEVER be parsed as player names
  const isTimeToken = (s: string) => /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(s);
  const isNonPlayerToken = (s: string) => {
    const upper = s.toUpperCase().trim();
    return (
      isTimeToken(s) ||
      /^(STARTERS?|STATS?|SLOT|Player|opp|STATUS|MOVE|MIN|FGM|FGA|FG%|FTM|FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|Trade|Acquisition|Limits|ESPN\.com|Copyright|Fantasy|Chat|Bench|IR|Empty|Action|ACQUIRE|DROP|WATCH)$/i.test(s) ||
      /^(ADD|REMOVE|SET|EDIT|VIEW|NEWS|INJURY|INJURED|SCHEDULE|ROSTER|TEAM|LEAGUE|MATCHUP|PROJECTIONS?)$/i.test(upper) ||
      // Pure numbers (stats)
      /^[-+]?\d+(?:\.\d+)?$/.test(s) ||
      // Fraction patterns (stats like "15/30")
      /^\d+\/\d+$/.test(s)
    );
  };

  const playerInfo: Array<{
    name: string;
    team: string;
    opponent: string;
    status: string;
    positions: string[];
    slotLabel: string;
    slotType: "starter" | "bench" | "ir";
  }> = [];

  for (let idx = 0; idx < lines.length; idx++) {
    loopGuard.check();

    const line = lines[idx];
    if (!slotPattern.test(line)) continue;

    const slotLabel = line;
    const slotType: "starter" | "bench" | "ir" = /ir/i.test(slotLabel)
      ? "ir"
      : /bench/i.test(slotLabel)
      ? "bench"
      : "starter";

    let name = "";
    let team = "";
    let opponent = "";
    let status = "";
    let positions: string[] = [];
    let isEmptySlot = false;
    let foundPositions = false; // Track if we've found positions (helps distinguish team vs fantasy owner)

    // Increase lookahead window from 14 to 30 to handle ESPN copies with extra tokens
    for (let j = idx + 1; j < Math.min(idx + 30, lines.length); j++) {
      loopGuard.check();

      const next = lines[j];
      if (slotPattern.test(next)) break;

      if (next === "Empty") {
        isEmptySlot = true;
        break;
      }
      
      // CRITICAL: Skip time tokens and non-player tokens immediately
      if (isTimeToken(next)) {
        continue;
      }

      if (!status && statusPattern.test(next)) {
        status = next.toUpperCase();
        continue;
      }

      if (next === "MOVE" || next === "--") continue;

      // Positions like "SG, SF" or "PF,C" (handle varied spacing)
      // Also handle "SG" alone or "PG,SG,SF"
      if (positions.length === 0 && /^(PG|SG|SF|PF|C)(,\s*(PG|SG|SF|PF|C))*$/i.test(next.replace(/\s/g, ''))) {
        positions = parsePositions(next);
        foundPositions = true;
        continue;
      }

      // Team codes appear like "Cha", "Mia", "GS", "Utah" (case varies)
      // IMPORTANT: If we've already found positions AND team, subsequent 2-4 letter codes
      // are likely fantasy owner abbreviations (e.g., "SAS" appearing after "SA" + "PG,SG")
      if (/^[A-Za-z]{2,4}$/.test(next)) {
        const normalized = normalizeNbaTeamCode(next);
        if (normalized) {
          // Only set team if we haven't found one yet
          // OR if we found it but it was before positions (early in block = likely team)
          if (!team) {
            team = normalized;
            continue;
          }
          // If we already have team AND positions, this is likely fantasy owner - skip
          if (team && foundPositions) {
            continue;
          }
        }
      }

      // Opponent line often like "@Chi" or "Min" followed by time
      if (!opponent && /^@?[A-Za-z]{2,4}$/.test(next)) {
        const timeMaybe = lines[j + 1];
        if (timeMaybe && /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(timeMaybe)) {
          opponent = `${next} ${timeMaybe}`;
          continue;
        }
      }

      // Name: handle doubled ESPN copy like "LaMelo BallLaMelo Ball"
      if (!name) {
        // Skip non-player tokens
        if (isNonPlayerToken(next)) {
          continue;
        }
        
        const doubled = next.match(/^([A-Z][a-zA-Z'.-]+(?:\s+[A-Za-z'.-]+)*)\1$/);
        if (doubled) {
          name = doubled[1].trim();
          continue;
        }

        // Fallback heuristic: avoid obvious headers, must look like a name
        // A valid name should have at least one letter and be reasonably long
        if (
          next.length > 2 &&
          /[A-Za-z]/.test(next) &&
          !isNonPlayerToken(next) &&
          // Must not be just digits and punctuation
          /[A-Za-z]{2,}/.test(next)
        ) {
          name = next;
        }
      }
    }

    if (isEmptySlot || !name) continue;
    
    // Final sanity check: reject time tokens that slipped through as names
    if (isTimeToken(name)) {
      devWarn(`[parseEspnRosterSlots] Rejected time token as player name: ${name}`);
      continue;
    }

    // Second pass: if no team found, search more aggressively in the first 10 tokens after slot
    if (!team) {
      for (let j = idx + 1; j < Math.min(idx + 10, lines.length); j++) {
        const next = lines[j];
        if (slotPattern.test(next)) break;
        if (/^[A-Za-z]{2,4}$/.test(next)) {
          const normalized = normalizeNbaTeamCode(next);
          if (normalized) {
            team = normalized;
            break;
          }
        }
      }
    }

    // Warn if we couldn't extract team code
    if (!team) {
      devWarn(`[parseEspnRosterSlots] No team code found for player: ${name}`);
    }

    // Warn if no positions found (common parsing issue)
    if (positions.length === 0) {
      devWarn(`[parseEspnRosterSlots] No positions found for player: ${name}`);
    }

    playerInfo.push({
      name,
      team,
      opponent,
      status,
      positions,
      slotLabel,
      slotType,
    });
  }

  // 5) Build roster rows (match playerInfo row order with stats row order)
  const roster: RosterSlot[] = [];
  const parseErrors: string[] = [];
  const rows = Math.min(statRows.length, playerInfo.length);

  for (let row = 0; row < rows; row++) {
    loopGuard.check();

    const info = playerInfo[row];
    const stats = statRows[row];

    const player: Player = {
      id: info.name,
      name: info.name,
      nbaTeam: info.team,
      positions: info.positions,
      opponent: info.opponent,
      status: info.status as Player["status"],
      minutes: stats.min,
      fgm: stats.fgm,
      fga: stats.fga,
      fgPct: stats.fgPct,
      ftm: stats.ftm,
      fta: stats.fta,
      ftPct: stats.ftPct,
      threepm: stats.threepm,
      rebounds: stats.reb,
      assists: stats.ast,
      steals: stats.stl,
      blocks: stats.blk,
      turnovers: stats.to,
      points: stats.pts,
    };

    // Sanity check
    const validationError = validatePlayerStats(player);
    if (validationError) {
      parseErrors.push(`${info.name}: ${validationError}`);
      devWarn(`[parseEspnRosterSlots] Invalid stats for ${info.name}: ${validationError}`);
    }

    roster.push({
      slot: info.slotLabel,
      slotType: info.slotType,
      player,
    });
  }

  // Log summary
  const playersWithTeam = roster.filter(r => r.player.nbaTeam).length;
  const playersWithoutTeam = roster.filter(r => !r.player.nbaTeam).length;
  devLog(`[parseEspnRosterSlots] Parsed ${roster.length} players: ${playersWithTeam} with team, ${playersWithoutTeam} without`);
  
  if (playersWithoutTeam > 0) {
    const unmappedNames = roster.filter(r => !r.player.nbaTeam).map(r => r.player.name);
    devWarn(`[parseEspnRosterSlots] Players missing team code:`, unmappedNames);
  }
  
  if (parseErrors.length > 0) {
    devWarn(`[parseEspnRosterSlots] Parse validation errors:`, parseErrors);
  }

  return roster;
}
