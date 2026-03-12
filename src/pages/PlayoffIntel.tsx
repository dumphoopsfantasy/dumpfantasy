/**
 * Playoff Intel Dashboard — Phase 2
 * 
 * Sections:
 * A) Likely Opponents — opponent cards with win probability, expected cats won, swing cats
 * B) Category Matrix — full category breakdown with confidence tiers
 * C) Schedule Density — day-by-day bar chart (recharts)
 * D) Bye Week Prep Plan — target cats, streamer profile, roster notes
 */

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Trophy, Shield, Target, TrendingUp, TrendingDown,
  Info, Upload, Swords, ChevronRight, Zap, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePersistedState } from '@/hooks/usePersistedState';
import { CATEGORIES, formatPct, CRIS_WEIGHTS } from '@/lib/crisUtils';
import type { LeagueTeam } from '@/types/league';
import type { RosterSlot, Player } from '@/types/fantasy';
import type { LeagueSchedule } from '@/lib/scheduleParser';
import { makeScheduleTeamKey, normalizeName, fuzzyNameMatch } from '@/lib/nameNormalization';
import { projectFinalStandings, type ForecastSettings } from '@/lib/forecastEngine';
import { parseDateRangeText, parseSeasonYears } from '@/lib/matchupWeekDates';
import {
  getLikelyOpponents,
  buildOpponentScenario,
  generateByeWeekPlan,
  type OpponentScenario,
  type CategoryProjection,
  type ConfidenceTier,
} from '@/lib/playoffProjectionEngine';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Cell,
} from 'recharts';

// ============================================================================
// TYPES
// ============================================================================

type TeamAliasMap = Record<string, string>;

interface PlayoffIntelProps {
  leagueTeams: LeagueTeam[];
  userTeamName?: string;
  roster?: RosterSlot[];
  freeAgents?: Player[];
  weights?: Record<string, number>;
  onNavigateTab?: (tab: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function parseRecordParts(record?: string): { wins: number; losses: number; ties: number } {
  if (!record) return { wins: 0, losses: 0, ties: 0 };
  const [w, l, t] = record.split('-');
  return { wins: parseInt(w || '0') || 0, losses: parseInt(l || '0') || 0, ties: parseInt(t || '0') || 0 };
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

const confidenceColor = (tier: ConfidenceTier) => {
  switch (tier) {
    case 'Lock Win': return 'text-stat-positive';
    case 'Lean Win': return 'text-stat-positive/80';
    case 'Coinflip': return 'text-yellow-500';
    case 'Lean Loss': return 'text-stat-negative/80';
    case 'Lock Loss': return 'text-stat-negative';
  }
};

const confidenceBg = (tier: ConfidenceTier) => {
  switch (tier) {
    case 'Lock Win': return 'bg-stat-positive/15 text-stat-positive';
    case 'Lean Win': return 'bg-stat-positive/10 text-stat-positive/80';
    case 'Coinflip': return 'bg-yellow-500/15 text-yellow-500';
    case 'Lean Loss': return 'bg-stat-negative/10 text-stat-negative/80';
    case 'Lock Loss': return 'bg-stat-negative/15 text-stat-negative';
  }
};

const overallBadge = (conf: 'high' | 'medium' | 'low', winProb: number) => {
  if (winProb >= 0.6) return { label: 'Favored', className: 'bg-stat-positive/15 text-stat-positive' };
  if (winProb >= 0.45) return { label: 'Toss-up', className: 'bg-yellow-500/15 text-yellow-500' };
  return { label: 'Underdog', className: 'bg-stat-negative/15 text-stat-negative' };
};

// ============================================================================
// COMPONENT
// ============================================================================

export const PlayoffIntel = ({
  leagueTeams,
  userTeamName = '',
  roster = [],
  freeAgents = [],
  weights,
  onNavigateTab,
}: PlayoffIntelProps) => {
  const [playoffTeamCount] = usePersistedState<string>('dumphoops-playoff-team-count', '6');
  const numPlayoffTeams = parseInt(playoffTeamCount);

  const [schedule] = usePersistedState<LeagueSchedule | null>('dumphoops-schedule.v2', null);
  const [aliases] = usePersistedState<TeamAliasMap>('dumphoops-schedule-aliases.v2', {});
  const [currentWeekCutoff] = usePersistedState<number>('dumphoops-schedule-currentWeekCutoff.v2', 0);
  const [lastRegularSeasonWeek] = usePersistedState<number | null>('dumphoops-schedule-lastRegularWeek.v2', null);

  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);

  // ---- resolve schedule ----
  const effectiveCutoff = useMemo(() => {
    if (currentWeekCutoff !== 0) return currentWeekCutoff;
    if (schedule) return getSuggestedCurrentWeek(schedule);
    return 0;
  }, [currentWeekCutoff, schedule]);

  const inferredLastRegWeek = useMemo(() => {
    if (!schedule) return undefined;
    if (schedule.lastRegularSeasonWeek != null) return schedule.lastRegularSeasonWeek;
    const playoffWeeks = schedule.matchups.filter(m => m.isPlayoff).map(m => m.week);
    if (playoffWeeks.length === 0) return undefined;
    return Math.min(...playoffWeeks) - 1;
  }, [schedule]);

  const effectiveLastRegWeek = lastRegularSeasonWeek ?? inferredLastRegWeek ?? undefined;

  // ---- resolve standings ----
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

  // ---- projected standings for seeding ----
  const forecastSettings: ForecastSettings = useMemo(() => ({
    useCri: true, useWeightedCri: false, simulationScale: 1,
    includeCompletedWeeks: false, startFromCurrentRecords: true,
    completedWeeks: [], currentWeekCutoff: effectiveCutoff,
    lastRegularSeasonWeek: effectiveLastRegWeek,
  }), [effectiveCutoff, effectiveLastRegWeek]);

  const projectedStandings = useMemo(() => {
    if (!resolvedSchedule || leagueTeams.length === 0) return [];
    return projectFinalStandings(
      { season: resolvedSchedule.season, matchups: resolvedSchedule.matchups },
      leagueTeams, forecastSettings,
    );
  }, [resolvedSchedule, leagueTeams, forecastSettings]);

  const standingsForBracket = useMemo(() => {
    const shouldUseImported = effectiveLastRegWeek != null && effectiveCutoff >= effectiveLastRegWeek;
    if (shouldUseImported) {
      return leagueTeams.map((team, idx) => {
        const rec = parseRecordParts(team.record);
        return {
          teamName: team.name,
          totalWins: rec.wins, totalLosses: rec.losses, totalTies: rec.ties,
          projectedRank: idx + 1,
        };
      });
    }
    return projectedStandings.map(s => ({
      teamName: s.teamName, totalWins: s.totalWins, totalLosses: s.totalLosses,
      totalTies: s.totalTies, projectedRank: s.projectedRank,
    }));
  }, [leagueTeams, projectedStandings, effectiveCutoff, effectiveLastRegWeek]);

  // ---- playoff seeds ----
  const playoffSeeds = useMemo(() => {
    if (standingsForBracket.length === 0) return [];
    return standingsForBracket.slice(0, numPlayoffTeams).map((s, i) => ({
      seed: i + 1,
      teamName: s.teamName,
      record: `${s.totalWins}-${s.totalLosses}-${s.totalTies}`,
    }));
  }, [standingsForBracket, numPlayoffTeams]);

  // ---- identify user ----
  const isUserTeam = (name: string) => {
    if (userTeamName) return name.toLowerCase() === userTeamName.toLowerCase();
    return name.toLowerCase().includes('bane');
  };

  const userSeedObj = playoffSeeds.find(s => isUserTeam(s.teamName));
  const userTeamData = leagueTeams.find(t => isUserTeam(t.name));
  const isInPlayoffs = !!userSeedObj;

  // ---- likely opponents ----
  const likelyOpponents = useMemo(() => {
    if (!userSeedObj || !userTeamData) return [];
    return getLikelyOpponents(userSeedObj.seed, playoffSeeds, numPlayoffTeams);
  }, [userSeedObj, userTeamData, playoffSeeds, numPlayoffTeams]);

  // ---- build scenarios ----
  const opponentScenarios = useMemo(() => {
    if (!userTeamData || likelyOpponents.length === 0) return [];
    return likelyOpponents
      .map(opp => {
        const oppTeam = leagueTeams.find(t => t.name === opp.teamName);
        if (!oppTeam) return null;
        return buildOpponentScenario(opp, userTeamData, oppTeam, 1, weights);
      })
      .filter(Boolean) as OpponentScenario[];
  }, [userTeamData, likelyOpponents, leagueTeams, weights]);

  // ---- selected scenario detail ----
  const activeScenario = useMemo(() => {
    if (!selectedOpponent) return opponentScenarios[0] || null;
    return opponentScenarios.find(s => s.teamName === selectedOpponent) || opponentScenarios[0] || null;
  }, [selectedOpponent, opponentScenarios]);

  // ---- bye week plan ----
  const byeWeekPlan = useMemo(() => {
    return generateByeWeekPlan(opponentScenarios, weights);
  }, [opponentScenarios, weights]);

  // ---- playoff weeks for schedule density ----
  const playoffWeeks = useMemo(() => {
    if (!resolvedSchedule) return [];
    const allWeeks = Array.from(new Set(resolvedSchedule.matchups.map(m => m.week))).sort((a, b) => a - b);
    if (effectiveLastRegWeek) return allWeeks.filter(w => w > effectiveLastRegWeek);
    return allWeeks.slice(-3);
  }, [resolvedSchedule, effectiveLastRegWeek]);

  // ========================================
  // EMPTY STATE
  // ========================================
  if (leagueTeams.length === 0) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card className="p-8 text-center">
          <Trophy className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-display font-bold mb-2">Playoff Intelligence</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Import your league standings and schedule to unlock playoff projections,
            opponent analysis, and strategic recommendations.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" size="sm" onClick={() => onNavigateTab?.('league')}>
              <Upload className="w-4 h-4 mr-2" />
              Import Standings
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!isInPlayoffs) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-stat-negative mx-auto mb-4" />
          <h2 className="text-xl font-display font-bold mb-2">Outside Playoff Picture</h2>
          <p className="text-muted-foreground text-sm">
            Based on current projections, your team is outside the top {numPlayoffTeams} playoff spots.
            Focus on climbing the standings!
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">

      {/* ============================================================ */}
      {/* HERO — Your playoff status                                    */}
      {/* ============================================================ */}
      <div className="rounded-xl bg-gradient-to-br from-muted/60 to-muted/20 p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Playoff Intel</div>
              <div className="font-display font-bold text-xl">
                <span className="text-primary">#{userSeedObj?.seed}</span> Seed — {userSeedObj?.record}
              </div>
            </div>
          </div>

          {activeScenario && (
            <div className="flex flex-wrap items-center gap-4 md:gap-6">
              <div className="text-center">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Win Prob</div>
                <div className={cn(
                  'font-display font-bold text-lg',
                  activeScenario.winProbability >= 0.6 ? 'text-stat-positive' :
                  activeScenario.winProbability >= 0.45 ? 'text-foreground' : 'text-stat-negative'
                )}>
                  {Math.round(activeScenario.winProbability * 100)}%
                </div>
              </div>
              <div className="w-px h-8 bg-border/50 hidden md:block" />
              <div className="text-center">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Expected Score</div>
                <div className="font-display font-bold text-lg">
                  {activeScenario.expectedCatsWon.toFixed(1)}–{activeScenario.expectedCatsLost.toFixed(1)}
                </div>
              </div>
              <div className="w-px h-8 bg-border/50 hidden md:block" />
              <div className="text-center">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">vs</div>
                <div className="font-semibold text-sm truncate max-w-[140px]">{activeScenario.teamName}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION A — LIKELY OPPONENTS                                  */}
      {/* ============================================================ */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h3 className="font-display font-semibold text-base">Likely Opponents</h3>
          <div className="flex-1 h-px bg-border/40" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {opponentScenarios.map((scenario) => {
            const badge = overallBadge(scenario.overallConfidence, scenario.winProbability);
            const isActive = activeScenario?.teamName === scenario.teamName;

            return (
              <button
                key={`${scenario.teamName}-${scenario.round}`}
                onClick={() => setSelectedOpponent(scenario.teamName)}
                className={cn(
                  'text-left rounded-lg border p-4 transition-all hover:bg-muted/30',
                  isActive ? 'border-primary/40 bg-primary/[0.04] ring-1 ring-primary/20' : 'border-border/40 bg-muted/10'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-sm">{scenario.teamName}</div>
                    <div className="text-xs text-muted-foreground">
                      #{scenario.seed} · {scenario.record} · {scenario.round}
                    </div>
                  </div>
                  <Badge className={cn('text-[10px] font-semibold', badge.className)}>
                    {badge.label}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Win:</span>{' '}
                    <span className="font-bold">{Math.round(scenario.winProbability * 100)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cats:</span>{' '}
                    <span className="font-bold">{scenario.expectedCatsWon.toFixed(1)}–{scenario.expectedCatsLost.toFixed(1)}</span>
                  </div>
                  {scenario.likelihood < 1 && (
                    <div>
                      <span className="text-muted-foreground">Chance:</span>{' '}
                      <span className="font-medium">{Math.round(scenario.likelihood * 100)}%</span>
                    </div>
                  )}
                </div>

                {scenario.swingCategories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {scenario.swingCategories.map(cat => (
                      <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {opponentScenarios.length === 0 && (
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription>
              Import league schedule in the Standings → Forecast tab to see projected playoff opponents.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* ============================================================ */}
      {/* SECTION B — CATEGORY MATRIX                                   */}
      {/* ============================================================ */}
      {activeScenario && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-display font-semibold text-base">
              Category Breakdown vs {activeScenario.teamName}
            </h3>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          <div className="rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th className="text-left p-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Cat</th>
                  <th className="text-right p-3 font-display text-xs uppercase tracking-wider text-muted-foreground">You</th>
                  <th className="text-right p-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Opp</th>
                  <th className="text-right p-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Delta</th>
                  <th className="text-center p-3 font-display text-xs uppercase tracking-wider text-muted-foreground">Confidence</th>
                  <th className="text-center p-3 font-display text-xs uppercase tracking-wider text-muted-foreground w-20">Win%</th>
                </tr>
              </thead>
              <tbody>
                {activeScenario.categories.map((cat) => {
                  const isPct = cat.key === 'fgPct' || cat.key === 'ftPct';
                  const isTO = cat.key === 'turnovers';
                  const myFormatted = isPct ? formatPct(cat.myValue) : cat.myValue.toFixed(isPct ? 3 : 1);
                  const oppFormatted = isPct ? formatPct(cat.oppValue) : cat.oppValue.toFixed(isPct ? 3 : 1);
                  const deltaFormatted = isPct
                    ? (cat.delta >= 0 ? '+' : '') + formatPct(Math.abs(cat.delta))
                    : (cat.delta >= 0 ? '+' : '') + cat.delta.toFixed(1);

                  return (
                    <tr key={cat.key} className="border-b border-border/30 hover:bg-muted/10">
                      <td className="p-3 font-semibold">{cat.label}</td>
                      <td className="p-3 text-right font-mono text-xs">{myFormatted}</td>
                      <td className="p-3 text-right font-mono text-xs">{oppFormatted}</td>
                      <td className={cn(
                        'p-3 text-right font-mono text-xs font-semibold',
                        cat.delta > 0 ? 'text-stat-positive' : cat.delta < 0 ? 'text-stat-negative' : 'text-muted-foreground'
                      )}>
                        {deltaFormatted}
                      </td>
                      <td className="p-3 text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge className={cn('text-[10px] font-medium', confidenceBg(cat.confidence))}>
                                {cat.confidence}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              {cat.notes.length > 0 ? (
                                <div className="space-y-1">
                                  {cat.notes.map((n, i) => <p key={i} className="text-xs">{n}</p>)}
                                </div>
                              ) : (
                                <p className="text-xs">Based on season averages and category volatility</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="p-3 text-center">
                        <span className={cn(
                          'text-xs font-bold',
                          cat.winProbability >= 0.6 ? 'text-stat-positive' :
                          cat.winProbability >= 0.4 ? 'text-foreground' : 'text-stat-negative'
                        )}>
                          {Math.round(cat.winProbability * 100)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* CRIS-weighted edge */}
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>wCRI Edge Score:</span>
            <span className={cn(
              'font-bold',
              activeScenario.weightedEdge > 0.2 ? 'text-stat-positive' :
              activeScenario.weightedEdge < -0.2 ? 'text-stat-negative' : 'text-foreground'
            )}>
              {activeScenario.weightedEdge > 0 ? '+' : ''}{activeScenario.weightedEdge.toFixed(2)}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger><Info className="w-3 h-3" /></TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-xs">
                    Weighted category advantage using your CRIS weights. Positive = edge for you.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION D — BYE WEEK PREP PLAN                               */}
      {/* ============================================================ */}
      {byeWeekPlan.targetCategories.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-base">Playoff Prep Plan</h3>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target categories */}
            <Card className="p-4 border-border/40 bg-muted/10">
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Target className="w-3.5 h-3.5" />
                Target Categories
              </h4>
              <div className="space-y-2">
                {byeWeekPlan.targetCategories.map(cat => (
                  <div key={cat.key} className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px] font-bold flex-shrink-0 mt-0.5">
                      {cat.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{cat.reason}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Streamer profile */}
            <Card className="p-4 border-border/40 bg-muted/10">
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" />
                Ideal Streamer Profile
              </h4>
              <div className="space-y-1.5">
                {byeWeekPlan.streamerProfile.map((profile, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <ChevronRight className="w-3 h-3 text-primary flex-shrink-0" />
                    <span>{profile}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Roster notes */}
            {byeWeekPlan.rosterNotes.length > 0 && (
              <Card className="p-4 border-border/40 bg-muted/10 md:col-span-2">
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <Swords className="w-3.5 h-3.5" />
                  Strategic Notes
                </h4>
                <div className="space-y-1.5">
                  {byeWeekPlan.rosterNotes.map((note, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <Info className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* CTA to free agents */}
          {freeAgents.length > 0 && (
            <div className="mt-3 text-center">
              <Button variant="outline" size="sm" onClick={() => onNavigateTab?.('freeagents')}>
                <TrendingUp className="w-4 h-4 mr-2" />
                Browse Free Agents for Streamers
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Opponent roster import CTA */}
      {roster.length === 0 && (
        <Alert className="border-primary/20">
          <Upload className="w-4 h-4" />
          <AlertDescription className="text-xs">
            <span className="font-semibold">Import your roster</span> on the Roster tab for more accurate playoff projections.
            Currently using league-average team stats.
          </AlertDescription>
        </Alert>
      )}

      {/* Legend */}
      <div className="flex items-start gap-2 text-[11px] text-muted-foreground/60 pt-2">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          Projections use 9-cat season averages and logistic win probability.
          Confidence tiers account for category-level volatility.
          Import opponent rosters for higher-fidelity projections.
        </span>
      </div>
    </div>
  );
};
