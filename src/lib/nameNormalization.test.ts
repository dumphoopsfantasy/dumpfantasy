import { describe, expect, it } from "vitest";
import { teamNamesMatch } from "./nameNormalization";

describe("team identity matching", () => {
  it("never matches placeholder identities to a scoreboard team", () => {
    for (const name of ["Team", " TEAM ", "", "—", "Your Team"]) {
      expect(teamNamesMatch(name, "Jordan's Scary Team")).toBe(false);
      expect(teamNamesMatch(name, name)).toBe(false);
    }
  });

  it("matches punctuation and whitespace variants", () => {
    expect(teamNamesMatch("Mr Bane", "Mr. Bane")).toBe(true);
    expect(teamNamesMatch("Jordan’s  Scary Team", "Jordans Scary Team")).toBe(true);
  });

  it("does not confuse the two matchup sides", () => {
    expect(teamNamesMatch("Jordan's Scary Team", "Mr. Bane")).toBe(false);
  });

  it("selects the user's 7-1-1 side instead of JST's 1-7-1", () => {
    const sides = [
      { name: "Jordan's Scary Team", currentMatchup: "1-7-1" },
      { name: "Mr Bane", currentMatchup: "7-1-1" },
    ];
    expect(sides.find(side => teamNamesMatch(side.name, "Mr. Bane"))?.currentMatchup).toBe("7-1-1");
    expect(sides.find(side => teamNamesMatch(side.name, "Team"))).toBeUndefined();
  });

  it("only contains complete multiword names at word boundaries", () => {
    expect(teamNamesMatch("Mr. Bane", "Mr. Bane (BAN)")).toBe(true);
    expect(teamNamesMatch("Mr. Bane", "Mr. Baneful")).toBe(false);
    expect(teamNamesMatch("Jordan", "Jordan's Scary Team")).toBe(false);
    expect(teamNamesMatch("Bilbo", "Bilbo")).toBe(true);
  });
});