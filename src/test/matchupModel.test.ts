/**
 * Unit tests for matchup model and parsing
 * 
 * Tests critical fixes:
 * A) Today detection: hasGameToday based on opp field, not slot
 * B) Baseline x40: uses roster-wide average (all non-IR players)
 * C) Schedule-aware: uses integer optimized starts
 */

import { describe, it, expect } from "vitest";
import { parseEspnRosterSlotsFromTeamPage } from "@/lib/espnRosterSlots";
import {
  MY_TEAM_ESPN_BLOB,
  OPPONENT_TEAM_ESPN_BLOB,
  EXPECTED_MY_TEAM_TODAY_STARTS,
  EXPECTED_OPP_TEAM_TODAY_STARTS,
} from "./fixtures/espnRosterFixtures";
import {
  computeBaselineStats,
  playerHasGameToday,
  getPlayersWithGamesToday,
} from "@/hooks/useMatchupModel";
import { NBAGame } from "@/lib/nbaApi";

describe("ESPN Roster Parsing", () => {
  it("parses my team without ghost players", () => {
    const roster = parseEspnRosterSlotsFromTeamPage(MY_TEAM_ESPN_BLOB);
    
    // Should have 16 players (14 active + 2 IR)
    expect(roster.length).toBeGreaterThanOrEqual(14);
    
    // No time tokens as player names
    const timeTokenPlayers = roster.filter(
      (r) => /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(r.player.name)
    );
    expect(timeTokenPlayers).toHaveLength(0);
    
    // Check specific players exist
    const playerNames = roster.map((r) => r.player.name);
    expect(playerNames).toContain("Reed Sheppard");
    expect(playerNames).toContain("Desmond Bane");
    expect(playerNames).toContain("Cade Cunningham");
  });

  it("parses opponent team without ghost players", () => {
    const roster = parseEspnRosterSlotsFromTeamPage(OPPONENT_TEAM_ESPN_BLOB);
    
    expect(roster.length).toBeGreaterThanOrEqual(14);
    
    // No time tokens as player names
    const timeTokenPlayers = roster.filter(
      (r) => /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(r.player.name)
    );
    expect(timeTokenPlayers).toHaveLength(0);
    
    // Check specific players exist
    const playerNames = roster.map((r) => r.player.name);
    expect(playerNames).toContain("Jalen Brunson");
    expect(playerNames).toContain("Anthony Davis");
  });

  it("correctly identifies IR players", () => {
    const myRoster = parseEspnRosterSlotsFromTeamPage(MY_TEAM_ESPN_BLOB);
    const irPlayers = myRoster.filter((r) => r.slotType === "ir");
    
    // Should have 2 IR players: Jamal Murray and Dejounte Murray
    expect(irPlayers.length).toBe(2);
    
    const irNames = irPlayers.map((r) => r.player.name);
    expect(irNames.some((n) => n.includes("Murray"))).toBe(true);
  });
});

describe("Today Detection (Critical Fix A)", () => {
  const mockTodayGames: NBAGame[] = [
    { homeTeam: "CLE", awayTeam: "ORL", gameTime: "2025-01-24T19:00:00", status: "scheduled" },
    { homeTeam: "MIN", awayTeam: "GSW", gameTime: "2025-01-24T17:30:00", status: "scheduled" },
    { homeTeam: "UTA", awayTeam: "MIA", gameTime: "2025-01-24T21:30:00", status: "scheduled" },
    { homeTeam: "CHI", awayTeam: "BOS", gameTime: "2025-01-24T20:00:00", status: "scheduled" },
  ];

  it("player with opp='--' should NOT have game today", () => {
    // Reed Sheppard has opp="--" (no game)
    const player = {
      id: "1",
      name: "Reed Sheppard",
      nbaTeam: "HOU",
      positions: ["SG", "PG"],
      opponent: "--",
      minutes: 22.7,
      fgm: 4.9, fga: 11.9, fgPct: 0.411,
      ftm: 0.8, fta: 1.0, ftPct: 0.778,
      threepm: 2.7, rebounds: 1.3, assists: 2.4,
      steals: 1.0, blocks: 0.2, turnovers: 0.9, points: 13.2,
    };
    
    expect(playerHasGameToday(player, mockTodayGames)).toBe(false);
  });

  it("player with valid opp should have game today", () => {
    // Desmond Bane has opp="Cle 7:00 PM"
    const player = {
      id: "2",
      name: "Desmond Bane",
      nbaTeam: "ORL",
      positions: ["SG", "SF"],
      opponent: "Cle 7:00 PM",
      minutes: 35.2,
      fgm: 7.0, fga: 15.0, fgPct: 0.467,
      ftm: 3.8, fta: 3.8, ftPct: 1.0,
      threepm: 1.2, rebounds: 4.6, assists: 4.2,
      steals: 0.8, blocks: 0.6, turnovers: 2.2, points: 19.0,
    };
    
    expect(playerHasGameToday(player, mockTodayGames)).toBe(true);
  });

  it("player in starting slot but no game should NOT count", () => {
    const myRoster = parseEspnRosterSlotsFromTeamPage(MY_TEAM_ESPN_BLOB);
    
    // Reed Sheppard is in PG slot but has "--" for opponent
    const reedSlot = myRoster.find((r) => r.player.name.includes("Sheppard"));
    expect(reedSlot).toBeDefined();
    expect(reedSlot?.slotType).toBe("starter");
    expect(playerHasGameToday(reedSlot!.player, mockTodayGames)).toBe(false);
  });
});

describe("Baseline Calculation (Critical Fix C)", () => {
  it("excludes IR players from baseline", () => {
    const myRoster = parseEspnRosterSlotsFromTeamPage(MY_TEAM_ESPN_BLOB);
    const baseline = computeBaselineStats(myRoster);
    
    expect(baseline).not.toBeNull();
    
    // Should have 14 players (16 total - 2 IR)
    expect(baseline!.playerCount).toBe(14);
  });

  it("uses roster-wide average, not top 8 only", () => {
    const myRoster = parseEspnRosterSlotsFromTeamPage(MY_TEAM_ESPN_BLOB);
    const baseline = computeBaselineStats(myRoster);
    
    expect(baseline).not.toBeNull();
    
    // Verify all 14 non-IR players are included
    const nonIrCount = myRoster.filter((r) => r.slotType !== "ir").length;
    expect(baseline!.playerCount).toBe(nonIrCount);
  });

  it("computes valid shooting percentages", () => {
    const myRoster = parseEspnRosterSlotsFromTeamPage(MY_TEAM_ESPN_BLOB);
    const baseline = computeBaselineStats(myRoster);
    
    expect(baseline).not.toBeNull();
    expect(baseline!.fgPct).toBeGreaterThan(0);
    expect(baseline!.fgPct).toBeLessThanOrEqual(1);
    expect(baseline!.ftPct).toBeGreaterThan(0);
    expect(baseline!.ftPct).toBeLessThanOrEqual(1);
  });
});

describe("Opponent Today Starts (Acceptance Check)", () => {
  const mockTodayGames: NBAGame[] = [
    { homeTeam: "NYK", awayTeam: "PHI", gameTime: "2025-01-24T15:00:00", status: "scheduled" },
    { homeTeam: "UTA", awayTeam: "MIA", gameTime: "2025-01-24T21:30:00", status: "scheduled" },
    { homeTeam: "CLE", awayTeam: "ORL", gameTime: "2025-01-24T19:00:00", status: "scheduled" },
    { homeTeam: "DAL", awayTeam: "LAL", gameTime: "2025-01-24T20:30:00", status: "scheduled" },
  ];

  it("opponent today starts excludes IR even if they have games", () => {
    const oppRoster = parseEspnRosterSlotsFromTeamPage(OPPONENT_TEAM_ESPN_BLOB);
    const playersWithGames = getPlayersWithGamesToday(oppRoster, mockTodayGames);
    
    // Anthony Davis and Kyrie Irving are IR with games - should be excluded
    const irWithGames = playersWithGames.filter(
      (r) => r.slotType === "ir"
    );
    expect(irWithGames).toHaveLength(0);
    
    // Only non-IR players with games: Brunson (@Phi), Wiggins (@Utah), Black (Cle)
    // Expected: 3 players
    expect(playersWithGames.length).toBe(EXPECTED_OPP_TEAM_TODAY_STARTS);
  });
});
