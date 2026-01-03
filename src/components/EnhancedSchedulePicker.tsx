import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Calendar, RefreshCw, X, Check, Ban, Lightbulb, Target, AlertTriangle } from "lucide-react";
import { ScheduleDate } from "@/hooks/useNBAUpcomingSchedule";
import { DateSelectionMode, CoverageGap, RecommendedCombo } from "@/hooks/useStreamingSchedule";

interface EnhancedSchedulePickerProps {
  scheduleDates: ScheduleDate[];
  dateSelections: Map<string, DateSelectionMode>;
  onToggleDate: (dateStr: string) => void;
  onClearAll: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  lastUpdated: Date | null;
  
  // Enhanced features
  coverageGaps: CoverageGap[];
  onFillGaps: () => void;
  recommendedCombos: RecommendedCombo[];
  onApplyCombo: (combo: RecommendedCombo) => void;
  includedCount: number;
  excludedCount: number;
}

export const EnhancedSchedulePicker = ({
  scheduleDates,
  dateSelections,
  onToggleDate,
  onClearAll,
  onRefresh,
  isLoading,
  lastUpdated,
  coverageGaps,
  onFillGaps,
  recommendedCombos,
  onApplyCombo,
  includedCount,
  excludedCount,
}: EnhancedSchedulePickerProps) => {
  if (isLoading && scheduleDates.length === 0) {
    return (
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-16 w-16" />
          <Skeleton className="h-16 w-16" />
          <Skeleton className="h-16 w-16" />
          <Skeleton className="h-16 w-16" />
          <Skeleton className="h-16 w-16" />
        </div>
      </Card>
    );
  }

  // Classify slates by size
  const getSlateLabel = (gameCount: number): { label: string; color: string } => {
    if (gameCount === 0) return { label: 'Off', color: 'text-muted-foreground' };
    if (gameCount <= 4) return { label: 'Light', color: 'text-emerald-500' };
    if (gameCount <= 8) return { label: 'Med', color: 'text-amber-500' };
    return { label: 'Heavy', color: 'text-red-500' };
  };

  const getSelectionStyle = (dateStr: string, hasGames: boolean) => {
    const mode = dateSelections.get(dateStr);
    
    if (!hasGames) {
      return "bg-muted/20 border-border/50 text-muted-foreground cursor-not-allowed opacity-50";
    }
    
    if (mode === 'include') {
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 ring-2 ring-emerald-500/30";
    }
    
    if (mode === 'exclude') {
      return "bg-red-500/20 text-red-400 border-red-500/50 ring-2 ring-red-500/30";
    }
    
    return "bg-secondary/30 border-border hover:bg-secondary/50 hover:border-primary/50";
  };

  const getSelectionIcon = (dateStr: string) => {
    const mode = dateSelections.get(dateStr);
    if (mode === 'include') return <Check className="w-3 h-3 text-emerald-400" />;
    if (mode === 'exclude') return <Ban className="w-3 h-3 text-red-400" />;
    return null;
  };

  return (
    <Card className="gradient-card border-border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Streaming Schedule</span>
          {(includedCount > 0 || excludedCount > 0) && (
            <div className="flex items-center gap-1">
              {includedCount > 0 && (
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  <Check className="w-3 h-3 mr-1" />
                  {includedCount}
                </Badge>
              )}
              {excludedCount > 0 && (
                <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/30">
                  <Ban className="w-3 h-3 mr-1" />
                  {excludedCount}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dateSelections.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearAll}
              className="h-7 text-xs gap-1 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="w-3 h-3" />
              Clear All
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-7 w-7"
          >
            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-xs text-muted-foreground">
        Click once to <span className="text-emerald-400">include</span>, twice to <span className="text-red-400">exclude</span>, third to clear
      </p>

      {/* Date Grid */}
      <div className="flex flex-wrap gap-2">
        <TooltipProvider>
          {scheduleDates.map((scheduleDate) => {
            const hasGames = scheduleDate.games.length > 0;
            const slateInfo = getSlateLabel(scheduleDate.games.length);
            const gap = coverageGaps.find(g => g.dateStr === scheduleDate.dateStr);
            
            return (
              <Tooltip key={scheduleDate.dateStr}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => hasGames && onToggleDate(scheduleDate.dateStr)}
                    disabled={!hasGames}
                    className={cn(
                      "relative flex flex-col items-center px-3 py-2 rounded-lg border transition-all min-w-[70px]",
                      getSelectionStyle(scheduleDate.dateStr, hasGames),
                      scheduleDate.isToday && !dateSelections.has(scheduleDate.dateStr) && "ring-2 ring-primary/30"
                    )}
                  >
                    {/* Selection indicator */}
                    {dateSelections.has(scheduleDate.dateStr) && (
                      <div className="absolute -top-1 -right-1">
                        {getSelectionIcon(scheduleDate.dateStr)}
                      </div>
                    )}
                    
                    {/* Coverage gap indicator */}
                    {gap && !dateSelections.has(scheduleDate.dateStr) && (
                      <div className="absolute -top-1 -left-1">
                        <Target className="w-3 h-3 text-amber-400" />
                      </div>
                    )}
                    
                    <span className="text-[10px] uppercase tracking-wider opacity-70">
                      {scheduleDate.dayLabel}
                    </span>
                    <span className="text-sm font-bold">{scheduleDate.dateLabel}</span>
                    
                    {hasGames ? (
                      <div className="flex flex-col items-center mt-0.5">
                        <span className="text-[10px]">
                          {scheduleDate.games.length} {scheduleDate.games.length === 1 ? 'game' : 'games'}
                        </span>
                        <span className={cn("text-[9px] font-medium", slateInfo.color)}>
                          {slateInfo.label}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] mt-0.5 opacity-50">No games</span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px]">
                  <div className="text-xs space-y-1">
                    <p className="font-medium">{scheduleDate.dayLabel} - {scheduleDate.dateLabel}</p>
                    {hasGames && (
                      <>
                        <p>{scheduleDate.games.length} games ({slateInfo.label} slate)</p>
                        <p className="text-muted-foreground">
                          {scheduleDate.teamCount} teams playing
                        </p>
                      </>
                    )}
                    {gap && (
                      <p className="text-amber-400">
                        ⚠️ {gap.unusedSlots} unused lineup slot{gap.unusedSlots > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Recommended Combos */}
      {recommendedCombos.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-muted-foreground">Quick Selections</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {recommendedCombos.slice(0, 5).map(combo => (
              <Tooltip key={combo.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onApplyCombo(combo)}
                    className={cn(
                      "h-7 text-xs gap-1",
                      combo.id === 'fill-gaps' && "border-amber-500/50 text-amber-400 hover:bg-amber-500/10",
                      combo.id === 'avoid-heavy' && "border-red-500/50 text-red-400 hover:bg-red-500/10"
                    )}
                  >
                    <span>{combo.icon}</span>
                    <span>{combo.label}</span>
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                      {combo.dates.length}
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">{combo.description}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* Legend and last updated */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            Include
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            Exclude
          </span>
          <span className="flex items-center gap-1">
            <Target className="w-3 h-3 text-amber-400" />
            Coverage gap
          </span>
        </div>
        {lastUpdated && (
          <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>
    </Card>
  );
};
