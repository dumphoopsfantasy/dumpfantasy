/**
 * Position Breakdown Module
 * 
 * Shows positional balance for the roster - compact inline display
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RosterSlot } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { normalizeNbaTeamCode } from "@/lib/scheduleAwareProjection";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type Position = typeof POSITIONS[number];

interface PositionBreakdownProps {
  roster: RosterSlot[];
  gamesByDate: Map<string, NBAGame[]>;
  matchupDates: string[];
  isLoading?: boolean;
}

/**
 * Count how many players are eligible for each position (excluding IR)
 */
function countPositionEligibility(roster: RosterSlot[]): Record<Position, number> {
  const counts: Record<Position, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  
  for (const slot of roster) {
    // Exclude IR players
    if (slot.slotType === "ir") continue;
    
    const positions = (slot.player.positions || []).map(p => p.toUpperCase());
    for (const pos of POSITIONS) {
      if (positions.includes(pos)) {
        counts[pos]++;
      }
    }
  }
  
  return counts;
}

/**
 * Count remaining games this week per position
 */
function countGamesThisWeek(
  roster: RosterSlot[],
  gamesByDate: Map<string, NBAGame[]>,
  matchupDates: string[]
): Record<Position, number> {
  const counts: Record<Position, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  
  // Get today's date string
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  // Only count remaining dates
  const remainingDates = matchupDates.filter(d => d >= todayStr);
  
  for (const slot of roster) {
    if (slot.slotType === "ir") continue;
    
    const player = slot.player;
    const normalizedTeam = player.nbaTeam ? normalizeNbaTeamCode(player.nbaTeam) : null;
    if (!normalizedTeam) continue;
    
    const positions = (player.positions || []).map(p => p.toUpperCase());
    
    // Count games for this player
    let gamesCount = 0;
    for (const dateStr of remainingDates) {
      const games = gamesByDate.get(dateStr) || [];
      const hasGame = games.some(g => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam);
      if (hasGame) gamesCount++;
    }
    
    // Add games to each eligible position
    for (const pos of POSITIONS) {
      if (positions.includes(pos)) {
        counts[pos] += gamesCount;
      }
    }
  }
  
  return counts;
}

export function PositionBreakdown({
  roster,
  gamesByDate,
  matchupDates,
  isLoading = false,
}: PositionBreakdownProps) {
  // Position counts (simple eligibility, no schedule)
  const positionCounts = useMemo(() => countPositionEligibility(roster), [roster]);
  
  // Games remaining per position this week
  const gamesPerPosition = useMemo(() => 
    countGamesThisWeek(roster, gamesByDate, matchupDates), 
    [roster, gamesByDate, matchupDates]
  );
  
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-2 bg-card/30 rounded-md border border-border">
        <Skeleton className="h-4 w-4" />
        <div className="flex gap-2">
          {POSITIONS.map(pos => (
            <Skeleton key={pos} className="h-5 w-12" />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-3 p-2 bg-card/30 rounded-md border border-border">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Users className="w-3.5 h-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">Depth</span>
      </div>
      
      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.map(pos => {
          const count = positionCounts[pos];
          const games = gamesPerPosition[pos];
          // Highlight if position is deep (4+) or shallow (1)
          const isDeep = count >= 4;
          const isShallow = count <= 1;
          
          return (
            <Badge
              key={pos}
              variant="outline"
              className={cn(
                "text-[10px] font-mono px-1.5 py-0 h-5 gap-1",
                isDeep && "border-primary/50 bg-primary/10 text-primary",
                isShallow && "border-destructive/50 bg-destructive/10 text-destructive"
              )}
              title={`${count} player${count !== 1 ? 's' : ''} eligible, ${games} games remaining this week`}
            >
              <span className="font-semibold">{pos}</span>
              <span className="opacity-70">{count}</span>
              {games > 0 && (
                <span className="text-muted-foreground text-[9px]">({games}g)</span>
              )}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
