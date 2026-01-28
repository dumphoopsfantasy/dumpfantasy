import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseESPNRosterData } from "./espnRosterParser";

// Mock devLog to prevent console noise during tests
vi.mock("@/lib/devLog", () => ({
  devLog: vi.fn(),
  devWarn: vi.fn(),
  devError: vi.fn(),
}));

describe("parseESPNRosterData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses IR players with stats correctly when preceded by IR player with --/-- stats (Malik Monk scenario)", () => {
    // This fixture reproduces the exact scenario:
    // - Dejounte Murray (IR) has all "--" and "--/--" for stats
    // - Malik Monk (IR) has real stats: MIN=24.4, 3PM=2.7, PTS=15.1
    const espnBlob = `STARTERS	January 28
SLOT
Player
action
opp
STATUS
PG
Reed SheppardReed Sheppard
Reed Sheppard
Hou
SG, PG
MOVE
SA
9:30 PM
Bench
Cade CunninghamCade Cunningham
Cade Cunningham
Det
PG, SG
MOVE
--
IR
Dejounte MurrayDejounte Murray
Dejounte Murray
O
NO
SG, PG
--
IR
Malik MonkMalik Monk
Malik Monk
DTD
Sac
SG, PG, SF
--
STATS	Research
MIN
FGM/FGA
FG%
FTM/FTA
FT%
3PM
REB
AST
STL
BLK
TO
PTS
PR15
%ROST
+/-
21.3
4.5/11.6
.387
0.8/1.0
.750
2.4
1.6
2.0
1.0
0.3
1.1
12.1
1.30
56.9
-0.5
33.8
6.7/16.5
.404
3.2/4.8
.655
1.0
3.2
10.0
1.0
1.0
3.0
17.5
1.16
100.0
0
--
--/--
--
--/--
--
--
--
--
--
--
--
--
--
15.8
-0.1
24.4
5.3/10.6
.500
1.9/1.9
1.000
2.7
2.0
3.1
0.3
0.6
1.7
15.1
7.47
51.3
-1.5
ESPN.com`;

    const result = parseESPNRosterData(espnBlob);

    // Should parse 4 players
    expect(result.length).toBe(4);

    // Find Malik Monk
    const malikMonk = result.find(p => p.player === "Malik Monk");
    expect(malikMonk).toBeDefined();
    expect(malikMonk!.slot).toBe("IR");
    expect(malikMonk!.team).toBe("SAC");
    expect(malikMonk!.status).toBe("DTD");
    
    // Key assertions: Malik Monk should have his actual stats
    expect(malikMonk!.minutes).toBeCloseTo(24.4, 1);
    expect(malikMonk!.threepm).toBeCloseTo(2.7, 1);
    expect(malikMonk!.points).toBeCloseTo(15.1, 1);

    // Also verify Dejounte Murray has zero stats (from --/-- tokens)
    const dejounteMurray = result.find(p => p.player === "Dejounte Murray");
    expect(dejounteMurray).toBeDefined();
    expect(dejounteMurray!.slot).toBe("IR");
    expect(dejounteMurray!.minutes).toBe(0);
    expect(dejounteMurray!.points).toBe(0);
  });

  it("handles unicode dashes (— and –) as missing tokens", () => {
    const espnBlob = `STARTERS
PG
Test PlayerTest Player
Test Player
LAL
PG
MOVE
--
STATS	Research
MIN
FGM/FGA
FG%
FTM/FTA
FT%
3PM
REB
AST
STL
BLK
TO
PTS
PR15
%ROST
+/-
—
—/—
—
–/–
—
—
—
—
—
—
—
—
—
50.0
0
ESPN.com`;

    const result = parseESPNRosterData(espnBlob);
    
    expect(result.length).toBe(1);
    expect(result[0].player).toBe("Test Player");
    // All stats should be 0 (from missing tokens)
    expect(result[0].minutes).toBe(0);
    expect(result[0].points).toBe(0);
  });

  it("correctly counts stat tokens with mixed --/-- and real values", () => {
    // 2 players, each with 15 columns
    const espnBlob = `STARTERS
PG
Player OnePlayer One
Player One
BOS
PG
MOVE
--
SG
Player TwoPlayer Two
Player Two
LAL
SG
MOVE
--
STATS
MIN
FGM/FGA
FG%
FTM/FTA
FT%
3PM
REB
AST
STL
BLK
TO
PTS
PR15
%ROST
+/-
30.0
5.0/10.0
.500
2.0/2.0
1.000
3.0
5.0
5.0
1.0
1.0
2.0
15.0
5.00
50.0
+1.0
--
--/--
--
--/--
--
--
--
--
--
--
--
--
--
25.0
-1.0
ESPN.com`;

    const result = parseESPNRosterData(espnBlob);
    
    expect(result.length).toBe(2);
    
    // Player One should have real stats
    expect(result[0].minutes).toBe(30.0);
    expect(result[0].threepm).toBe(3.0);
    expect(result[0].points).toBe(15.0);
    
    // Player Two should have zero stats
    expect(result[1].minutes).toBe(0);
    expect(result[1].threepm).toBe(0);
    expect(result[1].points).toBe(0);
  });
});
