/**
 * Position Breakdown Module
 * 
 * Shows positional balance for the roster:
 * A) Position Counts - how many players eligible at each position
 * B) Slot Pressure - eligible vs startable vs overflow with Today/Rest of Week toggle
 */

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RosterSlot } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { 
  normalizeNbaTeamCode,
  STANDARD_LINEUP_SLOTS,
} from "@/lib/scheduleAwareProjection";
import { 
  computeRestOfWeekStarts,
  getTodayDateStr,
  categorizeDates,
} from "@/lib/restOfWeekUtils";
import { cn } from "@/lib/utils";
import { Users, TrendingUp, AlertTriangle } from "lucide-react";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type Position = typeof POSITIONS[number];

interface PositionBreakdownProps {
  roster: RosterSlot[];
  gamesByDate: Map<string, NBAGame[]>;
  matchupDates: string[];
  isLoading?: boolean;
}

interface PositionPressure {
  position: Position;
  eligibleWithGames: number;
  startable: number;
  overflow: number;
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
 * Check if a player's team has a game on a specific date
 */
function playerHasGameOnDate(
  nbaTeam: string | undefined,
  games: NBAGame[]
): boolean {
  if (!nbaTeam) return false;
  const normalizedTeam = normalizeNbaTeamCode(nbaTeam);
  if (!normalizedTeam) return false;
  return games.some(
    g => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam
  );
}

/**
 * Calculate slot pressure for a given scope (today or rest of week)
 * Uses the existing optimization engine to determine startable players
 */
function calculateSlotPressure(
  roster: RosterSlot[],
  gamesByDate: Map<string, NBAGame[]>,
  dates: string[]
): PositionPressure[] {
  // Compute optimization for the given dates
  const result = computeRestOfWeekStarts({
    rosterPlayers: roster,
    matchupDates: dates,
    gamesByDate,
    lineupSlots: STANDARD_LINEUP_SLOTS,
  });
  
  // Initialize counters
  const eligibleWithGames: Record<Position, Set<string>> = {
    PG: new Set(), SG: new Set(), SF: new Set(), PF: new Set(), C: new Set()
  };
  const startedPlayers: Record<Position, Set<string>> = {
    PG: new Set(), SG: new Set(), SF: new Set(), PF: new Set(), C: new Set()
  };
  
  // For each day, count eligible players with games
  for (const dateStr of dates) {
    const games = gamesByDate.get(dateStr) || [];
    
    for (const slot of roster) {
      if (slot.slotType === "ir") continue;
      
      const player = slot.player;
      if (!playerHasGameOnDate(player.nbaTeam, games)) continue;
      
      const positions = (player.positions || []).map(p => p.toUpperCase());
      for (const pos of POSITIONS) {
        if (positions.includes(pos)) {
          eligibleWithGames[pos].add(player.id);
        }
      }
    }
  }
  
  // Count started players from optimization results
  // Use remainingPerDay for remaining dates, combine elapsed+remaining for rest of week
  const allDays = result.allPerDay.filter(d => dates.includes(d.date));
  
  for (const day of allDays) {
    for (const assignment of day.slotAssignments) {
      const positions = (assignment.positions || []).map(p => p.toUpperCase());
      // Count player under their primary position (first position)
      const primaryPos = positions.find(p => POSITIONS.includes(p as Position)) as Position | undefined;
      if (primaryPos) {
        startedPlayers[primaryPos].add(assignment.playerId);
      }
    }
  }
  
  // Calculate pressure for each position
  return POSITIONS.map(pos => ({
    position: pos,
    eligibleWithGames: eligibleWithGames[pos].size,
    startable: startedPlayers[pos].size,
    overflow: Math.max(0, eligibleWithGames[pos].size - startedPlayers[pos].size),
  }));
}

export function PositionBreakdown({
  roster,
  gamesByDate,
  matchupDates,
  isLoading = false,
}: PositionBreakdownProps) {
  const [scope, setScope] = useState<"today" | "restOfWeek">("today");
  
  // Position counts (simple eligibility, no schedule)
  const positionCounts = useMemo(() => countPositionEligibility(roster), [roster]);
  
  // Calculate today and remaining dates
  const { todayDates, remainingDates } = useMemo(() => {
    const todayStr = getTodayDateStr();
    const { remaining } = categorizeDates(matchupDates, gamesByDate);
    
    // Today is either in remaining or already elapsed
    const todayInRemaining = remaining.includes(todayStr);
    
    return {
      todayDates: todayInRemaining ? [todayStr] : [],
      remainingDates: remaining,
    };
  }, [matchupDates, gamesByDate]);
  
  // Calculate slot pressure based on scope
  const slotPressure = useMemo(() => {
    if (gamesByDate.size === 0) return [];
    
    const dates = scope === "today" ? todayDates : remainingDates;
    if (dates.length === 0) return [];
    
    return calculateSlotPressure(roster, gamesByDate, dates);
  }, [roster, gamesByDate, todayDates, remainingDates, scope]);
  
  // Check if there's any pressure (overflow > 0)
  const hasPressure = slotPressure.some(p => p.overflow > 0);
  const totalOverflow = slotPressure.reduce((sum, p) => sum + p.overflow, 0);
  
  if (isLoading) {
    return (
      <Card className="gradient-card border-border p-4">
        <Skeleton className="h-6 w-40 mb-3" />
        <div className="flex gap-2">
          {POSITIONS.map(pos => (
            <Skeleton key={pos} className="h-6 w-14" />
          ))}
        </div>
      </Card>
    );
  }
  
  return (
    <Card className="gradient-card border-border p-4">
      {/* Section A: Position Counts */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display font-semibold text-sm">Position Breakdown</h3>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map(pos => (
            <Badge
              key={pos}
              variant="outline"
              className={cn(
                "text-xs font-mono px-2 py-1",
                positionCounts[pos] >= 4 && "border-primary/50 bg-primary/10"
              )}
            >
              {pos} <span className="ml-1 font-bold">{positionCounts[pos]}</span>
            </Badge>
          ))}
        </div>
      </div>
      
      {/* Section B: Slot Pressure */}
      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-display font-semibold text-sm">Slot Pressure</h3>
            {hasPressure && (
              <Badge variant="destructive" className="text-[10px] h-5">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {totalOverflow} overflow
              </Badge>
            )}
          </div>
          
          {/* Today / Rest of Week Toggle */}
          <div className="flex items-center gap-1 bg-secondary/30 rounded-md p-0.5">
            <Button
              variant={scope === "today" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-5 px-2 text-[10px]",
                scope === "today" && "bg-secondary"
              )}
              onClick={() => setScope("today")}
            >
              Today
            </Button>
            <Button
              variant={scope === "restOfWeek" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-5 px-2 text-[10px]",
                scope === "restOfWeek" && "bg-secondary"
              )}
              onClick={() => setScope("restOfWeek")}
            >
              Rest of Week
            </Button>
          </div>
        </div>
        
        {slotPressure.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {scope === "today" 
              ? "No games scheduled today"
              : "No schedule data available"
            }
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {slotPressure.map(({ position, eligibleWithGames, startable, overflow }) => (
              <div
                key={position}
                className={cn(
                  "flex items-center justify-between p-2 rounded-md bg-secondary/20",
                  overflow > 0 && "bg-destructive/10 border border-destructive/20"
                )}
              >
                <span className="font-mono font-bold text-xs">{position}</span>
                <div className="flex items-center gap-1 text-[10px]">
                  <span className="text-muted-foreground">{eligibleWithGames}</span>
                  <span className="text-muted-foreground/50">→</span>
                  <span className="text-primary font-semibold">{startable}</span>
                  {overflow > 0 && (
                    <>
                      <span className="text-muted-foreground/50">+</span>
                      <span className="text-destructive font-semibold">{overflow}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {slotPressure.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2">
            eligible → startable {hasPressure ? "+ overflow" : ""}
          </p>
        )}
      </div>
    </Card>
  );
}
