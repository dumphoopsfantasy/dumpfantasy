import { useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Calendar, 
  Upload, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Trophy, 
  Target, 
  Info, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
  ArrowRight,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeagueTeam } from '@/types/league';
import { useToast } from '@/hooks/use-toast';
import { usePersistedState } from '@/hooks/usePersistedState';
import { parseScheduleData, LeagueSchedule, getScheduleTeams } from '@/lib/scheduleParser';
import { 
  forecastTeamMatchups, 
  projectFinalStandings, 
  MatchupPrediction, 
  ProjectedStanding,
  ForecastSettings,
  CategoryResult
} from '@/lib/forecastEngine';
import { CATEGORIES, formatPct } from '@/lib/crisUtils';
import { CrisToggle } from '@/components/CrisToggle';

interface ScheduleForecastProps {
  leagueTeams: LeagueTeam[];
  userTeamName?: string;
}

interface TeamAliasMap {
  [scheduleTeamName: string]: string; // maps to leagueTeams name
}

export const ScheduleForecast = ({ leagueTeams, userTeamName = '' }: ScheduleForecastProps) => {
  const { toast } = useToast();
  
  // Persisted state
  const [schedule, setSchedule] = usePersistedState<LeagueSchedule | null>('dumphoops-schedule', null);
  const [aliases, setAliases] = usePersistedState<TeamAliasMap>('dumphoops-schedule-aliases', {});
  
  // Local state
  const [rawScheduleData, setRawScheduleData] = useState('');
  const [focusTeam, setFocusTeam] = useState(userTeamName);
  const [useCri, setUseCri] = useState(true);
  const [useDynamicWeights, setUseDynamicWeights] = useState(false);
  const [simulationScale, setSimulationScale] = useState(40);
  const [includeCompletedWeeks, setIncludeCompletedWeeks] = useState(false);
  const [startFromCurrentRecords, setStartFromCurrentRecords] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedMatchup, setSelectedMatchup] = useState<MatchupPrediction | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [unknownTeams, setUnknownTeams] = useState<string[]>([]);
  
  // Auto-detect user team if not provided
  const effectiveUserTeam = useMemo(() => {
    if (focusTeam) return focusTeam;
    
    // Try to find a team with "bane" in the name (or other patterns)
    const userTeam = leagueTeams.find(t => 
      t.name.toLowerCase().includes('bane') ||
      t.name.toLowerCase().includes('my team')
    );
    return userTeam?.name || leagueTeams[0]?.name || '';
  }, [focusTeam, leagueTeams]);
  
  // Get known team names for matching
  const knownTeamNames = useMemo(() => leagueTeams.map(t => t.name), [leagueTeams]);
  
  // Handle schedule parsing
  const handleParseSchedule = useCallback(() => {
    if (!rawScheduleData.trim()) {
      toast({
        title: 'No data',
        description: 'Please paste the ESPN League Schedule page',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      const result = parseScheduleData(rawScheduleData, knownTeamNames);
      setSchedule(result.schedule);
      setParseWarnings(result.warnings);
      setUnknownTeams(result.unknownTeams);
      
      if (result.schedule.matchups.length > 0) {
        toast({
          title: 'Schedule loaded',
          description: `Parsed ${result.schedule.matchups.length} matchups across ${new Set(result.schedule.matchups.map(m => m.week)).size} weeks`,
        });
      }
      
      setRawScheduleData('');
    } catch (error) {
      toast({
        title: 'Parse error',
        description: error instanceof Error ? error.message : 'Failed to parse schedule',
        variant: 'destructive',
      });
    }
  }, [rawScheduleData, knownTeamNames, toast, setSchedule]);
  
  // Build forecast settings
  const forecastSettings: ForecastSettings = useMemo(() => ({
    useCri,
    useWeightedCri: !useCri,
    simulationScale,
    includeCompletedWeeks,
    startFromCurrentRecords,
    completedWeeks: [], // TODO: Calculate based on current date
  }), [useCri, simulationScale, includeCompletedWeeks, startFromCurrentRecords]);
  
  // Generate predictions for focus team
  const futureMatchups = useMemo(() => {
    if (!schedule || !effectiveUserTeam || leagueTeams.length === 0) return [];
    return forecastTeamMatchups(schedule, effectiveUserTeam, leagueTeams, forecastSettings);
  }, [schedule, effectiveUserTeam, leagueTeams, forecastSettings]);
  
  // Project final standings
  const projectedStandings = useMemo(() => {
    if (!schedule || leagueTeams.length === 0) return [];
    return projectFinalStandings(schedule, leagueTeams, forecastSettings);
  }, [schedule, leagueTeams, forecastSettings]);
  
  // Summary stats for focus team
  const focusTeamSummary = useMemo(() => {
    const wins = futureMatchups.reduce((sum, m) => sum + (m.wins > m.losses ? 1 : 0), 0);
    const losses = futureMatchups.reduce((sum, m) => sum + (m.losses > m.wins ? 1 : 0), 0);
    const ties = futureMatchups.length - wins - losses;
    const totalCatWins = futureMatchups.reduce((sum, m) => sum + m.wins, 0);
    const totalCatLosses = futureMatchups.reduce((sum, m) => sum + m.losses, 0);
    
    return {
      matchWins: wins,
      matchLosses: losses,
      matchTies: ties,
      totalCatWins,
      totalCatLosses,
      avgEdge: futureMatchups.length > 0 
        ? futureMatchups.reduce((sum, m) => sum + m.edge, 0) / futureMatchups.length 
        : 0,
    };
  }, [futureMatchups]);
  
  // Handle alias mapping
  const handleAliasChange = (scheduleTeam: string, leagueTeam: string) => {
    setAliases(prev => ({
      ...prev,
      [scheduleTeam]: leagueTeam,
    }));
  };
  
  const handleReset = () => {
    setSchedule(null);
    setAliases({});
    setParseWarnings([]);
    setUnknownTeams([]);
    setRawScheduleData('');
  };
  
  const getOutcomeColor = (wins: number, losses: number) => {
    if (wins > losses) return 'text-stat-positive';
    if (losses > wins) return 'text-stat-negative';
    return 'text-yellow-500';
  };
  
  const getConfidenceColor = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high': return 'bg-stat-positive/20 text-stat-positive';
      case 'medium': return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400';
      case 'low': return 'bg-stat-negative/20 text-stat-negative';
    }
  };
  
  // Render empty state with paste box
  if (!schedule) {
    return (
      <Card className="gradient-card shadow-card p-6 border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Calendar className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">Schedule Forecast</h2>
            <p className="text-sm text-muted-foreground">
              Predict future matchups and project final standings
            </p>
          </div>
        </div>
        
        {leagueTeams.length === 0 && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Import league standings first (from the Standings tab) to enable matchup predictions.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Paste ESPN League Schedule</Label>
            <Textarea
              placeholder={`Copy the ENTIRE ESPN League Schedule page (Ctrl+A, Ctrl+C) and paste here.

Look for the page that shows:
Matchup 1 (Oct 21 - 26)
Away    Home
Team A  Team B
Team C  Team D
...`}
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
              <p className="font-semibold mb-1">How to find League Schedule:</p>
              <p>In ESPN Fantasy, go to League → Schedule. You'll see all matchups organized by week.</p>
            </div>
          </div>
        </div>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold">Schedule Forecast</h2>
          <p className="text-sm text-muted-foreground">
            {schedule.matchups.length} matchups parsed • Season {schedule.season}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={effectiveUserTeam} onValueChange={setFocusTeam}>
            <SelectTrigger className="w-[200px]">
              <Users className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {leagueTeams.map(team => (
                <SelectItem key={team.name} value={team.name}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <CrisToggle useCris={useCri} onChange={setUseCri} />
          
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Re-import
          </Button>
        </div>
      </div>
      
      {/* Warnings */}
      {parseWarnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {parseWarnings.map((w, i) => <p key={i}>{w}</p>)}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Unknown teams alias mapping */}
      {unknownTeams.length > 0 && (
        <Card className="p-4 border-yellow-500/50 bg-yellow-500/10">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
            <span className="font-semibold text-sm">Unknown Teams in Schedule</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            These teams from the schedule don't match imported standings. Map them to the correct teams:
          </p>
          <div className="space-y-2">
            {unknownTeams.map(schedTeam => (
              <div key={schedTeam} className="flex items-center gap-2">
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{schedTeam}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <Select value={aliases[schedTeam] || ''} onValueChange={(v) => handleAliasChange(schedTeam, v)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leagueTeams.map(team => (
                      <SelectItem key={team.name} value={team.name}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {/* Settings panel */}
      <Collapsible open={showSettings} onOpenChange={setShowSettings}>
        <CollapsibleContent>
          <Card className="p-4 space-y-4">
            <h3 className="font-display font-semibold text-sm">Forecast Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Use Dynamic Weights</Label>
                <Switch checked={useDynamicWeights} onCheckedChange={setUseDynamicWeights} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Include Completed Weeks</Label>
                <Switch checked={includeCompletedWeeks} onCheckedChange={setIncludeCompletedWeeks} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Start from Current Records</Label>
                <Switch checked={startFromCurrentRecords} onCheckedChange={setStartFromCurrentRecords} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground flex items-start gap-2 p-2 bg-muted/30 rounded">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>Projections are baseline estimates using current team stats. They don't account for trades, injuries, or streaming.</span>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>
      
      {/* Focus team summary */}
      <Card className="gradient-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold">{effectiveUserTeam} – Forecast Summary</h3>
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
            <p className={cn("font-display font-bold text-lg", focusTeamSummary.avgEdge >= 0 ? 'text-stat-positive' : 'text-stat-negative')}>
              {focusTeamSummary.avgEdge >= 0 ? '+' : ''}{focusTeamSummary.avgEdge.toFixed(1)}%
            </p>
          </div>
        </div>
      </Card>
      
      {/* Future matchups table */}
      <Card className="gradient-card border-border">
        <div className="p-4 border-b border-border">
          <h3 className="font-display font-bold">Future Matchups</h3>
          <p className="text-xs text-muted-foreground">Click a row for detailed breakdown</p>
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
              {futureMatchups.map((matchup, i) => (
                <tr 
                  key={i} 
                  className="border-b border-border/50 hover:bg-muted/20 cursor-pointer"
                  onClick={() => setSelectedMatchup(matchup)}
                >
                  <td className="p-3">
                    <div className="font-semibold">Wk {matchup.week}</div>
                    <div className="text-xs text-muted-foreground">{matchup.dateRange}</div>
                  </td>
                  <td className="p-3 font-medium">{matchup.opponent}</td>
                  <td className={cn("text-center p-3 font-bold", getOutcomeColor(matchup.wins, matchup.losses))}>
                    {matchup.outcome}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {matchup.swingCategories.slice(0, 3).map((cat, j) => (
                        <Badge key={j} variant="outline" className="text-xs">{cat}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className={cn("text-center p-3 font-semibold", matchup.edge >= 0 ? 'text-stat-positive' : 'text-stat-negative')}>
                    {matchup.edge >= 0 ? '+' : ''}{matchup.edge.toFixed(1)}%
                  </td>
                  <td className="text-center p-3">
                    <Badge className={getConfidenceColor(matchup.confidence)}>
                      {matchup.confidence}
                    </Badge>
                  </td>
                </tr>
              ))}
              {futureMatchups.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No future matchups found for {effectiveUserTeam}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      
      {/* Projected Final Standings */}
      <Card className="gradient-card border-border">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold">Projected Final Standings</h3>
          </div>
          <p className="text-xs text-muted-foreground">Based on simulating all remaining matchups</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="border-b border-border">
                <th className="text-center p-3 font-display w-[60px]">Proj Rank</th>
                <th className="text-left p-3 font-display">Team</th>
                <th className="text-center p-3 font-display">Current</th>
                <th className="text-center p-3 font-display">+ Projected</th>
                <th className="text-center p-3 font-display">Final</th>
                <th className="text-center p-3 font-display">Cat W%</th>
              </tr>
            </thead>
            <tbody>
              {projectedStandings.map((standing, i) => {
                const isUserTeam = standing.teamName.toLowerCase() === effectiveUserTeam.toLowerCase();
                return (
                  <tr 
                    key={i} 
                    className={cn(
                      "border-b border-border/50",
                      isUserTeam && "bg-primary/10 border-primary/30"
                    )}
                  >
                    <td className="text-center p-3 font-bold text-primary">{standing.projectedRank}</td>
                    <td className="p-3">
                      <span className={cn("font-medium", isUserTeam && "text-primary")}>
                        {standing.teamName}
                      </span>
                      {isUserTeam && <Badge className="ml-2 text-[10px]" variant="outline">You</Badge>}
                    </td>
                    <td className="text-center p-3 text-muted-foreground">
                      {standing.currentWins}-{standing.currentLosses}-{standing.currentTies}
                    </td>
                    <td className="text-center p-3">
                      <span className="text-stat-positive">+{standing.projectedWins}</span>
                      {' / '}
                      <span className="text-stat-negative">+{standing.projectedLosses}</span>
                    </td>
                    <td className="text-center p-3 font-bold">
                      {standing.totalWins}-{standing.totalLosses}-{standing.totalTies}
                    </td>
                    <td className="text-center p-3">
                      <span className={cn(
                        standing.categoryWinPct >= 0.55 ? 'text-stat-positive' : 
                        standing.categoryWinPct < 0.45 ? 'text-stat-negative' : ''
                      )}>
                        {(standing.categoryWinPct * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      
      {/* Matchup detail drawer */}
      <Sheet open={!!selectedMatchup} onOpenChange={() => setSelectedMatchup(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              Week {selectedMatchup?.week}: vs {selectedMatchup?.opponent}
            </SheetTitle>
            <SheetDescription>
              {selectedMatchup?.dateRange}
            </SheetDescription>
          </SheetHeader>
          
          {selectedMatchup && (
            <div className="mt-6 space-y-6">
              {/* Outcome summary */}
              <div className="text-center p-4 bg-muted/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Predicted Outcome</p>
                <p className={cn("text-3xl font-display font-bold", getOutcomeColor(selectedMatchup.wins, selectedMatchup.losses))}>
                  {selectedMatchup.outcome}
                </p>
                <p className="text-sm mt-2">
                  Edge: <span className={cn("font-semibold", selectedMatchup.edge >= 0 ? 'text-stat-positive' : 'text-stat-negative')}>
                    {selectedMatchup.edge >= 0 ? '+' : ''}{selectedMatchup.edge.toFixed(1)}%
                  </span>
                </p>
              </div>
              
              {/* Category breakdown */}
              <div>
                <h4 className="font-display font-semibold mb-3">Category Breakdown</h4>
                <div className="space-y-2">
                  {selectedMatchup.categoryResults.map((cat, i) => {
                    const catInfo = CATEGORIES.find(c => c.key === cat.category);
                    const label = catInfo?.label || cat.category;
                    const format = catInfo?.format || 'num';
                    
                    return (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                        <div className="flex items-center gap-2">
                          {cat.winner === 'my' ? (
                            <TrendingUp className="w-4 h-4 text-stat-positive" />
                          ) : cat.winner === 'opp' ? (
                            <TrendingDown className="w-4 h-4 text-stat-negative" />
                          ) : (
                            <Minus className="w-4 h-4 text-yellow-500" />
                          )}
                          <span className="font-medium">{label}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className={cn(cat.winner === 'my' && 'text-stat-positive font-semibold')}>
                            {format === 'pct' ? formatPct(cat.myValue) : cat.myValue.toFixed(1)}
                          </span>
                          <span className="text-muted-foreground">vs</span>
                          <span className={cn(cat.winner === 'opp' && 'text-stat-negative font-semibold')}>
                            {format === 'pct' ? formatPct(cat.oppValue) : cat.oppValue.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Swing categories */}
              <div>
                <h4 className="font-display font-semibold mb-2">Swing Categories</h4>
                <p className="text-sm text-muted-foreground mb-2">
                  Closest margins – focus on these to flip the outcome
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedMatchup.swingCategories.map((cat, i) => (
                    <Badge key={i} variant="secondary">{cat}</Badge>
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
