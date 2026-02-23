import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trophy, Crown, ChevronDown, Info, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { LeagueTeam } from "@/types/league";
import type { ForecastSettings } from "@/lib/forecastEngine";
import { projectFinalStandings, predictMatchup } from "@/lib/forecastEngine";
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
  const [viewMode, setViewMode] = useState<"bracket" | "table">("bracket");
  const numPlayoffTeams = parseInt(playoffTeamCount);

  const [schedule] = usePersistedState<LeagueSchedule | null>("dumphoops-schedule.v2", null);
  const [aliases] = usePersistedState<TeamAliasMap>("dumphoops-schedule-aliases.v2", {});
  const [currentWeekCutoff] = usePersistedState<number>("dumphoops-schedule-currentWeekCutoff.v2", 0);

  const effectiveCutoff = useMemo(() => {
    if (currentWeekCutoff !== 0) return currentWeekCutoff;
    if (schedule) return getSuggestedCurrentWeek(schedule);
    return 0;
  }, [currentWeekCutoff, schedule]);

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

  const playoffWeeks = useMemo(() => {
    if (!resolvedSchedule) return [];
    const allWeeks = Array.from(new Set(resolvedSchedule.matchups.map(m => m.week))).sort((a, b) => a - b);
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

  // Find user's seed and projected first opponent
  const userSeed = playoffSeeds.find(s => isUserTeam(s.teamName));
  const userFirstOpponent = useMemo(() => {
    for (const round of bracket.rounds) {
      for (const m of round) {
        if (isUserTeam(m.teamA)) return { opponent: m.teamB, seed: m.seedB, outcome: m.outcome, wins: m.winner === m.teamA };
        if (isUserTeam(m.teamB)) return { opponent: m.teamA, seed: m.seedA, outcome: m.outcome, wins: m.winner === m.teamB };
      }
      break; // only check first round user appears in
    }
    return null;
  }, [bracket.rounds]);

  // Compute a rough playoff odds % based on standing buffer
  const playoffOdds = useMemo(() => {
    if (!userSeed || projectedStandings.length === 0) return null;
    const userStanding = projectedStandings.find(s => isUserTeam(s.teamName));
    if (!userStanding) return null;
    const cutoffTeam = projectedStandings[numPlayoffTeams - 1];
    const bubbleTeam = projectedStandings[numPlayoffTeams];
    if (!cutoffTeam || !bubbleTeam) return 95;
    const winBuffer = userStanding.totalWins - bubbleTeam.totalWins;
    if (winBuffer >= 4) return 98;
    if (winBuffer >= 2) return 88;
    if (winBuffer >= 1) return 72;
    if (winBuffer === 0) return 50;
    return Math.max(15, 50 + winBuffer * 15);
  }, [userSeed, projectedStandings, numPlayoffTeams]);

  if (projectedStandings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Trophy className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm max-w-sm">
          Import standings and league schedule in the Forecast tab to see projected playoff bracket.
        </p>
      </div>
    );
  }

  const roundLabels: Record<string, string> = {
    "Round 1": "First Round",
    "Semifinal": "Semifinals",
    "Finals": "Championship",
  };

  return (
    <div className="space-y-10 animate-fade-in">
      {/* ============================================================ */}
      {/* SECTION 1 – HERO SUMMARY                                     */}
      {/* ============================================================ */}
      <div className="rounded-xl bg-gradient-to-br from-muted/60 to-muted/20 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
          {/* Champion projection */}
          {bracket.champion && (
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Projected Champion</div>
                <div className={cn(
                  "font-display font-bold text-xl md:text-2xl truncate",
                  isUserTeam(bracket.champion) && "text-primary"
                )}>
                  {bracket.champion}
                  {isUserTeam(bracket.champion) && (
                    <span className="ml-2 text-xs font-normal bg-primary/15 text-primary px-2 py-0.5 rounded-full align-middle">You</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* User stats - horizontal pills */}
          {userSeed && (
            <div className="flex flex-wrap items-center gap-3 md:gap-5">
              <div className="text-center">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Seed</div>
                <div className="font-display font-bold text-2xl text-primary">#{userSeed.seed}</div>
              </div>
              <div className="w-px h-8 bg-border/50 hidden md:block" />
              <div className="text-center">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Record</div>
                <div className="font-display font-bold text-lg">{userSeed.record}</div>
              </div>
              {playoffOdds !== null && (
                <>
                  <div className="w-px h-8 bg-border/50 hidden md:block" />
                  <div className="text-center">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Playoff Odds</div>
                    <div className={cn(
                      "font-display font-bold text-lg",
                      playoffOdds >= 75 ? "text-stat-positive" : playoffOdds >= 50 ? "text-foreground" : "text-stat-negative"
                    )}>
                      {playoffOdds}%
                    </div>
                  </div>
                </>
              )}
              {userFirstOpponent && (
                <>
                  <div className="w-px h-8 bg-border/50 hidden md:block" />
                  <div className="text-center">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider">First Matchup</div>
                    <div className="text-sm font-medium">
                      vs <span className="font-semibold">{userFirstOpponent.opponent}</span>
                      <span className={cn(
                        "ml-1.5 text-xs",
                        userFirstOpponent.wins ? "text-stat-positive" : "text-stat-negative"
                      )}>
                        {userFirstOpponent.wins ? "W" : "L"} {userFirstOpponent.outcome}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {!isInPlayoffs && (
            <div className="flex items-center gap-2 text-stat-negative text-sm">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Currently projected outside the playoffs</span>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* CONTROLS BAR                                                  */}
      {/* ============================================================ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("bracket")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              viewMode === "bracket" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Bracket
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              viewMode === "table" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Table
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Teams:</span>
          <Select value={playoffTeamCount} onValueChange={setPlayoffTeamCount}>
            <SelectTrigger className="w-[60px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="6">6</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 2 – BRACKET VIEW                                     */}
      {/* ============================================================ */}
      {viewMode === "bracket" && (
        <div className="space-y-8">
          {bracket.rounds.map((round, rIdx) => (
            <div key={rIdx}>
              <div className="flex items-center gap-3 mb-4">
                <h3 className="font-display font-semibold text-base text-foreground">
                  {roundLabels[round[0]?.round] || round[0]?.round || `Round ${rIdx + 1}`}
                </h3>
                {rIdx === 0 && numPlayoffTeams === 6 && (
                  <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                    #1 & #2 have byes
                  </span>
                )}
                <div className="flex-1 h-px bg-border/40" />
              </div>
              <div className={cn(
                "grid gap-3",
                round.length > 1 ? "grid-cols-1 md:grid-cols-2" : "max-w-md"
              )}>
                {round.map((matchup, mIdx) => (
                  <MatchupCard key={mIdx} matchup={matchup} isUserTeam={isUserTeam} isFinals={matchup.round === "Finals"} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 2B – TABLE VIEW                                      */}
      {/* ============================================================ */}
      {viewMode === "table" && (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/20">
                <th className="text-left p-3 font-display text-xs uppercase tracking-wider text-muted-foreground w-12">Seed</th>
                <th className="text-left p-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Team</th>
                <th className="text-center p-3 font-display text-xs uppercase tracking-wider text-muted-foreground w-24">Record</th>
                <th className="text-center p-3 font-display text-xs uppercase tracking-wider text-muted-foreground w-16">Trend</th>
              </tr>
            </thead>
            <tbody>
              {playoffSeeds.map((s, i) => {
                const isUser = isUserTeam(s.teamName);
                const standing = projectedStandings.find(ps => ps.teamName === s.teamName);
                const currentTeam = leagueTeams.find(t => t.name === s.teamName);
                let currentRank = 0;
                if (currentTeam) {
                  const sorted = [...leagueTeams].sort((a, b) => {
                    const aW = parseInt(a.record?.split('-')[0] || '0');
                    const bW = parseInt(b.record?.split('-')[0] || '0');
                    return bW - aW;
                  });
                  currentRank = sorted.findIndex(t => t.name === s.teamName) + 1;
                }
                const trend = currentRank > 0 ? currentRank - s.seed : 0;

                return (
                  <tr key={s.seed} className={cn(
                    "border-b border-border/30 transition-colors",
                    isUser ? "bg-primary/[0.04]" : "hover:bg-muted/20"
                  )}>
                    <td className="p-3">
                      <span className={cn("font-display font-bold text-base", isUser ? "text-primary" : "text-foreground")}>
                        {s.seed}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={cn("font-semibold", isUser && "text-primary")}>{s.teamName}</span>
                      {isUser && <span className="ml-1.5 text-[10px] text-primary/70">You</span>}
                    </td>
                    <td className="p-3 text-center font-mono font-semibold">{s.record}</td>
                    <td className="p-3 text-center">
                      {trend > 0 && <ArrowUp className="w-3.5 h-3.5 text-stat-positive inline" />}
                      {trend < 0 && <ArrowDown className="w-3.5 h-3.5 text-stat-negative inline" />}
                      {trend === 0 && <Minus className="w-3.5 h-3.5 text-muted-foreground inline" />}
                    </td>
                  </tr>
                );
              })}
              {/* Bubble separator */}
              {projectedStandings.length > numPlayoffTeams && (
                <>
                  <tr>
                    <td colSpan={4} className="px-3 py-1.5">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wider">
                        <div className="flex-1 h-px bg-border/40" />
                        <span>Bubble</span>
                        <div className="flex-1 h-px bg-border/40" />
                      </div>
                    </td>
                  </tr>
                  {projectedStandings.slice(numPlayoffTeams, numPlayoffTeams + 2).map(s => {
                    const isUser = isUserTeam(s.teamName);
                    return (
                      <tr key={s.teamName} className={cn("border-b border-border/30", isUser && "bg-primary/[0.04]")}>
                        <td className="p-3 text-muted-foreground font-mono text-sm">{s.projectedRank}</td>
                        <td className="p-3">
                          <span className={cn("font-medium text-muted-foreground", isUser && "text-primary")}>{s.teamName}</span>
                        </td>
                        <td className="p-3 text-center font-mono text-muted-foreground">{s.totalWins}-{s.totalLosses}-{s.totalTies}</td>
                        <td className="p-3" />
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 4 – PLAYOFF SCHEDULE (Collapsible)                   */}
      {/* ============================================================ */}
      {playoffScheduleMatchups.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-display font-semibold text-base text-foreground mb-3">Playoff Schedule</h3>
          {playoffScheduleMatchups.map(({ week, dateRange, matchups: wkMatchups }, idx) => (
            <Collapsible key={week} defaultOpen={idx === 0}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-muted/30 transition-colors group text-left">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">Week {week}</span>
                  {dateRange && <span className="text-xs text-muted-foreground">{dateRange}</span>}
                  <span className="text-[11px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                    {wkMatchups.length} game{wkMatchups.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-1 pl-3 pr-3 pb-2">
                  {wkMatchups.map((m, i) => (
                    <div key={i} className={cn(
                      "flex items-center gap-3 py-2 text-sm",
                      i < wkMatchups.length - 1 && "border-b border-border/20"
                    )}>
                      <span className={cn("font-medium flex-1 truncate", isUserTeam(m.awayTeam) && "text-primary font-semibold")}>
                        {m.awayTeam}
                      </span>
                      <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">vs</span>
                      <span className={cn("font-medium flex-1 truncate text-right", isUserTeam(m.homeTeam) && "text-primary font-semibold")}>
                        {m.homeTeam}
                      </span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-start gap-2 text-[11px] text-muted-foreground/60 pt-2">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>Projections based on 9-cat season averages simulated through remaining schedule. Playoff seeding uses projected final records.</span>
      </div>
    </div>
  );
};

/* ================================================================== */
/* Bracket matchup card – clean, minimal                               */
/* ================================================================== */
function MatchupCard({ matchup, isUserTeam, isFinals }: { matchup: BracketMatchup; isUserTeam: (n: string) => boolean; isFinals: boolean }) {
  return (
    <div className={cn(
      "rounded-lg overflow-hidden border transition-colors",
      isFinals ? "border-primary/20 bg-primary/[0.03]" : "border-border/40 bg-muted/10"
    )}>
      {/* Team A */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3",
        matchup.winner === matchup.teamA && "bg-stat-positive/[0.04]",
        isUserTeam(matchup.teamA) && "bg-primary/[0.04]"
      )}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-xs text-muted-foreground/70 font-mono w-5 flex-shrink-0">{matchup.seedA}</span>
          <span className={cn(
            "font-medium truncate",
            isUserTeam(matchup.teamA) && "text-primary",
            matchup.winner === matchup.teamA && "font-semibold"
          )}>
            {matchup.teamA}
          </span>
        </div>
        {matchup.winner === matchup.teamA && (
          <span className="text-[10px] text-stat-positive font-semibold uppercase tracking-wider flex-shrink-0">Win</span>
        )}
      </div>

      {/* Divider with score */}
      <div className="flex items-center border-y border-border/30">
        <div className="flex-1 h-px bg-border/20" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <span className="px-3 py-1 text-xs font-mono font-bold text-muted-foreground">
                {matchup.outcome || "—"}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">Projected 9-cat outcome</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex-1 h-px bg-border/20" />
      </div>

      {/* Team B */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3",
        matchup.winner === matchup.teamB && "bg-stat-positive/[0.04]",
        isUserTeam(matchup.teamB) && "bg-primary/[0.04]"
      )}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-xs text-muted-foreground/70 font-mono w-5 flex-shrink-0">{matchup.seedB}</span>
          <span className={cn(
            "font-medium truncate",
            isUserTeam(matchup.teamB) && "text-primary",
            matchup.winner === matchup.teamB && "font-semibold"
          )}>
            {matchup.teamB}
          </span>
        </div>
        {matchup.winner === matchup.teamB && (
          <span className="text-[10px] text-stat-positive font-semibold uppercase tracking-wider flex-shrink-0">Win</span>
        )}
      </div>
    </div>
  );
}
