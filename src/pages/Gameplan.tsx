import { useMemo } from "react";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, TrendingUp, TrendingDown, Minus, UserPlus, UserMinus, Calendar, Target, AlertTriangle, CheckCircle, Clock } from "lucide-react";

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

type RiskLevel = "secure" | "at-risk" | "critical";

interface SwingCategory {
  key: string;
  label: string;
  myVal: number;
  oppVal: number;
  diff: number;
  isLeading: boolean;
  risk: RiskLevel;
}

function classifyRisk(diff: number, isPercentage: boolean): RiskLevel {
  const absMargin = Math.abs(diff);
  if (isPercentage) {
    // For percentages like FG%, FT%
    if (absMargin >= 0.03) return "secure";
    if (absMargin >= 0.01) return "at-risk";
    return "critical";
  } else {
    // For counting stats
    if (absMargin >= 15) return "secure";
    if (absMargin >= 5) return "at-risk";
    return "critical";
  }
}

function getRiskBadge(risk: RiskLevel) {
  switch (risk) {
    case "secure":
      return <Badge className="bg-stat-positive/20 text-stat-positive border-stat-positive/30">Secure</Badge>;
    case "at-risk":
      return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">At Risk</Badge>;
    case "critical":
      return <Badge className="bg-stat-negative/20 text-stat-negative border-stat-negative/30">Critical</Badge>;
  }
}

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

  // Calculate ALL categories with risk classification
  const allCategories = useMemo((): SwingCategory[] => {
    if (!matchupData) return [];

    const categories = Object.keys(CATEGORY_LABELS) as (keyof MatchupStats)[];
    const results: SwingCategory[] = [];

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
      const isPercentage = key === "fgPct" || key === "ftPct";
      const rawDiff = isTurnover ? oppVal - myVal : myVal - oppVal;
      const isLeading = rawDiff > 0;
      const risk = classifyRisk(rawDiff, isPercentage);

      results.push({
        key,
        label: CATEGORY_LABELS[key],
        myVal,
        oppVal,
        diff: rawDiff,
        isLeading,
        risk,
      });
    });

    return results;
  }, [matchupData, myTeamWeekly]);

  // Swing categories = top 3 most competitive (smallest absolute margin)
  const swingCategories = useMemo(() => {
    return [...allCategories]
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))
      .slice(0, 3);
  }, [allCategories]);

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

  // TODAY'S GAMES - STRICT VALIDATION
  const todayGames = useMemo(() => {
    const today = new Date();
    const todayStr = today.toDateString();
    
    return roster.filter(r => {
      const player = r.player;
      
      // Must have valid opponent (not "--" or empty)
      const hasValidOpponent = player.opponent && 
        player.opponent !== "--" && 
        player.opponent.trim() !== "" &&
        (player.opponent.includes("vs") || player.opponent.includes("@"));
      
      if (!hasValidOpponent) return false;
      
      // Must have valid game time
      const hasValidGameTime = player.gameTime && 
        player.gameTime.trim() !== "" && 
        player.gameTime !== "--";
      
      if (!hasValidGameTime) return false;
      
      // Must NOT be O, IR, or inactive status
      const inactiveStatuses = ["O", "IR", "SUSP"];
      if (player.status && inactiveStatuses.includes(player.status)) return false;
      
      // Must be on active roster (not IR slot)
      if (r.slotType === "ir") return false;
      
      return true;
    }).map(r => ({
      name: r.player.name,
      opponent: r.player.opponent || "",
      gameTime: r.player.gameTime || "",
      team: r.player.nbaTeam,
    }));
  }, [roster]);

  // Generate ADD/DROP recommendations with detailed reasoning
  const recommendations = useMemo(() => {
    const hasRoster = roster.length > 0;
    const hasFreeAgents = freeAgents.length === 50;
    
    if (!hasRoster || !hasFreeAgents) return null;

    // Determine target categories based on swing categories or weakest standings
    let targetCats: { key: string; label: string; trailing: boolean }[] = [];
    
    if (matchupData?.opponent?.name && swingCategories.length > 0) {
      // Weight toward swing categories, especially trailing ones
      targetCats = swingCategories.map(c => ({
        key: c.key,
        label: c.label,
        trailing: !c.isLeading,
      }));
    } else if (weakestCategories.length > 0) {
      targetCats = weakestCategories.map(c => ({
        key: c.key,
        label: c.label,
        trailing: true,
      }));
    } else {
      targetCats = [
        { key: "points", label: "PTS", trailing: true },
        { key: "rebounds", label: "REB", trailing: true },
        { key: "assists", label: "AST", trailing: true },
      ];
    }

    const trailingCats = targetCats.filter(c => c.trailing);
    const priorityCatKeys = trailingCats.length > 0 
      ? trailingCats.map(c => c.key)
      : targetCats.map(c => c.key);

    // Calculate team averages for comparison
    const activePlayers = roster.filter(r => r.slotType !== "ir" && r.player.minutes > 0);
    const teamAvg: Record<string, number> = {};
    priorityCatKeys.forEach(key => {
      const sum = activePlayers.reduce((acc, r) => acc + ((r.player as any)[key] || 0), 0);
      teamAvg[key] = activePlayers.length > 0 ? sum / activePlayers.length : 0;
    });

    // Score free agents with detailed impact
    const scoredFA = freeAgents.map(fa => {
      const deltas: { cat: string; delta: number }[] = [];
      let totalScore = 0;
      
      priorityCatKeys.forEach(key => {
        const faVal = (fa as any)[key] || 0;
        const isTurnover = key === "turnovers";
        const delta = isTurnover ? teamAvg[key] - faVal : faVal - teamAvg[key];
        
        deltas.push({ 
          cat: CATEGORY_LABELS[key], 
          delta: isTurnover ? -faVal : faVal 
        });
        totalScore += delta * (isTurnover ? 1 : 1);
      });
      
      // Get games this week if available
      const gamesRemaining = fa.gamesThisWeek || 0;
      
      // Build reason
      const topDeltas = deltas
        .filter(d => d.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 2);
      
      let reason = "";
      if (topDeltas.length > 0) {
        const catList = topDeltas.map(d => d.cat).join(" + ");
        reason = `Strong in ${catList}`;
        if (gamesRemaining > 0) {
          reason += ` with ${gamesRemaining} games remaining`;
        }
      } else {
        reason = "Solid contributor in target categories";
      }
      
      return { 
        player: fa, 
        score: totalScore, 
        deltas, 
        gamesRemaining,
        reason,
      };
    });

    scoredFA.sort((a, b) => b.score - a.score);
    const adds = scoredFA.slice(0, 5);

    // Score roster players for drops with opportunity cost reasoning
    const scoredRoster = activePlayers.map(r => {
      const player = r.player;
      const deltas: { cat: string; val: number }[] = [];
      let totalScore = 0;
      
      priorityCatKeys.forEach(key => {
        const val = (player as any)[key] || 0;
        const isTurnover = key === "turnovers";
        const contribution = isTurnover ? -val : val;
        
        deltas.push({ cat: CATEGORY_LABELS[key], val });
        totalScore += contribution;
      });
      
      const gamesRemaining = player.gamesThisWeek || 0;
      
      // Build drop reason based on opportunity cost
      const reasons: string[] = [];
      
      if (gamesRemaining === 0) {
        reasons.push("No games remaining this matchup");
      } else if (gamesRemaining === 1) {
        reasons.push("Only 1 game remaining");
      }
      
      // Check for high TO
      if (player.turnovers > 3) {
        reasons.push("High turnover risk");
      }
      
      // Check if below team average in priority cats
      const belowAvgCats = priorityCatKeys.filter(key => {
        const val = (player as any)[key] || 0;
        const isTurnover = key === "turnovers";
        return isTurnover ? val > teamAvg[key] : val < teamAvg[key];
      });
      
      if (belowAvgCats.length >= 2) {
        reasons.push("Below team average in swing categories");
      }
      
      // Check if bench player
      if (r.slotType === "bench") {
        reasons.push("Currently on bench");
      }
      
      const reason = reasons.length > 0 
        ? reasons[0] 
        : "Lower overall impact in target categories";
      
      return { 
        player, 
        score: totalScore, 
        deltas,
        gamesRemaining,
        reason,
        slotType: r.slotType,
      };
    });

    scoredRoster.sort((a, b) => a.score - b.score);
    const drops = scoredRoster.slice(0, 3);

    return { adds, drops, targetCats: priorityCatKeys.map(k => CATEGORY_LABELS[k]) };
  }, [roster, freeAgents, swingCategories, weakestCategories, matchupData]);

  // URGENCY INDICATOR
  const urgencyLevel = useMemo(() => {
    if (!matchupData || allCategories.length === 0) return "green";
    
    const atRiskOrCritical = allCategories.filter(c => 
      (c.risk === "at-risk" || c.risk === "critical") && !c.isLeading
    );
    
    const criticalTrailing = allCategories.filter(c => c.risk === "critical" && !c.isLeading);
    
    if (criticalTrailing.length >= 2) return "red";
    if (atRiskOrCritical.length >= 3) return "red";
    if (atRiskOrCritical.length >= 1) return "yellow";
    
    return "green";
  }, [allCategories, matchupData]);

  const urgencyConfig = {
    green: {
      icon: CheckCircle,
      bg: "bg-stat-positive/10 border-stat-positive/30",
      text: "text-stat-positive",
      message: "No action needed today",
    },
    yellow: {
      icon: Clock,
      bg: "bg-yellow-500/10 border-yellow-500/30",
      text: "text-yellow-600",
      message: "Optional optimization available",
    },
    red: {
      icon: AlertTriangle,
      bg: "bg-stat-negative/10 border-stat-negative/30",
      text: "text-stat-negative",
      message: "Action recommended today",
    },
  };

  const hasMyTeam = matchupData?.myTeam?.name;
  const hasOpponent = matchupData?.opponent?.name && matchupData.opponent.name !== matchupData.myTeam?.name;
  const urgency = urgencyConfig[urgencyLevel as keyof typeof urgencyConfig];
  const UrgencyIcon = urgency.icon;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl md:text-3xl font-display font-bold">Gameplan</h2>
        <p className="text-muted-foreground mt-1">Your matchup strategy at a glance</p>
      </div>

      {/* URGENCY INDICATOR BANNER */}
      {hasMyTeam && (
        <div className={`border rounded-lg p-4 flex items-center justify-center gap-3 ${urgency.bg}`}>
          <UrgencyIcon className={`w-5 h-5 ${urgency.text}`} />
          <span className={`font-semibold text-lg ${urgency.text}`}>{urgency.message}</span>
        </div>
      )}

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* My Team */}
              <div className="text-center space-y-2 p-4 bg-accent/20 rounded-lg">
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

              {/* Opponent */}
              <div className="text-center space-y-2 p-4 bg-accent/20 rounded-lg">
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
                  <p className="text-muted-foreground italic py-4">Import Matchup data to see opponent</p>
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
              {myTeamWeekly ? "(weekly totals)" : "(projected)"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {swingCategories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {swingCategories.map((cat) => {
                const isPercentage = cat.key === "fgPct" || cat.key === "ftPct";
                const displayDiff = isPercentage ? Math.abs(cat.diff).toFixed(3) : Math.round(Math.abs(cat.diff));
                
                return (
                  <div key={cat.key} className="bg-accent/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl font-display font-bold">{cat.label}</span>
                      {getRiskBadge(cat.risk)}
                    </div>
                    <div className="flex items-center gap-2">
                      {cat.diff === 0 ? (
                        <>
                          <Minus className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground font-semibold">Tied</span>
                        </>
                      ) : cat.isLeading ? (
                        <>
                          <TrendingUp className="w-4 h-4 text-stat-positive" />
                          <span className="text-stat-positive font-semibold">
                            Leading by {displayDiff}
                          </span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-4 h-4 text-stat-negative" />
                          <span className="text-stat-negative font-semibold">
                            Trailing by {displayDiff}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ADD Candidates */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <UserPlus className="w-4 h-4 text-stat-positive" />
                  <h4 className="font-display font-semibold text-stat-positive text-lg">Top Add Candidates</h4>
                </div>
                <div className="space-y-3">
                  {recommendations.adds.map((rec, idx) => {
                    const positiveDeltas = rec.deltas
                      .filter(d => d.delta > 0)
                      .sort((a, b) => b.delta - a.delta)
                      .slice(0, 3);
                    
                    return (
                      <div key={rec.player.id} className="bg-accent/20 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="font-semibold text-lg">{rec.player.name}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              {rec.player.nbaTeam} · {rec.player.positions?.join("/") || "—"}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs">#{idx + 1}</Badge>
                        </div>
                        
                        {/* Stat deltas */}
                        <div className="flex flex-wrap gap-2 mb-2">
                          {positiveDeltas.map(d => (
                            <Badge key={d.cat} variant="secondary" className="text-xs">
                              +{d.delta.toFixed(1)} {d.cat}
                            </Badge>
                          ))}
                          {rec.gamesRemaining > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {rec.gamesRemaining} games left
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground">{rec.reason}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* DROP Candidates */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <UserMinus className="w-4 h-4 text-stat-negative" />
                  <h4 className="font-display font-semibold text-stat-negative text-lg">Top Drop Candidates</h4>
                </div>
                <div className="space-y-3">
                  {recommendations.drops.map((rec, idx) => (
                    <div key={rec.player.id} className="bg-accent/20 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="font-semibold text-lg">{rec.player.name}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {rec.player.nbaTeam} · {rec.player.positions?.join("/") || "—"}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">#{idx + 1}</Badge>
                      </div>
                      
                      {/* Context badges */}
                      <div className="flex flex-wrap gap-2 mb-2">
                        {rec.gamesRemaining === 0 && (
                          <Badge variant="destructive" className="text-xs">No games left</Badge>
                        )}
                        {rec.gamesRemaining === 1 && (
                          <Badge variant="secondary" className="text-xs">1 game left</Badge>
                        )}
                        {rec.slotType === "bench" && (
                          <Badge variant="secondary" className="text-xs">Bench</Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground">{rec.reason}</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {todayGames.map((game, idx) => (
                  <div key={idx} className="bg-accent/20 rounded-lg p-3">
                    <div className="font-semibold text-lg">{game.name}</div>
                    <div className="text-sm text-muted-foreground">{game.opponent}</div>
                    {game.gameTime && (
                      <div className="text-xs text-primary mt-1">{game.gameTime}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>None of your players have games today.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
