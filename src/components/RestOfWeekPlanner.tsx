import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  RestOfWeekResult,
  DayStartsBreakdown,
  getTodayDateStr,
} from "@/lib/restOfWeekUtils";

interface DayStats {
  dateStr: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isElapsed: boolean;

  // You
  rosterGames: number; // candidates (players with games)
  optimizedStarts: number; // max starts (slot matching, integer)
  startsUsed: number; // after weekly cap clamp
  capOverflow: number; // starts blocked by weekly cap
  maxSlots: number;
  benchedGames: number; // candidates - optimizedStarts
  unusedSlots: number;

  // Opp
  oppRosterGames: number;
  oppOptimizedStarts: number;
  oppStartsUsed: number;
  oppCapOverflow: number;
  oppBenchedGames: number;
  oppUnusedSlots: number;

  // Edge (after cap)
  startEdge: number;

  // Debug hooks
  userDay?: DayStartsBreakdown;
  oppDay?: DayStartsBreakdown;
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
  /** Optional weekly starts cap (default 32) - kept for future use */
  weeklyStartsCap?: number;
}

// Check if we're in dev mode
const isDevMode = import.meta.env.DEV;

const DAILY_SLOTS = 8; // ESPN default (PG, SG, SF, PF, C, G, F, UTIL)

export const RestOfWeekPlanner = ({
  roster,
  opponentRoster = [],
  weekDates,
  gamesByDate,
  selectedDateStr,
  onSelectDate,
}: RestOfWeekPlannerProps) => {
  const [showDebug, setShowDebug] = useState(false);
  const hasOpponent = opponentRoster.length > 0;
  const todayStr = useMemo(() => getTodayDateStr(), []);

  const dateStrings = useMemo(() => weekDates.map((wd) => wd.dateStr), [weekDates]);

  // Compute both teams using the SAME pipeline
  const userStats: RestOfWeekResult = useMemo(() => {
    return computeRestOfWeekStarts({
      rosterPlayers: roster,
      matchupDates: dateStrings,
      gamesByDate,
    });
  }, [roster, dateStrings, gamesByDate]);

  const oppStats: RestOfWeekResult = useMemo(() => {
    if (!hasOpponent) {
      return {
        elapsedDays: 0,
        elapsedStarts: 0,
        elapsedPerDay: [],
        remainingDays: 0,
        remainingStarts: 0,
        remainingRosterGames: 0,
        remainingOverflow: 0,
        remainingUnusedSlots: 0,
        remainingPerDay: [],
        allPerDay: [],
        maxPossibleStarts: 0,
        todayIsElapsed: false,
      };
    }

    return computeRestOfWeekStarts({
      rosterPlayers: opponentRoster,
      matchupDates: dateStrings,
      gamesByDate,
    });
  }, [opponentRoster, dateStrings, gamesByDate, hasOpponent]);

  // Build day stats for grid display (no cap logic - just optimized starts per day)
  const dayStats = useMemo((): DayStats[] => {
    return weekDates.map((wd) => {
      const userDay = userStats.allPerDay.find((d) => d.date === wd.dateStr);
      const oppDay = oppStats.allPerDay.find((d) => d.date === wd.dateStr);

      // Check if this day is elapsed
      const isElapsed = userStats.elapsedPerDay.some((d) => d.date === wd.dateStr);

      const optimizedStarts = userDay?.startsUsed ?? 0;
      const oppOptimizedStarts = oppDay?.startsUsed ?? 0;

      return {
        dateStr: wd.dateStr,
        dayLabel: wd.dayLabel,
        dateLabel: wd.dateLabel,
        isToday: wd.dateStr === todayStr,
        isElapsed,

        rosterGames: userDay?.playersWithGame ?? 0,
        optimizedStarts,
        startsUsed: optimizedStarts, // No cap clamping - just pure optimized
        capOverflow: 0, // Not using cap in remaining view
        maxSlots: DAILY_SLOTS,
        benchedGames: userDay?.overflow ?? 0,
        unusedSlots: userDay?.unusedSlots ?? DAILY_SLOTS,

        oppRosterGames: oppDay?.playersWithGame ?? 0,
        oppOptimizedStarts,
        oppStartsUsed: oppOptimizedStarts,
        oppCapOverflow: 0,
        oppBenchedGames: oppDay?.overflow ?? 0,
        oppUnusedSlots: oppDay?.unusedSlots ?? DAILY_SLOTS,

        startEdge: optimizedStarts - oppOptimizedStarts,

        userDay,
        oppDay,
      };
    });
  }, [weekDates, userStats, oppStats, todayStr]);

  // Edge = you remaining starts - opp remaining starts
  const remainingEdge = useMemo(() => {
    if (!hasOpponent) return 0;
    return userStats.remainingStarts - oppStats.remainingStarts;
  }, [hasOpponent, userStats.remainingStarts, oppStats.remainingStarts]);

  return (
    <Card className="border-border/50 bg-card/50 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-xs">Rest of Week</h4>

        <Badge variant="outline" className="text-[9px] ml-auto">
          {userStats.remainingDays}d left
          {userStats.todayIsElapsed && <span className="ml-1">(today started)</span>}
        </Badge>
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-0.5 mb-3">
        {dayStats.map((day) => (
          <TooltipProvider key={day.dateStr}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => !day.isElapsed && onSelectDate(day.dateStr)}
                  disabled={day.isElapsed}
                  className={cn(
                    "flex flex-col items-center p-1 rounded text-[10px] transition-colors",
                    day.isElapsed && "opacity-40 cursor-not-allowed bg-muted/20",
                    !day.isElapsed && "hover:bg-muted/50 cursor-pointer",
                    day.dateStr === selectedDateStr && !day.isElapsed && "bg-primary/10 ring-1 ring-primary/30",
                    day.isToday && "border-b-2 border-primary"
                  )}
                >
                  <span
                    className={cn(
                      "font-medium",
                      day.isToday && "text-primary"
                    )}
                  >
                    {day.dayLabel}
                  </span>
                  <span className="text-[8px] text-muted-foreground">{day.dateLabel}</span>

                  <div className="flex flex-col items-center mt-0.5 gap-0">
                    {/* Starts: you / slots (left) vs opp (right) */}
                    {/* Optimized starts / slots (not cap-clamped for remaining view) */}
                    <span
                      className={cn(
                        "font-mono text-[10px]",
                        day.rosterGames > 0 ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {day.rosterGames > 0 ? `${day.optimizedStarts}/${day.maxSlots}` : "—"}
                    </span>

                    {/* Roster games today */}
                    {day.rosterGames > 0 && (
                      <span className="text-[8px] text-muted-foreground">
                        {day.rosterGames}g{hasOpponent && ` v ${day.oppRosterGames}g`}
                      </span>
                    )}

                    {/* Daily edge (based on optimized starts, not cap-clamped) */}
                    {hasOpponent && !day.isElapsed && day.rosterGames > 0 && (day.optimizedStarts - day.oppOptimizedStarts) !== 0 && (
                      <span
                        className={cn(
                          "text-[8px] font-medium",
                          (day.optimizedStarts - day.oppOptimizedStarts) > 0 ? "text-stat-positive" : "text-stat-negative"
                        )}
                      >
                        {(day.optimizedStarts - day.oppOptimizedStarts) > 0 ? "+" : ""}{day.optimizedStarts - day.oppOptimizedStarts}
                      </span>
                    )}
                  </div>
                </button>
              </TooltipTrigger>

              <TooltipContent side="bottom" className="max-w-[280px]">
                <div className="text-xs space-y-2">
                  <p className="font-semibold">{day.dayLabel} {day.dateLabel}</p>

                  {day.isElapsed ? (
                    <p className="text-muted-foreground">
                      {day.isToday ? "In Progress" : "Completed"} — {day.optimizedStarts} starts
                    </p>
                  ) : (
                    <>
                      <div className="border-b border-border pb-1">
                        <p className="text-primary font-medium">You</p>
                        <p>
                          Games: <span className="font-mono">{day.rosterGames}</span> · 
                          Max Starts: <span className="font-mono">{day.optimizedStarts}</span> · 
                          Benched: <span className="font-mono">{day.benchedGames}</span> · 
                          Unfilled: <span className="font-mono">{day.unusedSlots}</span>
                        </p>
                        <p>
                          Starts Used (cap): <span className="font-mono">{day.startsUsed}</span>
                          {day.capOverflow > 0 && (
                            <span className="text-warning"> · Cap Overflow: {day.capOverflow}</span>
                          )}
                        </p>
                        {day.userDay?.slotAssignments?.length ? (
                          <div className="mt-1">
                            <p className="text-muted-foreground">Assignments:</p>
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {day.userDay.slotAssignments.slice(0, 8).map((a, i) => (
                                <span key={i} className="bg-muted/30 px-1 rounded">
                                  {a.assignedSlot}:{a.playerName.split(" ").pop()}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {hasOpponent && (
                        <div>
                          <p className="text-stat-negative font-medium">Opponent</p>
                          <p>
                            Games: <span className="font-mono">{day.oppRosterGames}</span> · 
                            Max Starts: <span className="font-mono">{day.oppOptimizedStarts}</span> · 
                            Benched: <span className="font-mono">{day.oppBenchedGames}</span> · 
                            Unfilled: <span className="font-mono">{day.oppUnusedSlots}</span>
                          </p>
                          <p>
                            Starts Used (cap): <span className="font-mono">{day.oppStartsUsed}</span>
                            {day.oppCapOverflow > 0 && (
                              <span className="text-warning"> · Cap Overflow: {day.oppCapOverflow}</span>
                            )}
                          </p>
                          {day.oppDay?.slotAssignments?.length ? (
                            <div className="mt-1">
                              <p className="text-muted-foreground">Assignments:</p>
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {day.oppDay.slotAssignments.slice(0, 8).map((a, i) => (
                                  <span key={i} className="bg-muted/30 px-1 rounded">
                                    {a.assignedSlot}:{a.playerName.split(" ").pop()}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
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

      {/* Summary - Remaining Starts Outlook */}
      <div className="space-y-2 text-[10px] border-t border-border/50 pt-2">
        {/* You */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-primary font-medium w-8">You</span>
            <span className="font-mono">
              <span className="font-semibold">{userStats.remainingStarts}</span>
              <span className="text-muted-foreground">/{userStats.maxPossibleStarts}</span>
            </span>
            <span className="text-muted-foreground">possible starts</span>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground cursor-help flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  {userStats.remainingRosterGames}g
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Roster games remaining: {userStats.remainingRosterGames}</p>
                <p className="text-xs">Possible starts (optimized): {userStats.remainingStarts}</p>
                <p className="text-xs">Unfilled slots: {userStats.remainingUnusedSlots}</p>
                <p className="text-xs">Overflow games: {userStats.remainingOverflow}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center justify-between text-muted-foreground">
          <span>{userStats.remainingUnusedSlots} unfilled slots</span>
          <span>{userStats.remainingOverflow} overflow games</span>
        </div>

        {/* Opponent */}
        {hasOpponent && (
          <>
            <div className="flex items-start justify-between gap-2 pt-1 border-t border-border/30">
              <div className="flex items-center gap-2">
                <span className="text-stat-negative font-medium w-8">Opp</span>
                <span className="font-mono">
                  <span className="font-semibold">{oppStats.remainingStarts}</span>
                  <span className="text-muted-foreground">/{oppStats.maxPossibleStarts}</span>
                </span>
                <span className="text-muted-foreground">possible starts</span>
              </div>
              <span className="text-muted-foreground">{oppStats.remainingRosterGames}g</span>
            </div>

            <div className="flex items-center justify-between text-muted-foreground">
              <span>{oppStats.remainingUnusedSlots} unfilled slots</span>
              <span>{oppStats.remainingOverflow} overflow games</span>
            </div>

            <div className="flex justify-end pt-1">
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-2",
                  remainingEdge > 0
                    ? "border-stat-positive/50 text-stat-positive bg-stat-positive/5"
                    : remainingEdge < 0
                      ? "border-stat-negative/50 text-stat-negative bg-stat-negative/5"
                      : "border-muted-foreground/30"
                )}
              >
                {remainingEdge > 0 ? "+" : ""}{remainingEdge} start edge (remaining)
              </Badge>
            </div>
          </>
        )}
      </div>

      {/* Diagnosis Info - shows excluded players summary for both teams */}
      {hasOpponent && (() => {
        // Aggregate excluded players across all remaining days
        const userExcluded = userStats.remainingPerDay.flatMap(d => d.excludedPlayers);
        const oppExcluded = oppStats.remainingPerDay.flatMap(d => d.excludedPlayers);
        
        // Count by reason (deduplicated by playerId)
        const countByReason = (excluded: typeof userExcluded) => {
          const seen = new Set<string>();
          const counts = { ir: 0, missingTeam: 0, noPositions: 0, total: 0 };
          for (const p of excluded) {
            if (seen.has(p.playerId)) continue;
            seen.add(p.playerId);
            counts.total++;
            if (p.reason === "IR slot") counts.ir++;
            else if (p.reason === "Missing team") counts.missingTeam++;
            else if (p.reason === "No positions") counts.noPositions++;
          }
          return counts;
        };
        
        const userCounts = countByReason(userExcluded);
        const oppCounts = countByReason(oppExcluded);
        
        // Get unique excluded players by name for display
        const getUniqueExcluded = (excluded: typeof userExcluded) => {
          const seen = new Map<string, typeof excluded[0]>();
          for (const p of excluded) {
            if (!seen.has(p.playerId)) seen.set(p.playerId, p);
          }
          return Array.from(seen.values());
        };
        
        const oppUniqueExcluded = getUniqueExcluded(oppExcluded);
        const hasDiagnosticIssue = oppCounts.missingTeam > 0 || oppCounts.noPositions > 0;
        
        if (!hasDiagnosticIssue && oppCounts.total === 0) return null;
        
        return (
          <Collapsible className="mt-2 border-t border-border/50 pt-2">
            <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors w-full">
              <Info className="w-3 h-3" />
              <span>Diagnosis</span>
              {hasDiagnosticIssue && (
                <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0 border-warning text-warning">
                  {oppCounts.missingTeam + oppCounts.noPositions} issues
                </Badge>
              )}
              <ChevronDown className="w-3 h-3 ml-auto" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-2 bg-muted/10 rounded text-[9px] space-y-2">
                {/* User excluded summary */}
                <div>
                  <span className="text-primary font-medium">You:</span>{" "}
                  <span className="text-muted-foreground">
                    {userCounts.total === 0 ? "All players valid" : (
                      <>
                        {userCounts.ir > 0 && `${userCounts.ir} IR`}
                        {userCounts.missingTeam > 0 && `${userCounts.ir > 0 ? ", " : ""}${userCounts.missingTeam} missing team`}
                        {userCounts.noPositions > 0 && `${(userCounts.ir > 0 || userCounts.missingTeam > 0) ? ", " : ""}${userCounts.noPositions} no positions`}
                      </>
                    )}
                  </span>
                </div>
                
                {/* Opponent excluded summary */}
                <div>
                  <span className="text-stat-negative font-medium">Opp:</span>{" "}
                  <span className={cn("text-muted-foreground", hasDiagnosticIssue && "text-warning")}>
                    {oppCounts.total === 0 ? "All players valid" : (
                      <>
                        {oppCounts.ir > 0 && `${oppCounts.ir} IR`}
                        {oppCounts.missingTeam > 0 && `${oppCounts.ir > 0 ? ", " : ""}${oppCounts.missingTeam} missing team`}
                        {oppCounts.noPositions > 0 && `${(oppCounts.ir > 0 || oppCounts.missingTeam > 0) ? ", " : ""}${oppCounts.noPositions} no positions`}
                      </>
                    )}
                  </span>
                </div>
                
                {/* Show excluded opponent players if there are parsing issues */}
                {hasDiagnosticIssue && oppUniqueExcluded.length > 0 && (
                  <div className="mt-1 pt-1 border-t border-border/30">
                    <p className="text-muted-foreground mb-1">Opp excluded players:</p>
                    <div className="space-y-0.5 text-[8px]">
                      {oppUniqueExcluded
                        .filter(p => p.reason !== "IR slot")
                        .slice(0, 10)
                        .map((p) => (
                          <div key={p.playerId} className="flex items-center gap-1">
                            <span className="text-warning">⚠</span>
                            <span>{p.playerName}</span>
                            <span className="text-muted-foreground">
                              — {p.reason}
                              {p.reason === "Missing team" && p.nbaTeam && ` (got: "${p.nbaTeam}")`}
                              {p.reason === "No positions" && p.positions && ` (got: [${p.positions.join(",")}])`}
                            </span>
                          </div>
                        ))}
                      {oppUniqueExcluded.filter(p => p.reason !== "IR slot").length > 10 && (
                        <div className="text-muted-foreground">
                          ...and {oppUniqueExcluded.filter(p => p.reason !== "IR slot").length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })()}

      {/* Dev-only debug panel */}
      {isDevMode && (
        <Collapsible open={showDebug} onOpenChange={setShowDebug} className="mt-2">
          <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
            <Bug className="w-3 h-3" />
            <span>Planner Debug</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", showDebug && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-2 bg-muted/20 rounded text-[8px] font-mono space-y-3">
              <div className="text-muted-foreground mb-2">
                Today: {todayStr} | Elapsed: {userStats.todayIsElapsed ? "yes" : "no"}
              </div>
              
              <div className="space-y-2">
                {[
                  { label: "You", stats: userStats, color: "text-primary" },
                  ...(hasOpponent ? [{ label: "Opp", stats: oppStats, color: "text-stat-negative" }] : [])
                ].map((t) => (
                  <div key={t.label}>
                    <p className={cn("font-semibold mb-1", t.color)}>
                      {t.label} · remaining={t.stats.remainingDays}d · opt={t.stats.remainingStarts}/{t.stats.maxPossibleStarts} · unfilled={t.stats.remainingUnusedSlots} · overflow={t.stats.remainingOverflow}
                    </p>

                    <div className="space-y-1">
                      {t.stats.remainingPerDay.map((d) => (
                        <details key={d.date} className="bg-muted/10 rounded p-1">
                          <summary className="cursor-pointer select-none">
                            ○ {d.date} · cand={d.playersWithGame} · slots={d.slotsCount} · opt={d.startsUsed} · unfilled={d.unusedSlots} · overflow={d.overflow}
                          </summary>
                          <div className="mt-1 space-y-1">
                            <div className="text-muted-foreground">Assignments ({d.slotAssignments.length}):</div>
                            <div className="flex flex-wrap gap-0.5">
                              {d.slotAssignments.length ? (
                                d.slotAssignments.map((a, i) => (
                                  <span key={i} className="bg-muted/30 px-1 rounded">
                                    {a.assignedSlot}→{a.playerName}
                                  </span>
                                ))
                              ) : (
                                <span className="text-muted-foreground">(none)</span>
                              )}
                            </div>

                            <div className="text-muted-foreground mt-1">Excluded ({d.excludedPlayers.length}):</div>
                            <div className="space-y-0.5">
                              {d.excludedPlayers.length ? (
                                d.excludedPlayers.slice(0, 20).map((p) => (
                                  <div key={p.playerId}>
                                    {p.playerName}: {p.reason}
                                    {p.reason === "Missing team" && p.nbaTeam ? ` ("${p.nbaTeam}")` : ""}
                                  </div>
                                ))
                              ) : (
                                <div className="text-muted-foreground">(none)</div>
                              )}
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
};
