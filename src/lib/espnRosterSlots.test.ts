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

  it("never parses time tokens like '7:30 PM' as player names", () => {
    // This simulates ESPN data where times appear as standalone lines
    const input = [
      "PG",
      "Devin BookerDevin Booker",
      "Phx",
      "PG, SG",
      "@Chi",
      "7:30 PM",
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
      "35.0",
      "8.5/18.0",
      ".472",
      "5.0/5.5",
      ".909",
      "2.5",
      "4.5",
      "6.5",
      "1.1",
      "0.3",
      "2.8",
      "24.5",
      "8.50",
      "99.0",
      "+0.5",
    ].join("\n");

    const roster = parseEspnRosterSlotsFromTeamPage(input);
    
    // Should only have Devin Booker, not a player named "7:30 PM"
    expect(roster.length).toBe(1);
    expect(roster[0].player.name).toBe("Devin Booker");
    expect(roster.every(r => !/^\d{1,2}:\d{2}/.test(r.player.name))).toBe(true);
  });

  it("parses single-position players correctly (Champagnie SA SF)", () => {
    const input = [
      "SF",
      "Julian ChampagnieJulian Champagnie",
      "SA",
      "SF",
      "@Min",
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
      "28.0",
      "4.5/10.0",
      ".450",
      "1.5/2.0",
      ".750",
      "2.0",
      "5.0",
      "2.0",
      "0.8",
      "0.5",
      "1.2",
      "12.5",
      "5.00",
      "45.0",
      "+0.2",
    ].join("\n");

    const roster = parseEspnRosterSlotsFromTeamPage(input);
    expect(roster.length).toBe(1);
    
    const p = roster[0].player;
    expect(p.name).toBe("Julian Champagnie");
    expect(p.nbaTeam).toBe("SAS"); // SA normalizes to SAS
    expect(p.positions).toContain("SF");
  });

  it("parses Embiid (Phi C) and Garland (Cle PG) correctly", () => {
    const input = [
      "C",
      "Joel EmbiidJoel Embiid",
      "Phi",
      "C",
      "vs LAL",
      "7:00 PM",
      "DTD",
      "PG",
      "Darius GarlandDarius Garland",
      "Cle",
      "PG",
      "@Bos",
      "7:30 PM",
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
      // Embiid stats
      "34.0",
      "10.0/20.0",
      ".500",
      "8.0/9.0",
      ".889",
      "1.0",
      "11.0",
      "3.5",
      "1.0",
      "1.8",
      "3.5",
      "29.0",
      "10.00",
      "99.5",
      "+1.0",
      // Garland stats
      "32.0",
      "7.5/17.0",
      ".441",
      "3.5/4.0",
      ".875",
      "2.5",
      "3.0",
      "7.5",
      "1.3",
      "0.2",
      "2.5",
      "21.0",
      "8.50",
      "98.0",
      "+0.8",
    ].join("\n");

    const roster = parseEspnRosterSlotsFromTeamPage(input);
    expect(roster.length).toBe(2);
    
    const embiid = roster.find(r => r.player.name === "Joel Embiid");
    expect(embiid).toBeDefined();
    expect(embiid!.player.nbaTeam).toBe("PHI");
    expect(embiid!.player.positions).toContain("C");
    expect(embiid!.player.status).toBe("DTD");
    
    const garland = roster.find(r => r.player.name === "Darius Garland");
    expect(garland).toBeDefined();
    expect(garland!.player.nbaTeam).toBe("CLE");
    expect(garland!.player.positions).toContain("PG");
  });

  it("parses Gafford (Dal C) with correct team normalization", () => {
    const input = [
      "C",
      "Daniel GaffordDaniel Gafford",
      "Dal",
      "C",
      "@Hou",
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
      "22.0",
      "3.5/5.0",
      ".700",
      "1.0/2.0",
      ".500",
      "0.0",
      "6.5",
      "1.0",
      "0.5",
      "2.0",
      "0.8",
      "8.0",
      "5.50",
      "70.0",
      "+0.3",
    ].join("\n");

    const roster = parseEspnRosterSlotsFromTeamPage(input);
    expect(roster.length).toBe(1);
    
    const p = roster[0].player;
    expect(p.name).toBe("Daniel Gafford");
    expect(p.nbaTeam).toBe("DAL");
    expect(p.positions).toContain("C");
    expect(p.blocks).toBeCloseTo(2.0, 1);
  });

  it("rejects header tokens as player names", () => {
    const input = [
      "PG",
      "STARTERS", // Should not become a player name
      "7:30 PM",  // Should not become a player name
      "STATS",    // Should not become a player name
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
    
    // Should only have LaMelo Ball
    expect(roster.length).toBe(1);
    expect(roster[0].player.name).toBe("LaMelo Ball");
    
    // Ensure none of the rejected tokens appear as player names
    const badNames = ["STARTERS", "7:30 PM", "STATS", "8:00 PM"];
    roster.forEach(r => {
      badNames.forEach(bad => {
        expect(r.player.name).not.toBe(bad);
        expect(r.player.name).not.toContain(bad);
      });
    });
  });
});
