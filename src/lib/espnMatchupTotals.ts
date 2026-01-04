import { preprocessInput, createLoopGuard } from "@/lib/parseUtils";
import { TeamTotals } from "@/lib/teamTotals";

export type MatchupTotalsParseErrorCode =
  | "TOTALS_HEADER_NOT_FOUND"
  | "TOTALS_ROW_NOT_FOUND"
  | "INVALID_TOTALS";

export interface MatchupTotalsParseError {
  code: MatchupTotalsParseErrorCode;
  message: string;
  details?: string;
}

export type MatchupTotalsParseResult =
  | { ok: true; totals: TeamTotals }
  | { ok: false; error: MatchupTotalsParseError };

const HEADER_CANONICAL: Record<string, keyof TeamTotals | "FGM_FGA" | "FTM_FTA"> = {
  "FGM/FGA": "FGM_FGA",
  "FGM/A": "FGM_FGA",
  "FTM/FTA": "FTM_FTA",
  "FTM/A": "FTM_FTA",
  "3PM": "threepm",
  "REB": "rebounds",
  "AST": "assists",
  "STL": "steals",
  "BLK": "blocks",
  "TO": "turnovers",
  "PTS": "points",
};

function normalizeHeaderToken(t: string): string {
  return t
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[•·]/g, "")
    .replace(/[^A-Z0-9%/+-]/g, "");
}

function isDataCellToken(t: string): boolean {
  if (!t) return false;
  if (t === "--" || t === "--/--") return true;
  if (/^\+?[-]?\d+(?:\.\d+)?$/.test(t)) return true;
  if (/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(t)) return true;
  return false;
}

function parseNum(t: string): number {
  if (!t || t === "--") return 0;
  const n = parseFloat(t.replace(/^\+/, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseFraction(t: string): { made: number; att: number } {
  if (!t || t === "--" || t === "--/--") return { made: 0, att: 0 };
  const m = t.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (!m) return { made: 0, att: 0 };
  return { made: parseFloat(m[1]) || 0, att: parseFloat(m[2]) || 0 };
}

/**
 * Parses an ESPN "matchup totals" style row that includes FGM/FGA and FTM/FTA.
 *
 * Intended input: a paste that contains a header row with these tokens in order, followed by a totals row.
 * Works with plain-text Ctrl+A pastes (cells are newline separated).
 */
export function parseEspnMatchupTotalsFromText(text: string): MatchupTotalsParseResult {
  if (!text?.trim()) {
    return {
      ok: false,
      error: {
        code: "TOTALS_HEADER_NOT_FOUND",
        message: "No data provided",
      },
    };
  }

  const lines = preprocessInput(text);
  const guard = createLoopGuard();

  // 1) Find a header row start (FGM/FGA or FGM/A)
  let headerStart = -1;
  for (let i = 0; i < lines.length; i++) {
    guard.check();
    const h = normalizeHeaderToken(lines[i]);
    if (h === "FGM/FGA" || h === "FGM/A") {
      headerStart = i;
      break;
    }
  }

  if (headerStart === -1) {
    return {
      ok: false,
      error: {
        code: "TOTALS_HEADER_NOT_FOUND",
        message: "Could not find a totals header row (missing FGM/FGA)",
        details:
          "Paste the matchup totals section that includes columns like FGM/FGA, FTM/FTA, 3PM, REB, AST, STL, BLK, TO, PTS.",
      },
    };
  }

  // 2) Collect headers until first data cell
  const headers: string[] = [];
  let dataStart = headerStart;
  for (let i = headerStart; i < lines.length; i++) {
    guard.check();
    const token = lines[i];
    if (!token) break;

    const normalized = normalizeHeaderToken(token);
    if (HEADER_CANONICAL[normalized]) {
      headers.push(normalized);
      dataStart = i + 1;
      continue;
    }

    // Allow non-target headers between, but stop once data begins
    if (isDataCellToken(token)) {
      dataStart = i;
      break;
    }

    // If we already collected some headers and hit non-header junk, stop
    if (headers.length > 0) {
      // keep scanning forward until data begins
      continue;
    }
  }

  // Ensure we have at least the core columns
  if (!headers.includes("FGM/FGA") && !headers.includes("FGM/A")) {
    return {
      ok: false,
      error: {
        code: "TOTALS_HEADER_NOT_FOUND",
        message: "Totals header row incomplete",
      },
    };
  }

  // 3) Read first row of cells with length=headers.length
  const cells: string[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    guard.check();
    const token = lines[i];

    // Stop at footer-ish content
    if (/^(ESPN\.com|Copyright|Fantasy Chat)/i.test(token)) break;

    if (!isDataCellToken(token)) {
      // ignore junk between header and row
      continue;
    }

    cells.push(token);
    if (cells.length >= headers.length) break;
  }

  if (cells.length < headers.length) {
    return {
      ok: false,
      error: {
        code: "TOTALS_ROW_NOT_FOUND",
        message: "Could not find a complete totals row after the header",
      },
    };
  }

  const totals: TeamTotals = {
    fgm: 0,
    fga: 0,
    ftm: 0,
    fta: 0,
    threepm: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    points: 0,
  };

  for (let idx = 0; idx < headers.length; idx++) {
    const header = headers[idx];
    const cell = cells[idx];

    const canonical = HEADER_CANONICAL[header];
    if (!canonical) continue;

    if (canonical === "FGM_FGA") {
      const { made, att } = parseFraction(cell);
      totals.fgm = made;
      totals.fga = att;
      continue;
    }

    if (canonical === "FTM_FTA") {
      const { made, att } = parseFraction(cell);
      totals.ftm = made;
      totals.fta = att;
      continue;
    }

    totals[canonical] = parseNum(cell);
  }

  // Basic validation: if we got no volume and no counting stats, it's not a real totals row.
  const anyCounts =
    totals.fga > 0 ||
    totals.fta > 0 ||
    totals.points > 0 ||
    totals.rebounds > 0 ||
    totals.assists > 0;

  const invalidPct =
    (totals.fga > 0 && totals.fgm > totals.fga) ||
    (totals.fta > 0 && totals.ftm > totals.fta);

  if (!anyCounts || invalidPct) {
    return {
      ok: false,
      error: {
        code: "INVALID_TOTALS",
        message: "Totals row looks invalid (missing volume or makes>attempts)",
        details: `FGM/FGA=${totals.fgm}/${totals.fga}, FTM/FTA=${totals.ftm}/${totals.fta}, PTS=${totals.points}`,
      },
    };
  }

  return { ok: true, totals };
}
