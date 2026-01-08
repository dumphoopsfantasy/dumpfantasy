import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RosterSlot } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronDown, Bug, Info } from "lucide-react";
import { 
  computeRestOfWeekStarts, 
  RestOfWeekStats,
  DayStartsBreakdown 
} from "@/lib/restOfWeekUtils";

interface DayStats {
  dateStr: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
  // My team
  rosterGames: number;       // Players with games
  startsUsed: number;        // Optimized starts
  maxSlots: number;
  overflow: number;
  unusedSlots: number;
  missingTeamIdCount: number;
  // Opponent
  oppRosterGames: number;
  oppStartsUsed: number;
  oppOverflow: number;
  oppMissingTeamIdCount: number;
  // Edge
  startEdge: number;
}

interface RestOfWeekPlannerProps {
  roster: RosterSlot[];
  opponentRoster?: RosterSlot[];
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

// Check if we're in dev mode
const isDevMode = import.meta.env.DEV;

export const RestOfWeekPlanner = ({
  roster,
  opponentRoster = [],
  weekDates,
  gamesByDate,
  selectedDateStr,
  onSelectDate,
  applyInjuryMultipliers = true,
}: RestOfWeekPlannerProps) => {
  const [showDebug, setShowDebug] = useState(false);
  const [assumeOpponentOptimizes, setAssumeOpponentOptimizes] = useState(true);
  const hasOpponent = opponentRoster.length > 0;
  
  const dateStrings = useMemo(() => weekDates.map(wd => wd.dateStr), [weekDates]);
  
  const injuryPolicy = useMemo(() => ({
    excludeOut: true,
    applyDTDMultiplier: applyInjuryMultipliers,
  }), [applyInjuryMultipliers]);
  
  // Compute user team stats using unified function
  const userStats: RestOfWeekStats = useMemo(() => {
    return computeRestOfWeekStarts({
      rosterPlayers: roster,
      matchupDates: dateStrings,
      gamesByDate,
      injuryPolicy,
    });
  }, [roster, dateStrings, gamesByDate, injuryPolicy]);
  
  // Compute opponent stats using SAME unified function
  const oppStats: RestOfWeekStats = useMemo(() => {
    if (!hasOpponent) {
      return {
        projectedStarts: 0,
        maxPossibleStarts: 0,
        unusedStarts: 0,
        overflowGames: 0,
        rosterGamesRemaining: 0,
        daysRemaining: 0,
        perDay: [],
      };
    }
    return computeRestOfWeekStarts({
      rosterPlayers: opponentRoster,
      matchupDates: dateStrings,
      gamesByDate,
      injuryPolicy,
    });
  }, [opponentRoster, dateStrings, gamesByDate, injuryPolicy, hasOpponent]);
  
  // Build day stats for grid display
  const dayStats = useMemo((): DayStats[] => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    
    return weekDates.map((wd) => {
      const isPast = wd.dateStr < todayStr;
      
      // Find the day breakdown from computed stats
      const userDay = userStats.perDay.find(d => d.date === wd.dateStr);
      const oppDay = oppStats.perDay.find(d => d.date === wd.dateStr);
      
      const userStarts = userDay?.startsUsed ?? 0;
      const oppStarts = oppDay?.startsUsed ?? 0;
      
      return {
        dateStr: wd.dateStr,
        dayLabel: wd.dayLabel,
        dateLabel: wd.dateLabel,
        isToday: wd.dateStr === todayStr,
        isPast,
        // User team
        rosterGames: userDay?.playersWithGame ?? 0,
        startsUsed: userStarts,
        maxSlots: 8,
        overflow: userDay?.overflow ?? 0,
        unusedSlots: userDay?.unusedSlots ?? 0,
        missingTeamIdCount: userDay?.missingTeamIdCount ?? 0,
        // Opponent
        oppRosterGames: oppDay?.playersWithGame ?? 0,
        oppStartsUsed: oppStarts,
        oppOverflow: oppDay?.overflow ?? 0,
        oppMissingTeamIdCount: oppDay?.missingTeamIdCount ?? 0,
        // Edge
        startEdge: Math.round(userStarts - oppStarts),
      };
    });
  }, [weekDates, userStats, oppStats]);
  
  // Calculate total start advantage
  const startAdvantage = Math.round(userStats.projectedStarts - oppStats.projectedStarts);
  
  return (
    <Card className="border-border/50 bg-card/50 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-xs">Rest of Week</h4>
        
        {/* Opponent optimization toggle */}
        {hasOpponent && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 ml-2">
                  <Switch
                    id="opp-optimize"
                    checked={assumeOpponentOptimizes}
                    onCheckedChange={setAssumeOpponentOptimizes}
                    className="h-3.5 w-6 data-[state=checked]:bg-primary"
                  />
                  <Label htmlFor="opp-optimize" className="text-[9px] text-muted-foreground cursor-pointer">
                    Opp optimizes
                  </Label>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs">
                <p><strong>ON:</strong> Assume opponent optimizes lineup</p>
                <p className="mt-1"><strong>OFF:</strong> Use their set lineup (may undercount)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        <Badge variant="outline" className="text-[9px] ml-auto">
          {userStats.daysRemaining}d left
        </Badge>
      </div>
      
      {/* 7-day grid - cleaner design */}
      <div className="grid grid-cols-7 gap-0.5 mb-3">
        {dayStats.map((day) => (
          <TooltipProvider key={day.dateStr}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => !day.isPast && onSelectDate(day.dateStr)}
                  disabled={day.isPast}
                  className={cn(
                    "flex flex-col items-center p-1 rounded text-[10px] transition-colors",
                    day.isPast && "opacity-30 cursor-not-allowed",
                    !day.isPast && "hover:bg-muted/50 cursor-pointer",
                    day.dateStr === selectedDateStr && "bg-primary/10 ring-1 ring-primary/30",
                    day.isToday && "border-b-2 border-primary"
                  )}
                >
                  {/* Day label */}
                  <span className={cn(
                    "font-medium",
                    day.isToday && "text-primary"
                  )}>
                    {day.dayLabel}
                  </span>
                  <span className="text-[8px] text-muted-foreground">{day.dateLabel}</span>
                  
                  {!day.isPast && (
                    <div className="flex flex-col items-center mt-0.5 gap-0">
                      {/* Starts / Slots */}
                      <span className={cn(
                        "font-mono text-[10px]",
                        day.rosterGames > 0 ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {day.rosterGames > 0 ? `${Math.round(day.startsUsed)}/${day.maxSlots}` : "—"}
                      </span>
                      
                      {/* Games available */}
                      {day.rosterGames > 0 && day.rosterGames !== Math.round(day.startsUsed) && (
                        <span className="text-[8px] text-muted-foreground">
                          {day.rosterGames}g
                        </span>
                      )}
                      
                      {/* Opponent starts */}
                      {hasOpponent && !day.isPast && day.oppRosterGames > 0 && (
                        <span className="text-[8px] text-muted-foreground">
                          vs {Math.round(day.oppStartsUsed)}
                        </span>
                      )}
                      
                      {/* Daily edge indicator */}
                      {hasOpponent && !day.isPast && day.rosterGames > 0 && day.startEdge !== 0 && (
                        <span className={cn(
                          "text-[8px] font-medium",
                          day.startEdge > 0 ? "text-stat-positive" : "text-stat-negative"
                        )}>
                          {day.startEdge > 0 ? "+" : ""}{day.startEdge}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <div className="text-xs space-y-1">
                  <p className="font-semibold">{day.dayLabel} {day.dateLabel}</p>
                  {day.isPast ? (
                    <p className="text-muted-foreground">Past</p>
                  ) : (
                    <>
                      <div className="border-b border-border pb-1 mb-1">
                        <p className="text-primary font-medium">You</p>
                        <p>{day.rosterGames} roster games → {Math.round(day.startsUsed)}/{day.maxSlots} starts</p>
                        {day.overflow > 0 && (
                          <p className="text-warning">{day.overflow} overflow</p>
                        )}
                      </div>
                      
                      {hasOpponent && (
                        <div>
                          <p className="text-stat-negative font-medium">Opponent</p>
                          <p>{day.oppRosterGames} roster games → {Math.round(day.oppStartsUsed)}/{day.maxSlots} starts</p>
                          {day.oppOverflow > 0 && (
                            <p className="text-warning">{day.oppOverflow} overflow</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
      
      {/* Summary - clean two-row layout */}
      <div className="space-y-1.5 text-[10px] border-t border-border/50 pt-2">
        {/* You row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-primary font-medium w-8">You</span>
            <span className="font-mono">
              <span className="font-semibold">{Math.round(userStats.projectedStarts)}</span>
              <span className="text-muted-foreground">/{userStats.maxPossibleStarts}</span>
            </span>
            <span className="text-muted-foreground">starts</span>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground cursor-help flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  {userStats.rosterGamesRemaining}g
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{userStats.rosterGamesRemaining} roster games remaining</p>
                <p className="text-xs text-muted-foreground">{Math.round(userStats.projectedStarts)} can be started (slot limits)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {/* Opponent row */}
        {hasOpponent && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-stat-negative font-medium w-8">Opp</span>
              <span className="font-mono">
                <span className="font-semibold">{Math.round(oppStats.projectedStarts)}</span>
                <span className="text-muted-foreground">/{oppStats.maxPossibleStarts}</span>
              </span>
              <span className="text-muted-foreground">starts</span>
            </div>
            <span className="text-muted-foreground">
              {oppStats.rosterGamesRemaining}g
            </span>
          </div>
        )}
        
        {/* Edge badge */}
        {hasOpponent && (
          <div className="flex justify-end pt-1">
            <Badge 
              variant="outline" 
              className={cn(
                "text-[9px] px-2",
                startAdvantage > 0 ? "border-stat-positive/50 text-stat-positive bg-stat-positive/5" : 
                startAdvantage < 0 ? "border-stat-negative/50 text-stat-negative bg-stat-negative/5" : 
                "border-muted-foreground/30"
              )}
            >
              {startAdvantage > 0 ? "+" : ""}{startAdvantage} start edge
            </Badge>
          </div>
        )}
      </div>
      
      {/* Dev-only debug panel */}
      {isDevMode && (
        <Collapsible open={showDebug} onOpenChange={setShowDebug} className="mt-2">
          <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
            <Bug className="w-3 h-3" />
            <span>Debug</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", showDebug && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-2 bg-muted/20 rounded text-[8px] font-mono space-y-3">
              {/* User team debug */}
              <div>
                <p className="font-semibold text-primary mb-1">You ({roster.length} roster)</p>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="p-0.5">Date</th>
                      <th className="p-0.5">Games</th>
                      <th className="p-0.5">Starts</th>
                      <th className="p-0.5">Over</th>
                      <th className="p-0.5">Empty</th>
                      <th className="p-0.5">NoID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userStats.perDay.map((day) => (
                      <tr key={day.date} className="border-b border-border/20">
                        <td className="p-0.5">{day.date.slice(5)}</td>
                        <td className="p-0.5">{day.playersWithGame}</td>
                        <td className="p-0.5 text-stat-positive">{day.startsUsed}</td>
                        <td className={cn("p-0.5", day.overflow > 0 && "text-warning")}>{day.overflow}</td>
                        <td className="p-0.5">{day.unusedSlots}</td>
                        <td className={cn("p-0.5", day.missingTeamIdCount > 0 && "text-stat-negative")}>
                          {day.missingTeamIdCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Opponent team debug */}
              {hasOpponent && (
                <div>
                  <p className="font-semibold text-stat-negative mb-1">
                    Opp ({opponentRoster.length} roster)
                    <span className="text-muted-foreground font-normal ml-1">
                      [{assumeOpponentOptimizes ? 'opt' : 'set'}]
                    </span>
                  </p>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="p-0.5">Date</th>
                        <th className="p-0.5">Games</th>
                        <th className="p-0.5">Starts</th>
                        <th className="p-0.5">Over</th>
                        <th className="p-0.5">Empty</th>
                        <th className="p-0.5">NoID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oppStats.perDay.map((day) => (
                        <tr key={day.date} className="border-b border-border/20">
                          <td className="p-0.5">{day.date.slice(5)}</td>
                          <td className="p-0.5">{day.playersWithGame}</td>
                          <td className="p-0.5 text-stat-positive">{day.startsUsed}</td>
                          <td className={cn("p-0.5", day.overflow > 0 && "text-warning")}>{day.overflow}</td>
                          <td className="p-0.5">{day.unusedSlots}</td>
                          <td className={cn("p-0.5", day.missingTeamIdCount > 0 && "text-stat-negative")}>
                            {day.missingTeamIdCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Slot assignments for first day */}
                  {oppStats.perDay[0]?.slotAssignments?.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-muted-foreground">Slots ({oppStats.perDay[0].date.slice(5)}):</p>
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {oppStats.perDay[0].slotAssignments.map((a, i) => (
                          <span key={i} className="bg-muted/30 px-1 rounded">
                            {a.assignedSlot}:{a.playerName.split(' ').pop()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Missing team IDs */}
                  {oppStats.perDay.some(d => d.missingTeamIdCount > 0) && (
                    <div className="mt-1.5 text-stat-negative">
                      <p>Missing IDs:</p>
                      {oppStats.perDay[0]?.playerDetails
                        .filter(p => !p.normalizedTeam && !p.filteredReason)
                        .slice(0, 5)
                        .map((p, i) => (
                          <span key={i} className="block">{p.name}: "{p.nbaTeam}"</span>
                        ))
                      }
                    </div>
                  )}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
};
