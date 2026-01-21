/**
 * Schedule-Aware Summary Component
 * 
 * Compact summary of schedule-aware projection with collapsible full details.
 * Shows: verdict, games counts, schedule advantage - details hidden by default.
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { Calendar, ChevronDown, Users, AlertTriangle, Upload, Trophy, Target, Minus } from "lucide-react";
import { WeekProjectionResult, ProjectedStats, ProjectionError } from "@/lib/scheduleAwareProjection";
import { formatPct } from "@/lib/crisUtils";

interface ScheduleAwareSummaryProps {
  myProjection: WeekProjectionResult | null;
  myError: ProjectionError | null;
  oppProjection: WeekProjectionResult | null;
  oppError: ProjectionError | null;
  myTeamName: string;
  oppTeamName: string;
  remainingDays: number;
  isLoading?: boolean;
  oppRosterParseFailed?: boolean;
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

export function ScheduleAwareSummary({
  myProjection,
  myError,
  oppProjection,
  oppError,
  myTeamName,
  oppTeamName,
  remainingDays,
  isLoading,
  oppRosterParseFailed,
  onSyncOpponentRoster,
}: ScheduleAwareSummaryProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (isLoading) {
    return (
      <Card className="p-3 bg-muted/30 border-border">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="w-4 h-4 animate-pulse" />
          <span className="text-sm">Loading schedule data...</span>
        </div>
      </Card>
    );
  }

  if (!myProjection) {
    return null;
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

  const hasOpponent = !!oppProjection;

  const results = CATEGORIES.map(cat => {
    const myVal = getValue(myProjection.totalStats, cat.key);
    const oppVal = hasOpponent ? getValue(oppProjection!.totalStats, cat.key) : Number.NaN;
    const winner = hasOpponent
      ? determineWinner(myVal, oppVal, cat.lowerIsBetter, cat.isPct)
      : 'tie';
    return { ...cat, myVal, oppVal, winner };
  });

  const myWins = hasOpponent ? results.filter(r => r.winner === 'my').length : 0;
  const oppWins = hasOpponent ? results.filter(r => r.winner === 'opp').length : 0;
  const ties = hasOpponent ? results.filter(r => r.winner === 'tie').length : 0;

  // Calculate schedule advantage
  const myGames = myProjection.totalStartedGames;
  const oppGames = oppProjection?.totalStartedGames ?? 0;
  const gameAdvantage = myGames - oppGames;

  // Determine verdict icon
  const VerdictIcon = myWins > oppWins ? Trophy : myWins < oppWins ? Target : Minus;
  const verdictColor = myWins > oppWins ? 'text-stat-positive' : myWins < oppWins ? 'text-stat-negative' : 'text-muted-foreground';

  const formatValue = (val: number, isPct: boolean): string => {
    if (!Number.isFinite(val)) return '—';
    if (isPct) return formatPct(val);
    return Math.round(val).toString();
  };

  const getCellBg = (winner: 'my' | 'opp' | 'tie', forTeam: 'my' | 'opp'): string => {
    if (!hasOpponent) return 'bg-muted/20';
    if (winner === 'tie') return 'bg-muted/50';
    if (winner === forTeam) return 'bg-stat-positive/15';
    return 'bg-stat-negative/15';
  };

  return (
    <Card className="p-3 gradient-card border-primary/20">
      {/* Compact Summary Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold text-sm">Schedule-Aware</span>
        </div>

        {/* Key Metrics */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Users className="w-3 h-3" />
            You: {myGames.toFixed(1)}g
          </Badge>
          {hasOpponent && (
            <Badge variant="outline" className="text-[10px] gap-1">
              Opp: {oppGames.toFixed(1)}g
            </Badge>
          )}
          {gameAdvantage !== 0 && hasOpponent && (
            <Badge 
              variant="secondary" 
              className={cn("text-[10px]", gameAdvantage > 0 ? "text-stat-positive" : "text-stat-negative")}
            >
              {gameAdvantage > 0 ? '+' : ''}{gameAdvantage.toFixed(1)} games
            </Badge>
          )}
          {remainingDays > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {remainingDays}d left
            </Badge>
          )}
        </div>
      </div>

      {/* Verdict Line */}
      {hasOpponent ? (
        <p className="mt-2 text-sm flex items-center gap-2">
          <VerdictIcon className={cn("w-4 h-4", verdictColor)} />
          <span className="text-muted-foreground">Projected:</span>
          <span className="font-display font-semibold">
            <span className="text-stat-positive">{myWins}</span>–
            <span className="text-stat-negative">{oppWins}</span>–
            <span className="text-muted-foreground">{ties}</span>
          </span>
          <span className={cn("font-medium", verdictColor)}>
            {myWins > oppWins ? 'WIN' : myWins < oppWins ? 'LOSS' : 'TIE'}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Import opponent roster for head-to-head projection</span>
        </p>
      )}

      {/* Opponent Sync CTA if missing */}
      {oppError?.code === 'OPP_ROSTER_MISSING' && onSyncOpponentRoster && (
        <Button 
          variant="outline" 
          size="sm" 
          className="mt-2 h-7 text-xs"
          onClick={onSyncOpponentRoster}
        >
          <Upload className="w-3 h-3 mr-1" />
          Sync Opponent Roster
        </Button>
      )}

      {/* Parse Failed Alert */}
      {oppRosterParseFailed && (
        <Alert className="mt-2 border-amber-500/50 bg-amber-500/10 py-2">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <AlertDescription className="text-xs">
            Opponent roster paste missing STATS table.
          </AlertDescription>
        </Alert>
      )}

      {/* Collapsible Details */}
      <Collapsible open={showDetails} onOpenChange={setShowDetails} className="mt-2">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={cn("w-3 h-3 transition-transform", showDetails && "rotate-180")} />
            <span>{showDetails ? 'Hide' : 'Show'} details</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3">
          {/* Games Breakdown */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="gap-1">
              You: {myProjection.totalStartedGames.toFixed(1)} / {myProjection.totalPossibleGames.toFixed(1)} games
              {myProjection.totalPossibleGames - myProjection.totalStartedGames > 0.5 && (
                <span className="text-muted-foreground">(−{(myProjection.totalPossibleGames - myProjection.totalStartedGames).toFixed(1)})</span>
              )}
            </Badge>
            {oppProjection && (
              <Badge variant="outline" className="gap-1">
                Opp: {oppProjection.totalStartedGames.toFixed(1)} / {oppProjection.totalPossibleGames.toFixed(1)} games
              </Badge>
            )}
          </div>

          {/* Warnings */}
          {(myProjection.totalBenchOverflow > 0 || myProjection.emptySlotMissedGames > 0) && (
            <Alert className="border-amber-500/50 bg-amber-500/10 py-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              <AlertDescription className="text-[10px]">
                {myProjection.totalBenchOverflow > 0 && (
                  <span>You: {myProjection.totalBenchOverflow} benched (overflow) </span>
                )}
                {myProjection.emptySlotMissedGames > 0 && (
                  <span>You: {myProjection.emptySlotMissedGames} missed (empty slots)</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Category Grids */}
          <div className="grid md:grid-cols-2 gap-3">
            {/* My Team */}
            <Card className="gradient-card border-border p-2">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-display font-semibold text-xs text-stat-positive">{myTeamName}</h4>
              </div>
              <div className="grid grid-cols-9 gap-0.5 text-center">
                {results.map(cat => (
                  <div key={cat.key} className={cn("rounded px-0.5 py-0.5", getCellBg(cat.winner, 'my'))}>
                    <p className="text-[8px] text-muted-foreground">{cat.label}</p>
                    <p className="font-display font-bold text-[10px]">
                      {formatValue(cat.myVal, cat.isPct)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Opponent */}
            {oppProjection ? (
              <Card className="gradient-card border-border p-2">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-display font-semibold text-xs text-stat-negative">{oppTeamName}</h4>
                </div>
                <div className="grid grid-cols-9 gap-0.5 text-center">
                  {results.map(cat => (
                    <div key={cat.key} className={cn("rounded px-0.5 py-0.5", getCellBg(cat.winner, 'opp'))}>
                      <p className="text-[8px] text-muted-foreground">{cat.label}</p>
                      <p className="font-display font-bold text-[10px]">
                        {formatValue(cat.oppVal, cat.isPct)}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="gradient-card border-border p-2 flex items-center justify-center min-h-[60px]">
                <p className="text-[10px] text-muted-foreground">Opponent data unavailable</p>
              </Card>
            )}
          </div>

          {/* Player Breakdown */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                <ChevronDown className="w-2.5 h-2.5" />
                <span>Player breakdown ({myProjection.playerProjections.length} players)</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              <div className="space-y-0.5 text-[10px]">
                {myProjection.playerProjections
                  .filter(p => p.expectedStartedGames > 0)
                  .sort((a, b) => b.expectedStartedGames - a.expectedStartedGames)
                  .slice(0, 8)
                  .map(p => (
                    <div key={p.playerId} className="flex items-center justify-between py-0.5 px-1 rounded bg-muted/30">
                      <span className="font-medium truncate max-w-[120px]">{p.playerName}</span>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span>{p.expectedStartedGames.toFixed(1)}g</span>
                        {p.benchedGames > 0 && (
                          <span className="text-amber-600">({p.benchedGames}b)</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
