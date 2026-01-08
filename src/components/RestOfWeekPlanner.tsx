import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RosterSlot, Player } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { normalizeNbaTeamCode, STANDARD_LINEUP_SLOTS } from "@/lib/scheduleAwareProjection";
import { cn } from "@/lib/utils";
import { CalendarDays, Users, ArrowUp, AlertCircle } from "lucide-react";

interface DayStats {
  dateStr: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  playersWithGames: number;
  maxSlots: number;
  startsUsed: number;
  overflow: number;
  unusedStarts: number;
}

interface RestOfWeekPlannerProps {
  roster: RosterSlot[];
  weekDates: Array<{
    dateStr: string;
    dayLabel: string;
    dateLabel: string;
    isToday: boolean;
  }>;
  gamesByDate: Map<string, NBAGame[]>;
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
  applyInjuryMultipliers?: boolean;
}

// Check if player can fill a slot based on positions
function canFillSlot(positions: string[], eligiblePositions: string[]): boolean {
  const playerPositions = positions.map((p) => p.toUpperCase());
  return eligiblePositions.some((eligible) => playerPositions.includes(eligible));
}

// Get injury multiplier
function getInjuryMultiplier(status?: string, applyInjury: boolean = true): number {
  if (!applyInjury) return 1.0;
  if (!status) return 1.0;
  const s = status.toUpperCase().trim();
  if (s === "O" || s === "OUT" || s === "IR" || s === "SUSP" || s.includes("(O)")) return 0;
  if (s === "DTD" || s.includes("DTD")) return 0.6;
  if (s === "Q" || s === "QUESTIONABLE") return 0.7;
  if (s === "GTD" || s === "P" || s === "PROBABLE") return 0.85;
  return 1.0;
}

// Calculate starts for a single day using greedy slot filling
function calculateDayStarts(
  roster: RosterSlot[],
  games: NBAGame[],
  applyInjury: boolean
): { startsUsed: number; playersWithGames: number; maxSlots: number } {
  // Get players with games on this day (non-IR)
  const playersWithGames: { player: Player; injuryMult: number; positions: string[] }[] = [];
  
  for (const slot of roster) {
    if (slot.slotType === "ir") continue;
    const player = slot.player;
    if (!player.minutes || player.minutes <= 0) continue;
    
    const normalizedTeam = normalizeNbaTeamCode(player.nbaTeam);
    if (!normalizedTeam) continue;
    
    const hasGame = games.some(
      (g) => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam
    );
    if (!hasGame) continue;
    
    const injuryMult = getInjuryMultiplier(player.status, applyInjury);
    if (injuryMult === 0) continue;
    
    playersWithGames.push({
      player,
      injuryMult,
      positions: player.positions || [],
    });
  }
  
  // Greedy slot filling: prioritize more constrained players
  const playersWithEligibility = playersWithGames.map((p) => {
    let eligibleSlots = 0;
    for (const slot of STANDARD_LINEUP_SLOTS) {
      if (canFillSlot(p.positions, slot.eligiblePositions)) eligibleSlots++;
    }
    return { ...p, eligibleSlots };
  });
  
  playersWithEligibility.sort((a, b) => a.eligibleSlots - b.eligibleSlots);
  
  const usedSlots = new Set<string>();
  const usedPlayers = new Set<string>();
  let startsUsed = 0;
  
  for (const player of playersWithEligibility) {
    if (usedPlayers.has(player.player.id)) continue;
    
    for (const slotDef of STANDARD_LINEUP_SLOTS) {
      if (usedSlots.has(slotDef.slot)) continue;
      
      if (canFillSlot(player.positions, slotDef.eligiblePositions)) {
        startsUsed += player.injuryMult;
        usedSlots.add(slotDef.slot);
        usedPlayers.add(player.player.id);
        break;
      }
    }
  }
  
  return {
    startsUsed: Math.round(startsUsed * 10) / 10,
    playersWithGames: playersWithGames.length,
    maxSlots: STANDARD_LINEUP_SLOTS.length,
  };
}

export const RestOfWeekPlanner = ({
  roster,
  weekDates,
  gamesByDate,
  selectedDateStr,
  onSelectDate,
  applyInjuryMultipliers = true,
}: RestOfWeekPlannerProps) => {
  // Calculate stats for each day
  const dayStats = useMemo((): DayStats[] => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    
    return weekDates.map((wd) => {
      const games = gamesByDate.get(wd.dateStr) || [];
      const isPast = wd.dateStr < todayStr;
      
      const { startsUsed, playersWithGames, maxSlots } = isPast
        ? { startsUsed: 0, playersWithGames: 0, maxSlots: 8 }
        : calculateDayStarts(roster, games, applyInjuryMultipliers);
      
      const overflow = Math.max(0, playersWithGames - maxSlots);
      const unusedStarts = Math.max(0, maxSlots - Math.ceil(startsUsed));
      
      return {
        dateStr: wd.dateStr,
        dayLabel: wd.dayLabel,
        dateLabel: wd.dateLabel,
        isToday: wd.dateStr === todayStr,
        isPast,
        playersWithGames,
        maxSlots,
        startsUsed,
        overflow,
        unusedStarts: isPast ? 0 : (playersWithGames < maxSlots ? unusedStarts : 0),
      };
    });
  }, [weekDates, gamesByDate, roster, applyInjuryMultipliers]);
  
  // Calculate totals
  const totals = useMemo(() => {
    const nonPast = dayStats.filter((d) => !d.isPast);
    return {
      totalStarts: nonPast.reduce((sum, d) => sum + d.startsUsed, 0),
      totalMaxSlots: nonPast.reduce((sum, d) => sum + d.maxSlots, 0),
      totalOverflow: nonPast.reduce((sum, d) => sum + d.overflow, 0),
      totalUnused: nonPast.reduce((sum, d) => sum + d.unusedStarts, 0),
      daysRemaining: nonPast.length,
    };
  }, [dayStats]);
  
  return (
    <Card className="gradient-card border-border p-3">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h4 className="font-display font-bold text-xs">Rest of Week Planner</h4>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] ml-auto cursor-help">
                {totals.totalStarts.toFixed(0)} / {totals.totalMaxSlots} starts
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[200px] text-xs">
              <p>Projected starts remaining this week (weighted by injury probability)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-1 mb-3">
        {dayStats.map((day) => (
          <TooltipProvider key={day.dateStr}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => !day.isPast && onSelectDate(day.dateStr)}
                  disabled={day.isPast}
                  className={cn(
                    "flex flex-col items-center p-1.5 rounded-md text-[10px] transition-all",
                    day.isPast && "opacity-40 cursor-not-allowed",
                    !day.isPast && "hover:bg-accent/10 cursor-pointer",
                    day.dateStr === selectedDateStr && "bg-accent/20 ring-1 ring-accent",
                    day.isToday && "border border-primary/50"
                  )}
                >
                  <span className={cn(
                    "font-semibold",
                    day.isToday && "text-primary"
                  )}>
                    {day.dayLabel}
                  </span>
                  <span className="text-muted-foreground">{day.dateLabel}</span>
                  
                  {!day.isPast && (
                    <div className="flex flex-col items-center mt-1 gap-0.5">
                      {/* Players with games / starts used */}
                      <span className={cn(
                        "font-mono font-medium",
                        day.playersWithGames > day.maxSlots ? "text-warning" : "text-foreground"
                      )}>
                        {day.playersWithGames > 0 ? `${Math.round(day.startsUsed)}/${day.maxSlots}` : "—"}
                      </span>
                      
                      {/* Overflow indicator */}
                      {day.overflow > 0 && (
                        <Badge 
                          variant="outline" 
                          className="text-[8px] px-1 py-0 border-warning text-warning h-4"
                        >
                          +{day.overflow}
                        </Badge>
                      )}
                      
                      {/* Unused indicator */}
                      {day.unusedStarts > 0 && day.playersWithGames > 0 && (
                        <Badge 
                          variant="outline" 
                          className="text-[8px] px-1 py-0 border-muted-foreground text-muted-foreground h-4"
                        >
                          {day.unusedStarts} empty
                        </Badge>
                      )}
                      
                      {/* No games */}
                      {day.playersWithGames === 0 && (
                        <span className="text-[8px] text-muted-foreground">no games</span>
                      )}
                    </div>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[180px]">
                <div className="text-xs space-y-1">
                  <p className="font-semibold">{day.dayLabel} {day.dateLabel}</p>
                  {day.isPast ? (
                    <p className="text-muted-foreground">Past day</p>
                  ) : (
                    <>
                      <p>
                        <Users className="w-3 h-3 inline mr-1" />
                        {day.playersWithGames} players with games
                      </p>
                      <p>
                        <ArrowUp className="w-3 h-3 inline mr-1" />
                        {Math.round(day.startsUsed)} / {day.maxSlots} starts filled
                      </p>
                      {day.overflow > 0 && (
                        <p className="text-warning">
                          ⚠ {day.overflow} overflow (benched due to slot limits)
                        </p>
                      )}
                      {day.unusedStarts > 0 && day.playersWithGames > 0 && (
                        <p className="text-muted-foreground">
                          {day.unusedStarts} slots unfilled (not enough eligible players)
                        </p>
                      )}
                    </>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
      
      {/* Summary stats */}
      <div className="flex items-center justify-between text-[10px] border-t border-border pt-2">
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-help">
                  <span className="text-muted-foreground">Starts:</span>
                  <span className="font-mono font-medium">{totals.totalStarts.toFixed(0)} / {totals.totalMaxSlots}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Projected starts / max possible ({totals.daysRemaining} days × 8 slots)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {totals.totalOverflow > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-warning cursor-help">
                    <AlertCircle className="w-3 h-3" />
                    <span>{totals.totalOverflow} overflow</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Players benched because too many have games on the same day</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {totals.totalUnused > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-muted-foreground cursor-help">
                    <span>{totals.totalUnused} unused</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Empty lineup slots (not enough players with games)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </Card>
  );
};
