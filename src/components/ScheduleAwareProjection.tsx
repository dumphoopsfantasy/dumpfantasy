/**
 * Schedule-Aware Projection Display Component
 * 
 * Shows projected week totals with started games, bench overflow, etc.
 * Displays clear error banners when opponent roster is missing or schedule mapping fails.
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { CalendarCheck, ChevronDown, Users, AlertTriangle, TrendingDown, Upload, XCircle } from "lucide-react";
import { WeekProjectionResult, ProjectedStats, ProjectionError } from "@/lib/scheduleAwareProjection";
import { formatPct } from "@/lib/crisUtils";

interface ScheduleAwareProjectionProps {
  myProjection: WeekProjectionResult | null;
  myError: ProjectionError | null;
  oppProjection: WeekProjectionResult | null;
  oppError: ProjectionError | null;
  myTeamName: string;
  oppTeamName: string;
  remainingDays: number;
  isLoading?: boolean;
  onSyncOpponentRoster?: () => void;
}

const CATEGORIES = [
  { key: 'fgPct', label: 'FG%', lowerIsBetter: false, isPct: true },
  { key: 'ftPct', label: 'FT%', lowerIsBetter: false, isPct: true },
  { key: 'threepm', label: '3PM', lowerIsBetter: false, isPct: false },
  { key: 'rebounds', label: 'REB', lowerIsBetter: false, isPct: false },
  { key: 'assists', label: 'AST', lowerIsBetter: false, isPct: false },
  { key: 'steals', label: 'STL', lowerIsBetter: false, isPct: false },
  { key: 'blocks', label: 'BLK', lowerIsBetter: false, isPct: false },
  { key: 'turnovers', label: 'TO', lowerIsBetter: true, isPct: false },
  { key: 'points', label: 'PTS', lowerIsBetter: false, isPct: false },
] as const;

type StatKey = typeof CATEGORIES[number]['key'];

export function ScheduleAwareProjection({
  myProjection,
  myError,
  oppProjection,
  oppError,
  myTeamName,
  oppTeamName,
  remainingDays,
  isLoading,
  onSyncOpponentRoster,
}: ScheduleAwareProjectionProps) {
  if (isLoading) {
    return (
      <Card className="p-4 bg-muted/30 border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarCheck className="w-4 h-4 animate-pulse" />
          <span className="text-sm">Loading schedule data...</span>
        </div>
      </Card>
    );
  }

  // Handle my team error
  if (myError) {
    return (
      <Alert className="border-destructive/50 bg-destructive/10">
        <XCircle className="h-4 w-4 text-destructive" />
        <AlertDescription className="text-sm">
          {myError.code === 'SCHEDULE_MAPPING_FAILED' 
            ? `Schedule mapping failed for your team: ${myError.validation?.unmappedPlayers.length || 0} players missing team mapping.`
            : myError.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!myProjection) {
    return (
      <Alert className="border-muted">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Schedule-aware projection requires roster data and NBA schedule. Import your roster first.
        </AlertDescription>
      </Alert>
    );
  }

  const getValue = (stats: ProjectedStats, key: StatKey): number => {
    return stats[key as keyof ProjectedStats] as number;
  };

  const determineWinner = (myVal: number, oppVal: number, lowerIsBetter: boolean, isPct: boolean): 'my' | 'opp' | 'tie' => {
    const epsilon = isPct ? 0.001 : 0.5;
    const diff = Math.abs(myVal - oppVal);
    if (diff < epsilon) return 'tie';
    if (lowerIsBetter) {
      return myVal < oppVal ? 'my' : 'opp';
    } else {
      return myVal > oppVal ? 'my' : 'opp';
    }
  };

  const results = CATEGORIES.map(cat => {
    const myVal = getValue(myProjection.totalStats, cat.key);
    const oppVal = oppProjection ? getValue(oppProjection.totalStats, cat.key) : 0;
    const winner = oppProjection ? determineWinner(myVal, oppVal, cat.lowerIsBetter, cat.isPct) : 'my';
    return { ...cat, myVal, oppVal, winner };
  });

  const myWins = results.filter(r => r.winner === 'my').length;
  const oppWins = results.filter(r => r.winner === 'opp').length;
  const ties = results.filter(r => r.winner === 'tie').length;

  const getCellBg = (winner: 'my' | 'opp' | 'tie', forTeam: 'my' | 'opp'): string => {
    if (winner === 'tie') return 'bg-muted/50';
    if (winner === forTeam) return 'bg-stat-positive/15';
    return 'bg-stat-negative/15';
  };

  const formatValue = (val: number, isPct: boolean): string => {
    if (isPct) return formatPct(val);
    return Math.round(val).toString();
  };

  // Warnings for schedule issues
  const hasWarnings = myProjection.emptySlotDays > 0 || myProjection.totalBenchOverflow > 0 ||
    (oppProjection && (oppProjection.emptySlotDays > 0 || oppProjection.totalBenchOverflow > 0));

  // Render opponent error banner
  const renderOpponentErrorBanner = () => {
    if (!oppError) return null;

    if (oppError.code === 'OPP_ROSTER_MISSING') {
      return (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <Upload className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm flex items-center justify-between gap-2 flex-wrap">
            <span>
              <strong>Opponent roster not imported.</strong> Sync to enable schedule-aware projection.
            </span>
            {onSyncOpponentRoster && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={onSyncOpponentRoster}
              >
                <Upload className="w-3 h-3 mr-1" />
                Sync Opponent Roster
              </Button>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    if (oppError.code === 'SCHEDULE_MAPPING_FAILED') {
      const unmappedCount = oppError.validation?.unmappedPlayers.length || 0;
      const unmappedNames = oppError.validation?.unmappedPlayers.slice(0, 3).map(p => p.name).join(', ') || '';
      return (
        <Alert className="border-destructive/50 bg-destructive/10">
          <XCircle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-sm">
            <strong>Opponent schedule mapping failed</strong> ({unmappedCount} players missing team mapping).
            {unmappedNames && <span className="text-muted-foreground"> Players: {unmappedNames}{unmappedCount > 3 ? '...' : ''}</span>}
          </AlertDescription>
        </Alert>
      );
    }

    if (oppError.code === 'NO_SCHEDULE_DATA') {
      return (
        <Alert className="border-muted">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            NBA schedule data not available for opponent projection.
          </AlertDescription>
        </Alert>
      );
    }

    return null;
  };

  return (
    <div className="space-y-3">
      {/* Schedule Stats Summary */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="gap-1">
          <Users className="w-3 h-3" />
          You: {myProjection.totalStartedGames.toFixed(1)} games
        </Badge>
        {oppProjection && (
          <Badge variant="outline" className="gap-1">
            <Users className="w-3 h-3" />
            Opp: {oppProjection.totalStartedGames.toFixed(1)} games
          </Badge>
        )}
        {oppError?.code === 'OPP_ROSTER_MISSING' && (
          <Badge variant="secondary" className="gap-1 text-amber-600">
            <AlertTriangle className="w-3 h-3" />
            Opp: Not imported
          </Badge>
        )}
        {myProjection.totalBenchOverflow > 0 && (
          <Badge variant="secondary" className="gap-1 text-amber-600">
            <TrendingDown className="w-3 h-3" />
            {myProjection.totalBenchOverflow} benched
          </Badge>
        )}
        {remainingDays > 0 && (
          <Badge variant="secondary" className="gap-1">
            {remainingDays} days left
          </Badge>
        )}
      </div>

      {/* Opponent Error Banner */}
      {renderOpponentErrorBanner()}

      {/* Schedule Warnings */}
      {hasWarnings && (
        <Alert className="border-amber-500/50 bg-amber-500/10 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-xs">
            <div className="flex flex-wrap gap-3">
              {myProjection.emptySlotDays > 0 && (
                <span>You: {myProjection.emptySlotDays} days with unfilled slots</span>
              )}
              {myProjection.totalBenchOverflow > 0 && (
                <span>You: {myProjection.totalBenchOverflow} games benched (overflow)</span>
              )}
              {oppProjection?.emptySlotDays > 0 && (
                <span>Opp: {oppProjection.emptySlotDays} days with unfilled slots</span>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Projection Grids */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* My Team */}
        <Card className="gradient-card border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-semibold text-sm text-stat-positive">{myTeamName}</h3>
            <span className="text-[10px] text-muted-foreground">
              {myProjection.totalStartedGames.toFixed(1)} games
            </span>
          </div>
          <div className="grid grid-cols-9 gap-1 text-center">
            {results.map(cat => (
              <div key={cat.key} className={cn("rounded px-0.5 py-1", getCellBg(cat.winner, 'my'))}>
                <p className="text-[9px] text-muted-foreground">{cat.label}</p>
                <p className="font-display font-bold text-xs">
                  {formatValue(cat.myVal, cat.isPct)}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Opponent */}
        {oppProjection ? (
          <Card className="gradient-card border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold text-sm text-stat-negative">{oppTeamName}</h3>
              <span className="text-[10px] text-muted-foreground">
                {oppProjection.totalStartedGames.toFixed(1)} games
              </span>
            </div>
            <div className="grid grid-cols-9 gap-1 text-center">
              {results.map(cat => (
                <div key={cat.key} className={cn("rounded px-0.5 py-1", getCellBg(cat.winner, 'opp'))}>
                  <p className="text-[9px] text-muted-foreground">{cat.label}</p>
                  <p className="font-display font-bold text-xs">
                    {formatValue(cat.oppVal, cat.isPct)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="gradient-card border-border p-3 flex items-center justify-center min-h-[80px]">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                {oppError?.code === 'OPP_ROSTER_MISSING' 
                  ? 'Import opponent roster to see projection'
                  : oppError?.code === 'SCHEDULE_MAPPING_FAILED'
                  ? 'Schedule mapping failed for opponent'
                  : 'Opponent data unavailable'}
              </p>
              {onSyncOpponentRoster && oppError?.code === 'OPP_ROSTER_MISSING' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2 h-7 text-xs"
                  onClick={onSyncOpponentRoster}
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Sync Opponent
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Projected Outcome */}
      {oppProjection && (
        <p className="text-center text-xs text-muted-foreground">
          Schedule-aware projection:{' '}
          <span className="font-display font-semibold text-foreground">
            {myTeamName}{' '}
            <span className="text-stat-positive">{myWins}</span>–
            <span className="text-stat-negative">{oppWins}</span>–
            <span className="text-muted-foreground">{ties}</span>{' '}
            {oppTeamName}
          </span>
        </p>
      )}

      {/* Player Breakdown (Collapsible) */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <ChevronDown className="w-3 h-3" />
            <span>Player breakdown ({myProjection.playerProjections.length} players)</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="space-y-1 text-xs">
            {myProjection.playerProjections
              .filter(p => p.expectedStartedGames > 0)
              .sort((a, b) => b.expectedStartedGames - a.expectedStartedGames)
              .slice(0, 10)
              .map(p => (
                <div key={p.playerId} className="flex items-center justify-between py-1 px-2 rounded bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.playerName}</span>
                    <span className="text-muted-foreground">{p.nbaTeam}</span>
                    {p.injuryMultiplier < 1 && (
                      <Badge variant="secondary" className="text-[9px] py-0">
                        {p.injuryMultiplier === 0 ? 'OUT' : `${Math.round(p.injuryMultiplier * 100)}%`}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{p.expectedStartedGames.toFixed(1)} games</span>
                    {p.benchedGames > 0 && (
                      <span className="text-amber-600">({p.benchedGames} benched)</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
