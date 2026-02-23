import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Trophy, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { LeagueTeam } from "@/types/league";
import type { ForecastSettings } from "@/lib/forecastEngine";
import { projectFinalStandings, predictMatchup } from "@/lib/forecastEngine";
import { CRIS_WEIGHTS } from "@/lib/crisUtils";
import type { LeagueSchedule } from "@/lib/scheduleParser";
import { makeScheduleTeamKey, normalizeName, fuzzyNameMatch } from "@/lib/nameNormalization";
import { parseDateRangeText } from "@/lib/matchupWeekDates";

type TeamAliasMap = Record<string, string>;

interface PlayoffBracketProps {
  leagueTeams: LeagueTeam[];
  userTeamName?: string;
}

interface BracketMatchup {
  round: string;
  seedA: number;
  seedB: number;
  teamA: string;
  teamB: string;
  winnerSeed?: number;
  winner?: string;
  outcome?: string;
}

function getSuggestedCurrentWeek(schedule: LeagueSchedule): number {
  const seasonYear = parseInt(schedule.season.slice(0, 4)) || new Date().getFullYear();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeksWithDates: Array<{ week: number; start: Date; end: Date }> = [];
  for (const m of schedule.matchups) {
    const { start, end } = parseDateRangeText(m.dateRangeText, seasonYear);
    if (!start || !end) continue;
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (!weeksWithDates.find(w => w.week === m.week)) {
      weeksWithDates.push({ week: m.week, start, end });
    }
  }
  weeksWithDates.sort((a, b) => a.week - b.week);
  for (const w of weeksWithDates) {
    if (today >= w.start && today <= w.end) return w.week;
  }
  const lastWeek = weeksWithDates[weeksWithDates.length - 1];
  if (lastWeek && today > lastWeek.end) return lastWeek.week;
  return weeksWithDates[0]?.week ?? 0;
}

export const PlayoffBracket = ({ leagueTeams, userTeamName = "" }: PlayoffBracketProps) => {
  const [playoffTeamCount, setPlayoffTeamCount] = useState("6");
  const numPlayoffTeams = parseInt(playoffTeamCount);

  // Read persisted schedule (same keys as ScheduleForecast)
  const [schedule] = usePersistedState<LeagueSchedule | null>("dumphoops-schedule.v2", null);
  const [aliases] = usePersistedState<TeamAliasMap>("dumphoops-schedule-aliases.v2", {});
  const [currentWeekCutoff] = usePersistedState<number>("dumphoops-schedule-currentWeekCutoff.v2", 0);

  const effectiveCutoff = useMemo(() => {
    if (currentWeekCutoff !== 0) return currentWeekCutoff;
    if (schedule) return getSuggestedCurrentWeek(schedule);
    return 0;
  }, [currentWeekCutoff, schedule]);

  // Resolve schedule teams to standings teams (same logic as ScheduleForecast)
  const resolvedSchedule = useMemo(() => {
    if (!schedule) return null;
    const standingsByName = new Map<string, LeagueTeam>();
    leagueTeams.forEach(t => standingsByName.set(normalizeName(t.name), t));
    const standingsByMgr = new Map<string, LeagueTeam>();
    leagueTeams.forEach(t => { if (t.manager) standingsByMgr.set(normalizeName(t.manager), t); });

    const mapping: TeamAliasMap = {};
    for (const st of schedule.teams) {
      const key = makeScheduleTeamKey(st.teamName, st.managerName);
      const alias = aliases[key];
      if (alias) { const lt = leagueTeams.find(t => t.name === alias); if (lt) { mapping[key] = lt.name; continue; } }
      const byTeam = standingsByName.get(normalizeName(st.teamName));
      if (byTeam) { mapping[key] = byTeam.name; continue; }
      if (st.managerName) { const byMgr = standingsByMgr.get(normalizeName(st.managerName)); if (byMgr) { mapping[key] = byMgr.name; continue; } }
      const fuzzy = leagueTeams.find(t => fuzzyNameMatch(t.name, st.teamName));
      if (fuzzy) { mapping[key] = fuzzy.name; continue; }
    }

    const matchups = schedule.matchups.map(m => {
      const awayKey = makeScheduleTeamKey(m.awayTeamName, m.awayManagerName);
      const homeKey = makeScheduleTeamKey(m.homeTeamName, m.homeManagerName);
      const away = mapping[awayKey];
      const home = mapping[homeKey];
      if (!away || !home) return null;
      return { week: m.week, dateRangeText: m.dateRangeText, awayTeam: away, homeTeam: home };
    }).filter(Boolean) as Array<{ week: number; dateRangeText: string; awayTeam: string; homeTeam: string }>;

    return { season: schedule.season, matchups };
  }, [schedule, aliases, leagueTeams]);

  const forecastSettings: ForecastSettings = useMemo(() => ({
    useCri: true, useWeightedCri: false, simulationScale: 1,
    includeCompletedWeeks: false, startFromCurrentRecords: true,
    completedWeeks: [], currentWeekCutoff: effectiveCutoff,
  }), [effectiveCutoff]);

  const projectedStandings = useMemo(() => {
    if (!resolvedSchedule || leagueTeams.length === 0) return [];
    return projectFinalStandings(
      { season: resolvedSchedule.season, matchups: resolvedSchedule.matchups },
      leagueTeams, forecastSettings
    );
  }, [resolvedSchedule, leagueTeams, forecastSettings]);

  const teamStatsMap = useMemo(() => {
    const map = new Map<string, LeagueTeam>();
    leagueTeams.forEach(t => map.set(t.name.toLowerCase(), t));
    return map;
  }, [leagueTeams]);

  const playoffSeeds = useMemo(() => {
    if (projectedStandings.length === 0) return [];
    return projectedStandings.slice(0, numPlayoffTeams).map((s, i) => ({
      seed: i + 1, teamName: s.teamName,
      record: `${s.totalWins}-${s.totalLosses}-${s.totalTies}`,
    }));
  }, [projectedStandings, numPlayoffTeams]);

  // Identify playoff weeks from schedule
  const playoffWeeks = useMemo(() => {
    if (!resolvedSchedule) return [];
    const allWeeks = Array.from(new Set(resolvedSchedule.matchups.map(m => m.week))).sort((a, b) => a - b);
    // Playoff weeks are typically the last 3 weeks of the season
    const numPlayoffWeeks = numPlayoffTeams === 6 ? 3 : 2;
    return allWeeks.slice(-numPlayoffWeeks);
  }, [resolvedSchedule, numPlayoffTeams]);

  const playoffScheduleMatchups = useMemo(() => {
    if (!resolvedSchedule || playoffWeeks.length === 0) return [];
    return playoffWeeks.map(week => {
      const weekMatchups = resolvedSchedule.matchups.filter(m => m.week === week);
      const playoffTeamNames = new Set(playoffSeeds.map(s => s.teamName.toLowerCase()));
      const playoffGames = weekMatchups.filter(m =>
        playoffTeamNames.has(m.awayTeam.toLowerCase()) || playoffTeamNames.has(m.homeTeam.toLowerCase())
      );
      return { week, dateRange: weekMatchups[0]?.dateRangeText || "", matchups: playoffGames };
    });
  }, [resolvedSchedule, playoffWeeks, playoffSeeds]);

  const bracket = useMemo(() => {
    if (playoffSeeds.length < 4) return { rounds: [] as BracketMatchup[][], champion: null as string | null };

    const getTeamStats = (name: string) => {
      const t = teamStatsMap.get(name.toLowerCase());
      if (!t) return null;
      return { fgPct: t.fgPct, ftPct: t.ftPct, threepm: t.threepm, rebounds: t.rebounds, assists: t.assists, steals: t.steals, blocks: t.blocks, turnovers: t.turnovers, points: t.points };
    };

    const simulateMatchup = (seedA: number, teamA: string, seedB: number, teamB: string, roundLabel: string): BracketMatchup => {
      const statsA = getTeamStats(teamA);
      const statsB = getTeamStats(teamB);
      if (!statsA || !statsB) return { round: roundLabel, seedA, seedB, teamA, teamB };
      const prediction = predictMatchup(0, roundLabel, teamB, statsA, statsB, forecastSettings);
      const winner = prediction.wins >= prediction.losses ? teamA : teamB;
      const winnerSeed = winner === teamA ? seedA : seedB;
      return { round: roundLabel, seedA, seedB, teamA, teamB, winner, winnerSeed, outcome: prediction.outcome };
    };

    const rounds: BracketMatchup[][] = [];

    if (numPlayoffTeams === 6) {
      const r1m1 = simulateMatchup(3, playoffSeeds[2].teamName, 6, playoffSeeds[5].teamName, "Round 1");
      const r1m2 = simulateMatchup(4, playoffSeeds[3].teamName, 5, playoffSeeds[4].teamName, "Round 1");
      rounds.push([r1m1, r1m2]);

      const sf1 = simulateMatchup(1, playoffSeeds[0].teamName, r1m1.winnerSeed || 3, r1m1.winner || playoffSeeds[2].teamName, "Semifinal");
      const sf2 = simulateMatchup(2, playoffSeeds[1].teamName, r1m2.winnerSeed || 4, r1m2.winner || playoffSeeds[3].teamName, "Semifinal");
      rounds.push([sf1, sf2]);

      const finals = simulateMatchup(sf1.winnerSeed || 1, sf1.winner || playoffSeeds[0].teamName, sf2.winnerSeed || 2, sf2.winner || playoffSeeds[1].teamName, "Finals");
      rounds.push([finals]);
      return { rounds, champion: finals.winner || null };
    } else {
      const sf1 = simulateMatchup(1, playoffSeeds[0].teamName, 4, playoffSeeds[3].teamName, "Semifinal");
      const sf2 = simulateMatchup(2, playoffSeeds[1].teamName, 3, playoffSeeds[2].teamName, "Semifinal");
      rounds.push([sf1, sf2]);
      const finals = simulateMatchup(sf1.winnerSeed || 1, sf1.winner || playoffSeeds[0].teamName, sf2.winnerSeed || 2, sf2.winner || playoffSeeds[1].teamName, "Finals");
      rounds.push([finals]);
      return { rounds, champion: finals.winner || null };
    }
  }, [playoffSeeds, teamStatsMap, forecastSettings, numPlayoffTeams]);

  const isUserTeam = (name: string) => {
    if (userTeamName) return name.toLowerCase() === userTeamName.toLowerCase();
    return name.toLowerCase().includes('bane');
  };

  const isInPlayoffs = playoffSeeds.some(s => isUserTeam(s.teamName));

  if (projectedStandings.length === 0) {
    return (
      <Card className="gradient-card shadow-card p-6 border-border text-center">
        <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">Import standings and league schedule (in Schedule Forecast tab) to see projected playoff bracket.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg">Projected Playoff Bracket</h3>
            <p className="text-xs text-muted-foreground">Based on schedule forecast projected standings</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Playoff teams:</span>
          <Select value={playoffTeamCount} onValueChange={setPlayoffTeamCount}>
            <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="6">6</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Playoff seeding */}
      <Card className="gradient-card border-border p-4">
        <h4 className="font-display font-semibold text-sm mb-3">Projected Playoff Seeds</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {playoffSeeds.map(s => (
            <div key={s.seed} className={cn("p-2 rounded-lg border text-center", isUserTeam(s.teamName) ? "bg-primary/10 border-primary/30" : "bg-muted/30 border-border/50")}>
              <div className="text-xs text-muted-foreground">#{s.seed} Seed</div>
              <div className={cn("font-semibold text-sm truncate", isUserTeam(s.teamName) && "text-primary")}>{s.teamName}</div>
              <div className="text-xs text-muted-foreground">{s.record}</div>
            </div>
          ))}
        </div>
        {!isInPlayoffs && (
          <div className="mt-3 p-2 rounded bg-stat-negative/10 border border-stat-negative/20 text-sm text-stat-negative">
            ⚠️ Your team is currently projected outside the playoffs.
          </div>
        )}
      </Card>

      {/* Bracket */}
      <div className="space-y-4">
        {bracket.rounds.map((round, rIdx) => (
          <div key={rIdx}>
            <h4 className="font-display font-semibold text-sm mb-2 text-muted-foreground">
              {round[0]?.round || `Round ${rIdx + 1}`}
              {rIdx === 0 && numPlayoffTeams === 6 && <span className="ml-2 text-xs font-normal">(Seeds #1 & #2 have byes)</span>}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {round.map((matchup, mIdx) => (
                <Card key={mIdx} className="gradient-card border-border overflow-hidden">
                  <div className="flex items-stretch">
                    <div className={cn("flex-1 p-3 border-r border-border", matchup.winner === matchup.teamA && "bg-stat-positive/5", isUserTeam(matchup.teamA) && "bg-primary/5")}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground font-mono">#{matchup.seedA}</span>
                        <span className={cn("font-semibold text-sm truncate", isUserTeam(matchup.teamA) && "text-primary", matchup.winner === matchup.teamA && "text-stat-positive")}>{matchup.teamA}</span>
                        {matchup.winner === matchup.teamA && <Crown className="w-3.5 h-3.5 text-stat-positive flex-shrink-0" />}
                      </div>
                    </div>
                    <div className="flex items-center px-3 bg-muted/20">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger><span className="font-mono text-sm font-bold">{matchup.outcome || "—"}</span></TooltipTrigger>
                          <TooltipContent><p className="text-xs">Projected 9-cat outcome based on season averages</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className={cn("flex-1 p-3 text-right border-l border-border", matchup.winner === matchup.teamB && "bg-stat-positive/5", isUserTeam(matchup.teamB) && "bg-primary/5")}>
                      <div className="flex items-center justify-end gap-1.5">
                        {matchup.winner === matchup.teamB && <Crown className="w-3.5 h-3.5 text-stat-positive flex-shrink-0" />}
                        <span className={cn("font-semibold text-sm truncate", isUserTeam(matchup.teamB) && "text-primary", matchup.winner === matchup.teamB && "text-stat-positive")}>{matchup.teamB}</span>
                        <span className="text-xs text-muted-foreground font-mono">#{matchup.seedB}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Champion */}
      {bracket.champion && (
        <Card className="gradient-card border-primary/30 p-4 text-center bg-primary/5">
          <Crown className="w-6 h-6 text-primary mx-auto mb-2" />
          <div className="text-xs text-muted-foreground mb-1">Projected Champion</div>
          <div className={cn("font-display font-bold text-xl", isUserTeam(bracket.champion) && "text-primary")}>{bracket.champion}</div>
          {isUserTeam(bracket.champion) && <Badge className="mt-2 bg-primary/20 text-primary border-primary/30">🏆 That's you!</Badge>}
        </Card>
      )}

      {/* Playoff Schedule */}
      {playoffScheduleMatchups.length > 0 && (
        <Card className="gradient-card border-border p-4">
          <h4 className="font-display font-semibold text-sm mb-3">Projected Playoff Schedule</h4>
          <div className="space-y-4">
            {playoffScheduleMatchups.map(({ week, dateRange, matchups: wkMatchups }) => (
              <div key={week}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">Week {week}</Badge>
                  {dateRange && <span className="text-xs text-muted-foreground">{dateRange}</span>}
                </div>
                <div className="space-y-1.5">
                  {wkMatchups.map((m, i) => {
                    const awayInPlayoffs = playoffSeeds.some(s => s.teamName.toLowerCase() === m.awayTeam.toLowerCase());
                    const homeInPlayoffs = playoffSeeds.some(s => s.teamName.toLowerCase() === m.homeTeam.toLowerCase());
                    const isPlayoffMatchup = awayInPlayoffs && homeInPlayoffs;
                    return (
                      <div key={i} className={cn(
                        "flex items-center justify-between p-2 rounded-lg text-sm",
                        isPlayoffMatchup ? "bg-primary/5 border border-primary/20" : "bg-muted/20",
                        (isUserTeam(m.awayTeam) || isUserTeam(m.homeTeam)) && "ring-1 ring-primary/30"
                      )}>
                        <span className={cn("font-semibold truncate flex-1", isUserTeam(m.awayTeam) && "text-primary")}>{m.awayTeam}</span>
                        <span className="text-xs text-muted-foreground mx-2">vs</span>
                        <span className={cn("font-semibold truncate flex-1 text-right", isUserTeam(m.homeTeam) && "text-primary")}>{m.homeTeam}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Bubble teams */}
      {projectedStandings.length > numPlayoffTeams && (
        <Card className="gradient-card border-border p-4">
          <h4 className="font-display font-semibold text-sm mb-2">On the Bubble</h4>
          <div className="space-y-1.5">
            {projectedStandings.slice(numPlayoffTeams, numPlayoffTeams + 2).map(s => (
              <div key={s.teamName} className={cn("flex items-center justify-between p-2 rounded-lg", isUserTeam(s.teamName) ? "bg-primary/10" : "bg-muted/20")}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">#{s.projectedRank}</span>
                  <span className={cn("text-sm font-semibold", isUserTeam(s.teamName) && "text-primary")}>{s.teamName}</span>
                </div>
                <span className="text-xs text-muted-foreground">{s.totalWins}-{s.totalLosses}-{s.totalTies}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
