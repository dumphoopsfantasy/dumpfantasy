import { RosterSlot, Player } from "@/types/fantasy";
import { preprocessInput, createLoopGuard } from "@/lib/parseUtils";
import { parsePositions } from "@/lib/playerUtils";
import { normalizeNbaTeamCode } from "@/lib/scheduleAwareProjection";
import { devLog, devWarn } from "@/lib/devLog";

/**
 * Parse an ESPN Fantasy Basketball team page (Ctrl+A copy) into normalized RosterSlot[]
 * so schedule-aware projections can map players to the NBA schedule.
 */
export function parseEspnRosterSlotsFromTeamPage(data: string): RosterSlot[] {
  if (!data?.trim()) return [];

  const lines = preprocessInput(data);
  const loopGuard = createLoopGuard();

  // 1) Find the stats section start (header row)
  let statsStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    loopGuard.check();
    if (lines[i] === "MIN") {
      const nextFew = lines.slice(i, i + 8).join(" ");
      if (/(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS)/i.test(nextFew)) {
        statsStartIdx = i;
        break;
      }
    }
  }
  if (statsStartIdx === -1) return [];

  // 2) Collect stat tokens (fractions split into 2 tokens)
  const statTokens: string[] = [];

  let dataStartIdx = statsStartIdx + 1;
  while (
    dataStartIdx < lines.length &&
    /^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|MIN)$/i.test(
      lines[dataStartIdx]
    )
  ) {
    dataStartIdx++;
  }

  for (let i = dataStartIdx; i < lines.length; i++) {
    loopGuard.check();

    const line = lines[i];
    if (/^(ESPN\.com|Copyright|Fantasy Chat)/i.test(line)) break;

    // Fractions: 6.7/15.7
    if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(line)) {
      const [a, b] = line.split("/");
      statTokens.push(a, b);
      continue;
    }

    // Numbers / decimals / --
    if (/^[-+]?\d+(?:\.\d+)?$/.test(line) || /^\.\d+$/.test(line) || line === "--") {
      statTokens.push(line.replace(/^\+/, ""));
    }
  }

  // ESPN headers include 15 columns, but we split 2 fraction columns into 4 tokens => 17 tokens per player
  const COLS = 17;
  const numStatRows = Math.floor(statTokens.length / COLS);

  // 3) Extract player info block (slot -> name/team/positions/opponent/status)
  const slotPattern = /^(PG|SG|SF|PF|C|G|F\/C|UTIL|Bench|IR)$/i;
  const statusPattern = /^(O|OUT|DTD|GTD|Q|SUSP|P|IR)$/i;

  const playerInfo: Array<{
    name: string;
    team: string;
    opponent: string;
    status: string;
    positions: string[];
    slotLabel: string;
    slotType: "starter" | "bench" | "ir";
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    loopGuard.check();

    const line = lines[i];
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

    for (let j = i + 1; j < Math.min(i + 14, lines.length); j++) {
      loopGuard.check();

      const next = lines[j];
      if (slotPattern.test(next)) break;

      if (next === "Empty") {
        isEmptySlot = true;
        break;
      }

      if (!status && statusPattern.test(next)) {
        status = next.toUpperCase();
        continue;
      }

      if (next === "MOVE" || next === "--") continue;

      // Positions like "SG, SF" or "PF, C"
      if (positions.length === 0 && /^(PG|SG|SF|PF|C)(,\s*(PG|SG|SF|PF|C))*$/i.test(next)) {
        positions = parsePositions(next);
        continue;
      }

      // Team codes appear like "Cha", "Mia", "GS", "Utah" (case varies)
      if (!team && /^[A-Za-z]{2,4}$/.test(next)) {
        const normalized = normalizeNbaTeamCode(next);
        if (normalized) {
          team = normalized;
          continue;
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
        const doubled = next.match(/^([A-Z][a-zA-Z'.-]+(?:\s+[A-Za-z'.-]+)*)\1$/);
        if (doubled) {
          name = doubled[1].trim();
          continue;
        }

        // Fallback heuristic: avoid obvious headers
        if (
          next.length > 3 &&
          /[A-Za-z]/.test(next) &&
          !/^(STARTERS|STATS|SLOT|Player|opp|STATUS)$/i.test(next)
        ) {
          name = next;
        }
      }
    }

    if (isEmptySlot || !name) continue;

    // Warn if we couldn't extract team code
    if (!team) {
      devWarn(`[parseEspnRosterSlots] No team code found for player: ${name}`);
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

  // 4) Build roster rows (match playerInfo row order with stats row order)
  const roster: RosterSlot[] = [];
  const rows = Math.min(numStatRows, playerInfo.length);

  const parseVal = (base: number, idx: number): number => {
    const token = statTokens[base + idx];
    if (!token || token === "--") return 0;
    const n = parseFloat(token);
    return Number.isFinite(n) ? n : 0;
  };

  for (let row = 0; row < rows; row++) {
    loopGuard.check();

    const info = playerInfo[row];
    const base = row * COLS;

    const minutes = parseVal(base, 0);
    const fgm = parseVal(base, 1);
    const fga = parseVal(base, 2);

    let fgPct = parseVal(base, 3);
    if (fgPct > 1) fgPct = fgPct / (fgPct >= 100 ? 1000 : 100);

    const ftm = parseVal(base, 4);
    const fta = parseVal(base, 5);

    let ftPct = parseVal(base, 6);
    if (ftPct > 1) ftPct = ftPct / (ftPct >= 100 ? 1000 : 100);

    roster.push({
      slot: info.slotLabel,
      slotType: info.slotType,
      player: {
        id: info.name,
        name: info.name,
        nbaTeam: info.team,
        positions: info.positions,
        opponent: info.opponent,
        status: info.status as Player["status"],
        minutes,
        fgm,
        fga,
        fgPct,
        ftm,
        fta,
        ftPct,
        threepm: parseVal(base, 7),
        rebounds: parseVal(base, 8),
        assists: parseVal(base, 9),
        steals: parseVal(base, 10),
        blocks: parseVal(base, 11),
        turnovers: parseVal(base, 12),
        points: parseVal(base, 13),
      },
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

  return roster;
}
