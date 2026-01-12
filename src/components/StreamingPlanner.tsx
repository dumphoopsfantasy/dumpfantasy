import { useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { cn } from "@/lib/utils";
import { Zap, ArrowRight, Calendar, TrendingUp, AlertTriangle } from "lucide-react";
import { ScheduleDate } from "@/hooks/useNBAUpcomingSchedule";

// Accept any player object with required streaming fields
interface StreamingPlannerProps {
  freeAgents: Array<{
    id: string;
    name: string;
    nbaTeam: string;
    positions?: string[];
    status?: string;
    cri?: number;
    wCri?: number;
  }>;
  scheduleDates: ScheduleDate[];
  includedDates: Set<string>;
  excludedDates: Set<string>;
  isTeamPlayingOnDate: (teamCode: string, dateStr: string) => boolean;
  onPlayerClick?: (player: { id: string; name: string; nbaTeam: string }) => void;
  useCris?: boolean;
}

interface StreamSuggestion {
  player: {
    id: string;
    name: string;
    nbaTeam: string;
    positions?: string[];
    status?: string;
    cri?: number;
    wCri?: number;
  };
  gamesOnSelected: number;
  playingDates: string[];
  score: number;
  reason: string;
}

export const StreamingPlanner = ({
  freeAgents,
  scheduleDates,
  includedDates,
  excludedDates,
  isTeamPlayingOnDate,
  onPlayerClick,
  useCris = true,
}: StreamingPlannerProps) => {
  // Calculate streaming suggestions
  const streamingSuggestions = useMemo(() => {
    if (includedDates.size === 0 || freeAgents.length === 0) return [];

    const suggestions: StreamSuggestion[] = [];
    const dateLabels = new Map<string, string>();
    scheduleDates.forEach(sd => dateLabels.set(sd.dateStr, sd.dayLabel));

    for (const player of freeAgents) {
      // Skip injured players
      if (player.status === 'O' || player.status === 'IR') continue;
      
      // Check if player plays on excluded dates
      let playsOnExcluded = false;
      for (const dateStr of excludedDates) {
        if (isTeamPlayingOnDate(player.nbaTeam, dateStr)) {
          playsOnExcluded = true;
          break;
        }
      }
      if (playsOnExcluded) continue;

      // Count games on included dates
      const playingDates: string[] = [];
      for (const dateStr of includedDates) {
        if (isTeamPlayingOnDate(player.nbaTeam, dateStr)) {
          playingDates.push(dateStr);
        }
      }

      if (playingDates.length === 0) continue;

      // Calculate score: games × CRI/wCRI value
      const criValue = useCris ? player.cri : player.wCri;
      const score = playingDates.length * criValue;

      // Generate reason
      const dateNames = playingDates.map(d => dateLabels.get(d) || d).join(', ');
      const reason = `${playingDates.length} game${playingDates.length > 1 ? 's' : ''} on ${dateNames}`;

      suggestions.push({
        player,
        gamesOnSelected: playingDates.length,
        playingDates,
        score,
        reason,
      });
    }

    // Sort by score (games × CRI)
    suggestions.sort((a, b) => b.score - a.score);

    return suggestions.slice(0, 10);
  }, [freeAgents, includedDates, excludedDates, scheduleDates, isTeamPlayingOnDate, useCris]);

  // Find mid-week swap candidates
  const swapPlan = useMemo(() => {
    if (streamingSuggestions.length < 2 || includedDates.size < 3) return null;

    const sortedDates = [...includedDates].sort();
    const midPoint = Math.floor(sortedDates.length / 2);
    const firstHalf = new Set(sortedDates.slice(0, midPoint));
    const secondHalf = new Set(sortedDates.slice(midPoint));

    // Find best player for first half
    let bestFirst: StreamSuggestion | null = null;
    let bestSecond: StreamSuggestion | null = null;

    for (const suggestion of streamingSuggestions) {
      const firstHalfGames = suggestion.playingDates.filter(d => firstHalf.has(d)).length;
      const secondHalfGames = suggestion.playingDates.filter(d => secondHalf.has(d)).length;

      if (!bestFirst && firstHalfGames > 0 && firstHalfGames >= secondHalfGames) {
        bestFirst = { ...suggestion, gamesOnSelected: firstHalfGames };
      }

      if (!bestSecond && secondHalfGames > 0 && secondHalfGames > firstHalfGames) {
        bestSecond = { ...suggestion, gamesOnSelected: secondHalfGames };
      }

      if (bestFirst && bestSecond) break;
    }

    if (bestFirst && bestSecond && bestFirst.player.id !== bestSecond.player.id) {
      return {
        firstAdd: bestFirst,
        midWeekSwap: bestSecond,
        swapDay: sortedDates[midPoint],
      };
    }

    return null;
  }, [streamingSuggestions, includedDates]);

  // Get date labels for display - MUST be before early returns
  const selectedDateLabels = useMemo(() => {
    const labels: string[] = [];
    for (const dateStr of includedDates) {
      const sd = scheduleDates.find(d => d.dateStr === dateStr);
      if (sd) labels.push(sd.dayLabel);
    }
    return labels.sort();
  }, [includedDates, scheduleDates]);

  const scoreLabel = useCris ? 'CRI' : 'wCRI';

  if (includedDates.size === 0) {
    return (
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Streaming Planner</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Select dates above to see streaming recommendations
        </p>
      </Card>
    );
  }

  if (streamingSuggestions.length === 0) {
    return (
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Streaming Planner</span>
        </div>
        <p className="text-xs text-muted-foreground">
          No free agents found playing on selected dates
        </p>
      </Card>
    );
  }

  return (
    <Card className="gradient-card border-border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Streaming Planner</span>
          <Badge variant="secondary" className="text-xs">
            {includedDates.size} day{includedDates.size > 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Filter explanation */}
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
        <p className="text-xs text-emerald-400">
          <span className="font-medium">Filter active:</span> Only showing players who play on{' '}
          <span className="font-semibold">all</span> of these days:{' '}
          <span className="font-semibold">{selectedDateLabels.join(' + ')}</span>
        </p>
      </div>

      {/* Swap Plan - if available */}
      {swapPlan && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <TrendingUp className="w-4 h-4" />
            Optimal 2-Player Stream
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* First add */}
            <button
              onClick={() => onPlayerClick?.(swapPlan.firstAdd.player)}
              className="flex items-center gap-2 bg-background/50 rounded-md px-2 py-1 hover:bg-background/80 transition-colors"
            >
              <PlayerPhoto name={swapPlan.firstAdd.player.name} size="xs" />
              <div className="text-left">
                <p className="text-xs font-medium truncate max-w-[100px]">
                  {swapPlan.firstAdd.player.name.split(' ').pop()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {swapPlan.firstAdd.gamesOnSelected}g start
                </p>
              </div>
            </button>

            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ArrowRight className="w-3 h-3" />
              <span>swap</span>
            </div>

            {/* Mid-week swap */}
            <button
              onClick={() => onPlayerClick?.(swapPlan.midWeekSwap.player)}
              className="flex items-center gap-2 bg-background/50 rounded-md px-2 py-1 hover:bg-background/80 transition-colors"
            >
              <PlayerPhoto name={swapPlan.midWeekSwap.player.name} size="xs" />
              <div className="text-left">
                <p className="text-xs font-medium truncate max-w-[100px]">
                  {swapPlan.midWeekSwap.player.name.split(' ').pop()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {swapPlan.midWeekSwap.gamesOnSelected}g finish
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Top Suggestions List */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground mb-2">
          Top pickups for selected dates (ranked by games × {scoreLabel})
        </p>
        
        {streamingSuggestions.slice(0, 5).map((suggestion, idx) => (
          <button
            key={suggestion.player.id}
            onClick={() => onPlayerClick?.(suggestion.player)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors text-left"
          >
            {/* Rank */}
            <span className={cn(
              "w-5 h-5 flex items-center justify-center rounded text-xs font-bold",
              idx === 0 && "bg-amber-500/20 text-amber-400",
              idx === 1 && "bg-slate-400/20 text-slate-300",
              idx === 2 && "bg-orange-500/20 text-orange-400",
              idx > 2 && "bg-secondary/50 text-muted-foreground"
            )}>
              {idx + 1}
            </span>

            {/* Player info */}
            <PlayerPhoto name={suggestion.player.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{suggestion.player.name}</span>
                {suggestion.player.status && suggestion.player.status !== 'healthy' && (
                  <Badge variant="outline" className="text-[10px] px-1 h-4 text-amber-400 border-amber-400/50">
                    {suggestion.player.status}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{suggestion.player.nbaTeam}</span>
                <span>•</span>
                <span>{suggestion.reason}</span>
              </div>
            </div>

            {/* Games & Score */}
            <div className="text-right">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">
                  {suggestion.gamesOnSelected}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {scoreLabel}: {suggestion.score.toFixed(0)}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Note */}
      <p className="text-[10px] text-muted-foreground flex items-start gap-1">
        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
        Score = games on selected dates × {scoreLabel}. Higher = more value for streaming.
      </p>
    </Card>
  );
};
