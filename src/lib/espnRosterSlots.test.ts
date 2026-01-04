/**
 * Unit tests for ESPN roster parsing -> schedule-aware readiness.
 */

import { parseEspnRosterSlotsFromTeamPage, validatePlayerStats } from "./espnRosterSlots";
import { describe, it, expect } from "vitest";

describe("validatePlayerStats", () => {
  it("returns null for valid stats", () => {
    const player = {
      id: "test",
      name: "Test Player",
      blocks: 0.4,
      steals: 1.4,
      fgPct: 0.427,
      ftPct: 0.842,
      points: 20.1,
      minutes: 26.6,
    } as any;
    expect(validatePlayerStats(player)).toBeNull();
  });

  it("catches impossible BLK values", () => {
    const player = {
      id: "test",
      name: "Test Player",
      blocks: 23.3, // This was the bug - MIN value in BLK column
    } as any;
    expect(validatePlayerStats(player)).toContain("BLK=23.3");
  });

  it("catches FG% > 1", () => {
    const player = {
      id: "test",
      name: "Test Player",
      blocks: 0.4,
      steals: 1.0,
      fgPct: 1.5,
      ftPct: 0.8,
      points: 20,
      minutes: 30,
    } as any;
    expect(validatePlayerStats(player)).toContain("FG%");
  });
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
    expect(p.fgm).toBeCloseTo(6.7, 1);
    expect(p.fga).toBeCloseTo(15.7, 1);
    expect(p.fgPct).toBeCloseTo(0.427, 3);
    // Critical: BLK should be 0.4, not misaligned to MIN or other column
    expect(p.blocks).toBeCloseTo(0.4, 1);
    expect(p.steals).toBeCloseTo(1.4, 1);
    expect(p.points).toBeCloseTo(20.1, 1);
  });

  it("correctly aligns all stat columns without index shift", () => {
    // This simulates the exact ESPN paste format causing the bug
    const input = [
      "PG",
      "Norman PowellNorman Powell",
      "Mia",
      "SG, SF",
      "Min",
      "5:00 PM",
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
      "32.6",        // MIN
      "8.1/18.4",    // FGM/FGA
      ".442",        // FG%
      "4.7/5.1",     // FTM/FTA
      ".917",        // FT%
      "2.7",         // 3PM
      "4.1",         // REB
      "3.6",         // AST
      "1.6",         // STL
      "0.1",         // BLK - this is the key test
      "2.0",         // TO
      "23.7",        // PTS
      "8.27",
      "89.0",
      "+0.1",
    ].join("\n");

    const roster = parseEspnRosterSlotsFromTeamPage(input);
    expect(roster.length).toBe(1);

    const p = roster[0].player;
    expect(p.minutes).toBeCloseTo(32.6, 1);
    expect(p.fgm).toBeCloseTo(8.1, 1);
    expect(p.fga).toBeCloseTo(18.4, 1);
    expect(p.ftm).toBeCloseTo(4.7, 1);
    expect(p.fta).toBeCloseTo(5.1, 1);
    expect(p.threepm).toBeCloseTo(2.7, 1);
    expect(p.rebounds).toBeCloseTo(4.1, 1);
    expect(p.assists).toBeCloseTo(3.6, 1);
    expect(p.steals).toBeCloseTo(1.6, 1);
    expect(p.blocks).toBeCloseTo(0.1, 1); // NOT 32.6 (MIN)!
    expect(p.turnovers).toBeCloseTo(2.0, 1);
    expect(p.points).toBeCloseTo(23.7, 1);
  });

  it("handles empty slots and -- values gracefully", () => {
    const input = [
      "C",
      "Empty",
      "--",
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
      "--",
      "--/--",
      "--",
      "--/--",
      "--",
      "--",
      "--",
      "--",
      "--",
      "--",
      "--",
      "--",
    ].join("\n");

    const roster = parseEspnRosterSlotsFromTeamPage(input);
    // Empty slots should be skipped
    expect(roster.length).toBe(0);
  });

  it("validates team BLK ×40 is reasonable", () => {
    // Simulate a full roster with 8 players
    const players = [
      { name: "Player1", blk: "0.4" },
      { name: "Player2", blk: "0.2" },
      { name: "Player3", blk: "0.1" },
      { name: "Player4", blk: "1.1" },
      { name: "Player5", blk: "2.0" },
      { name: "Player6", blk: "0.3" },
      { name: "Player7", blk: "0.5" },
      { name: "Player8", blk: "0.0" },
    ];

    const lines: string[] = [];
    players.forEach((p, i) => {
      lines.push(i < 5 ? ["PG", "SG", "SF", "PF", "C"][i] : "Bench");
      lines.push(`${p.name}${p.name}`);
      lines.push("LAL");
      lines.push("PG");
    });
    lines.push("STATS", "MIN", "FGM/FGA", "FG%", "FTM/FTA", "FT%", "3PM", "REB", "AST", "STL", "BLK", "TO", "PTS", "PR15", "%ROST", "+/-");
    
    players.forEach(p => {
      lines.push("30.0", "5.0/10.0", ".500", "2.0/2.5", ".800", "1.5", "5.0", "4.0", "1.0", p.blk, "2.0", "15.0", "5.0", "90.0", "+1.0");
    });

    const roster = parseEspnRosterSlotsFromTeamPage(lines.join("\n"));
    expect(roster.length).toBe(8);

    // Calculate team BLK sum
    const teamBlk = roster.reduce((sum, r) => sum + r.player.blocks, 0);
    // Sum should be 0.4+0.2+0.1+1.1+2.0+0.3+0.5+0.0 = 4.6
    expect(teamBlk).toBeCloseTo(4.6, 1);
    // ×40 = 184 which is reasonable for a team
    expect(teamBlk * 40).toBeLessThan(300);
  });
});
