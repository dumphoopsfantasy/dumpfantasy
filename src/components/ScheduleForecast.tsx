import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  Info,
  RefreshCw,
  Settings,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Upload,
  Users,
  Minus,
  Bug,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { usePersistedState } from "@/hooks/usePersistedState";
import { CATEGORIES, formatPct, CRIS_WEIGHTS } from "@/lib/crisUtils";
import { CrisToggle } from "@/components/CrisToggle";
import type { LeagueTeam } from "@/types/league";
import {
  LeagueSchedule,
  ScheduleTeam,
  ScheduleDebugInfo,
  parseScheduleData,
} from "@/lib/scheduleParser";
import {
  forecastTeamMatchups,
  projectFinalStandings,
  type ForecastSettings,
  type MatchupPrediction,
} from "@/lib/forecastEngine";
import { makeScheduleTeamKey, normalizeName, fuzzyNameMatch } from "@/lib/nameNormalization";

type TeamAliasMap = Record<string, string>; // scheduleTeamKey -> leagueTeamName

type ScheduleForecastProps = {
  leagueTeams: LeagueTeam[];
  userTeamName?: string;
  baseWeights?: Record<string, number>;
  effectiveWeights?: Record<string, number>;
  dynamicWeightsActive?: boolean;
  dynamicWeightsModeLabel?: string;
};

type ResolvedMatchup = {
  week: number;
  dateRangeText: string;
  awayTeam: string;
  homeTeam: string;
};

type ResolvedScheduleResult = {
  season: string;
  matchups: ResolvedMatchup[];
  waitingForMapping: number;
  totalMatchups: number;
};

function parseDateRangeText(dateRangeText: string, seasonYear: number): { start?: Date; end?: Date } {
  // Ex: "Dec 15 - 21" or "Oct 21 - 26" or "Dec 30 - Jan 5"
  const m = dateRangeText.match(/^(\w{3})\s+(\d{1,2})\s*-\s*(?:(\w{3})\s+)?(\d{1,2})/);
  if (!m) return {};

  const monthToIndex: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  const startMonth = monthToIndex[m[1].toLowerCase()];
  const startDay = parseInt(m[2]);
  const endMonth = m[3] ? monthToIndex[m[3].toLowerCase()] : startMonth;
  const endDay = parseInt(m[4]);

  if (startMonth === undefined || endMonth === undefined) return {};

  // NBA fantasy seasons usually span year boundary; if date is Oct-Dec, use seasonYear-1 for "2026" season label.
  // Heuristic: treat Oct/Nov/Dec as previous calendar year.
  const startYear = startMonth >= 9 ? seasonYear - 1 : seasonYear;
  const endYear = endMonth >= 9 ? seasonYear - 1 : seasonYear;

  const start = new Date(startYear, startMonth, startDay);
  const end = new Date(endYear, endMonth, endDay);

  return { start, end };
}

function getSuggestedCurrentWeek(schedule: LeagueSchedule): number {
  const seasonYear = parseInt(schedule.season.slice(0, 4)) || new Date().getFullYear();
  const today = new Date();

  // Find the week whose date range contains today
  for (const m of schedule.matchups) {
    const { start, end } = parseDateRangeText(m.dateRangeText, seasonYear);
    if (!start || !end) continue;
    if (today >= start && today <= end) return m.week;
  }

  // Otherwise pick the latest week whose end is before today
  let lastCompleted = 0;
  for (const m of schedule.matchups) {
    const { end } = parseDateRangeText(m.dateRangeText, seasonYear);
    if (!end) continue;
    if (end < today) lastCompleted = Math.max(lastCompleted, m.week);
  }

  return lastCompleted;
}

export const ScheduleForecast = ({
  leagueTeams,
  userTeamName = "",
  baseWeights,
  effectiveWeights,
  dynamicWeightsActive,
  dynamicWeightsModeLabel,
}: ScheduleForecastProps) => {
  const { toast } = useToast();

  const DEBUG = import.meta.env.DEV && localStorage.getItem("dumphoops.schedule_debug") === "1";

  // Persisted state (v2 keys because the schedule schema changed)
  const [schedule, setSchedule] = usePersistedState<LeagueSchedule | null>("dumphoops-schedule.v2", null);
  const [aliases, setAliases] = usePersistedState<TeamAliasMap>("dumphoops-schedule-aliases.v2", {});
  const [currentWeekCutoff, setCurrentWeekCutoff] = usePersistedState<number>("dumphoops-schedule-currentWeekCutoff.v2", 0);

  // Local state
  const [rawScheduleData, setRawScheduleData] = useState("");
  const [focusTeam, setFocusTeam] = useState(userTeamName);
  const [useCri, setUseCri] = useState(true);
  const [useDynamic, setUseDynamic] = useState(false);
  const [simulationScale, setSimulationScale] = useState(40);
  const [includeCompletedWeeks, setIncludeCompletedWeeks] = useState(false);
  const [startFromCurrentRecords, setStartFromCurrentRecords] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedMatchup, setSelectedMatchup] = useState<MatchupPrediction | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [debugInfo, setDebugInfo] = useState<ScheduleDebugInfo | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Auto-detect focus team (fallback)
  const effectiveFocusTeam = useMemo(() => {
    if (focusTeam) return focusTeam;
    const byHeuristic = leagueTeams.find((t) => t.name.toLowerCase().includes("bane"));
    return byHeuristic?.name || leagueTeams[0]?.name || "";
  }, [focusTeam, leagueTeams]);

  // Build standings lookup maps
  const standingsByTeamName = useMemo(() => {
    const map = new Map<string, LeagueTeam>();
    leagueTeams.forEach((t) => map.set(normalizeName(t.name), t));
    return map;
  }, [leagueTeams]);

  const standingsByManagerName = useMemo(() => {
    const map = new Map<string, LeagueTeam>();
    leagueTeams.forEach((t) => {
      if (t.manager) map.set(normalizeName(t.manager), t);
    });
    return map;
  }, [leagueTeams]);

  // Default current week cutoff when schedule loads
  useEffect(() => {
    if (!schedule) return;
    if (currentWeekCutoff !== 0) return;
    const suggested = getSuggestedCurrentWeek(schedule);
    if (suggested) setCurrentWeekCutoff(suggested);
  }, [schedule, currentWeekCutoff, setCurrentWeekCutoff]);

  const scheduleWeekOptions = useMemo(() => {
    if (!schedule) return [] as number[];
    return Array.from(new Set(schedule.matchups.map((m) => m.week))).sort((a, b) => a - b);
  }, [schedule]);

  // Core: resolve schedule teams to standings teams
  const resolution = useMemo(() => {
    if (!schedule) {
      return {
        mapping: {} as TeamAliasMap,
        unknownTeams: [] as Array<{ key: string; team: ScheduleTeam }>,
        matched: [] as Array<{ key: string; team: ScheduleTeam; leagueTeam: LeagueTeam; method: string }>,
      };
    }

    const mapping: TeamAliasMap = {};
    const unknownTeams: Array<{ key: string; team: ScheduleTeam }> = [];
    const matched: Array<{ key: string; team: ScheduleTeam; leagueTeam: LeagueTeam; method: string }> = [];

    for (const st of schedule.teams) {
      const key = makeScheduleTeamKey(st.teamName, st.managerName);

      // 0) User alias override
      const alias = aliases[key];
      if (alias) {
        const lt = leagueTeams.find((t) => t.name === alias);
        if (lt) {
          mapping[key] = lt.name;
          matched.push({ key, team: st, leagueTeam: lt, method: "alias" });
          continue;
        }
      }

      // a) Exact match on team name
      const byTeam = standingsByTeamName.get(normalizeName(st.teamName));
      if (byTeam) {
        mapping[key] = byTeam.name;
        matched.push({ key, team: st, leagueTeam: byTeam, method: "teamName" });
        continue;
      }

      // b) Exact match on manager name
      if (st.managerName) {
        const byMgr = standingsByManagerName.get(normalizeName(st.managerName));
        if (byMgr) {
          mapping[key] = byMgr.name;
          matched.push({ key, team: st, leagueTeam: byMgr, method: "manager" });
          continue;
        }
      }

      // c) Fuzzy match on team name
      const fuzzy = leagueTeams.find((t) => fuzzyNameMatch(t.name, st.teamName));
      if (fuzzy) {
        mapping[key] = fuzzy.name;
        matched.push({ key, team: st, leagueTeam: fuzzy, method: "fuzzy" });
        continue;
      }

      unknownTeams.push({ key, team: st });
    }

    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log("[ScheduleForecast] schedule teams:", schedule.teams);
      // eslint-disable-next-line no-console
      console.log("[ScheduleForecast] matched:", matched.map((m) => ({ key: m.key, method: m.method, to: m.leagueTeam.name })));
      // eslint-disable-next-line no-console
      console.log("[ScheduleForecast] unknown:", unknownTeams.map((u) => u.key));
    }

    return { mapping, unknownTeams, matched };
  }, [schedule, aliases, leagueTeams, standingsByTeamName, standingsByManagerName, DEBUG]);

  // Apply mapping to matchups
  const resolvedSchedule = useMemo((): ResolvedScheduleResult | null => {
    if (!schedule) return null;

    const matchups: ResolvedMatchup[] = [];
    let waitingCount = 0;

    for (const m of schedule.matchups) {
      const awayKey = makeScheduleTeamKey(m.awayTeamName, m.awayManagerName);
      const homeKey = makeScheduleTeamKey(m.homeTeamName, m.homeManagerName);

      const awayResolved = resolution.mapping[awayKey];
      const homeResolved = resolution.mapping[homeKey];

      if (!awayResolved || !homeResolved) {
        waitingCount++;
        continue;
      }

      matchups.push({
        week: m.week,
        dateRangeText: m.dateRangeText,
        awayTeam: awayResolved,
        homeTeam: homeResolved,
      });
    }

    return {
      season: schedule.season,
      matchups,
      waitingForMapping: waitingCount,
      totalMatchups: schedule.matchups.length,
    };
  }, [schedule, resolution.mapping]);

  const weightsForForecast = useMemo(() => {
    if (useCri) return undefined;

    if (useDynamic && dynamicWeightsActive && effectiveWeights) {
      return effectiveWeights;
    }

    return baseWeights || CRIS_WEIGHTS;
  }, [useCri, useDynamic, dynamicWeightsActive, effectiveWeights, baseWeights]);

  const forecastSettings: ForecastSettings = useMemo(
    () => ({
      useCri,
      useWeightedCri: !useCri,
      dynamicWeights: weightsForForecast,
      simulationScale,
      includeCompletedWeeks,
      startFromCurrentRecords,
      completedWeeks: [],
      currentWeekCutoff,
    }),
    [useCri, weightsForForecast, simulationScale, includeCompletedWeeks, startFromCurrentRecords, currentWeekCutoff]
  );

  const futureMatchups = useMemo(() => {
    if (!resolvedSchedule || leagueTeams.length === 0) return [];
    if (!effectiveFocusTeam) return [];
    return forecastTeamMatchups(
      { season: resolvedSchedule.season, matchups: resolvedSchedule.matchups },
      effectiveFocusTeam,
      leagueTeams,
      forecastSettings
    );
  }, [resolvedSchedule, effectiveFocusTeam, leagueTeams, forecastSettings]);

  const projectedStandings = useMemo(() => {
    if (!resolvedSchedule || leagueTeams.length === 0) return [];
    return projectFinalStandings(
      { season: resolvedSchedule.season, matchups: resolvedSchedule.matchups },
      leagueTeams,
      forecastSettings
    );
  }, [resolvedSchedule, leagueTeams, forecastSettings]);

  const focusTeamSummary = useMemo(() => {
    const matchWins = futureMatchups.reduce((sum, m) => sum + (m.wins > m.losses ? 1 : 0), 0);
    const matchLosses = futureMatchups.reduce((sum, m) => sum + (m.losses > m.wins ? 1 : 0), 0);
    const matchTies = futureMatchups.length - matchWins - matchLosses;

    const totalCatWins = futureMatchups.reduce((sum, m) => sum + m.wins, 0);
    const totalCatLosses = futureMatchups.reduce((sum, m) => sum + m.losses, 0);

    const avgEdge = futureMatchups.length
      ? futureMatchups.reduce((sum, m) => sum + m.edge, 0) / futureMatchups.length
      : 0;

    return { matchWins, matchLosses, matchTies, totalCatWins, totalCatLosses, avgEdge };
  }, [futureMatchups]);

  const handleParseSchedule = useCallback(() => {
    if (!rawScheduleData.trim()) {
      toast({ title: "No data", description: "Paste the ESPN League Schedule page.", variant: "destructive" });
      return;
    }

    try {
      // Pass known team names from standings for whitelist matching
      const knownTeamNames = leagueTeams.map((t) => t.name);
      const result = parseScheduleData(rawScheduleData, knownTeamNames);
      
      setSchedule(result.schedule);
      setParseWarnings(result.warnings);
      setDebugInfo(result.debugInfo || null);

      // With the whitelist approach, teams should already match standings directly
      // Auto-populate aliases for any parsed teams
      const autoAliases: TeamAliasMap = {};
      for (const st of result.schedule.teams) {
        const key = makeScheduleTeamKey(st.teamName, st.managerName);
        // Since we used whitelist matching, teamName should already be canonical
        autoAliases[key] = st.teamName;
      }
      setAliases((prev) => ({ ...autoAliases, ...prev }));

      const weeks = new Set(result.schedule.matchups.map((m) => m.week));
      toast({
        title: "Schedule loaded",
        description: `Parsed ${result.schedule.matchups.length} matchups across ${weeks.size} weeks`,
      });

      setRawScheduleData("");
    } catch (err) {
      toast({
        title: "Parse error",
        description: err instanceof Error ? err.message : "Failed to parse schedule",
        variant: "destructive",
      });
    }
  }, [rawScheduleData, toast, setSchedule, setParseWarnings, setRawScheduleData, setAliases, leagueTeams]);

  const handleAliasChange = (scheduleKey: string, leagueTeamName: string) => {
    setAliases((prev) => ({ ...prev, [scheduleKey]: leagueTeamName }));
  };

  const handleReset = () => {
    setSchedule(null);
    setAliases({});
    setParseWarnings([]);
    setRawScheduleData("");
    setSelectedMatchup(null);
    setDebugInfo(null);
    setShowDebugPanel(false);
  };

  const outcomeColor = (wins: number, losses: number) => {
    if (wins > losses) return "text-stat-positive";
    if (losses > wins) return "text-stat-negative";
    return "text-yellow-500";
  };

  const confidenceBadge = (c: "high" | "medium" | "low") => {
    if (c === "high") return "bg-stat-positive/20 text-stat-positive";
    if (c === "medium") return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400";
    return "bg-stat-negative/20 text-stat-negative";
  };

  if (!schedule) {
    return (
      <Card className="gradient-card shadow-card p-6 border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Calendar className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">Schedule Forecast</h2>
            <p className="text-sm text-muted-foreground">Predict future matchups and project final standings</p>
          </div>
        </div>

        {leagueTeams.length === 0 && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Import league standings first (Standings tab) to enable predictions.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Paste ESPN League Schedule</Label>
            <Textarea
              placeholder={`Copy the ENTIRE ESPN League Schedule page (Ctrl+A, Ctrl+C) and paste here.\n\nLook for:\nMatchup 1 (Oct 21 - 26)\nAway  Home\nTeam A  Team B`}
              value={rawScheduleData}
              onChange={(e) => setRawScheduleData(e.target.value)}
              className="min-h-[200px] font-mono text-sm bg-muted/50"
              disabled={leagueTeams.length === 0}
            />
          </div>

          <Button
            onClick={handleParseSchedule}
            className="w-full gradient-primary font-display font-bold"
            disabled={leagueTeams.length === 0 || !rawScheduleData.trim()}
          >
            <Upload className="w-4 h-4 mr-2" />
            Parse Schedule
          </Button>

          <div className="text-xs text-muted-foreground flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-1">Where to find League Schedule</p>
              <p>In ESPN Fantasy: League → Schedule. Paste the full page.</p>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold">Schedule Forecast</h2>
          <p className="text-sm text-muted-foreground">
            {schedule.matchups.length} matchups parsed • Season {schedule.season}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select value={effectiveFocusTeam} onValueChange={setFocusTeam}>
            <SelectTrigger className="w-[220px]">
              <Users className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {leagueTeams.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <CrisToggle useCris={useCri} onChange={setUseCri} />

          <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)}>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>

          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Re-import
          </Button>
        </div>
      </div>

      {parseWarnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {parseWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {resolvedSchedule && resolvedSchedule.waitingForMapping > 0 && (
        <Alert className="border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription>
            {resolvedSchedule.waitingForMapping} / {resolvedSchedule.totalMatchups} matchups are waiting for team mapping.
          </AlertDescription>
        </Alert>
      )}

      {/* Debug Panel (collapsed by default) */}
      {debugInfo && (
        <Collapsible open={showDebugPanel} onOpenChange={setShowDebugPanel}>
          <Card className="p-3 border-border bg-muted/30">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2 text-xs">
                  <Bug className="w-3 h-3" />
                  Parser Diagnostics
                </span>
                {showDebugPanel ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-2 bg-background/50 rounded">
                  <p className="text-lg font-bold text-primary">{debugInfo.weeksDetected}</p>
                  <p className="text-xs text-muted-foreground">Weeks Detected</p>
                </div>
                <div className="p-2 bg-background/50 rounded">
                  <p className="text-lg font-bold text-primary">{debugInfo.totalMatchups}</p>
                  <p className="text-xs text-muted-foreground">Total Matchups</p>
                </div>
                <div className="p-2 bg-background/50 rounded">
                  <p className="text-lg font-bold text-primary">{debugInfo.knownTeamsUsed.length}</p>
                  <p className="text-xs text-muted-foreground">Known Teams</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold">Known Teams Used:</p>
                <div className="flex flex-wrap gap-1">
                  {debugInfo.knownTeamsUsed.map((team) => (
                    <Badge key={team} variant="secondary" className="text-xs">
                      {team}
                    </Badge>
                  ))}
                </div>
              </div>

              {debugInfo.weekDetails.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-auto">
                  <p className="text-xs font-semibold">Week-by-Week:</p>
                  {debugInfo.weekDetails.slice(0, 5).map((week) => (
                    <div
                      key={week.week}
                      className={cn(
                        "text-xs p-2 rounded bg-background/50",
                        week.errors.length > 0 && "border border-stat-negative/50"
                      )}
                    >
                      <div className="flex justify-between">
                        <span className="font-medium">Week {week.week}</span>
                        <span className="text-muted-foreground">
                          {week.matchupsCreated} matchups • {week.teamsFound.length} teams
                        </span>
                      </div>
                      {week.errors.length > 0 && (
                        <p className="text-stat-negative mt-1">{week.errors.join("; ")}</p>
                      )}
                    </div>
                  ))}
                  {debugInfo.weekDetails.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{debugInfo.weekDetails.length - 5} more weeks...
                    </p>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {resolution.unknownTeams.length > 0 && (
        <Card className="p-4 border-yellow-500/50 bg-yellow-500/10">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
            <span className="font-semibold text-sm">Unknown Teams in Schedule</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            These schedule teams couldn't be matched automatically. Map them once and we’ll reuse it.
          </p>

          <div className="space-y-2">
            {resolution.unknownTeams.map(({ key, team }) => {
              const display = team.managerName ? `${team.teamName} — ${team.managerName}` : team.teamName;
              return (
                <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded sm:min-w-[220px] truncate">
                    {display}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
                  <Select value={aliases[key] || ""} onValueChange={(v) => handleAliasChange(key, v)}>
                    <SelectTrigger className="w-full sm:w-[240px]">
                      <SelectValue placeholder="Select standings team..." />
                    </SelectTrigger>
                    <SelectContent>
                      {leagueTeams.map((t) => (
                        <SelectItem key={t.name} value={t.name}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm">Forecast Settings</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "Hide" : "Show"}
          </Button>
        </div>

        {showSettings && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Current matchup week (cutoff)</Label>
              <Select
                value={String(currentWeekCutoff)}
                onValueChange={(v) => setCurrentWeekCutoff(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select week" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 (simulate all weeks)</SelectItem>
                  {scheduleWeekOptions.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      Week {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Only weeks after this will be simulated (unless you include completed).</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Include completed weeks</Label>
                <p className="text-xs text-muted-foreground">Include weeks ≤ cutoff in tables and simulation</p>
              </div>
              <Switch checked={includeCompletedWeeks} onCheckedChange={setIncludeCompletedWeeks} />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm">Start from current records</Label>
                <p className="text-xs text-muted-foreground">Adds predicted W/L/T to imported standings record</p>
              </div>
              <Switch checked={startFromCurrentRecords} onCheckedChange={setStartFromCurrentRecords} />
            </div>

            {!useCri && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm">Use dynamic weights</Label>
                  <p className="text-xs text-muted-foreground">
                    {dynamicWeightsActive ? `Active (${dynamicWeightsModeLabel || "mode"})` : "Not active"}
                  </p>
                </div>
                <Switch checked={useDynamic} onCheckedChange={setUseDynamic} disabled={!dynamicWeightsActive} />
              </div>
            )}

            <div className="text-xs text-muted-foreground flex items-start gap-2 p-2 bg-muted/30 rounded md:col-span-2">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>
                Baseline forecast only (no trades/injuries/streaming). Uses your imported team stats.
              </span>
            </div>
          </div>
        )}
      </Card>

      <Card className="gradient-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold">{effectiveFocusTeam} — Forecast Summary</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Projected Record</p>
            <p className="font-display font-bold text-lg">
              {focusTeamSummary.matchWins}-{focusTeamSummary.matchLosses}-{focusTeamSummary.matchTies}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Category W-L</p>
            <p className="font-display font-bold text-lg">
              {focusTeamSummary.totalCatWins}-{focusTeamSummary.totalCatLosses}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Remaining Matchups</p>
            <p className="font-display font-bold text-lg">{futureMatchups.length}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Avg Edge</p>
            <p
              className={cn(
                "font-display font-bold text-lg",
                focusTeamSummary.avgEdge >= 0 ? "text-stat-positive" : "text-stat-negative"
              )}
            >
              {focusTeamSummary.avgEdge >= 0 ? "+" : ""}
              {focusTeamSummary.avgEdge.toFixed(1)}%
            </p>
          </div>
        </div>
      </Card>

      <Card className="gradient-card border-border">
        <div className="p-4 border-b border-border">
          <h3 className="font-display font-bold">Future Matchups</h3>
          <p className="text-xs text-muted-foreground">Weeks after cutoff (unless you include completed)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="border-b border-border">
                <th className="text-left p-3 font-display">Week</th>
                <th className="text-left p-3 font-display">Opponent</th>
                <th className="text-center p-3 font-display">Predicted</th>
                <th className="text-left p-3 font-display">Swing Cats</th>
                <th className="text-center p-3 font-display">Edge</th>
                <th className="text-center p-3 font-display">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {futureMatchups.map((m, i) => (
                <tr
                  key={`${m.week}-${i}`}
                  className="border-b border-border/50 hover:bg-muted/20 cursor-pointer"
                  onClick={() => setSelectedMatchup(m)}
                >
                  <td className="p-3">
                    <div className="font-semibold">Wk {m.week}</div>
                    <div className="text-xs text-muted-foreground">{m.dateRange}</div>
                  </td>
                  <td className="p-3 font-medium">{m.opponent}</td>
                  <td className={cn("text-center p-3 font-bold", outcomeColor(m.wins, m.losses))}>{m.outcome}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {m.swingCategories.slice(0, 3).map((c, j) => (
                        <Badge key={j} variant="outline" className="text-xs">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className={cn("text-center p-3 font-semibold", m.edge >= 0 ? "text-stat-positive" : "text-stat-negative")}>
                    {m.edge >= 0 ? "+" : ""}
                    {m.edge.toFixed(1)}%
                  </td>
                  <td className="text-center p-3">
                    <Badge className={confidenceBadge(m.confidence)}>{m.confidence}</Badge>
                  </td>
                </tr>
              ))}

              {futureMatchups.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No future matchups found for {effectiveFocusTeam}. If this looks wrong, check the cutoff week and team mapping.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="gradient-card border-border">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold">Projected Final Standings</h3>
          </div>
          <p className="text-xs text-muted-foreground">Simulated remaining matchups</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="border-b border-border">
                <th className="text-center p-3 font-display w-[70px]">Proj</th>
                <th className="text-left p-3 font-display">Team</th>
                <th className="text-center p-3 font-display">Current</th>
                <th className="text-center p-3 font-display">+Proj</th>
                <th className="text-center p-3 font-display">Final</th>
                <th className="text-center p-3 font-display">Cat W%</th>
              </tr>
            </thead>
            <tbody>
              {projectedStandings.map((s, i) => {
                const isFocus = s.teamName.toLowerCase() === effectiveFocusTeam.toLowerCase();
                return (
                  <tr key={i} className={cn("border-b border-border/50", isFocus && "bg-primary/10 border-primary/30")}>
                    <td className="text-center p-3 font-bold text-primary">{s.projectedRank}</td>
                    <td className="p-3">
                      <span className={cn("font-medium", isFocus && "text-primary")}>{s.teamName}</span>
                      {isFocus && (
                        <Badge className="ml-2 text-[10px]" variant="outline">
                          Focus
                        </Badge>
                      )}
                    </td>
                    <td className="text-center p-3 text-muted-foreground">
                      {s.currentWins}-{s.currentLosses}-{s.currentTies}
                    </td>
                    <td className="text-center p-3">
                      <span className="text-stat-positive">+{s.projectedWins}</span>
                      {" / "}
                      <span className="text-stat-negative">+{s.projectedLosses}</span>
                      {s.projectedTies ? ` / +${s.projectedTies}` : ""}
                    </td>
                    <td className="text-center p-3 font-bold">
                      {s.totalWins}-{s.totalLosses}-{s.totalTies}
                    </td>
                    <td className="text-center p-3">
                      <span
                        className={cn(
                          s.categoryWinPct >= 0.55
                            ? "text-stat-positive"
                            : s.categoryWinPct < 0.45
                              ? "text-stat-negative"
                              : ""
                        )}
                      >
                        {(s.categoryWinPct * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!selectedMatchup} onOpenChange={() => setSelectedMatchup(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Week {selectedMatchup?.week}: vs {selectedMatchup?.opponent}
            </SheetTitle>
            <SheetDescription>{selectedMatchup?.dateRange}</SheetDescription>
          </SheetHeader>

          {selectedMatchup && (
            <div className="mt-6 space-y-6">
              <div className="text-center p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Predicted Outcome</p>
                <p className={cn("text-3xl font-display font-bold", outcomeColor(selectedMatchup.wins, selectedMatchup.losses))}>
                  {selectedMatchup.outcome}
                </p>
                <p className="text-sm mt-2">
                  Edge:{" "}
                  <span className={cn("font-semibold", selectedMatchup.edge >= 0 ? "text-stat-positive" : "text-stat-negative")}>
                    {selectedMatchup.edge >= 0 ? "+" : ""}
                    {selectedMatchup.edge.toFixed(1)}%
                  </span>
                </p>
              </div>

              <div>
                <h4 className="font-display font-semibold mb-3">Category Breakdown</h4>
                <div className="space-y-2">
                  {selectedMatchup.categoryResults.map((cat, i) => {
                    const catInfo = CATEGORIES.find((c) => c.key === cat.category);
                    const label = catInfo?.label || cat.category;
                    const format = catInfo?.format || "num";

                    return (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                        <div className="flex items-center gap-2">
                          {cat.winner === "my" ? (
                            <TrendingUp className="w-4 h-4 text-stat-positive" />
                          ) : cat.winner === "opp" ? (
                            <TrendingDown className="w-4 h-4 text-stat-negative" />
                          ) : (
                            <Minus className="w-4 h-4 text-yellow-500" />
                          )}
                          <span className="font-medium">{label}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className={cn(cat.winner === "my" && "text-stat-positive font-semibold")}>
                            {format === "pct" ? formatPct(cat.myValue) : cat.myValue.toFixed(1)}
                          </span>
                          <span className="text-muted-foreground">vs</span>
                          <span className={cn(cat.winner === "opp" && "text-stat-negative font-semibold")}>
                            {format === "pct" ? formatPct(cat.oppValue) : cat.oppValue.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="font-display font-semibold mb-2">Swing Categories</h4>
                <p className="text-sm text-muted-foreground mb-2">Closest margins — focus on these to flip the outcome.</p>
                <div className="flex flex-wrap gap-2">
                  {selectedMatchup.swingCategories.map((cat, i) => (
                    <Badge key={i} variant="secondary">
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
