import { describe, it, expect } from "vitest";
import { parseEspnMatchupTotalsFromText } from "./espnMatchupTotals";
import { addTotals, withDerivedPct } from "./teamTotals";

describe("parseEspnMatchupTotalsFromText", () => {
  it("parses a totals row with slash fields without shifting columns", () => {
    const input = [
      "FGM/FGA",
      "FTM/FTA",
      "3PM",
      "REB",
      "AST",
      "STL",
      "BLK",
      "TO",
      "PTS",
      "350/780",
      "210/260",
      "95",
      "410",
      "255",
      "78",
      "52",
      "160",
      "980",
    ].join("\n");

    const res = parseEspnMatchupTotalsFromText(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.totals.fgm).toBe(350);
    expect(res.totals.fga).toBe(780);
    expect(res.totals.blocks).toBe(52);
    expect(res.totals.points).toBe(980);
  });

  it("fails fast if totals row is missing or malformed", () => {
    const input = ["FGM/FGA", "FTM/FTA", "3PM", "REB", "AST"].join("\n");
    const res = parseEspnMatchupTotalsFromText(input);
    expect(res.ok).toBe(false);
  });
});

describe("Projected Final math", () => {
  it("computes Final = Current + Remaining and derives FG%/FT% from makes/attempts", () => {
    const current = {
      fgm: 100,
      fga: 220,
      ftm: 60,
      fta: 80,
      threepm: 30,
      rebounds: 200,
      assists: 120,
      steals: 40,
      blocks: 25,
      turnovers: 70,
      points: 520,
    };

    const remaining = {
      fgm: 55,
      fga: 120,
      ftm: 35,
      fta: 45,
      threepm: 18,
      rebounds: 95,
      assists: 60,
      steals: 18,
      blocks: 12,
      turnovers: 32,
      points: 300,
    };

    const final = addTotals(current, remaining);
    const withPct = withDerivedPct(final);

    expect(withPct.points).toBe(820);
    expect(withPct.fgPct).toBeCloseTo(155 / 340, 6);
    expect(withPct.ftPct).toBeCloseTo(95 / 125, 6);
  });
});
