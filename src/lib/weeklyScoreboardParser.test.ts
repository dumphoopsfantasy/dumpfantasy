import { describe, it, expect } from "vitest";
import { parseWeeklyScoreboard } from "@/pages/WeeklyPerformance";

const cats = ["FG%","FT%","3PM","REB","AST","STL","BLK","TO","PTS"];
const block = (a: string, ra: string, b: string, rb: string, ta: string, sa: string[], tb: string, sb: string[]) =>
  [a, ra, b, rb, ...cats, ta, ...sa, tb, ...sb, "Matchup", "Box Score"].join("\n");

const paste = [
  "Scoreboard",
  block("Mr. Bane","7-1-1","Jordan's Scary Team","1-7-1","DUMP",[".5531",".8000","44","67","39","21","8","32","298"],"JST",[".4574",".7955","11","67","23","7","3","22","164"]),
  block("Christian's Team","5-4-0","Bilbo","4-5-0","CT",[".5","8","1","2","3","4","5","6","7"].map((v,i)=>i<2?".5000":v),"BIL",[".4","7","1","2","3","4","5","6","7"].map((v,i)=>i<2?".4000":v)),
].join("\n");

describe("parseWeeklyScoreboard new ESPN header format", () => {
  it("parses Mr. Bane vs Jordan's Scary Team with W-L-T and stats", () => {
    const { matchups } = parseWeeklyScoreboard(paste);
    expect(matchups).toHaveLength(2);
    const m = matchups[0];
    expect(m.teamA.name).toBe("Mr. Bane");
    expect(m.teamA.currentMatchup).toBe("7-1-1");
    expect(m.teamA.stats).toEqual({ fgPct: 0.5531, ftPct: 0.8, threepm: 44, rebounds: 67, assists: 39, steals: 21, blocks: 8, turnovers: 32, points: 298 });
    expect(m.teamB.name).toBe("Jordan's Scary Team");
    expect(m.teamB.currentMatchup).toBe("1-7-1");
    expect(m.teamB.stats).toEqual({ fgPct: 0.4574, ftPct: 0.7955, threepm: 11, rebounds: 67, assists: 23, steals: 7, blocks: 3, turnovers: 22, points: 164 });
    expect(matchups[1].teamA.name).toBe("Christian's Team");
    expect(matchups[1].teamB.name).toBe("Bilbo");
  });
});
