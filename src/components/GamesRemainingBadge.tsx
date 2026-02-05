/**
 * Games Remaining Badge Component
 * Shows remaining games for a player within the current matchup week.
 */

import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NBAGame } from "@/lib/nbaApi";
import { getPlayerRemainingGamesBadge, GamesRemainingInfo } from "@/lib/gamesRemainingUtils";
import { Calendar } from "lucide-react";

interface GamesRemainingBadgeProps {
  teamCode: string | undefined;
  weekDates: string[];
  gamesByDate: Map<string, NBAGame[]>;
  className?: string;
  compact?: boolean;
}

export const GamesRemainingBadge = memo(function GamesRemainingBadge({
  teamCode,
  weekDates,
  gamesByDate,
  className,
  compact = false,
}: GamesRemainingBadgeProps) {
  const badgeInfo = useMemo(() => {
    return getPlayerRemainingGamesBadge(teamCode, weekDates, gamesByDate);
  }, [teamCode, weekDates, gamesByDate]);

  if (!teamCode || badgeInfo.count === 0) {
    if (compact) return null;
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "text-[9px] px-1 py-0 text-muted-foreground/60 border-muted-foreground/30",
          className
        )}
      >
        —
      </Badge>
    );
  }

  const isToday = badgeInfo.isToday;
  const isLow = badgeInfo.count === 1 && !isToday;

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-[9px] px-1.5 py-0 gap-0.5",
        isToday && "bg-primary/20 text-primary border-primary/40",
        !isToday && badgeInfo.count >= 3 && "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
        !isToday && badgeInfo.count === 2 && "bg-amber-500/15 text-amber-400 border-amber-500/40",
        isLow && "bg-muted/30 text-muted-foreground border-muted-foreground/40",
        className
      )}
    >
      {!compact && <Calendar className="w-2.5 h-2.5" />}
      {badgeInfo.text}
    </Badge>
  );
});
