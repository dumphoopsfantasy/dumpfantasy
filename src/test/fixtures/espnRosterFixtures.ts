/**
 * Test fixtures from real ESPN roster blobs
 * 
 * These fixtures are used to test parsing accuracy and matchup computations.
 * Date: January 24, 2025
 * 
 * Key test cases:
 * - Players with games today (opp != "--")
 * - Players WITHOUT games today (opp = "--")
 * - IR players (should be excluded from all computations)
 * - Mixed positions (multi-position eligibility)
 * - Team code normalization (Hou, Tor, NY, Por, etc.)
 */

// My Team: "Mr. Bane" - pasted from ESPN on January 24
export const MY_TEAM_ESPN_BLOB = `hsb.accessibility.skipContent
ESPN
NFL

NBA

NCAAF

NCAAM

NCAAW

NHL

Soccer

More Sports

ESPN BET
Watch

ESPN BET
Fantasy

Where to Watch

Fantasy Basketball Home
My Team
League
League Home
Settings
Members
Rosters
Schedule
Message Board
Transaction Counter
History
Draft Recap
Email League
Recent Activity
Players
Add Players
Watch List
Daily Leaders
Live Draft Trends
Added / Dropped
Player Rater
Player News
Projections
Waiver Order
Waiver Report
Undroppables
FantasyCast
Scoreboard
Standings
Opposing Teams

DA SPURS (SAS)
Dimitri Vasiliadis

Wooden Nickelers (QLee)
Quentin Lee

You, Complete Me (ANUS)
paul vasiliadis

FREAK (VAS)
Thomas Vasiliadis

Let Steph Cook (CHEF)
Dennis Rollfs

Floor Generals (DEM)
Andrew Demers

Howdy Y'All (HWDY)
Jonathan Rouillard

The Real Slim Shaidy's (SS)
Tim Berry

Bilbo (Bilb)
Bill Vasiliadis
LM Tools
Get Another Team
Change
Mr. Bane
9-4-0
(1st of 10)
Team Settings
All Hail WembyDemitri VoyiatzisAdd 2nd Manager
Watch List
Waiver Order (10 of 10)
Lineup Protection Moves
Full Schedule
Last Matchup

Wooden Nickelers
3-6-0

Mr. Bane
6-3-0
Current Matchup

Mr. Bane
7-2-0

DA SPURS
2-7-0
Set Lineup:

Jan 19
Mon
Jan 20
Tue
Jan 21
Wed
Jan 22
Thu
Jan 23
Fri
Jan 24
Today
Jan 25
Sun
Jan 26
Mon
Jan 27
Tue
Jan 28
Wed
Jan 29
Thu
Jan 30
Fri
Jan 31
Sat
Feb 1
Sun
Feb 2
Mon


Trade & Acquisition Limits
Matchup Acquisition Limit2 / 3
Season Acquisition LimitNo Limit
Trade LimitNo Limit

Manage IR
Add Player

Drop Players
Stats
Trending
Schedule
News
Show Stats
Last 15
TotalsAverages
STARTERS	January 24
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
--
SG
Desmond BaneDesmond Bane
Desmond Bane
Orl
SG, SF

MOVE
Cle
7:00 PM
SF
Jaylon TysonJaylon Tyson
Jaylon Tyson
Cle
SG, SF

MOVE
@Orl
7:00 PM
PF
Naz ReidNaz Reid
Naz Reid
Min
C, PF

MOVE
GS
5:30 PM
C
Jusuf NurkicJusuf Nurkic
Jusuf Nurkic
DTD
Utah
C

MOVE
Mia
9:30 PM
G
Ayo DosunmuAyo Dosunmu
Ayo Dosunmu
Chi
SG

MOVE
Bos
8:00 PM
F/C
Sam HauserSam Hauser
Sam Hauser
Bos
SF

MOVE
@Chi
8:00 PM
UTIL
Lauri MarkkanenLauri Markkanen
Lauri Markkanen
O
Utah
PF, SF

MOVE
Mia
9:30 PM
Bench
Cade CunninghamCade Cunningham
Cade Cunningham
Det
PG, SG

MOVE
--
Bench
Kevin DurantKevin Durant
Kevin Durant
Hou
PF, SF

MOVE
--
Bench
Kawhi LeonardKawhi Leonard
Kawhi Leonard
LAC
SF, PF

MOVE
--
Bench
John CollinsJohn Collins
John Collins
LAC
PF, C

MOVE
--
Bench
RJ BarrettRJ Barrett
RJ Barrett
Tor
SF, SG, PF

MOVE
--
Bench
Saddiq BeySaddiq Bey
Saddiq Bey
NO
SF, PF

MOVE
--
IR
Jamal MurrayJamal Murray
Jamal Murray
DTD
Den
PG
--
IR
Dejounte MurrayDejounte Murray
Dejounte Murray
O
NO
SG, PG
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
22.7
4.9/11.9
.411
0.8/1.0
.778
2.7
1.3
2.4
1.0
0.2
0.9
13.2
3.51
58.1
-1.1
35.2
7.0/15.0
.467
3.8/3.8
1.000
1.2
4.6
4.2
0.8
0.6
2.2
19.0
3.31
95.1
+0.1
30.6
6.9/13.0
.527
2.0/2.6
.778
3.1
5.7
3.3
0.6
0.0
2.7
18.9
4.38
27.7
+1.2
25.9
6.4/11.6
.556
1.0/1.4
.700
3.1
6.1
2.9
1.0
1.0
1.7
17.0
8.40
80.5
+0.7
30.5
6.8/14.0
.482
1.5/2.0
.750
1.0
13.8
8.0
1.3
1.0
1.5
16.0
4.03
48.2
+0.3
25.4
5.6/10.6
.527
1.4/1.7
.833
2.4
2.7
4.3
1.6
0.4
0.9
15.0
7.19
27.7
0
31.1
6.3/11.1
.564
0.6/0.6
1.000
4.9
5.3
2.3
0.6
0.1
0.9
18.0
8.20
17.9
+4.9
36.0
8.0/16.0
.500
9.0/12.0
.750
3.0
12.0
2.0
1.0
1.0
1.0
28.0
-1.20
96.1
0
34.3
4.5/15.0
.300
4.0/6.0
.667
0.5
2.8
9.5
0.8
1.0
3.3
13.5
-3.81
100.0
0
39.3
9.6/19.1
.500
4.8/5.6
.860
3.1
6.8
5.0
0.9
0.8
3.1
27.0
12.93
99.9
0
29.2
9.2/17.6
.523
5.8/6.6
.879
4.6
5.2
3.4
2.4
0.2
1.8
28.8
8.58
97.6
+0.1
29.3
6.0/8.8
.679
0.7/1.0
.667
2.5
4.2
0.7
0.8
1.3
1.0
15.2
6.17
63.5
-0.7
24.5
5.0/12.0
.417
3.0/4.0
.750
1.5
5.0
5.0
0.0
0.5
1.5
14.5
-2.99
81.7
+0.4
30.0
5.5/10.8
.508
6.3/7.2
.884
2.0
3.8
2.0
0.8
0.0
0.7
19.3
4.57
23.3
+0.9
35.2
10.8/19.5
.556
5.0/5.5
.909
3.0
2.3
6.3
1.3
0.7
2.8
29.7
9.70
99.6
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
16.3
-0.1
ESPN.com | Member Services | Fantasy Games | Help | Interest-Based Ads | Do Not Sell My Info

Copyright ©2026 ESPN Internet Ventures. Terms of Use, Privacy Policy and Safety Information and Your US State Privacy Rights are applicable to this site.

Officially Licensed Product of the National Basketball Players Association. Visit www.nbpa.com.

Fantasy Chat


Apollo`;

// Opponent Team: "DA SPURS" - pasted from ESPN on January 24
export const OPPONENT_TEAM_ESPN_BLOB = `hsb.accessibility.skipContent
ESPN
NFL

NBA

NCAAF

NCAAM

NCAAW

NHL

Soccer

More Sports

ESPN BET
Watch

ESPN BET
Fantasy

Where to Watch

Fantasy Basketball Home
My Team
League
League Home
Settings
Members
Rosters
Schedule
Message Board
Transaction Counter
History
Draft Recap
Email League
Recent Activity
Players
Add Players
Watch List
Daily Leaders
Live Draft Trends
Added / Dropped
Player Rater
Player News
Projections
Waiver Order
Waiver Report
Undroppables
FantasyCast
Scoreboard
Standings
Opposing Teams

DA SPURS (SAS)
Dimitri Vasiliadis

Wooden Nickelers (QLee)
Quentin Lee

You, Complete Me (ANUS)
paul vasiliadis

FREAK (VAS)
Thomas Vasiliadis

Let Steph Cook (CHEF)
Dennis Rollfs

Floor Generals (DEM)
Andrew Demers

Howdy Y'All (HWDY)
Jonathan Rouillard

The Real Slim Shaidy's (SS)
Tim Berry

Bilbo (Bilb)
Bill Vasiliadis
LM Tools
Get Another Team

DA SPURS
2-11-0
(9th of 10)
All Hail WembyDimitri Vasiliadis
Waiver Order (2 of 10)
Lineup Protection Moves
Full Schedule
Last Matchup

DA SPURS
1-8-0

FREAK
8-1-0
Current Matchup

Mr. Bane
7-2-0

DA SPURS
2-7-0
Set Lineup:

Jan 19
Mon
Jan 20
Tue
Jan 21
Wed
Jan 22
Thu
Jan 23
Fri
Jan 24
Today
Jan 25
Sun
Jan 26
Mon
Jan 27
Tue
Jan 28
Wed
Jan 29
Thu
Jan 30
Fri
Jan 31
Sat
Feb 1
Sun
Feb 2
Mon


Trade & Acquisition Limits
Matchup Acquisition Limit0 / 3
Season Acquisition LimitNo Limit
Trade LimitNo Limit
Propose Trade
Stats
Trending
Schedule
News
Show Stats
Last 15
TotalsAverages
STARTERS	January 24
SLOT
Player
opp
STATUS
PG
Jalen BrunsonJalen Brunson
Jalen Brunson
NY
PG
@Phi
3:00 PM
SG
Shaedon SharpeShaedon Sharpe
Shaedon Sharpe
Por
SG, SF
--
SF
Andrew WigginsAndrew Wiggins
Andrew Wiggins
Mia
SF, PF
@Utah
9:30 PM
PF
Peyton WatsonPeyton Watson
Peyton Watson
DTD
Den
SF, PF
--
C
Alperen SengunAlperen Sengun
Alperen Sengun
Hou
C
--
G
Anthony BlackAnthony Black
Anthony Black
Orl
PG, SG
Cle
7:00 PM
F/C
Brandon IngramBrandon Ingram
Brandon Ingram
Tor
SF
--
UTIL
Sandro MamukelashviliSandro Mamukelashvili
Sandro Mamukelashvili
Tor
PF
--
Bench
Domantas SabonisDomantas Sabonis
Domantas Sabonis
Sac
C, PF
--
Bench
Ja MorantJa Morant
Ja Morant
O
Mem
PG
--
Bench
Zion WilliamsonZion Williamson
Zion Williamson
NO
PF
--
Bench
Jrue HolidayJrue Holiday
Jrue Holiday
Por
PG, SG
--
Bench
Jerami GrantJerami Grant
Jerami Grant
Por
PF
--
Bench
Marcus SasserMarcus Sasser
Marcus Sasser
Det
PG
--
IR
Anthony DavisAnthony Davis
Anthony Davis
O
Dal
C, PF
LAL
8:30 PM
IR
Kyrie IrvingKyrie Irving
Kyrie Irving
O
Dal
PG, SG
LAL
8:30 PM
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
28.8
7.6/16.4
.463
2.6/2.8
.929
2.0
2.6
4.8
0.2
0.0
2.2
19.8
0.70
99.8
0
32.5
9.0/18.8
.480
2.9/3.6
.793
2.4
6.1
3.3
1.6
0.0
3.3
23.3
5.88
80.2
0
30.1
5.6/11.9
.474
2.0/2.1
.941
2.3
5.5
2.5
1.1
0.4
2.3
15.5
6.12
85.3
+0.3
35.6
7.8/15.6
.496
4.3/5.6
.756
2.5
6.6
3.1
1.5
1.6
2.5
22.3
10.60
59.7
-0.2
33.9
7.9/16.0
.492
3.1/5.8
.543
0.4
9.1
6.0
1.6
1.1
3.5
19.3
4.02
99.6
0
34.8
6.2/12.2
.508
3.2/4.0
.800
2.6
3.6
5.2
0.8
0.2
2.8
18.2
1.75
63.1
-0.5
35.9
7.6/16.7
.453
4.1/4.6
.906
2.1
6.1
4.6
1.0
0.7
2.1
21.4
7.49
92.9
+0.1
25.4
5.8/9.8
.590
1.3/2.3
.556
1.5
5.8
2.5
0.6
0.5
0.8
14.3
4.74
18.8
+1.6
22.3
4.8/7.8
.613
3.0/3.8
.800
0.3
10.0
4.0
0.5
0.3
3.5
12.8
-0.15
99.5
0
29.0
7.0/14.0
.500
7.5/8.5
.882
2.0
3.5
12.5
1.0
1.5
3.5
23.5
0.65
94.0
-0.2
29.1
8.4/13.1
.638
3.9/6.6
.585
0.0
5.9
3.4
1.3
0.6
1.9
20.6
4.69
95.9
+0.1
19.8
5.0/10.8
.462
0.8/1.2
.714
2.0
3.3
4.8
0.7
0.0
1.3
12.8
1.03
73.2
+0.5
23.5
4.0/10.0
.400
5.3/6.8
.778
1.3
1.8
1.8
0.8
1.0
2.0
14.5
-1.79
40.8
-0.7
13.3
2.0/7.3
.273
1.0/1.3
.750
1.0
0.7
2.3
0.7
0.0
0.3
6.0
-4.09
0.2
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
-2.70
88.9
-0.2
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
51.3
0
ESPN.com | Member Services | Fantasy Games | Help | Interest-Based Ads | Do Not Sell My Info

Copyright ©2026 ESPN Internet Ventures. Terms of Use, Privacy Policy and Safety Information and Your US State Privacy Rights are applicable to this site.

Officially Licensed Product of the National Basketball Players Association. Visit www.nbpa.com.

Fantasy Chat


Apollo`;

// Expected parsing results for validation
export const EXPECTED_MY_TEAM_PLAYERS = [
  { name: "Reed Sheppard", team: "HOU", positions: ["SG", "PG"], hasGameToday: false, slotType: "starter" },
  { name: "Desmond Bane", team: "ORL", positions: ["SG", "SF"], hasGameToday: true, slotType: "starter" },
  { name: "Jaylon Tyson", team: "CLE", positions: ["SG", "SF"], hasGameToday: true, slotType: "starter" },
  { name: "Naz Reid", team: "MIN", positions: ["C", "PF"], hasGameToday: true, slotType: "starter" },
  { name: "Jusuf Nurkic", team: "UTA", positions: ["C"], hasGameToday: true, slotType: "starter", status: "DTD" },
  { name: "Ayo Dosunmu", team: "CHI", positions: ["SG"], hasGameToday: true, slotType: "starter" },
  { name: "Sam Hauser", team: "BOS", positions: ["SF"], hasGameToday: true, slotType: "starter" },
  { name: "Lauri Markkanen", team: "UTA", positions: ["PF", "SF"], hasGameToday: true, slotType: "starter", status: "O" },
  { name: "Cade Cunningham", team: "DET", positions: ["PG", "SG"], hasGameToday: false, slotType: "bench" },
  { name: "Kevin Durant", team: "HOU", positions: ["PF", "SF"], hasGameToday: false, slotType: "bench" },
  { name: "Kawhi Leonard", team: "LAC", positions: ["SF", "PF"], hasGameToday: false, slotType: "bench" },
  { name: "John Collins", team: "LAC", positions: ["PF", "C"], hasGameToday: false, slotType: "bench" },
  { name: "RJ Barrett", team: "TOR", positions: ["SF", "SG", "PF"], hasGameToday: false, slotType: "bench" },
  { name: "Saddiq Bey", team: "NOP", positions: ["SF", "PF"], hasGameToday: false, slotType: "bench" },
  { name: "Jamal Murray", team: "DEN", positions: ["PG"], hasGameToday: false, slotType: "ir", status: "DTD" },
  { name: "Dejounte Murray", team: "NOP", positions: ["SG", "PG"], hasGameToday: false, slotType: "ir", status: "O" },
] as const;

export const EXPECTED_OPP_TEAM_PLAYERS = [
  { name: "Jalen Brunson", team: "NYK", positions: ["PG"], hasGameToday: true, slotType: "starter" },
  { name: "Shaedon Sharpe", team: "POR", positions: ["SG", "SF"], hasGameToday: false, slotType: "starter" },
  { name: "Andrew Wiggins", team: "MIA", positions: ["SF", "PF"], hasGameToday: true, slotType: "starter" },
  { name: "Peyton Watson", team: "DEN", positions: ["SF", "PF"], hasGameToday: false, slotType: "starter", status: "DTD" },
  { name: "Alperen Sengun", team: "HOU", positions: ["C"], hasGameToday: false, slotType: "starter" },
  { name: "Anthony Black", team: "ORL", positions: ["PG", "SG"], hasGameToday: true, slotType: "starter" },
  { name: "Brandon Ingram", team: "TOR", positions: ["SF"], hasGameToday: false, slotType: "starter" },
  { name: "Sandro Mamukelashvili", team: "TOR", positions: ["PF"], hasGameToday: false, slotType: "starter" },
  { name: "Domantas Sabonis", team: "SAC", positions: ["C", "PF"], hasGameToday: false, slotType: "bench" },
  { name: "Ja Morant", team: "MEM", positions: ["PG"], hasGameToday: false, slotType: "bench", status: "O" },
  { name: "Zion Williamson", team: "NOP", positions: ["PF"], hasGameToday: false, slotType: "bench" },
  { name: "Jrue Holiday", team: "POR", positions: ["PG", "SG"], hasGameToday: false, slotType: "bench" },
  { name: "Jerami Grant", team: "POR", positions: ["PF"], hasGameToday: false, slotType: "bench" },
  { name: "Marcus Sasser", team: "DET", positions: ["PG"], hasGameToday: false, slotType: "bench" },
  { name: "Anthony Davis", team: "DAL", positions: ["C", "PF"], hasGameToday: true, slotType: "ir", status: "O" },
  { name: "Kyrie Irving", team: "DAL", positions: ["PG", "SG"], hasGameToday: true, slotType: "ir", status: "O" },
] as const;

// Expected computation results
export const EXPECTED_MY_TEAM_TODAY_STARTS = 7; // 7 players with games today (non-IR)
export const EXPECTED_OPP_TEAM_TODAY_STARTS = 3; // Only 3 non-IR players with games: Brunson, Wiggins, Black

// Players that should NOT count as "today starters":
// - Reed Sheppard: in starting slot but opp="--" (no game)
// - Kevin Durant: on bench, opp="--"
// - Jamal Murray: IR slot
// - Anthony Davis: IR slot (even though has game)
