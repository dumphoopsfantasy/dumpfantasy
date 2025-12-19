import { useMemo, useState } from "react";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, TrendingUp, TrendingDown, Minus, UserPlus, UserMinus, Calendar, Target, AlertTriangle, CheckCircle, Clock, Shield, ChevronDown, ChevronUp } from "lucide-react";

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

// League weights for AddScore calculation
const CATEGORY_WEIGHTS: Record<string, number> = {
  points: 1.00,
  threepm: 0.90,
  rebounds: 0.80,
  assists: 0.75,
  fgPct: 0.70,
  blocks: 0.65,
  ftPct: 0.55,
  steals: 0.50,
  turnovers: 0.30, // Inverted: lower is better
};

const COUNTING_STATS = ["threepm", "rebounds", "assists", "steals", "blocks", "turnovers", "points"];

type RiskLevel = "secure" | "at-risk" | "critical";

interface SwingCategory {
  key: string;
  label: string;
  myVal: number;
  oppVal: number;
  diff: number;
  projectedDiff: number;
  isLeading: boolean;
  risk: RiskLevel;
}

function classifyRisk(diff: number, isPercentage: boolean): RiskLevel {
  const absMargin = Math.abs(diff);
  if (isPercentage) {
    if (absMargin >= 0.03) return "secure";
    if (absMargin >= 0.01) return "at-risk";
    return "critical";
  } else {
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // PROTECTED PLAYERS LIST (Never Drop)
  const protectedPlayers = useMemo(() => {
    if (roster.length === 0) return new Set<string>();
    
    const protectedSet = new Set<string>();
    
    // Get active players with CRI
    const activePlayers = roster.filter(r => r.slotType !== "ir" && r.player.cri !== undefined);
    
    // Sort by CRI descending and protect top 6
    const sortedByCri = [...activePlayers].sort((a, b) => (b.player.cri || 0) - (a.player.cri || 0));
    sortedByCri.slice(0, 6).forEach(r => protectedSet.add(r.player.id));
    
    // Also protect any player with playoffRank <= 60 (ADP anchor)
    roster.forEach(r => {
      if (r.player.playoffRank && r.player.playoffRank <= 60) {
        protectedSet.add(r.player.id);
      }
    });
    
    return protectedSet;
  }, [roster]);

  // Calculate ALL categories with risk classification and projections
  const allCategories = useMemo((): SwingCategory[] => {
    if (!matchupData) return [];

    const categories = Object.keys(CATEGORY_LABELS) as (keyof MatchupStats)[];
    const results: SwingCategory[] = [];

    // Calculate active roster averages for projection
    const activePlayers = roster.filter(r => r.slotType !== "ir" && r.player.minutes > 0);
    const avgGamesRemaining = 3; // Estimate for rest of week

    categories.forEach((key) => {
      let myVal: number;
      let oppVal: number;
      let myProjectedAdd = 0;
      let oppProjectedAdd = 0;

      if (myTeamWeekly) {
        myVal = myTeamWeekly.team.stats[key];
        oppVal = myTeamWeekly.opponent.stats[key];
        
        // Estimate remaining impact from roster averages
        if (activePlayers.length > 0 && COUNTING_STATS.includes(key)) {
          const rosterAvg = activePlayers.reduce((sum, r) => sum + ((r.player as any)[key] || 0), 0) / activePlayers.length;
          myProjectedAdd = rosterAvg * avgGamesRemaining * 5; // 5 starters playing
          // Estimate opponent at similar pace
          oppProjectedAdd = (oppVal / Math.max(1, 7 - avgGamesRemaining)) * avgGamesRemaining;
        }
      } else {
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
      const projectedDiff = isTurnover 
        ? (oppVal + oppProjectedAdd) - (myVal + myProjectedAdd)
        : (myVal + myProjectedAdd) - (oppVal + oppProjectedAdd);
      const isLeading = rawDiff > 0;
      const risk = classifyRisk(rawDiff, isPercentage);

      results.push({
        key,
        label: CATEGORY_LABELS[key],
        myVal,
        oppVal,
        diff: rawDiff,
        projectedDiff,
        isLeading,
        risk,
      });
    });

    return results;
  }, [matchupData, myTeamWeekly, roster]);

  // Swing categories = categories closest to flipping (smallest abs margin)
  const swingCategories = useMemo(() => {
    return [...allCategories]
      .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))
      .slice(0, 3);
  }, [allCategories]);

  // Categories where we're trailing but could recover
  const recoverableCategories = useMemo(() => {
    return allCategories.filter(c => !c.isLeading && (c.risk === "at-risk" || c.risk === "critical"));
  }, [allCategories]);

  // Categories where we're leading but at risk
  const vulnerableCategories = useMemo(() => {
    return allCategories.filter(c => c.isLeading && (c.risk === "at-risk" || c.risk === "critical"));
  }, [allCategories]);

  // TODAY'S GAMES - STRICT VALIDATION
  const todayGames = useMemo(() => {
    return roster.filter(r => {
      const player = r.player;
      
      const hasValidOpponent = player.opponent && 
        player.opponent !== "--" && 
        player.opponent.trim() !== "" &&
        (player.opponent.includes("vs") || player.opponent.includes("@"));
      
      if (!hasValidOpponent) return false;
      
      const hasValidGameTime = player.gameTime && 
        player.gameTime.trim() !== "" && 
        player.gameTime !== "--";
      
      if (!hasValidGameTime) return false;
      
      const inactiveStatuses = ["O", "IR", "SUSP"];
      if (player.status && inactiveStatuses.includes(player.status)) return false;
      
      if (r.slotType === "ir") return false;
      
      return true;
    }).map(r => ({
      name: r.player.name,
      opponent: r.player.opponent || "",
      gameTime: r.player.gameTime || "",
      team: r.player.nbaTeam,
    }));
  }, [roster]);

  // Generate ADD/DROP recommendations
  const recommendations = useMemo(() => {
    const hasRoster = roster.length > 0;
    const hasFreeAgents = freeAgents.length === 50;
    
    if (!hasRoster || !hasFreeAgents) return null;

    // Determine priority categories: recoverable (trailing) + vulnerable (leading at-risk)
    const priorityCatKeys = [
      ...recoverableCategories.map(c => c.key),
      ...vulnerableCategories.map(c => c.key),
    ].slice(0, 5);

    // If no matchup data, use general counting stats
    const targetCats = priorityCatKeys.length > 0 
      ? priorityCatKeys 
      : ["points", "rebounds", "assists", "steals", "blocks"];

    // Calculate team averages
    const activePlayers = roster.filter(r => r.slotType !== "ir" && r.player.minutes > 0);
    const teamAvg: Record<string, number> = {};
    targetCats.forEach(key => {
      const sum = activePlayers.reduce((acc, r) => acc + ((r.player as any)[key] || 0), 0);
      teamAvg[key] = activePlayers.length > 0 ? sum / activePlayers.length : 0;
    });

    // SCORE FREE AGENTS with AddScore formula
    const scoredFA = freeAgents.map(fa => {
      let addScore = 0;
      const helps: { cat: string; gain: number }[] = [];
      const hurts: { cat: string; loss: number }[] = [];
      const gamesRemaining = fa.gamesThisWeek || 3;

      targetCats.forEach(key => {
        const faVal = (fa as any)[key] || 0;
        const weight = CATEGORY_WEIGHTS[key] || 0.5;
        const isTurnover = key === "turnovers";
        
        // Category gain/loss vs team average
        const diff = isTurnover ? teamAvg[key] - faVal : faVal - teamAvg[key];
        const impact = diff * weight * gamesRemaining;
        
        if (diff > 0.1) {
          helps.push({ cat: CATEGORY_LABELS[key], gain: diff * gamesRemaining });
          addScore += impact;
        } else if (diff < -0.1) {
          hurts.push({ cat: CATEGORY_LABELS[key], loss: Math.abs(diff) * gamesRemaining });
          addScore -= Math.abs(impact) * 0.5; // Penalty for hurting categories
        }
      });

      // Sort helps/hurts by magnitude
      helps.sort((a, b) => b.gain - a.gain);
      hurts.sort((a, b) => b.loss - a.loss);

      // Build "Why now" reason
      let whyNow = "";
      const topHelps = helps.slice(0, 2);
      if (topHelps.length > 0) {
        const isRecoverable = recoverableCategories.some(c => topHelps.some(h => h.cat === CATEGORY_LABELS[c.key]));
        const isProtecting = vulnerableCategories.some(c => topHelps.some(h => h.cat === CATEGORY_LABELS[c.key]));
        
        if (isRecoverable) {
          whyNow = `Helps recover ${topHelps[0].cat}`;
        } else if (isProtecting) {
          whyNow = `Protects lead in ${topHelps[0].cat}`;
        } else {
          whyNow = `Strong ${topHelps.map(h => h.cat).join(" + ")} contributor`;
        }
        
        if (gamesRemaining > 0) {
          whyNow += ` • ${gamesRemaining} games left`;
        }
      }

      return { 
        player: fa, 
        addScore, 
        helps, 
        hurts,
        gamesRemaining,
        whyNow,
      };
    });

    scoredFA.sort((a, b) => b.addScore - a.addScore);
    const adds = scoredFA.slice(0, 5);

    // SCORE ROSTER FOR DROPS with DropScore formula
    // Only consider: bottom 30% CRI (excluding protected), OR injured without expected return
    const eligibleForDrop = activePlayers.filter(r => {
      // Never drop protected players
      if (protectedPlayers.has(r.player.id)) return false;
      
      // Allow injured players only if O/IR status
      const isInjured = r.player.status === "O" || r.player.status === "IR";
      if (isInjured) return true; // Can suggest drop for injured non-protected players
      
      // Otherwise, check if bottom 30% CRI
      const criValues = activePlayers
        .filter(p => p.player.cri !== undefined)
        .map(p => p.player.cri || 0)
        .sort((a, b) => a - b);
      
      const bottom30Threshold = criValues[Math.floor(criValues.length * 0.3)] || 0;
      return (r.player.cri || 0) <= bottom30Threshold;
    });

    const scoredDrops = eligibleForDrop.map(r => {
      const player = r.player;
      let dropScore = 0;
      const reasons: string[] = [];

      // Find best FA upgrade at same position
      const playerPositions = player.positions || [];
      const positionMatchingFAs = freeAgents.filter(fa => {
        const faPositions = fa.positions || [];
        return playerPositions.some(p => faPositions.includes(p));
      });

      let bestUpgrade: { fa: Player; netGain: number; topCats: string[] } | null = null;
      positionMatchingFAs.forEach(fa => {
        let netGain = 0;
        const gainByCat: { cat: string; gain: number }[] = [];
        
        targetCats.forEach(key => {
          const faVal = (fa as any)[key] || 0;
          const playerVal = (player as any)[key] || 0;
          const isTurnover = key === "turnovers";
          const gain = isTurnover ? (playerVal - faVal) : (faVal - playerVal);
          const weight = CATEGORY_WEIGHTS[key] || 0.5;
          netGain += gain * weight;
          if (gain > 0.1) {
            gainByCat.push({ cat: CATEGORY_LABELS[key], gain });
          }
        });
        
        if (!bestUpgrade || netGain > bestUpgrade.netGain) {
          bestUpgrade = { 
            fa, 
            netGain, 
            topCats: gainByCat.sort((a, b) => b.gain - a.gain).slice(0, 2).map(g => g.cat) 
          };
        }
      });

      // DropScore components
      // 1. Opportunity cost (how much we gain by swapping)
      if (bestUpgrade && bestUpgrade.netGain > 0) {
        dropScore += bestUpgrade.netGain * 2;
        reasons.push(`Swap for ${bestUpgrade.fa.name} → +${bestUpgrade.topCats.join(", ")}`);
      }

      // 2. Low CRI percentile
      const criValues = activePlayers.map(p => p.player.cri || 0).sort((a, b) => b - a);
      const criRank = criValues.indexOf(player.cri || 0) + 1;
      const criPercentile = criRank / criValues.length;
      if (criPercentile > 0.7) {
        dropScore += 2;
        reasons.push(`Bottom ${Math.round((1 - criPercentile) * 100)}% CRI on roster`);
      }

      // 3. Injured status
      if (player.status === "O" || player.status === "IR") {
        dropScore += 3;
        reasons.push(`Currently ${player.status} — roster clog`);
      }

      // 4. High TO hurting swing category
      if (player.turnovers > 3 && targetCats.includes("turnovers")) {
        dropScore += 1;
        reasons.push(`High TO (${player.turnovers.toFixed(1)}) hurts swing category`);
      }

      // 5. Below average in multiple priority categories
      const belowAvgCats = targetCats.filter(key => {
        const val = (player as any)[key] || 0;
        const isTurnover = key === "turnovers";
        return isTurnover ? val > teamAvg[key] * 1.1 : val < teamAvg[key] * 0.8;
      });
      if (belowAvgCats.length >= 2) {
        dropScore += 1;
        reasons.push(`Below avg in ${belowAvgCats.map(k => CATEGORY_LABELS[k]).join(", ")}`);
      }

      return { 
        player, 
        dropScore,
        reasons,
        bestUpgrade,
        isProtected: false,
        slotType: r.slotType,
      };
    });

    scoredDrops.sort((a, b) => b.dropScore - a.dropScore);
    const drops = scoredDrops.filter(d => d.dropScore > 0).slice(0, 3);

    // If no safe drops, return empty with message
    const noSafeDrops = drops.length === 0;

    return { 
      adds, 
      drops, 
      noSafeDrops,
      targetCats: targetCats.map(k => CATEGORY_LABELS[k]),
      protectedCount: protectedPlayers.size,
    };
  }, [roster, freeAgents, recoverableCategories, vulnerableCategories, protectedPlayers]);

  // URGENCY INDICATOR
  const urgencyLevel = useMemo(() => {
    if (!matchupData || allCategories.length === 0) return "green";
    
    const criticalTrailing = allCategories.filter(c => c.risk === "critical" && !c.isLeading);
    const atRiskTrailing = allCategories.filter(c => c.risk === "at-risk" && !c.isLeading);
    
    if (criticalTrailing.length >= 2) return "red";
    if (criticalTrailing.length >= 1 && atRiskTrailing.length >= 2) return "red";
    if (atRiskTrailing.length >= 1 || criticalTrailing.length >= 1) return "yellow";
    
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
                    <span className="text-sm text-muted-foreground italic">Import Weekly Scoreboard for current record</span>
                  )}
                </p>
              </div>

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
            <>
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

              {/* Advanced toggle for projected margins */}
              <div className="mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-muted-foreground"
                >
                  {showAdvanced ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                  {showAdvanced ? "Hide" : "Show"} all category margins
                </Button>

                {showAdvanced && (
                  <div className="mt-3 bg-accent/20 rounded-lg p-4">
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-3 text-sm">
                      {allCategories.map((cat) => {
                        const isPercentage = cat.key === "fgPct" || cat.key === "ftPct";
                        const displayDiff = isPercentage ? cat.diff.toFixed(3) : Math.round(cat.diff);
                        const sign = cat.diff > 0 ? "+" : "";

                        return (
                          <div key={cat.key} className="text-center">
                            <div className="font-semibold">{cat.label}</div>
                            <div className={cat.isLeading ? "text-stat-positive" : cat.diff === 0 ? "text-muted-foreground" : "text-stat-negative"}>
                              {sign}{displayDiff}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
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
            {recommendations?.protectedCount && (
              <Badge variant="outline" className="ml-2 text-xs">
                <Shield className="w-3 h-3 mr-1" />
                {recommendations.protectedCount} protected
              </Badge>
            )}
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
                  {recommendations.adds.map((rec, idx) => (
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
                      
                      {/* Helps / Hurts */}
                      <div className="flex flex-wrap gap-2 mb-2">
                        {rec.helps.slice(0, 2).map(h => (
                          <Badge key={h.cat} variant="secondary" className="text-xs bg-stat-positive/20 text-stat-positive">
                            Helps: {h.cat} (+{h.gain.toFixed(1)})
                          </Badge>
                        ))}
                        {rec.hurts.length > 0 && (
                          <Badge variant="secondary" className="text-xs bg-stat-negative/20 text-stat-negative">
                            Hurts: {rec.hurts[0].cat}
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground">{rec.whyNow}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* DROP Candidates */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <UserMinus className="w-4 h-4 text-stat-negative" />
                  <h4 className="font-display font-semibold text-stat-negative text-lg">Top Drop Candidates</h4>
                </div>
                
                {recommendations.noSafeDrops ? (
                  <div className="bg-accent/20 rounded-lg p-4 text-center">
                    <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground font-medium">No safe drops found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      All roster players are either protected (top CRI) or provide value.<br />
                      Add candidates above if you have an open slot.
                    </p>
                  </div>
                ) : (
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
                          {rec.bestUpgrade && (
                            <Badge variant="secondary" className="text-xs bg-stat-positive/20 text-stat-positive">
                              Upgrade: {rec.bestUpgrade.fa.name}
                            </Badge>
                          )}
                          {rec.player.status === "O" && (
                            <Badge variant="secondary" className="text-xs bg-stat-negative/20 text-stat-negative">OUT</Badge>
                          )}
                          {rec.player.status === "IR" && (
                            <Badge variant="secondary" className="text-xs bg-stat-negative/20 text-stat-negative">IR</Badge>
                          )}
                          {rec.slotType === "bench" && (
                            <Badge variant="secondary" className="text-xs">Bench</Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground">{rec.reasons[0] || "Lower priority in current matchup context"}</p>
                      </div>
                    ))}
                  </div>
                )}
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
