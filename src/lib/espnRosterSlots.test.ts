/**
 * Unit tests for ESPN roster parsing -> schedule-aware readiness.
 */

import { parseEspnRosterSlotsFromTeamPage } from "./espnRosterSlots";

// Simple test runner for non-vitest environments
const describe = (name: string, fn: () => void) => {
  console.log(`Test suite: ${name}`);
  fn();
};
const it = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}:`, e);
  }
};
const expect = (val: any) => ({
  toBe: (expected: any) => {
    if (val !== expected) throw new Error(`Expected ${val} to be ${expected}`);
  },
  toBeGreaterThan: (expected: number) => {
    if (!(val > expected)) throw new Error(`Expected ${val} to be > ${expected}`);
  },
  toBeCloseTo: (expected: number, precision: number = 3) => {
    if (Math.abs(val - expected) > Math.pow(10, -precision)) {
      throw new Error(`Expected ${val} to be close to ${expected}`);
    }
  },
});

describe("parseEspnRosterSlotsFromTeamPage", () => {
  it("parses a roster row with mixed-case team codes and doubled name", () => {
    const input = [
      "STARTERS",
      "January 3",
      "SLOT",
      "Player",
      "opp",
      "STATUS",
      "PG",
      "LaMelo BallLaMelo Ball",
      "Cha",
      "PG",
      "@Chi",
      "8:00 PM",
      "STATS",
      "MIN",
      "FGM/FGA",
      "FG%",
      "FTM/FTA",
      "FT%",
      "3PM",
      "REB",
      "AST",
      "STL",
      "BLK",
      "TO",
      "PTS",
      "PR15",
      "%ROST",
      "+/-",
      "26.6",
      "6.7/15.7",
      ".427",
      "2.3/2.7",
      ".842",
      "4.4",
      "3.3",
      "6.9",
      "1.4",
      "0.4",
      "3.7",
      "20.1",
      "8.08",
      "98.4",
      "+0.1",
    ].join("\n");

    const roster = parseEspnRosterSlotsFromTeamPage(input);
    expect(roster.length).toBe(1);

    const p = roster[0].player;
    expect(p.name).toBe("LaMelo Ball");
    expect(p.nbaTeam).toBe("CHA");
    expect(p.positions.length).toBeGreaterThan(0);
    expect(p.fgm).toBeCloseTo(6.7, 2);
    expect(p.fga).toBeCloseTo(15.7, 2);
    expect(p.fgPct).toBeCloseTo(0.427, 3);
  });
});
