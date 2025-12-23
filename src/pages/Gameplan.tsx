import { useMemo, useState, useEffect } from "react";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  AlertCircle, TrendingUp, TrendingDown, Minus, UserPlus, UserMinus, 
  Calendar, Target, AlertTriangle, CheckCircle, Clock, Shield, 
  ChevronDown, ChevronUp, Zap, Eye, EyeOff, RefreshCw, AlertOctagon
} from "lucide-react";
import { useNBASchedule } from "@/hooks/useNBASchedule";

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

const CATEGORY_WEIGHTS: Record<string, number> = {
  points: 1.00,
  threepm: 0.90,
  rebounds: 0.80,
  assists: 0.75,
  fgPct: 0.70,
  blocks: 0.65,
  ftPct: 0.55,
  steals: 0.50,
  turnovers: 0.30,
};

type RiskLevel = "low" | "med" | "high";
type CategoryBucket = "protect" | "attack" | "ignore";

interface CategoryAnalysis {
  key: string;
  label: string;
  myVal: number;
  oppVal: number;
  diff: number;
  isLeading: boolean;
  bucket: CategoryBucket;
  risk: RiskLevel;
  isVolatile: boolean;
}

function classifyRisk(diff: number, isPercentage: boolean): RiskLevel {
  const absMargin = Math.abs(diff);
  if (isPercentage) {
    if (absMargin >= 0.025) return "low";
    if (absMargin >= 0.01) return "med";
    return "high";
  } else {
    if (absMargin >= 12) return "low";
    if (absMargin >= 5) return "med";
    return "high";
  }
}

function getRiskBadgeSmall(risk: RiskLevel) {
  switch (risk) {
    case "low":
      return <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Low</span>;
    case "med":
      return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">Med</span>;
    case "high":
      return <span className="text-xs px-1.5 py-0.5 rounded bg-stat-negative/20 text-stat-negative">High</span>;
  }
}

export function Gameplan({ roster, freeAgents, leagueTeams, matchupData, weeklyMatchups }: GameplanProps) {
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Build roster players for schedule matching
  const rosterPlayers = useMemo(() => 
    roster.map(r => ({ name: r.player.name, team: r.player.nbaTeam, position: r.player.positions?.[0] || '' })),
    [roster]
  );

  // Use shared schedule hook (same as NBA Scores sidebar)
  const { 
    todayGames: scheduleTodayGames, 
    isLoading: scheduleLoading, 
    lastUpdated: scheduleLastUpdated,
    fetchSchedule,
    teamHasGameToday,
    hasScheduleData: scheduleDataAvailable,
    error: scheduleError,
  } = useNBASchedule(rosterPlayers);

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

  // Parse current matchup record (W-L-T format)
  const matchupRecord = useMemo(() => {
    if (!myTeamWeekly?.team?.currentMatchup) return null;
    const match = myTeamWeekly.team.currentMatchup.match(/(\d+)-(\d+)(?:-(\d+))?/);
    if (!match) return null;
    return {
      wins: parseInt(match[1], 10),
      losses: parseInt(match[2], 10),
      ties: match[3] ? parseInt(match[3], 10) : 0,
    };
  }, [myTeamWeekly]);

  // PROTECTED PLAYERS (top 6 CRI or wCRI - never drop)
  const protectedPlayers = useMemo(() => {
    if (roster.length === 0) return new Set<string>();
    
    const protectedSet = new Set<string>();
    const activePlayers = roster.filter(r => r.slotType !== "ir" && r.player.cri !== undefined);
    
    // Top 6 by CRI
    const sortedByCri = [...activePlayers].sort((a, b) => (b.player.cri || 0) - (a.player.cri || 0));
    sortedByCri.slice(0, 6).forEach(r => protectedSet.add(r.player.id));
    
    // Top 6 by wCRI (redundant safety)
    const sortedByWcri = [...activePlayers].sort((a, b) => (b.player.wCri || 0) - (a.player.wCri || 0));
    sortedByWcri.slice(0, 6).forEach(r => protectedSet.add(r.player.id));
    
    return protectedSet;
  }, [roster]);

  // CATEGORY ANALYSIS with buckets: Protect / Attack / Ignore
  const categoryAnalysis = useMemo((): CategoryAnalysis[] => {
    if (!matchupData) return [];

    const categories = Object.keys(CATEGORY_LABELS) as (keyof MatchupStats)[];
    const results: CategoryAnalysis[] = [];

    categories.forEach((key) => {
      let myVal: number;
      let oppVal: number;

      if (myTeamWeekly) {
        myVal = myTeamWeekly.team.stats[key];
        oppVal = myTeamWeekly.opponent.stats[key];
      } else {
        myVal = matchupData.myTeam.stats[key];
        oppVal = matchupData.opponent.stats[key];
      }

      const isTurnover = key === "turnovers";
      const isPercentage = key === "fgPct" || key === "ftPct";
      const rawDiff = isTurnover ? oppVal - myVal : myVal - oppVal;
      const isLeading = rawDiff > 0;
      const risk = classifyRisk(rawDiff, isPercentage);
      const isVolatile = isPercentage; // FG%/FT% are volatile

      // Determine bucket
      let bucket: CategoryBucket;
      if (isLeading) {
        bucket = risk === "low" ? "ignore" : "protect";
      } else {
        bucket = risk === "low" ? "ignore" : "attack";
      }

      results.push({
        key,
        label: CATEGORY_LABELS[key],
        myVal,
        oppVal,
        diff: rawDiff,
        isLeading,
        bucket,
        risk,
        isVolatile,
      });
    });

    return results;
  }, [matchupData, myTeamWeekly]);

  // Group categories by bucket
  const protectCats = categoryAnalysis.filter(c => c.bucket === "protect");
  const attackCats = categoryAnalysis.filter(c => c.bucket === "attack");
  const ignoreCats = categoryAnalysis.filter(c => c.bucket === "ignore");

  // Summary line for matchup status
  const matchupSummary = useMemo(() => {
    const swingCount = protectCats.length + attackCats.length;
    const atRiskCount = protectCats.length;
    if (!matchupRecord) return null;
    
    const leadStatus = matchupRecord.wins > matchupRecord.losses 
      ? "Ahead" 
      : matchupRecord.wins < matchupRecord.losses 
        ? "Behind" 
        : "Tied";
    
    return `${leadStatus} ${matchupRecord.wins}–${matchupRecord.losses}–${matchupRecord.ties}${swingCount > 0 ? `, ${attackCats.length} to attack, ${atRiskCount} at risk` : ""}`;
  }, [matchupRecord, protectCats, attackCats]);

  // Helper: check if player has a game today (uses shared schedule OR player opponent data)
  const checkHasGameToday = (player: Player): boolean => {
    // First, check shared schedule data (most reliable source)
    if (scheduleDataAvailable && player.nbaTeam) {
      return teamHasGameToday(player.nbaTeam);
    }
    // Fallback to player-level opponent data if schedule unavailable
    const hasValidOpponent = player.opponent && 
      player.opponent !== "--" && 
      player.opponent.trim() !== "" &&
      (player.opponent.includes("vs") || player.opponent.includes("@"));
    const hasValidGameTime = player.gameTime && player.gameTime.trim() !== "" && player.gameTime !== "--";
    return hasValidOpponent && hasValidGameTime;
  };

  // TODAY'S GAMES - properly scoped to "has game today" first, using shared schedule
  const todayGames = useMemo(() => {
    // Use shared schedule data OR fall back to player-level data
    const hasAnyScheduleInfo = scheduleDataAvailable || roster.some(r => checkHasGameToday(r.player));
    
    if (!hasAnyScheduleInfo) {
      return { hasScheduleData: false, eligible: 0, unavailable: [], unavailableCount: 0, dtdStarters: [] };
    }

    // Build todayEligible: hasGameToday AND not O/IR
    const todayEligible = roster.filter(r => {
      if (!checkHasGameToday(r.player)) return false;
      const inactiveStatuses = ["O", "IR", "SUSP"];
      if (r.player.status && inactiveStatuses.includes(r.player.status)) return false;
      if (r.slotType === "ir") return false;
      return true;
    });

    // Build todayUnavailable: hasGameToday AND is O/IR
    const todayUnavailable = roster.filter(r => {
      if (!checkHasGameToday(r.player)) return false;
      const status = r.player.status;
      return status === "O" || status === "IR";
    });

    // Players in starting slots with DTD status (action items)
    const dtdInStartingSlots = roster.filter(r => {
      if (!checkHasGameToday(r.player)) return false;
      if (r.player.status !== "DTD") return false;
      return r.slotType === "starter";
    });

    return { 
      hasScheduleData: true,
      eligible: todayEligible.length, 
      unavailable: todayUnavailable.map(r => ({ name: r.player.name, status: r.player.status })),
      unavailableCount: todayUnavailable.length,
      dtdStarters: dtdInStartingSlots.map(r => ({ name: r.player.name, status: r.player.status })),
    };
  }, [roster, scheduleDataAvailable, teamHasGameToday]);

  // Injured players on roster (useful even without schedule)
  const injuredPlayers = useMemo(() => {
    return roster.filter(r => 
      r.player.status === "O" || r.player.status === "DTD"
    ).map(r => ({ name: r.player.name, status: r.player.status, slotType: r.slotType }));
  }, [roster]);

  // ACTION ITEMS based on category priorities
  const actionItems = useMemo(() => {
    const items: string[] = [];
    
    // Attack priorities
    if (attackCats.length > 0) {
      const topAttack = attackCats.slice(0, 2).map(c => c.label).join("/");
      items.push(`Prioritize ${topAttack} streamers`);
    }
    
    // Protect TO if at risk
    const toProtect = protectCats.find(c => c.key === "turnovers");
    if (toProtect) {
      items.push("Bench high-TO guards if possible");
    }
    
    // FG%/FT% volatile warning
    const volatileCats = [...protectCats, ...attackCats].filter(c => c.isVolatile);
    if (volatileCats.length > 0) {
      const labels = volatileCats.map(c => c.label).join("/");
      items.push(`${labels} volatile — volume dependent`);
    }
    
    return items.slice(0, 3);
  }, [attackCats, protectCats]);

  // STREAMING TARGETS (max 5, ranked by matchup fit)
  const streamingTargets = useMemo(() => {
    if (freeAgents.length === 0 || !matchupData) return [];
    
    const priorityKeys = [...attackCats, ...protectCats].map(c => c.key);
    const hurtKeys = protectCats.map(c => c.key);
    
    const activePlayers = roster.filter(r => r.slotType !== "ir" && r.player.minutes > 0);
    const teamAvg: Record<string, number> = {};
    priorityKeys.forEach(key => {
      const sum = activePlayers.reduce((acc, r) => acc + ((r.player as any)[key] || 0), 0);
      teamAvg[key] = activePlayers.length > 0 ? sum / activePlayers.length : 0;
    });
    
    const scored = freeAgents
      .filter(fa => fa.status !== "O" && fa.status !== "IR")
      .map(fa => {
        let score = 0;
        const helps: string[] = [];
        const hurts: string[] = [];
        const gamesRemaining = fa.gamesThisWeek || 3;
        const playsToday = fa.opponent && fa.opponent !== "--" && (fa.opponent.includes("vs") || fa.opponent.includes("@"));
        
        priorityKeys.forEach(key => {
          const faVal = (fa as any)[key] || 0;
          const weight = CATEGORY_WEIGHTS[key] || 0.5;
          const isTurnover = key === "turnovers";
          const diff = isTurnover ? teamAvg[key] - faVal : faVal - teamAvg[key];
          
          // Boost attack categories more
          const isAttack = attackCats.some(c => c.key === key);
          const multiplier = isAttack ? 1.5 : 1.0;
          
          if (diff > 0.1) {
            score += diff * weight * multiplier * gamesRemaining;
            helps.push(CATEGORY_LABELS[key]);
          } else if (diff < -0.1 && hurtKeys.includes(key)) {
            score -= Math.abs(diff) * weight * gamesRemaining;
            hurts.push(CATEGORY_LABELS[key]);
          }
        });
        
        if (playsToday) score += 2;
        
        return { player: fa, score, helps: helps.slice(0, 2), hurts: hurts.slice(0, 1), gamesRemaining, playsToday };
      });
    
    return scored.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [freeAgents, matchupData, attackCats, protectCats, roster]);

  // SAFE DROP CANDIDATES (max 3, with hard guardrails)
  const dropCandidates = useMemo(() => {
    if (roster.length === 0) return [];
    
    const activePlayers = roster.filter(r => r.slotType !== "ir");
    const priorityKeys = [...attackCats, ...protectCats].map(c => c.key);
    
    // Team averages for priority categories
    const teamAvg: Record<string, number> = {};
    priorityKeys.forEach(key => {
      const sum = activePlayers.reduce((acc, r) => acc + ((r.player as any)[key] || 0), 0);
      teamAvg[key] = activePlayers.length > 0 ? sum / activePlayers.length : 0;
    });
    
    const eligibleDrops = activePlayers.filter(r => {
      // HARD GUARDRAIL: Never drop protected players (top 6 CRI/wCRI)
      if (protectedPlayers.has(r.player.id)) return false;
      // Exclude IR/O unless explicitly wanted
      if (r.player.status === "IR") return false;
      return true;
    });
    
    const scored = eligibleDrops.map(r => {
      const player = r.player;
      let dropScore = 0;
      const reasons: string[] = [];
      
      // Check how many priority categories they underperform
      let underperformCount = 0;
      priorityKeys.forEach(key => {
        const val = (player as any)[key] || 0;
        const isTurnover = key === "turnovers";
        const belowAvg = isTurnover ? val > teamAvg[key] * 1.1 : val < teamAvg[key] * 0.8;
        if (belowAvg) underperformCount++;
      });
      
      if (underperformCount >= 2) {
        dropScore += 2;
        reasons.push(`Underperforms in ${underperformCount} priority cats`);
      }
      
      // Injured status adds drop score
      if (player.status === "O") {
        dropScore += 3;
        reasons.push(`OUT — roster clog`);
      } else if (player.status === "DTD") {
        dropScore += 1;
        reasons.push(`DTD — uncertain availability`);
      }
      
      // Low CRI ranking (bottom 30%)
      const criValues = activePlayers.map(p => p.player.cri || 0).sort((a, b) => b - a);
      const criRank = criValues.indexOf(player.cri || 0) + 1;
      const criPercentile = criRank / criValues.length;
      if (criPercentile > 0.7) {
        dropScore += 2;
        reasons.push(`Bottom ${Math.round((1 - criPercentile) * 100)}% CRI`);
      }
      
      // Fewer games remaining this week
      const gamesRemaining = player.gamesThisWeek || 3;
      if (gamesRemaining <= 1) {
        dropScore += 1;
        reasons.push(`Only ${gamesRemaining} game left`);
      }
      
      return { player, dropScore, reasons, slotType: r.slotType };
    });
    
    return scored.filter(d => d.dropScore > 0).sort((a, b) => b.dropScore - a.dropScore).slice(0, 3);
  }, [roster, attackCats, protectCats, protectedPlayers]);

  // DATA AVAILABILITY FLAGS
  const hasMatchupData = !!matchupData?.myTeam?.name;
  const hasWeeklyData = !!myTeamWeekly;
  const hasRoster = roster.length > 0;
  const hasFreeAgents = freeAgents.length > 0;

  // Empty state
  if (!hasMatchupData && !hasWeeklyData) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-display font-bold">Gameplan</h2>
          <p className="text-muted-foreground text-sm">Your matchup strategy at a glance</p>
        </div>
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Missing data</p>
            <p className="text-sm mt-1">Import Matchup + Weekly to enable matchup-aware strategy.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-2xl font-display font-bold">Gameplan</h2>
        <p className="text-muted-foreground text-sm">Your matchup strategy at a glance</p>
      </div>

      {/* 2-column layout: desktop side-by-side, mobile stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* === COLUMN A === */}
        <div className="space-y-4">
          
          {/* Matchup At-a-Glance (compact) */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-primary" />
              <span className="font-display font-semibold">Matchup At-a-Glance</span>
            </div>
            
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 text-center">
                <div className="text-xs text-muted-foreground uppercase">My Team</div>
                <div className="font-semibold truncate">{matchupData?.myTeam?.name?.split(' ').slice(0, 2).join(' ') || "—"}</div>
                <div className="text-xs text-muted-foreground">{matchupData?.myTeam?.record || "—"}</div>
              </div>
              
              <div className="text-center px-3">
                <div className="text-lg font-bold text-primary">vs</div>
                {matchupRecord && (
                  <div className="text-xs font-mono font-semibold">
                    {matchupRecord.wins}–{matchupRecord.losses}–{matchupRecord.ties}
                  </div>
                )}
              </div>
              
              <div className="flex-1 text-center">
                <div className="text-xs text-muted-foreground uppercase">Opponent</div>
                <div className="font-semibold truncate">{matchupData?.opponent?.name?.split(' ').slice(0, 2).join(' ') || "—"}</div>
                <div className="text-xs text-muted-foreground">{matchupData?.opponent?.record || "—"}</div>
              </div>
            </div>
            
            {matchupSummary && (
              <div className="mt-3 text-center">
                <Badge variant="outline" className="text-xs">
                  {matchupSummary}
                </Badge>
              </div>
            )}
          </Card>

          {/* Category Priorities (core of Gameplan) */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="font-display font-semibold">Category Priorities</span>
              </div>
              <span className="text-xs text-muted-foreground">{hasWeeklyData ? "weekly" : "projected"}</span>
            </div>

            {/* PROTECT bucket */}
            {protectCats.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Shield className="w-3 h-3 text-yellow-500" />
                  <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 uppercase">Protect</span>
                  <span className="text-xs text-muted-foreground">(close leads)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {protectCats.map(cat => (
                    <div key={cat.key} className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1">
                      <span className="text-sm font-medium">{cat.label}</span>
                      <span className="text-xs text-muted-foreground">
                        +{cat.key === "fgPct" || cat.key === "ftPct" ? cat.diff.toFixed(3) : Math.round(cat.diff)}
                      </span>
                      {getRiskBadgeSmall(cat.risk)}
                      {cat.isVolatile && <span className="text-xs text-muted-foreground">(vol)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ATTACK bucket */}
            {attackCats.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingUp className="w-3 h-3 text-stat-positive" />
                  <span className="text-xs font-semibold text-stat-positive uppercase">Attack</span>
                  <span className="text-xs text-muted-foreground">(winnable deficits)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {attackCats.map(cat => (
                    <div key={cat.key} className="flex items-center gap-1 bg-stat-positive/10 border border-stat-positive/20 rounded px-2 py-1">
                      <span className="text-sm font-medium">{cat.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {cat.key === "fgPct" || cat.key === "ftPct" ? cat.diff.toFixed(3) : Math.round(cat.diff)}
                      </span>
                      {getRiskBadgeSmall(cat.risk)}
                      {cat.isVolatile && <span className="text-xs text-muted-foreground">(vol)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* IGNORE bucket (collapsible) */}
            {ignoreCats.length > 0 && (
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground h-7 px-2">
                    <div className="flex items-center gap-1.5">
                      <EyeOff className="w-3 h-3" />
                      <span className="text-xs font-semibold uppercase">Ignore</span>
                      <span className="text-xs">({ignoreCats.length} locked/low ROI)</span>
                    </div>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {ignoreCats.map(cat => (
                      <div key={cat.key} className="flex items-center gap-1 bg-muted/50 border border-border rounded px-2 py-1">
                        <span className="text-sm font-medium text-muted-foreground">{cat.label}</span>
                        <span className={`text-xs ${cat.isLeading ? "text-stat-positive" : "text-stat-negative"}`}>
                          {cat.isLeading ? "+" : ""}{cat.key === "fgPct" || cat.key === "ftPct" ? cat.diff.toFixed(3) : Math.round(cat.diff)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {categoryAnalysis.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No category data available.</p>
            )}
          </Card>
        </div>

        {/* === COLUMN B === */}
        <div className="space-y-4">
          
          {/* Today's Execution Checklist - only show if schedule data exists */}
          {todayGames.hasScheduleData ? (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="font-display font-semibold">Today's Checklist</span>
                </div>
                <div className="flex items-center gap-2">
                  {scheduleLastUpdated && (
                    <span className="text-xs text-muted-foreground">
                      {scheduleLastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => fetchSchedule(true)}
                    disabled={scheduleLoading}
                    className="h-6 w-6"
                  >
                    <RefreshCw className={`w-3 h-3 ${scheduleLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
              
              {/* Player game counts */}
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Players with games today:</span>
                <span className="font-semibold">{todayGames.eligible}</span>
              </div>

              {/* Unavailable today (O/IR with games) */}
              {todayGames.unavailableCount > 0 && (
                <div className="flex items-center justify-between text-sm mb-2 text-muted-foreground">
                  <span>Unavailable today (O/IR):</span>
                  <span className="font-semibold text-stat-negative">{todayGames.unavailableCount}</span>
                </div>
              )}
              
              {/* DTD in starting slots - action items */}
              {todayGames.dtdStarters && todayGames.dtdStarters.length > 0 && (
                <div className="mb-3 space-y-1">
                  {todayGames.dtdStarters.slice(0, 2).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-yellow-500/10 rounded px-2 py-1">
                      <AlertTriangle className="w-3 h-3 text-yellow-500" />
                      <span>{p.name}</span>
                      <Badge variant="outline" className="text-xs px-1 py-0 h-4 border-yellow-500 text-yellow-600">{p.status}</Badge>
                      <span className="text-muted-foreground">— monitor before lock</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Action items */}
              {actionItems.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground font-semibold uppercase mb-1">Do This Now</div>
                  {actionItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-2">
                  <CheckCircle className="w-4 h-4 mx-auto mb-1 text-stat-positive" />
                  No urgent actions today
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="font-display font-semibold text-muted-foreground">Today's Checklist</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => fetchSchedule(true)}
                  disabled={scheduleLoading}
                  className="h-7 text-xs"
                >
                  <RefreshCw className={`w-3 h-3 mr-1 ${scheduleLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {/* Show last updated if available */}
              {scheduleLastUpdated && (
                <p className="text-xs text-muted-foreground mb-3">
                  Last updated: {scheduleLastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              )}

              {/* Schedule unavailable message */}
              <div className="text-sm text-muted-foreground mb-4 flex items-start gap-2 bg-muted/50 rounded px-2 py-2">
                <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                <span>Schedule unavailable. Use the Refresh button above.</span>
              </div>

              {/* Injury Watch - still useful without schedule */}
              {injuredPlayers.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-muted-foreground font-semibold uppercase mb-1.5">
                    Injury Watch (Roster)
                  </div>
                  <div className="space-y-1">
                    {injuredPlayers.slice(0, 4).map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-stat-negative/10 rounded px-2 py-1">
                        <AlertTriangle className="w-3 h-3 text-stat-negative" />
                        <span className="font-medium">{p.name}</span>
                        <Badge variant="outline" className="text-xs px-1 py-0 h-4 border-stat-negative text-stat-negative">
                          {p.status}
                        </Badge>
                      </div>
                    ))}
                    {injuredPlayers.length > 4 && (
                      <p className="text-xs text-muted-foreground pl-5">+{injuredPlayers.length - 4} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Lineup Reminder - always useful */}
              <div className="text-xs text-muted-foreground font-semibold uppercase mb-1.5">
                Lineup Reminder
              </div>
              <div className="text-sm text-muted-foreground">
                <CheckCircle className="w-3 h-3 inline mr-1 text-primary" />
                Confirm all starting slots are filled via Matchup → Start/Sit Advisor
              </div>
            </Card>
          )}

          {/* Streaming Targets (compact) */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4 text-stat-positive" />
              <span className="font-display font-semibold">Streaming Targets</span>
              <span className="text-xs text-muted-foreground">(max 5)</span>
            </div>
            
            {streamingTargets.length > 0 ? (
              <div className="space-y-2">
                {streamingTargets.map((t, i) => (
                  <div key={t.player.id} className="flex items-center justify-between text-sm bg-accent/30 rounded px-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{t.player.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {t.player.nbaTeam}/{t.player.positions?.slice(0, 2).join("")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {t.helps.length > 0 && (
                        <span className="text-xs bg-stat-positive/20 text-stat-positive px-1 rounded">
                          +{t.helps.join(",")}
                        </span>
                      )}
                      {t.hurts.length > 0 && (
                        <span className="text-xs bg-stat-negative/20 text-stat-negative px-1 rounded">
                          −{t.hurts[0]}
                        </span>
                      )}
                      {t.playsToday && (
                        <Badge variant="secondary" className="text-xs px-1 py-0 h-4 bg-primary/20 text-primary">
                          Today
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : hasFreeAgents ? (
              <p className="text-sm text-muted-foreground text-center py-4">No streaming targets based on current priorities.</p>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Import Free Agents to see streaming targets.</p>
            )}
          </Card>

          {/* Safe Drop Candidates */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserMinus className="w-4 h-4 text-stat-negative" />
              <span className="font-display font-semibold">Safe Drop Candidates</span>
              {protectedPlayers.size > 0 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">
                  <Shield className="w-2.5 h-2.5 mr-0.5" />
                  {protectedPlayers.size} protected
                </Badge>
              )}
            </div>
            
            {dropCandidates.length > 0 ? (
              <div className="space-y-2">
                {dropCandidates.map((d, i) => (
                  <div key={d.player.id} className="flex items-center justify-between text-sm bg-accent/30 rounded px-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{d.player.name}</span>
                      {d.player.status && (
                        <Badge variant="destructive" className="text-xs px-1 py-0 h-4">{d.player.status}</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {d.reasons[0]}
                    </span>
                  </div>
                ))}
              </div>
            ) : hasRoster ? (
              <div className="text-center py-4">
                <Shield className="w-5 h-5 mx-auto mb-1 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No safe drops found.</p>
                <p className="text-xs text-muted-foreground">All players are protected or provide value.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Import Roster to see drop candidates.</p>
            )}
          </Card>
        </div>
      </div>

      {/* Footer explanation */}
      <div className="text-center text-xs text-muted-foreground pt-2">
        Built from {hasWeeklyData ? "Weekly totals" : "Matchup projections"} + {hasRoster ? "Roster data" : "—"} + {hasFreeAgents ? "Free Agents" : "—"}
      </div>
    </div>
  );
}
