import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Player, RosterSlot } from "@/types/fantasy";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import {
  TrendingUp, TrendingDown, Minus, Zap, Calendar, CheckCircle,
  AlertCircle, ArrowRight, BarChart3, Users, Swords, Trophy,
  ClipboardList, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getImportTimestamps, formatTimestampAge, ImportTimestamps } from "@/lib/importTimestamps";
import { getMatchupWeekDatesFromSchedule, getRemainingMatchupDatesFromSchedule, getCurrentMatchupWeekFromSchedule } from "@/lib/matchupWeekDates";

// ── Types ──

interface MatchupStats {
  fgPct: number; ftPct: number; threepm: number; rebounds: number;
  assists: number; steals: number; blocks: number; turnovers: number; points: number;
}

interface MatchupProjectionData {
  myTeam: { name: string; record: string; standing: string; stats: MatchupStats };
  opponent: { name: string; record: string; standing: string; stats: MatchupStats };
  opponentRoster?: RosterSlot[];
}

interface ParsedTeam {
  token: string; tokenUpper: string; name: string;
  recordStanding: string; currentMatchup: string; stats: MatchupStats;
}

interface WeeklyMatchup { teamA: ParsedTeam; teamB: ParsedTeam; }

interface GamesByDate { [date: string]: Array<{ homeTeam: string; awayTeam: string; [k: string]: any }> };

interface ThisWeekSummaryProps {
  roster: (RosterSlot & { player: Player & { cri?: number; wCri?: number; criRank?: number; wCriRank?: number } })[];
  freeAgents: Player[];
  matchupData: MatchupProjectionData | null;
  weeklyMatchups: WeeklyMatchup[];
  gamesByDate: GamesByDate;
  scheduleLoading: boolean;
  onNavigateTab: (tab: string, openImport?: boolean) => void;
}

// ── Constants ──

const CATEGORY_LABELS: Record<string, string> = {
  fgPct: "FG%", ftPct: "FT%", threepm: "3PM", rebounds: "REB",
  assists: "AST", steals: "STL", blocks: "BLK", turnovers: "TO", points: "PTS",
};

const CAT_KEYS = Object.keys(CATEGORY_LABELS) as (keyof MatchupStats)[];

const TOSSUP_PCT = 0.015;
const TOSSUP_COUNT = 5;

type CatStatus = "win" | "loss" | "tossup";

interface CatResult { key: string; label: string; status: CatStatus; margin: number; }

// ── Helpers ──

function classifyCats(myStats: MatchupStats, oppStats: MatchupStats): CatResult[] {
  return CAT_KEYS.map(key => {
    const isPct = key === "fgPct" || key === "ftPct";
    const lowerBetter = key === "turnovers";
    const my = myStats[key];
    const opp = oppStats[key];
    const margin = lowerBetter ? opp - my : my - opp;
    const threshold = isPct ? TOSSUP_PCT : TOSSUP_COUNT;
    const status: CatStatus = margin > threshold ? "win" : margin < -threshold ? "loss" : "tossup";
    return { key, label: CATEGORY_LABELS[key], status, margin };
  });
}

function teamHasGame(teamCode: string, games: Array<{ homeTeam: string; awayTeam: string }>): boolean {
  const tc = teamCode.toUpperCase();
  return games.some(g => g.homeTeam.toUpperCase() === tc || g.awayTeam.toUpperCase() === tc);
}

function getOpponentForTeam(teamCode: string, games: Array<{ homeTeam: string; awayTeam: string }>): string | null {
  const tc = teamCode.toUpperCase();
  for (const g of games) {
    if (g.homeTeam.toUpperCase() === tc) return `vs ${g.awayTeam}`;
    if (g.awayTeam.toUpperCase() === tc) return `@ ${g.homeTeam}`;
  }
  return null;
}

// ── Component ──

export function ThisWeekSummary({
  roster, freeAgents, matchupData, weeklyMatchups, gamesByDate, scheduleLoading, onNavigateTab,
}: ThisWeekSummaryProps) {

  // Resolve actual stats (prefer weekly if available)
  const myTeamWeekly = useMemo(() => {
    if (!weeklyMatchups.length || !matchupData?.myTeam?.name) return null;
    const myName = matchupData.myTeam.name.toLowerCase();
    for (const m of weeklyMatchups) {
      if (m.teamA.name.toLowerCase().includes(myName) || myName.includes(m.teamA.name.toLowerCase()))
        return { team: m.teamA, opp: m.teamB };
      if (m.teamB.name.toLowerCase().includes(myName) || myName.includes(m.teamB.name.toLowerCase()))
        return { team: m.teamB, opp: m.teamA };
    }
    return null;
  }, [weeklyMatchups, matchupData]);

  const catResults = useMemo(() => {
    if (!matchupData) return [];
    const myStats = myTeamWeekly ? myTeamWeekly.team.stats : matchupData.myTeam.stats;
    const oppStats = myTeamWeekly ? myTeamWeekly.opp.stats : matchupData.opponent.stats;
    return classifyCats(myStats, oppStats);
  }, [matchupData, myTeamWeekly]);

  const wins = catResults.filter(c => c.status === "win");
  const losses = catResults.filter(c => c.status === "loss");
  const tossups = catResults.filter(c => c.status === "tossup");

  // Current matchup week info
  const currentWeek = useMemo(() => getCurrentMatchupWeekFromSchedule(), []);
  const weekDates = useMemo(() => getMatchupWeekDatesFromSchedule(), []);
  const remainingDates = useMemo(() => getRemainingMatchupDatesFromSchedule(), []);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const todayGames = gamesByDate[todayStr] || [];

  // ── Card 1: Matchup Outlook ──
  const swingCats = useMemo(() => {
    return [...tossups].sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin)).slice(0, 2);
  }, [tossups]);

  // ── Card 2: Games Remaining ──
  const gamesRemaining = useMemo(() => {
    const activeRoster = roster.filter(r => r.slotType !== "ir");
    const irRoster = roster.filter(r => r.slotType === "ir");

    const dailyCounts: { date: string; my: number; label: string }[] = [];
    let myTotal = 0;
    let irTotal = 0;

    for (const date of remainingDates) {
      const games = gamesByDate[date] || [];
      let myCount = 0;
      activeRoster.forEach(r => {
        if (r.player.nbaTeam && teamHasGame(r.player.nbaTeam, games)) myCount++;
      });
      myTotal += myCount;

      // IR games
      irRoster.forEach(r => {
        if (r.player.nbaTeam && teamHasGame(r.player.nbaTeam, games)) irTotal++;
      });

      const d = new Date(date + "T12:00:00");
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
      dailyCounts.push({ date, my: myCount, label: dayLabel });
    }

    // Opponent games if available
    let oppTotal = 0;
    const oppRoster = matchupData?.opponentRoster;
    if (oppRoster && oppRoster.length > 0) {
      for (const date of remainingDates) {
        const games = gamesByDate[date] || [];
        oppRoster.filter(r => r.slotType !== "ir").forEach(r => {
          if (r.player.nbaTeam && teamHasGame(r.player.nbaTeam, games)) oppTotal++;
        });
      }
    }

    return { myTotal, oppTotal, irTotal, dailyCounts, hasOpp: !!oppRoster && oppRoster.length > 0 };
  }, [roster, matchupData, gamesByDate, remainingDates]);

  const maxDailyGames = useMemo(() => Math.max(...gamesRemaining.dailyCounts.map(d => d.my), 1), [gamesRemaining]);

  // ── Card 3: Today ──
  const todayPlayers = useMemo(() => {
    if (!todayGames.length) return [];
    return roster
      .filter(r => r.slotType !== "ir" && r.player.nbaTeam && teamHasGame(r.player.nbaTeam, todayGames))
      .filter(r => r.player.status !== "O" && r.player.status !== "IR")
      .map(r => ({
        name: r.player.name,
        team: r.player.nbaTeam,
        opp: getOpponentForTeam(r.player.nbaTeam, todayGames) || "",
        status: r.player.status,
      }));
  }, [roster, todayGames]);

  // ── Card 4: Top 3 Moves ──
  const topMoves = useMemo(() => {
    const moves: Array<{ title: string; description: string; action?: { label: string; tab: string }; icon: "add" | "stream" | "focus" }> = [];

    // Needed categories
    const neededCats = catResults.filter(c => c.status === "loss" || c.status === "tossup").map(c => c.key);

    // Move 1: Best add
    if (freeAgents.length > 0 && neededCats.length > 0) {
      // Score free agents by fit for needed cats
      const next3Dates = remainingDates.slice(0, 3);
      const scored = freeAgents
        .filter(fa => fa.status !== "O" && fa.status !== "IR" && fa.minutes > 0)
        .map(fa => {
          let gamesNext3 = 0;
          next3Dates.forEach(date => {
            const games = gamesByDate[date] || [];
            if (fa.nbaTeam && teamHasGame(fa.nbaTeam, games)) gamesNext3++;
          });

          // Need fit: sum of z-score-like boosts for needed cats
          let needFit = 0;
          let bestCat = "";
          let bestCatVal = 0;
          neededCats.forEach(catKey => {
            const val = (fa as any)[catKey] as number || 0;
            const lowerBetter = catKey === "turnovers";
            // Simple heuristic: rank-like score
            const contribution = lowerBetter ? (val < 2 ? 1 : 0) : val;
            if (contribution > bestCatVal) { bestCatVal = contribution; bestCat = catKey; }
            needFit += contribution;
          });

          const streamScore = Math.max(gamesNext3, 1) * (fa.wCri || fa.cri || needFit);
          return { fa, streamScore, gamesNext3, bestCat };
        })
        .sort((a, b) => b.streamScore - a.streamScore);

      const best = scored[0];
      if (best) {
        const catLabel = CATEGORY_LABELS[best.bestCat] || best.bestCat;
        moves.push({
          title: `Add ${best.fa.name}`,
          description: `${best.gamesNext3} games in next 3 days · Boosts ${catLabel}`,
          action: { label: "View in Free Agents", tab: "freeagents" },
          icon: "add",
        });
      }
    } else if (freeAgents.length === 0) {
      moves.push({
        title: "Import free agents",
        description: "Get pickup recommendations tailored to your matchup",
        action: { label: "Go to Free Agents", tab: "freeagents" },
        icon: "add",
      });
    }

    // Move 2: Best stream window
    if (remainingDates.length > 0 && Object.keys(gamesByDate).length > 0) {
      // Find the day with most roster games in next 3 days
      const upcoming = remainingDates.slice(0, 3);
      let bestDay = "";
      let bestCount = 0;
      upcoming.forEach(date => {
        const games = gamesByDate[date] || [];
        let count = 0;
        roster.filter(r => r.slotType !== "ir").forEach(r => {
          if (r.player.nbaTeam && teamHasGame(r.player.nbaTeam, games)) count++;
        });
        if (count > bestCount) { bestCount = count; bestDay = date; }
      });

      // Find thin days (0-1 roster games)
      const thinDays = upcoming.filter(date => {
        const games = gamesByDate[date] || [];
        let count = 0;
        roster.filter(r => r.slotType !== "ir").forEach(r => {
          if (r.player.nbaTeam && teamHasGame(r.player.nbaTeam, games)) count++;
        });
        return count <= 1;
      });

      if (thinDays.length > 0) {
        const thinLabel = thinDays.map(d => {
          const dt = new Date(d + "T12:00:00");
          return dt.toLocaleDateString("en-US", { weekday: "short" });
        }).join(", ");
        moves.push({
          title: `Stream for ${thinLabel}`,
          description: `Low roster volume — add a player with games on thin days`,
          action: { label: "View Free Agents", tab: "freeagents" },
          icon: "stream",
        });
      } else if (bestDay) {
        const dt = new Date(bestDay + "T12:00:00");
        const dayLabel = dt.toLocaleDateString("en-US", { weekday: "long" });
        moves.push({
          title: `${bestCount} players active ${dayLabel}`,
          description: "Good volume day — ensure all starters are set",
          action: { label: "Check Matchup", tab: "matchup" },
          icon: "stream",
        });
      }
    }

    // Move 3: Category focus
    if (catResults.length > 0) {
      const attackable = catResults.filter(c => c.status === "tossup" || (c.status === "loss" && Math.abs(c.margin) < (c.key === "fgPct" || c.key === "ftPct" ? 0.03 : 10)));
      if (attackable.length > 0) {
        const topCats = attackable.slice(0, 2).map(c => c.label).join(" & ");
        moves.push({
          title: `Focus on ${topCats}`,
          description: `These categories are close enough to flip with streaming or lineup moves`,
          icon: "focus",
        });
      } else {
        moves.push({
          title: `Protect your ${wins.length} leads`,
          description: `Avoid risky lineup changes that could hurt winning categories`,
          icon: "focus",
        });
      }
    }

    return moves.slice(0, 3);
  }, [catResults, freeAgents, roster, gamesByDate, remainingDates, wins]);

  // ── Card 5: Data Freshness ──
  const timestamps = useMemo(() => getImportTimestamps(), []);

  const hasRoster = roster.length > 0;
  const hasMatchup = !!matchupData;
  const hasFreeAgents = freeAgents.length > 0;
  const hasStandings = false; // Can't check from here but we'll use timestamps
  const hasWeekly = weeklyMatchups.length > 0;

  const dataItems: Array<{ label: string; imported: boolean; tab: string; tsKey: keyof ImportTimestamps }> = [
    { label: "Roster", imported: hasRoster, tab: "roster", tsKey: "roster" },
    { label: "Matchup", imported: hasMatchup, tab: "matchup", tsKey: "matchup" },
    { label: "Free Agents", imported: hasFreeAgents, tab: "freeagents", tsKey: "freeAgents" },
    { label: "Weekly", imported: hasWeekly, tab: "weekly", tsKey: "weekly" },
    { label: "Standings", imported: !!timestamps.standings, tab: "league", tsKey: "standings" },
  ];

  const importedCount = dataItems.filter(d => d.imported || !!timestamps[d.tsKey]).length;

  // ── Onboarding state ──
  if (!hasRoster) {
    return (
      <Card className="p-8 text-center border-dashed border-2 border-primary/30">
        <Users className="w-10 h-10 mx-auto mb-3 text-primary opacity-60" />
        <h3 className="font-display font-bold text-lg mb-1">Welcome to This Week</h3>
        <p className="text-sm text-muted-foreground mb-4">Import your ESPN roster to unlock your weekly dashboard.</p>
        <Button onClick={() => onNavigateTab("roster", true)} className="font-display">
          <ArrowRight className="w-4 h-4 mr-2" />
          Import Roster
        </Button>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">

        {/* ── Card 1: Matchup Outlook ── */}
        <Card className="p-4 md:col-span-2 xl:col-span-2">
          {hasMatchup ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Swords className="w-4 h-4 text-primary" />
                <span className="font-display font-semibold text-sm">Matchup Outlook</span>
                <Badge variant="outline" className="text-xs ml-auto">
                  vs {matchupData!.opponent.name.split(" ").slice(0, 2).join(" ")}
                </Badge>
              </div>

              {/* Category chips */}
              <div className="grid grid-cols-9 gap-1 mb-3">
                {catResults.map(c => (
                  <Tooltip key={c.key}>
                    <TooltipTrigger asChild>
                      <div className={cn(
                        "flex flex-col items-center p-1.5 rounded text-center border cursor-default",
                        c.status === "win" && "bg-stat-positive/15 border-stat-positive/30 text-stat-positive",
                        c.status === "loss" && "bg-stat-negative/15 border-stat-negative/30 text-stat-negative",
                        c.status === "tossup" && "bg-warning/15 border-warning/30 text-warning",
                      )}>
                        <span className="text-[10px] font-medium">{c.label}</span>
                        {c.status === "win" ? <TrendingUp className="w-3 h-3" /> :
                         c.status === "loss" ? <TrendingDown className="w-3 h-3" /> :
                         <Minus className="w-3 h-3" />}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <p className="font-medium">{c.label}: {c.status === "win" ? "Likely Win" : c.status === "loss" ? "Likely Loss" : "Toss-up"}</p>
                      <p className="text-muted-foreground">
                        Margin: {c.key === "fgPct" || c.key === "ftPct" ? c.margin.toFixed(3) : c.margin.toFixed(1)}
                        {c.status === "tossup" && " — small enough to swing either way"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Summary line */}
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-stat-positive" /> {wins.length}W</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-stat-negative" /> {losses.length}L</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" /> {tossups.length} Flip</span>
                {swingCats.length > 0 && (
                  <span className="ml-auto text-muted-foreground">
                    Swing cats: <span className="text-foreground font-medium">{swingCats.map(c => c.label).join(", ")}</span>
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <Swords className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground mb-2">Import matchup to see category outlook</p>
              <Button variant="outline" size="sm" onClick={() => onNavigateTab("matchup", true)}>
                Import Matchup
              </Button>
            </div>
          )}
        </Card>

        {/* ── Card 5: Data Freshness (compact, right column) ── */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-primary" />
            <span className="font-display font-semibold text-sm">Data Status</span>
            <Badge variant="outline" className="text-xs ml-auto">{importedCount}/5</Badge>
          </div>
          <div className="space-y-1.5">
            {dataItems.map(item => {
              const isOk = item.imported || !!timestamps[item.tsKey];
              return (
                <div key={item.tsKey} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {isOk ? <CheckCircle className="w-3 h-3 text-stat-positive" /> : <AlertCircle className="w-3 h-3 text-muted-foreground" />}
                    <span className={isOk ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                  </div>
                  {isOk ? (
                    <span className="text-muted-foreground">{formatTimestampAge(timestamps[item.tsKey])}</span>
                  ) : (
                    <Button
                      variant="ghost" size="sm"
                      className="h-5 text-xs text-primary px-1"
                      onClick={() => onNavigateTab(item.tab, true)}
                    >
                      Import
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Card 2: Games Remaining ── */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-display font-semibold text-sm">Games Remaining</span>
            {currentWeek && (
              <span className="text-xs text-muted-foreground ml-auto">
                {currentWeek.dateRangeText}
              </span>
            )}
          </div>

          {scheduleLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : remainingDates.length > 0 && Object.keys(gamesByDate).length > 0 ? (
            <>
              {/* Totals */}
              <div className="flex items-center gap-4 mb-3 text-sm">
                <div>
                  <span className="text-muted-foreground">My team: </span>
                  <span className="font-bold text-primary">{gamesRemaining.myTotal}</span>
                </div>
                {gamesRemaining.hasOpp && (
                  <div>
                    <span className="text-muted-foreground">Opp: </span>
                    <span className="font-bold">{gamesRemaining.oppTotal}</span>
                  </div>
                )}
                {gamesRemaining.irTotal > 0 && (
                  <div className="text-xs text-muted-foreground">
                    IR: {gamesRemaining.irTotal}
                  </div>
                )}
              </div>

              {/* Daily bars */}
              <div className="flex items-end gap-1 h-16">
                {gamesRemaining.dailyCounts.map(d => {
                  const pct = (d.my / maxDailyGames) * 100;
                  const isThin = d.my <= 1;
                  const isToday = d.date === todayStr;
                  return (
                    <Tooltip key={d.date}>
                      <TooltipTrigger asChild>
                        <div className="flex-1 flex flex-col items-center gap-0.5 cursor-default">
                          <span className="text-[9px] font-mono text-muted-foreground">{d.my}</span>
                          <div
                            className={cn(
                              "w-full rounded-t transition-all min-h-[4px]",
                              isThin ? "bg-warning/60" : "bg-primary/60",
                              isToday && "ring-1 ring-primary",
                            )}
                            style={{ height: `${Math.max(pct, 8)}%` }}
                          />
                          <span className={cn("text-[9px]", isToday ? "font-bold text-primary" : "text-muted-foreground")}>
                            {d.label}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {d.label} {d.date}: {d.my} active players
                        {isThin && " — Thin day, consider streaming"}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">
              Schedule data loading…
            </p>
          )}
        </Card>

        {/* ── Card 3: Today ── */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-warning" />
            <span className="font-display font-semibold text-sm">Today</span>
            <Badge variant="outline" className="text-xs ml-auto">
              {todayPlayers.length} playing
            </Badge>
          </div>

          {scheduleLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : todayPlayers.length > 0 ? (
            <div className="space-y-1">
              {todayPlayers.slice(0, 6).map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <NBATeamLogo teamCode={p.team} size="xs" />
                    <span className="font-medium truncate max-w-[120px]">{p.name}</span>
                    {p.status === "DTD" && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-warning text-warning">DTD</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground text-[10px]">{p.opp}</span>
                </div>
              ))}
              {todayPlayers.length > 6 && (
                <p className="text-[10px] text-muted-foreground text-center">+{todayPlayers.length - 6} more</p>
              )}
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-xs text-muted-foreground">No one plays today</p>
              {hasFreeAgents && (
                <Button variant="ghost" size="sm" className="text-xs mt-1 h-6" onClick={() => onNavigateTab("freeagents")}>
                  Browse streamers →
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* ── Card 4: Top 3 Moves ── */}
        <Card className="p-4 md:col-span-2 xl:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="font-display font-semibold text-sm">Top Moves</span>
          </div>

          <div className="space-y-2.5">
            {topMoves.map((move, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold",
                  move.icon === "add" && "bg-stat-positive/20 text-stat-positive",
                  move.icon === "stream" && "bg-primary/20 text-primary",
                  move.icon === "focus" && "bg-warning/20 text-warning",
                )}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{move.title}</p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground leading-snug cursor-default">{move.description}</p>
                    </TooltipTrigger>
                    {move.icon === "add" && (
                      <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                        StreamScore = games × wCRI × category need fit. Higher means more matchup impact.
                      </TooltipContent>
                    )}
                  </Tooltip>
                  {move.action && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-5 text-xs text-primary px-0 mt-0.5"
                      onClick={() => onNavigateTab(move.action!.tab)}
                    >
                      {move.action.label} →
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {topMoves.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">Import more data to see recommendations</p>
            )}
          </div>
        </Card>
      </div>
    </TooltipProvider>
  );
}
