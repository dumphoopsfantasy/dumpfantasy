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
import { CalendarDays, Users, ArrowUp, AlertCircle, ChevronDown, Bug, Settings2 } from "lucide-react";
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
  playersWithGames: number;
  maxSlots: number;
  startsUsed: number;
  overflow: number;
  unusedStarts: number;
  missingTeamIdCount: number;
  // Opponent
  oppPlayersWithGames: number;
  oppStartsUsed: number;
  oppOverflow: number;
  oppMissingTeamIdCount: number;
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
      
      return {
        dateStr: wd.dateStr,
        dayLabel: wd.dayLabel,
        dateLabel: wd.dateLabel,
        isToday: wd.dateStr === todayStr,
        isPast,
        // User team
        playersWithGames: userDay?.playersWithGame ?? 0,
        maxSlots: 8,
        startsUsed: userDay?.startsUsed ?? 0,
        overflow: userDay?.overflow ?? 0,
        unusedStarts: userDay?.unusedSlots ?? 0,
        missingTeamIdCount: userDay?.missingTeamIdCount ?? 0,
        // Opponent
        oppPlayersWithGames: oppDay?.playersWithGame ?? 0,
        oppStartsUsed: oppDay?.startsUsed ?? 0,
        oppOverflow: oppDay?.overflow ?? 0,
        oppMissingTeamIdCount: oppDay?.missingTeamIdCount ?? 0,
      };
    });
  }, [weekDates, userStats, oppStats]);
  
  // Calculate start advantage
  const startAdvantage = userStats.projectedStarts - oppStats.projectedStarts;
  
  return (
    <Card className="gradient-card border-border p-3">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h4 className="font-display font-bold text-xs">Rest of Week Planner</h4>
        
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
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <p><strong>ON:</strong> Assume opponent will optimize their lineup to maximize starts (recommended for projections).</p>
                <p className="mt-1"><strong>OFF:</strong> Use opponent's currently-set lineup (may undercount if they haven't set future lineups).</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] ml-auto cursor-help">
                {userStats.daysRemaining} days left
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              <p>Projected starts = maximum lineup slots fillable by players with games, using position-based slot matching. Weighted by injury probability.</p>
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
                      {/* My team starts */}
                      <span className={cn(
                        "font-mono font-medium",
                        day.playersWithGames > day.maxSlots ? "text-warning" : "text-foreground"
                      )}>
                        {day.playersWithGames > 0 ? `${Math.round(day.startsUsed)}/${day.maxSlots}` : "—"}
                      </span>
                      
                      {/* Opponent starts (if available) */}
                      {hasOpponent && (
                        <span className={cn(
                          "font-mono text-[9px]",
                          day.oppPlayersWithGames > day.maxSlots ? "text-stat-negative/70" : "text-muted-foreground"
                        )}>
                          vs {day.oppPlayersWithGames > 0 ? Math.round(day.oppStartsUsed) : "—"}
                        </span>
                      )}
                      
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
              <TooltipContent side="bottom" className="max-w-[220px]">
                <div className="text-xs space-y-1">
                  <p className="font-semibold">{day.dayLabel} {day.dateLabel}</p>
                  {day.isPast ? (
                    <p className="text-muted-foreground">Past day</p>
                  ) : (
                    <>
                      <p className="font-medium text-primary">Your Team:</p>
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
                          ⚠ {day.overflow} overflow (benched)
                        </p>
                      )}
                      {day.unusedStarts > 0 && day.playersWithGames > 0 && (
                        <p className="text-muted-foreground">
                          {day.unusedStarts} slots unfilled
                        </p>
                      )}
                      {day.missingTeamIdCount > 0 && (
                        <p className="text-stat-negative text-[10px]">
                          ⚠ {day.missingTeamIdCount} players missing team ID
                        </p>
                      )}
                      
                      {hasOpponent && (
                        <>
                          <p className="font-medium text-stat-negative mt-2">Opponent:</p>
                          <p>
                            <Users className="w-3 h-3 inline mr-1" />
                            {day.oppPlayersWithGames} players with games
                          </p>
                          <p>
                            <ArrowUp className="w-3 h-3 inline mr-1" />
                            {Math.round(day.oppStartsUsed)} / {day.maxSlots} starts filled
                          </p>
                          {day.oppOverflow > 0 && (
                            <p className="text-warning">
                              ⚠ {day.oppOverflow} overflow
                            </p>
                          )}
                          {day.oppMissingTeamIdCount > 0 && (
                            <p className="text-stat-negative text-[10px]">
                              ⚠ {day.oppMissingTeamIdCount} players missing team ID
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
      
      {/* Summary stats - improved format: X / Y starts (Z unused) */}
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        {/* User team summary */}
        <div className="flex items-center justify-between text-[10px]">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1.5 cursor-help">
                  <span className="text-primary font-medium">You:</span>
                  <span className="font-mono font-semibold">
                    {userStats.projectedStarts.toFixed(0)} / {userStats.maxPossibleStarts}
                  </span>
                  <span className="text-muted-foreground">
                    starts ({userStats.unusedStarts.toFixed(0)} unused)
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[250px]">
                <div className="text-xs space-y-1">
                  <p className="font-semibold">Your Projected Starts</p>
                  <p><span className="font-mono">{userStats.projectedStarts.toFixed(0)}</span> projected starts remaining</p>
                  <p><span className="font-mono">{userStats.maxPossibleStarts}</span> max possible (8 slots × {userStats.daysRemaining} days)</p>
                  <p><span className="font-mono">{userStats.unusedStarts.toFixed(0)}</span> starts unused (empty slots)</p>
                  {userStats.overflowGames > 0 && (
                    <p className="text-warning"><span className="font-mono">{userStats.overflowGames}</span> overflow (benched due to slot limits)</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {userStats.overflowGames > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 text-warning cursor-help">
                    <AlertCircle className="w-3 h-3" />
                    <span>{userStats.overflowGames} overflow</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Players benched due to slot limits</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        
        {/* Opponent team summary */}
        {hasOpponent && (
          <div className="flex items-center justify-between text-[10px]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1.5 cursor-help">
                    <span className="text-stat-negative font-medium">Opp:</span>
                    <span className="font-mono font-semibold">
                      {oppStats.projectedStarts.toFixed(0)} / {oppStats.maxPossibleStarts}
                    </span>
                    <span className="text-muted-foreground">
                      starts ({oppStats.unusedStarts.toFixed(0)} unused)
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[250px]">
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">Opponent's Projected Starts</p>
                    <p><span className="font-mono">{oppStats.projectedStarts.toFixed(0)}</span> projected starts remaining</p>
                    <p><span className="font-mono">{oppStats.maxPossibleStarts}</span> max possible (8 slots × {oppStats.daysRemaining} days)</p>
                    <p><span className="font-mono">{oppStats.unusedStarts.toFixed(0)}</span> starts unused (empty slots)</p>
                    {oppStats.overflowGames > 0 && (
                      <p className="text-warning"><span className="font-mono">{oppStats.overflowGames}</span> overflow (benched due to slot limits)</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {/* Start advantage badge */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[9px] cursor-help",
                      startAdvantage > 0 ? "border-stat-positive text-stat-positive" : 
                      startAdvantage < 0 ? "border-stat-negative text-stat-negative" : 
                      "border-muted-foreground text-muted-foreground"
                    )}
                  >
                    {startAdvantage > 0 ? "+" : ""}{startAdvantage.toFixed(0)} edge
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">
                    {startAdvantage > 0 
                      ? `You have ${startAdvantage.toFixed(0)} more starts than opponent` 
                      : startAdvantage < 0 
                      ? `Opponent has ${Math.abs(startAdvantage).toFixed(0)} more starts than you`
                      : "Even start count with opponent"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
      
      {/* Dev-only debug panel */}
      {isDevMode && (
        <Collapsible open={showDebug} onOpenChange={setShowDebug} className="mt-2">
          <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
            <Bug className="w-3 h-3" />
            <span>Planner Debug</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", showDebug && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-2 bg-muted/30 rounded text-[9px] font-mono space-y-2">
              {/* User team debug */}
              <div>
                <p className="font-semibold text-primary mb-1">Your Team ({roster.length} players)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-1">Date</th>
                        <th className="p-1">w/Game</th>
                        <th className="p-1">Filtered</th>
                        <th className="p-1">Starts</th>
                        <th className="p-1">Overflow</th>
                        <th className="p-1">Unused</th>
                        <th className="p-1">Missing ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userStats.perDay.map((day) => (
                        <tr key={day.date} className="border-b border-border/50">
                          <td className="p-1">{day.date.slice(5)}</td>
                          <td className="p-1">{day.playersWithGame}</td>
                          <td className="p-1">{day.filteredOut || 0}</td>
                          <td className="p-1 text-stat-positive">{day.startsUsed}</td>
                          <td className={cn("p-1", day.overflow > 0 && "text-warning")}>{day.overflow}</td>
                          <td className={cn("p-1", day.unusedSlots > 0 && "text-muted-foreground")}>{day.unusedSlots}</td>
                          <td className={cn("p-1", day.missingTeamIdCount > 0 && "text-stat-negative")}>
                            {day.missingTeamIdCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Opponent team debug */}
              {hasOpponent && (
                <div>
                  <p className="font-semibold text-stat-negative mb-1">
                    Opponent ({opponentRoster.length} players) 
                    <span className="text-muted-foreground font-normal ml-1">
                      [{assumeOpponentOptimizes ? 'optimized' : 'actual set'}]
                    </span>
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="p-1">Date</th>
                          <th className="p-1">w/Game</th>
                          <th className="p-1">Filtered</th>
                          <th className="p-1">Starts</th>
                          <th className="p-1">Overflow</th>
                          <th className="p-1">Unused</th>
                          <th className="p-1">Missing ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oppStats.perDay.map((day) => (
                          <tr key={day.date} className="border-b border-border/50">
                            <td className="p-1">{day.date.slice(5)}</td>
                            <td className="p-1">{day.playersWithGame}</td>
                            <td className="p-1">{day.filteredOut || 0}</td>
                            <td className="p-1 text-stat-positive">{day.startsUsed}</td>
                            <td className={cn("p-1", day.overflow > 0 && "text-warning")}>{day.overflow}</td>
                            <td className={cn("p-1", day.unusedSlots > 0 && "text-muted-foreground")}>{day.unusedSlots}</td>
                            <td className={cn("p-1", day.missingTeamIdCount > 0 && "text-stat-negative")}>
                              {day.missingTeamIdCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Show slot assignments for first future day */}
                  {oppStats.perDay[0]?.slotAssignments && oppStats.perDay[0].slotAssignments.length > 0 && (
                    <div className="mt-2">
                      <p className="text-muted-foreground mb-1">Slot Assignments ({oppStats.perDay[0].date.slice(5)}):</p>
                      <div className="flex flex-wrap gap-1">
                        {oppStats.perDay[0].slotAssignments.map((a, i) => (
                          <Badge key={i} variant="outline" className="text-[8px] py-0">
                            {a.assignedSlot}: {a.playerName.split(' ').pop()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Show filtered out players */}
                  {oppStats.perDay[0]?.playerDetails && (
                    <div className="mt-2">
                      <p className="text-muted-foreground mb-1">Filtered Out:</p>
                      <div className="max-h-20 overflow-y-auto">
                        {oppStats.perDay[0].playerDetails
                          .filter(p => p.filteredReason)
                          .map((p, i) => (
                            <p key={i} className="text-[8px] text-stat-negative">
                              {p.name}: {p.filteredReason}
                            </p>
                          ))
                        }
                        {oppStats.perDay[0].playerDetails.filter(p => p.filteredReason).length === 0 && (
                          <p className="text-[8px] text-muted-foreground">None</p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Show missing player details if any */}
                  {oppStats.perDay.some(d => d.missingTeamIdCount > 0) && (
                    <div className="mt-2">
                      <p className="text-stat-negative mb-1">⚠ Missing Team ID:</p>
                      <div className="max-h-20 overflow-y-auto">
                        {oppStats.perDay[0]?.playerDetails
                          .filter(p => !p.normalizedTeam && !p.filteredReason)
                          .map((p, i) => (
                            <p key={i} className="text-[8px] text-muted-foreground">
                              {p.name}: nbaTeam="{p.nbaTeam || 'null'}"
                            </p>
                          ))
                        }
                      </div>
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
