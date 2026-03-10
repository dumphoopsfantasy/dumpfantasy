/**
 * Playoff Intel Dashboard v2.1
 * 
 * Enhanced with: schedule density, flippability meter, strategy classification,
 * opponent streaming toggle, playoff identity, visual hierarchy upgrades.
 */

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Trophy, Shield, Target, TrendingUp, TrendingDown,
  Info, Upload, Swords, ChevronRight, Zap, AlertTriangle,
  Activity, BarChart3, Flame, Eye, Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePersistedState } from '@/hooks/usePersistedState';
import { CATEGORIES, formatPct, CRIS_WEIGHTS } from '@/lib/crisUtils';
import type { LeagueTeam } from '@/types/league';
import type { RosterSlot, Player } from '@/types/fantasy';
import type { LeagueSchedule } from '@/lib/scheduleParser';
import { makeScheduleTeamKey, normalizeName, fuzzyNameMatch } from '@/lib/nameNormalization';
import { projectFinalStandings, type ForecastSettings } from '@/lib/forecastEngine';
import { parseDateRangeText } from '@/lib/matchupWeekDates';
import {
  getLikelyOpponents,
  getPlayoffAwareOpponents,
  buildOpponentScenario,
  generateByeWeekPlan,
  simulateOpponentStreaming,
  type OpponentScenario,
  type CategoryProjection,
  type ConfidenceTier,
  type CategoryStrategy,
  type PlayoffRoundInfo,
} from '@/lib/playoffProjectionEngine';

function getRoundLabelLocal(round: number, totalRounds: number): string {
  if (totalRounds === 3) {
    if (round === 1) return 'Quarterfinal';
    if (round === 2) return 'Semifinal';
    return 'Finals';
  }
  if (totalRounds === 2) {
    if (round === 1) return 'Semifinal';
    return 'Finals';
  }
  return `Round ${round}`;
}

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
  isByeWeek?: boolean;
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
  const seasonStartYear = parseInt(schedule.season.slice(0, 4)) || new Date().getFullYear();
  const seasonYear = seasonStartYear + 1; // NBA season "2025" means games in 2025-2026; Jan-Aug dates are in 2026
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

const confidenceBg = (tier: ConfidenceTier) => {
  switch (tier) {
    case 'Lock Win': return 'bg-stat-positive/10 text-stat-positive';
    case 'Lean Win': return 'bg-stat-positive/8 text-stat-positive/80';
    case 'Coinflip': return 'bg-stat-neutral/15 text-stat-neutral';
    case 'Lean Loss': return 'bg-stat-negative/8 text-stat-negative/80';
    case 'Lock Loss': return 'bg-stat-negative/10 text-stat-negative';
  }
};

const strategyIcon = (s: CategoryStrategy) => {
  switch (s) {
    case 'Protect': return <Shield className="w-3 h-3" />;
    case 'Attack': return <Flame className="w-3 h-3" />;
    case 'Reinforce': return <Eye className="w-3 h-3" />;
    case 'Punt': return <Ban className="w-3 h-3" />;
  }
};

const strategyColor = (s: CategoryStrategy) => {
  switch (s) {
    case 'Protect': return 'text-stat-positive bg-stat-positive/10';
    case 'Attack': return 'text-primary bg-primary/10';
    case 'Reinforce': return 'text-stat-neutral bg-stat-neutral/10';
    case 'Punt': return 'text-muted-foreground bg-muted/30';
  }
};

const volatilityLabel = (v: 'high' | 'medium' | 'low') => {
  switch (v) {
    case 'high': return { icon: '⚡', text: 'High Vol' };
    case 'medium': return { icon: '〰', text: 'Med Vol' };
    case 'low': return { icon: '▬', text: 'Low Vol' };
  }
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
  isByeWeek = false,
}: PlayoffIntelProps) => {
  const [playoffTeamCount] = usePersistedState<string>('dumphoops-playoff-team-count', '6');
  const numPlayoffTeams = parseInt(playoffTeamCount);

  const [schedule] = usePersistedState<LeagueSchedule | null>('dumphoops-schedule.v2', null);
  const [aliases] = usePersistedState<TeamAliasMap>('dumphoops-schedule-aliases.v2', {});
  const [currentWeekCutoff] = usePersistedState<number>('dumphoops-schedule-currentWeekCutoff.v2', 0);
  const [lastRegularSeasonWeek] = usePersistedState<number | null>('dumphoops-schedule-lastRegularWeek.v2', null);
  const [persistedMyTeam, setPersistedMyTeam] = usePersistedState<string>('dumphoops-my-team', '');

  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
  const [assumeOppStreaming, setAssumeOppStreaming] = useState(false);
  const [selectedRound, setSelectedRound] = useState<'current' | 'future'>('current');

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
  const effectiveUserTeam = userTeamName || persistedMyTeam;
  const isUserTeam = (name: string) => {
    if (effectiveUserTeam) return name.toLowerCase() === effectiveUserTeam.toLowerCase();
    return false;
  };

  const userSeedObj = playoffSeeds.find(s => isUserTeam(s.teamName));
  const userTeamData = leagueTeams.find(t => isUserTeam(t.name));
  const isInPlayoffs = !!userSeedObj;

  // ---- round-aware opponents ----
  const playoffAware = useMemo(() => {
    if (!userSeedObj || !userTeamData) return null;
    return getPlayoffAwareOpponents(
      userTeamData.name,
      playoffSeeds,
      numPlayoffTeams,
      effectiveCutoff,
      effectiveLastRegWeek,
      resolvedSchedule?.matchups,
    );
  }, [userSeedObj, userTeamData, playoffSeeds, numPlayoffTeams, effectiveCutoff, effectiveLastRegWeek, resolvedSchedule]);

  const roundInfo = playoffAware?.roundInfo;
  const isInPlayoffRound = (effectiveLastRegWeek != null && effectiveCutoff > effectiveLastRegWeek);

  const currentRoundOpponents = useMemo(() => {
    if (!playoffAware) return [];
    return playoffAware.confirmedOpponent ? [playoffAware.confirmedOpponent] : [];
  }, [playoffAware]);

  const futureRoundOpponents = useMemo(() => {
    return playoffAware?.futureOpponents || [];
  }, [playoffAware]);

  const activeRoundOpponents = selectedRound === 'current' ? currentRoundOpponents : futureRoundOpponents;
  const displayOpponents = activeRoundOpponents.length > 0 ? activeRoundOpponents : (playoffAware?.allOpponents || []);

  // ---- build scenarios ----
  const opponentScenarios = useMemo(() => {
    if (!userTeamData || displayOpponents.length === 0) return [];
    return displayOpponents
      .map(opp => {
        const oppTeam = leagueTeams.find(t => t.name === opp.teamName);
        if (!oppTeam) return null;
        return buildOpponentScenario(opp, userTeamData, oppTeam, 1, weights);
      })
      .filter(Boolean) as OpponentScenario[];
  }, [userTeamData, displayOpponents, leagueTeams, weights]);

  // ---- selected scenario detail ----
  const activeScenario = useMemo(() => {
    if (!selectedOpponent) return opponentScenarios[0] || null;
    return opponentScenarios.find(s => s.teamName === selectedOpponent) || opponentScenarios[0] || null;
  }, [selectedOpponent, opponentScenarios]);

  // ---- streaming sensitivity ----
  const streamingSensitivity = useMemo(() => {
    if (!activeScenario) return null;
    return simulateOpponentStreaming(activeScenario.categories, 4);
  }, [activeScenario]);

  // ---- bye week plan ----
  const byeWeekPlan = useMemo(() => {
    return generateByeWeekPlan(opponentScenarios, weights);
  }, [opponentScenarios, weights]);

  // ---- categories to display (with or without streaming sim) ----
  const displayCategories = useMemo(() => {
    if (assumeOppStreaming && streamingSensitivity) return streamingSensitivity.updatedCategories;
    return activeScenario?.categories || [];
  }, [assumeOppStreaming, streamingSensitivity, activeScenario]);

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
          <Button variant="outline" size="sm" onClick={() => onNavigateTab?.('league')}>
            <Upload className="w-4 h-4 mr-2" />
            Import Standings
          </Button>
        </Card>
      </div>
    );
  }

  if (!effectiveUserTeam && leagueTeams.length > 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="p-8 text-center">
          <Trophy className="w-10 h-10 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-display font-bold mb-2">Select Your Team</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Choose your team to see playoff projections and matchup analysis.
          </p>
          <Select value="" onValueChange={(v) => setPersistedMyTeam(v)}>
            <SelectTrigger className="w-[250px] h-9 text-sm mx-auto">
              <SelectValue placeholder="Choose your team…" />
            </SelectTrigger>
            <SelectContent>
              {leagueTeams.map(t => (
                <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">

      {/* ============================================================ */}
      {/* BYE WEEK BANNER                                               */}
      {/* ============================================================ */}
      {isByeWeek && !isInPlayoffRound && (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="font-display font-bold text-sm text-primary">You're on a bye week</div>
            <p className="text-xs text-muted-foreground mt-0.5">Use this time to structure your roster for the playoffs.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onNavigateTab?.('freeagents')}>
              <TrendingUp className="w-3 h-3 mr-1" /> Streaming Plan
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* HERO SUMMARY BAR                                              */}
      {/* ============================================================ */}
      <div className="rounded-xl bg-gradient-to-br from-muted/60 to-muted/20 p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                {roundInfo ? `Round ${roundInfo.currentPlayoffRound} — ${roundInfo.roundLabel}` : 'Playoff Intel'}
              </div>
              <div className="font-display font-bold text-lg">
                <span className="text-primary">#{userSeedObj?.seed}</span> Seed — {userSeedObj?.record}
              </div>
            </div>
          </div>

          {activeScenario && (
            <div className="flex flex-wrap items-center gap-4 md:gap-5">
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Prob</div>
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
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Expected</div>
                <div className="font-display font-bold text-lg">
                  {activeScenario.expectedCatsWon.toFixed(1)}–{activeScenario.expectedCatsLost.toFixed(1)}
                </div>
              </div>
              <div className="w-px h-8 bg-border/50 hidden md:block" />
              {/* wCRI Edge Score — moved to hero */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-center cursor-help">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">wCRI Edge</div>
                      <div className={cn(
                        'font-display font-bold text-lg',
                        activeScenario.weightedEdge > 0.2 ? 'text-stat-positive' :
                        activeScenario.weightedEdge < -0.2 ? 'text-stat-negative' : 'text-foreground'
                      )}>
                        {activeScenario.weightedEdge > 0 ? '+' : ''}{activeScenario.weightedEdge.toFixed(2)}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-xs">CRIS-weighted matchup advantage. Positive = edge for you.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="w-px h-8 bg-border/50 hidden md:block" />
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">vs</div>
                <div className="font-semibold text-sm truncate max-w-[140px]">{activeScenario.teamName}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* ROUND SELECTOR + OPPONENTS                                    */}
      {/* ============================================================ */}
      <div>
        {/* Round selector tabs */}
        {isInPlayoffRound && roundInfo && roundInfo.currentPlayoffRound < roundInfo.totalPlayoffRounds && roundInfo.roundLabel !== "Winner's Consolation" && (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => { setSelectedRound('current'); setSelectedOpponent(null); }}
              className={cn(
                'text-xs font-semibold px-3 py-1.5 rounded-md transition-colors',
                selectedRound === 'current'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              )}
            >
              {roundInfo.roundLabel} (This Week)
            </button>
            <button
              onClick={() => { setSelectedRound('future'); setSelectedOpponent(null); }}
              className={cn(
                'text-xs font-semibold px-3 py-1.5 rounded-md transition-colors',
                selectedRound === 'future'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              )}
            >
              {getRoundLabelLocal(roundInfo.currentPlayoffRound + 1, roundInfo.totalPlayoffRounds)} (Next)
            </button>
            <div className="flex-1 h-px bg-border/40" />
          </div>
        )}

        {/* Section header */}
        {(!isInPlayoffRound || !roundInfo || roundInfo.currentPlayoffRound >= roundInfo.totalPlayoffRounds) && (
          <div className="flex items-center gap-3 mb-3">
            <h3 className="font-display font-semibold text-sm">
              {playoffAware?.confirmedOpponent ? 'Your Opponent' : 'Likely Opponents'}
            </h3>
            <div className="flex-1 h-px bg-border/40" />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {opponentScenarios.map((scenario) => {
            const isActive = activeScenario?.teamName === scenario.teamName;
            const isFavored = scenario.winProbability >= 0.55;
            const isUnderdog = scenario.winProbability < 0.45;
            const isConfirmed = scenario.likelihood === 1.0 && selectedRound === 'current';

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
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {scenario.teamName}
                      {isConfirmed && (
                        <Badge className="text-[9px] bg-primary/15 text-primary border-0">Confirmed</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {scenario.seed > 0 && `#${scenario.seed} · `}{scenario.record}{scenario.record && ' · '}{scenario.round}
                    </div>
                  </div>
                  <div className={cn(
                    'text-lg font-display font-bold',
                    isFavored ? 'text-stat-positive' : isUnderdog ? 'text-stat-negative' : 'text-foreground'
                  )}>
                    {Math.round(scenario.winProbability * 100)}%
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Cats:</span>{' '}
                    <span className="font-bold">{scenario.expectedCatsWon.toFixed(1)}–{scenario.expectedCatsLost.toFixed(1)}</span>
                  </div>
                  {!isConfirmed && scenario.likelihood < 1 && (
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
      {/* CATEGORY MATRIX (enhanced)                                    */}
      {/* ============================================================ */}
      {activeScenario && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <h3 className="font-display font-semibold text-sm">
                Category Breakdown vs {activeScenario.teamName}
              </h3>
              <div className="flex-1 h-px bg-border/40" />
            </div>
            {/* Opponent streaming toggle */}
            <div className="flex items-center gap-2 text-xs flex-shrink-0">
              <span className="text-muted-foreground">Opp streams +4</span>
              <Switch
                checked={assumeOppStreaming}
                onCheckedChange={setAssumeOppStreaming}
                className="scale-75"
              />
            </div>
          </div>

          {/* Streaming vulnerability alert */}
          {assumeOppStreaming && streamingSensitivity && streamingSensitivity.flippedCats.length > 0 && (
            <Alert className="mb-3 border-stat-negative/30 bg-stat-negative/[0.04]">
              <AlertTriangle className="w-4 h-4 text-stat-negative" />
              <AlertDescription className="text-xs">
                <span className="font-semibold text-stat-negative">Categories vulnerable to opponent streaming:</span>{' '}
                {streamingSensitivity.flippedCats.join(', ')}
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/20">
                  <th className="text-left p-2.5 font-display text-[10px] uppercase tracking-wider text-muted-foreground">Cat</th>
                  <th className="text-center p-2.5 font-display text-[10px] uppercase tracking-wider text-muted-foreground w-16">Strategy</th>
                  <th className="text-right p-2.5 font-display text-[10px] uppercase tracking-wider text-muted-foreground">You</th>
                  <th className="text-right p-2.5 font-display text-[10px] uppercase tracking-wider text-muted-foreground">Opp</th>
                  <th className="text-right p-2.5 font-display text-[10px] uppercase tracking-wider text-muted-foreground">Delta</th>
                  <th className="text-center p-2.5 font-display text-[10px] uppercase tracking-wider text-muted-foreground">Conf</th>
                  <th className="text-center p-2.5 font-display text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Vol</th>
                  <th className="text-center p-2.5 font-display text-[10px] uppercase tracking-wider text-muted-foreground w-20">Flip</th>
                </tr>
              </thead>
              <tbody>
                {displayCategories.map((cat) => {
                  const isPct = cat.key === 'fgPct' || cat.key === 'ftPct';
                  const myFormatted = isPct ? formatPct(cat.myValue) : cat.myValue.toFixed(1);
                  const oppFormatted = isPct ? formatPct(cat.oppValue) : cat.oppValue.toFixed(1);
                  const deltaFormatted = isPct
                    ? (cat.delta >= 0 ? '+' : '') + formatPct(Math.abs(cat.delta))
                    : (cat.delta >= 0 ? '+' : '') + cat.delta.toFixed(1);
                  const vol = volatilityLabel(cat.volatility);
                  const rowBg = cat.delta > 0
                    ? 'bg-stat-positive/[0.03]'
                    : cat.delta < 0 ? 'bg-stat-negative/[0.03]' : '';

                  return (
                    <tr key={cat.key} className={cn('border-b border-border/20 hover:bg-muted/10 transition-colors', rowBg)}>
                      <td className="p-2.5 font-semibold text-xs">{cat.label}</td>
                      <td className="p-2.5 text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge className={cn('text-[9px] font-bold gap-0.5 px-1.5', strategyColor(cat.strategy))}>
                                {strategyIcon(cat.strategy)}
                                {cat.strategy}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">{cat.strategyReason}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="p-2.5 text-right font-mono text-xs">{myFormatted}</td>
                      <td className="p-2.5 text-right font-mono text-xs text-muted-foreground">{oppFormatted}</td>
                      <td className={cn(
                        'p-2.5 text-right font-mono text-xs font-bold',
                        cat.delta > 0 ? 'text-stat-positive' : cat.delta < 0 ? 'text-stat-negative' : 'text-muted-foreground'
                      )}>
                        {deltaFormatted}
                      </td>
                      <td className="p-2.5 text-center">
                        <Badge className={cn(
                          'text-[9px] font-medium',
                          confidenceBg(cat.confidence),
                          cat.confidence === 'Coinflip' && 'animate-pulse'
                        )}>
                          {cat.confidence}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-center hidden sm:table-cell">
                        <span className="text-[10px] text-muted-foreground" title={vol.text}>
                          {vol.icon}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          <Progress value={cat.flippability} className="h-1.5 flex-1" />
                          <span className="text-[10px] text-muted-foreground w-6 text-right">{cat.flippability}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* PLAYOFF IDENTITY + STRATEGY                                   */}
      {/* ============================================================ */}
      {byeWeekPlan.identity.summary && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Swords className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Recommended Playoff Identity</h3>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          <Card className="p-5 border-primary/20 bg-primary/[0.02]">
            {/* Identity grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {([
                { label: 'Protect', items: byeWeekPlan.identity.protect, color: 'text-stat-positive', icon: <Shield className="w-3.5 h-3.5" /> },
                { label: 'Attack', items: byeWeekPlan.identity.attack, color: 'text-primary', icon: <Flame className="w-3.5 h-3.5" /> },
                { label: 'Reinforce', items: byeWeekPlan.identity.reinforce, color: 'text-stat-neutral', icon: <Eye className="w-3.5 h-3.5" /> },
                { label: 'Punt', items: byeWeekPlan.identity.punt, color: 'text-muted-foreground', icon: <Ban className="w-3.5 h-3.5" /> },
              ] as const).map(group => (
                <div key={group.label} className="space-y-1">
                  <div className={cn('flex items-center gap-1.5 text-xs font-bold', group.color)}>
                    {group.icon}
                    {group.label}
                  </div>
                  <div className="text-xs text-foreground">
                    {group.items.length > 0 ? group.items.join(', ') : '—'}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary sentence */}
            <p className="text-xs text-muted-foreground border-t border-border/30 pt-3">
              {byeWeekPlan.identity.summary}
            </p>
          </Card>
        </div>
      )}

      {/* ============================================================ */}
      {/* TARGET CATEGORIES + STREAMER PROFILE                          */}
      {/* ============================================================ */}
      {byeWeekPlan.targetCategories.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Target className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Priority Targets</h3>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target categories — ranked with strategy tags */}
            <Card className="p-4 border-border/40 bg-muted/10">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" />
                Categories to Target (ranked)
              </h4>
              <div className="space-y-2.5">
                {byeWeekPlan.targetCategories.map((cat, i) => (
                  <div key={cat.key} className="flex items-start gap-2">
                    <span className="text-[10px] text-muted-foreground/60 font-mono w-4 pt-0.5">{i + 1}.</span>
                    <Badge className={cn('text-[9px] font-bold flex-shrink-0 mt-0.5 gap-0.5', strategyColor(cat.strategy))}>
                      {strategyIcon(cat.strategy)}
                      {cat.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{cat.reason}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Streamer profile */}
            <Card className="p-4 border-border/40 bg-muted/10">
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
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
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* STRATEGIC NOTES                                               */}
      {/* ============================================================ */}
      {byeWeekPlan.rosterNotes.length > 0 && (
        <Card className="p-4 border-primary/15 bg-primary/[0.02]">
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Swords className="w-3.5 h-3.5 text-primary" />
            Strategic Intel
          </h4>
          <div className="space-y-2">
            {byeWeekPlan.rosterNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <ChevronRight className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                <span className="font-medium">{note}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ============================================================ */}
      {/* FREE AGENT CTA                                                */}
      {/* ============================================================ */}
      {freeAgents.length > 0 && byeWeekPlan.identity.attack.length > 0 && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => onNavigateTab?.('freeagents')}>
            <TrendingUp className="w-4 h-4 mr-2" />
            Browse Streamers for {byeWeekPlan.identity.attack.join(' + ')}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1">
            Filtered for {byeWeekPlan.identity.attack.join(', ')} streamers with 3+ games
          </p>
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
      <div className="flex items-start gap-2 text-[10px] text-muted-foreground/50 pt-2">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        <span>
          Projections use 9-cat season averages and logistic win probability.
          Confidence tiers account for category-level volatility.
          {assumeOppStreaming && ' Opponent streaming (+4 adds) applied.'}
        </span>
      </div>
    </div>
  );
};
