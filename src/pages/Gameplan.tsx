import { useMemo } from "react";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, TrendingUp, TrendingDown, Minus, UserPlus, UserMinus, Calendar, Target } from "lucide-react";

interface MatchupStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

interface ParsedTeam {
  token: string;
  tokenUpper: string;
  name: string;
  recordStanding: string;
  currentMatchup: string;
  stats: MatchupStats;
}

interface WeeklyMatchup {
  teamA: ParsedTeam;
  teamB: ParsedTeam;
}

interface MatchupProjectionData {
  myTeam: { name: string; record: string; standing: string; owner?: string; lastMatchup?: string; stats: MatchupStats };
  opponent: { name: string; record: string; standing: string; owner?: string; lastMatchup?: string; stats: MatchupStats };
}

interface RosterSlot {
  slot: string;
  slotType: "starter" | "bench" | "ir";
  player: Player & { cri?: number; wCri?: number; criRank?: number; wCriRank?: number };
}

interface GameplanProps {
  roster: RosterSlot[];
  freeAgents: Player[];
  leagueTeams: LeagueTeam[];
  matchupData: MatchupProjectionData | null;
  weeklyMatchups: WeeklyMatchup[];
}

const CATEGORY_LABELS: Record<string, string> = {
  fgPct: "FG%",
  ftPct: "FT%",
  threepm: "3PM",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TO",
  points: "PTS",
};

const COUNTING_STATS = ["threepm", "rebounds", "assists", "steals", "blocks", "turnovers", "points"];

export function Gameplan({ roster, freeAgents, leagueTeams, matchupData, weeklyMatchups }: GameplanProps) {
  // Find my team in weekly matchups for current matchup record
  const myTeamWeekly = useMemo(() => {
    if (!weeklyMatchups.length || !matchupData?.myTeam?.name) return null;
    const myName = matchupData.myTeam.name.toLowerCase();
    for (const matchup of weeklyMatchups) {
      if (matchup.teamA.name.toLowerCase().includes(myName) || myName.includes(matchup.teamA.name.toLowerCase())) {
        return { team: matchup.teamA, opponent: matchup.teamB };
      }
      if (matchup.teamB.name.toLowerCase().includes(myName) || myName.includes(matchup.teamB.name.toLowerCase())) {
        return { team: matchup.teamB, opponent: matchup.teamA };
      }
    }
    // Try token matching
    const myToken = matchupData.myTeam.name.split(' ')[0]?.toLowerCase();
    for (const matchup of weeklyMatchups) {
      if (matchup.teamA.token.toLowerCase() === myToken || matchup.teamA.tokenUpper.toLowerCase() === myToken) {
        return { team: matchup.teamA, opponent: matchup.teamB };
      }
      if (matchup.teamB.token.toLowerCase() === myToken || matchup.teamB.tokenUpper.toLowerCase() === myToken) {
        return { team: matchup.teamB, opponent: matchup.teamA };
      }
    }
    return null;
  }, [weeklyMatchups, matchupData]);

  // Calculate swing categories
  const swingCategories = useMemo(() => {
    if (!matchupData) return [];

    const categories = Object.keys(CATEGORY_LABELS) as (keyof MatchupStats)[];
    const diffs: { key: string; label: string; myVal: number; oppVal: number; diff: number; isLeading: boolean }[] = [];

    categories.forEach((key) => {
      let myVal: number;
      let oppVal: number;

      if (myTeamWeekly) {
        // Use weekly totals
        myVal = myTeamWeekly.team.stats[key];
        oppVal = myTeamWeekly.opponent.stats[key];
      } else {
        // Use projection mode: averages × 40 for counting stats
        myVal = matchupData.myTeam.stats[key];
        oppVal = matchupData.opponent.stats[key];
        if (COUNTING_STATS.includes(key)) {
          myVal *= 40;
          oppVal *= 40;
        }
      }

      const isTurnover = key === "turnovers";
      const diff = isTurnover ? oppVal - myVal : myVal - oppVal;
      const isLeading = diff > 0;

      diffs.push({
        key,
        label: CATEGORY_LABELS[key],
        myVal,
        oppVal,
        diff: Math.abs(diff),
        isLeading,
      });
    });

    // Sort by smallest absolute difference (most competitive)
    diffs.sort((a, b) => a.diff - b.diff);
    return diffs.slice(0, 3);
  }, [matchupData, myTeamWeekly]);

  // Find my team's weakest standings categories
  const weakestCategories = useMemo(() => {
    if (!leagueTeams.length || !matchupData?.myTeam?.name) return [];
    
    const myTeam = leagueTeams.find(t => 
      t.name.toLowerCase().includes(matchupData.myTeam.name.toLowerCase()) ||
      matchupData.myTeam.name.toLowerCase().includes(t.name.toLowerCase())
    );
    
    if (!myTeam) return [];

    const catKeys = ["fgPct", "ftPct", "threepm", "rebounds", "assists", "steals", "blocks", "turnovers", "points"] as const;
    const ranks: { key: string; label: string; rank: number }[] = [];

    catKeys.forEach(key => {
      const mappedKey = key === "threepm" ? "tpm" : key;
      const sorted = [...leagueTeams].sort((a, b) => {
        const aVal = (a as any)[mappedKey] || 0;
        const bVal = (b as any)[mappedKey] || 0;
        if (key === "turnovers") return aVal - bVal; // Lower is better
        return bVal - aVal;
      });
      const rank = sorted.findIndex(t => t.name === myTeam.name) + 1;
      if (rank > 0) {
        ranks.push({ key, label: CATEGORY_LABELS[key], rank });
      }
    });

    // Sort by worst rank (highest number = weakest)
    ranks.sort((a, b) => b.rank - a.rank);
    return ranks.slice(0, 3);
  }, [leagueTeams, matchupData]);

  // Generate ADD/DROP recommendations
  const recommendations = useMemo(() => {
    const hasRoster = roster.length > 0;
    const hasFreeAgents = freeAgents.length === 50;
    
    if (!hasRoster || !hasFreeAgents) return null;

    // Determine target categories
    let targetCats: string[] = [];
    if (matchupData?.opponent?.name) {
      // Weight toward swing categories
      targetCats = swingCategories.filter(c => !c.isLeading).map(c => c.key);
      if (targetCats.length === 0) {
        targetCats = swingCategories.map(c => c.key);
      }
    } else if (weakestCategories.length > 0) {
      // Weight toward weakest standings categories
      targetCats = weakestCategories.map(c => c.key);
    } else {
      targetCats = ["points", "rebounds", "assists"];
    }

    // Score free agents by target categories
    const scoredFA = freeAgents.map(fa => {
      let score = 0;
      const strengths: string[] = [];
      
      targetCats.forEach(cat => {
        const val = (fa as any)[cat] || 0;
        if (val > 0) {
          score += val * (cat === "turnovers" ? -1 : 1);
          if (val > 0) strengths.push(CATEGORY_LABELS[cat]);
        }
      });
      
      return { player: fa, score, strengths };
    });

    scoredFA.sort((a, b) => b.score - a.score);
    const adds = scoredFA.slice(0, 5);

    // Score roster players for drops (lowest performers in target cats)
    const activePlayers = roster.filter(r => r.slotType !== "ir" && r.player.minutes > 0);
    const scoredRoster = activePlayers.map(r => {
      let score = 0;
      const weaknesses: string[] = [];
      
      targetCats.forEach(cat => {
        const val = (r.player as any)[cat] || 0;
        score += val * (cat === "turnovers" ? -1 : 1);
        if (val < (roster.length > 0 ? roster.reduce((sum, p) => sum + ((p.player as any)[cat] || 0), 0) / roster.length : 0)) {
          weaknesses.push(CATEGORY_LABELS[cat]);
        }
      });
      
      return { player: r.player, score, weaknesses };
    });

    scoredRoster.sort((a, b) => a.score - b.score);
    const drops = scoredRoster.slice(0, 3);

    return { adds, drops, targetCats };
  }, [roster, freeAgents, swingCategories, weakestCategories, matchupData]);

  // Get roster players playing today (mock - would need schedule data)
  const todayGames = useMemo(() => {
    const playersWithGames = roster.filter(r => r.player.opponent && r.player.opponent !== "--");
    return playersWithGames.map(r => ({
      name: r.player.name,
      opponent: r.player.opponent || "",
      gameTime: ""
    }));
  }, [roster]);

  const hasMyTeam = matchupData?.myTeam?.name;
  const hasOpponent = matchupData?.opponent?.name && matchupData.opponent.name !== matchupData.myTeam?.name;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl md:text-3xl font-display font-bold">Gameplan</h2>
        <p className="text-muted-foreground mt-1">Your matchup strategy at a glance</p>
      </div>

      {/* 1) MATCHUP SNAPSHOT */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Matchup Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasMyTeam ? (
            <div className="grid grid-cols-2 gap-6">
              {/* My Team */}
              <div className="text-center space-y-2">
                <Badge variant="default" className="text-sm px-3 py-1">MY TEAM</Badge>
                <h3 className="text-xl md:text-2xl font-display font-bold">{matchupData!.myTeam.name}</h3>
                <p className="text-lg text-muted-foreground">
                  Season: <span className="text-foreground font-semibold">{matchupData!.myTeam.record || "—"}</span>
                </p>
                <p className="text-lg">
                  {myTeamWeekly ? (
                    <>Current: <span className="font-bold text-primary">{myTeamWeekly.team.currentMatchup || "—"}</span></>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Current matchup unavailable — import Weekly Scoreboard</span>
                  )}
                </p>
              </div>

              <Separator orientation="vertical" className="hidden md:block mx-auto h-32" />

              {/* Opponent */}
              <div className="text-center space-y-2">
                <Badge variant="outline" className="text-sm px-3 py-1">OPPONENT</Badge>
                {hasOpponent ? (
                  <>
                    <h3 className="text-xl md:text-2xl font-display font-bold">{matchupData!.opponent.name}</h3>
                    <p className="text-lg text-muted-foreground">
                      Season: <span className="text-foreground font-semibold">{matchupData!.opponent.record || "—"}</span>
                    </p>
                    <p className="text-lg">
                      {myTeamWeekly ? (
                        <>Current: <span className="font-bold">{myTeamWeekly.opponent.currentMatchup || "—"}</span></>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">Current matchup unavailable</span>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground italic">Import Matchup data to see opponent</p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Import Matchup data to see your matchup snapshot</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2) SWING CATEGORIES */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Swing Categories
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {myTeamWeekly ? "(based on weekly totals)" : "(projected)"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {swingCategories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {swingCategories.map((cat, idx) => (
                <div key={cat.key} className="bg-accent/30 rounded-lg p-4 text-center">
                  <div className="text-sm text-muted-foreground mb-1">#{idx + 1} Most Competitive</div>
                  <div className="text-2xl font-display font-bold mb-2">{cat.label}</div>
                  <div className="flex items-center justify-center gap-2">
                    {cat.isLeading ? (
                      <>
                        <TrendingUp className="w-4 h-4 text-stat-positive" />
                        <span className="text-stat-positive font-semibold">
                          Leading by {cat.key === "fgPct" || cat.key === "ftPct" ? cat.diff.toFixed(3) : Math.round(cat.diff)}
                        </span>
                      </>
                    ) : cat.diff === 0 ? (
                      <>
                        <Minus className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground font-semibold">Tied</span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-4 h-4 text-stat-negative" />
                        <span className="text-stat-negative font-semibold">
                          Trailing by {cat.key === "fgPct" || cat.key === "ftPct" ? cat.diff.toFixed(3) : Math.round(cat.diff)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Import Matchup data to see swing categories</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3) WHAT TO DO (ADDS / DROPS) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            What To Do
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recommendations ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ADD Candidates */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <UserPlus className="w-4 h-4 text-stat-positive" />
                  <h4 className="font-display font-semibold text-stat-positive">Top 5 Add Candidates</h4>
                </div>
                <div className="space-y-2">
                  {recommendations.adds.map((rec, idx) => (
                    <div key={rec.player.id} className="bg-accent/20 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-semibold text-lg">{rec.player.name}</span>
                          <span className="text-sm text-muted-foreground ml-2">{rec.player.nbaTeam}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">#{idx + 1}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Boosts {rec.strengths.slice(0, 3).join(", ") || "key categories"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* DROP Candidates */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <UserMinus className="w-4 h-4 text-stat-negative" />
                  <h4 className="font-display font-semibold text-stat-negative">Top 3 Drop Candidates</h4>
                </div>
                <div className="space-y-2">
                  {recommendations.drops.map((rec, idx) => (
                    <div key={rec.player.id} className="bg-accent/20 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-semibold text-lg">{rec.player.name}</span>
                          <span className="text-sm text-muted-foreground ml-2">{rec.player.nbaTeam}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">#{idx + 1}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Underperforming in target categories
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>
                {roster.length === 0 
                  ? "Import your Roster to see recommendations" 
                  : freeAgents.length !== 50 
                    ? "Import exactly 50 Free Agents to see recommendations"
                    : "Unable to generate recommendations"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4) SCHEDULE / GAMES */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Today's Games
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayGames.length > 0 ? (
            <div>
              <div className="bg-accent/30 rounded-lg p-4 mb-4">
                <p className="text-lg text-center">
                  <span className="font-semibold">Today:</span>{" "}
                  <span className="text-primary font-bold">{todayGames.length}</span> of your players have games
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {todayGames.map((game, idx) => (
                  <div key={idx} className="bg-accent/20 rounded-lg p-3 text-center">
                    <div className="font-semibold">{game.name}</div>
                    <div className="text-sm text-muted-foreground">{game.opponent}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Schedule data not available</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
