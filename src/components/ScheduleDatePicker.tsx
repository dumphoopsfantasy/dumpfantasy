import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Calendar, RefreshCw, X } from "lucide-react";
import { ScheduleDate } from "@/hooks/useNBAUpcomingSchedule";

interface ScheduleDatePickerProps {
  scheduleDates: ScheduleDate[];
  selectedDates: Set<string>;
  onToggleDate: (dateStr: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  lastUpdated: Date | null;
  compact?: boolean;
}

export const ScheduleDatePicker = ({
  scheduleDates,
  selectedDates,
  onToggleDate,
  onSelectAll,
  onClearAll,
  onRefresh,
  isLoading,
  lastUpdated,
  compact = false,
}: ScheduleDatePickerProps) => {
  if (isLoading && scheduleDates.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
        <Skeleton className="h-10 w-16" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <Calendar className="w-4 h-4 text-muted-foreground mr-1" />
        {scheduleDates.slice(0, 7).map((scheduleDate) => {
          const isSelected = selectedDates.has(scheduleDate.dateStr);
          const hasGames = scheduleDate.games.length > 0;
          
          return (
            <button
              key={scheduleDate.dateStr}
              onClick={() => onToggleDate(scheduleDate.dateStr)}
              disabled={!hasGames}
              className={cn(
                "px-2 py-1 text-xs rounded-md border transition-all",
                isSelected && hasGames
                  ? "bg-primary text-primary-foreground border-primary"
                  : hasGames
                    ? "bg-secondary/30 border-border hover:bg-secondary/50"
                    : "bg-muted/20 border-border/50 text-muted-foreground cursor-not-allowed opacity-50",
                scheduleDate.isToday && "ring-1 ring-primary/50"
              )}
            >
              <span className="font-medium">{scheduleDate.dayLabel}</span>
              {hasGames && (
                <span className="ml-1 text-[10px] opacity-70">
                  {scheduleDate.games.length}
                </span>
              )}
            </button>
          );
        })}
        {selectedDates.size > 0 && (
          <button
            onClick={onClearAll}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear date filter"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <Card className="gradient-card border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Games Schedule</span>
          {selectedDates.size > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selectedDates.size} {selectedDates.size === 1 ? 'day' : 'days'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            className="h-7 text-xs"
          >
            All Week
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-7 text-xs"
          >
            Clear
          </Button>
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
      
      <div className="flex flex-wrap gap-2">
        {scheduleDates.map((scheduleDate) => {
          const isSelected = selectedDates.has(scheduleDate.dateStr);
          const hasGames = scheduleDate.games.length > 0;
          
          return (
            <button
              key={scheduleDate.dateStr}
              onClick={() => onToggleDate(scheduleDate.dateStr)}
              disabled={!hasGames}
              className={cn(
                "flex flex-col items-center px-3 py-2 rounded-lg border transition-all min-w-[60px]",
                isSelected && hasGames
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : hasGames
                    ? "bg-secondary/30 border-border hover:bg-secondary/50 hover:border-primary/50"
                    : "bg-muted/20 border-border/50 text-muted-foreground cursor-not-allowed opacity-50",
                scheduleDate.isToday && !isSelected && "ring-2 ring-primary/30"
              )}
            >
              <span className="text-[10px] uppercase tracking-wider opacity-70">
                {scheduleDate.dayLabel}
              </span>
              <span className="text-sm font-bold">{scheduleDate.dateLabel}</span>
              {hasGames ? (
                <span className="text-[10px] mt-0.5">
                  {scheduleDate.games.length} {scheduleDate.games.length === 1 ? 'game' : 'games'}
                </span>
              ) : (
                <span className="text-[10px] mt-0.5 opacity-50">No games</span>
              )}
            </button>
          );
        })}
      </div>
      
      {lastUpdated && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </Card>
  );
};
