import { describe, expect, it } from "vitest";
import { MY_TEAM_ESPN_BLOB, OPPONENT_TEAM_ESPN_BLOB } from "../test/fixtures/espnRosterFixtures";
import { extractESPNTeamIdentity, extractOpponentFromCurrentMatchup, resolveESPNOpponentName } from "./espnTeamIdentity";

describe("ESPN team identity", () => {
  it("extracts page owners from existing complete ESPN page fixtures", () => {
    expect(extractESPNTeamIdentity(MY_TEAM_ESPN_BLOB).name).toBe("Mr. Bane");
    expect(extractESPNTeamIdentity(OPPONENT_TEAM_ESPN_BLOB).name).toBe("DA SPURS");
  });

  const banner = "Current Matchup\nMr. Bane\n7-1-1\nJordan's Scary Team\n1-7-1\nFG%";
  it("prefers the owner selector over an earlier two-team banner without season standings", () => {
    expect(extractESPNTeamIdentity(`${banner}\nGet Another Team\nChange\nJordan's Scary Team\nTeam Settings`).name).toBe("Jordan's Scary Team");
    expect(extractESPNTeamIdentity(`Get Another Team\nChange\nMr. Bane\nTeam Settings\n${banner}`).name).toBe("Mr. Bane");
  });

  it("supports changed standings formatting and owner settings without a selector", () => {
    expect(extractESPNTeamIdentity(`Mr. Bane\n7-1-0\n1st out of 10\nTeam Settings\n${banner}`).name).toBe("Mr. Bane");
    expect(extractESPNTeamIdentity(`Mr. Bane\n7-1-0 (1st of 10)\n${banner}`).record).toBe("7-1-0");
  });

  it("never extracts identity from a matchup-only paste or returns Team", () => {
    expect(extractESPNTeamIdentity(banner).name).toBe("");
    expect(extractESPNTeamIdentity("Get Another Team\nTeam\nTeam Settings").name).toBe("");
  });

  it("resolves a duplicate opponent identity through the current matchup", () => {
    expect(extractOpponentFromCurrentMatchup(banner, "Mr Bane")).toBe("Jordan's Scary Team");
    expect(resolveESPNOpponentName(banner, "Mr. Bane", "Mr Bane")).toBe("Jordan's Scary Team");
    expect(resolveESPNOpponentName(banner, "Mr. Bane", "Team")).toBe("Jordan's Scary Team");
    expect(extractOpponentFromCurrentMatchup(banner, "Team")).toBeNull();
  });
});