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
  /** Optional weekly starts cap (default 32) */
  weeklyStartsCap?: number;
}

// Check if we're in dev mode
const isDevMode = import.meta.env.DEV;

const DEFAULT_WEEKLY_STARTS_CAP = 32;
const DAILY_SLOTS = 8; // ESPN default (PG, SG, SF, PF, C, G, F, UTIL)

/**
 * Allocates starts across remaining days, respecting the weekly cap.
 * Returns: per-day starts used after cap, per-day cap overflow, and totals.
 */
function allocateWeeklyCap(
  remainingPerDay: DayStartsBreakdown[],
  startsUsedSoFar: number,
  weeklyCap: number
): {
  byDate: Record<
    string,
    {
      startsUsed: number;
      overflowByCap: number;
      remainingBefore: number;
      remainingAfter: number;
    }
  >;
  totals: {
    startsUsedSoFar: number;
    remainingCap: number;
    projectedAdditionalStarts: number;
    projectedFinalStarts: number;
    capOverflowTotal: number;
  };
} {
  const byDate: Record<
    string,
    {
      startsUsed: number;
      overflowByCap: number;
      remainingBefore: number;
      remainingAfter: number;
    }
  > = {};

  let remaining = Math.max(0, weeklyCap - startsUsedSoFar);
  let add = 0;
  let overflowTotal = 0;

  for (const d of [...remainingPerDay].sort((a, b) => a.date.localeCompare(b.date))) {
    const before = remaining;
    const used = Math.min(d.startsUsed, remaining);
    const overflow = Math.max(0, d.startsUsed - used);

    remaining -= used;
    add += used;
    overflowTotal += overflow;

    byDate[d.date] = {
      startsUsed: used,
      overflowByCap: overflow,
      remainingBefore: before,
      remainingAfter: remaining,
    };
  }

  return {
    byDate,
    totals: {
      startsUsedSoFar,
      remainingCap: Math.max(0, weeklyCap - startsUsedSoFar),
      projectedAdditionalStarts: add,
      projectedFinalStarts: Math.min(weeklyCap, startsUsedSoFar + add),
      capOverflowTotal: overflowTotal,
    },
  };
}

export const RestOfWeekPlanner = ({
  roster,
  opponentRoster = [],
  weekDates,
  gamesByDate,
  selectedDateStr,
  onSelectDate,
  weeklyStartsCap = DEFAULT_WEEKLY_STARTS_CAP,
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

  // Weekly cap allocation using elapsed starts (deterministic, no "unknown")
  const youCap = useMemo(
    () => allocateWeeklyCap(userStats.remainingPerDay, userStats.elapsedStarts, weeklyStartsCap),
    [userStats.remainingPerDay, userStats.elapsedStarts, weeklyStartsCap]
  );

  const oppCap = useMemo(
    () => allocateWeeklyCap(oppStats.remainingPerDay, oppStats.elapsedStarts, weeklyStartsCap),
    [oppStats.remainingPerDay, oppStats.elapsedStarts, weeklyStartsCap]
  );

  // Build day stats for grid display
  const dayStats = useMemo((): DayStats[] => {
    return weekDates.map((wd) => {
      const userDay = userStats.allPerDay.find((d) => d.date === wd.dateStr);
      const oppDay = oppStats.allPerDay.find((d) => d.date === wd.dateStr);

      // Check if this day is elapsed
      const isElapsed = userStats.elapsedPerDay.some((d) => d.date === wd.dateStr);

      const optimizedStarts = userDay?.startsUsed ?? 0;
      const startsUsed = isElapsed
        ? optimizedStarts // Elapsed days: use actual optimized starts (already counted)
        : (youCap.byDate[wd.dateStr]?.startsUsed ?? optimizedStarts);
      const capOverflow = isElapsed ? 0 : (youCap.byDate[wd.dateStr]?.overflowByCap ?? 0);

      const oppOptimizedStarts = oppDay?.startsUsed ?? 0;
      const oppStartsUsed = isElapsed
        ? oppOptimizedStarts
        : (oppCap.byDate[wd.dateStr]?.startsUsed ?? oppOptimizedStarts);
      const oppCapOverflow = isElapsed ? 0 : (oppCap.byDate[wd.dateStr]?.overflowByCap ?? 0);

      return {
        dateStr: wd.dateStr,
        dayLabel: wd.dayLabel,
        dateLabel: wd.dateLabel,
        isToday: wd.dateStr === todayStr,
        isElapsed,

        rosterGames: userDay?.playersWithGame ?? 0,
        optimizedStarts,
        startsUsed,
        capOverflow,
        maxSlots: DAILY_SLOTS,
        benchedGames: userDay?.overflow ?? 0,
        unusedSlots: userDay?.unusedSlots ?? DAILY_SLOTS,

        oppRosterGames: oppDay?.playersWithGame ?? 0,
        oppOptimizedStarts,
        oppStartsUsed,
        oppCapOverflow,
        oppBenchedGames: oppDay?.overflow ?? 0,
        oppUnusedSlots: oppDay?.unusedSlots ?? DAILY_SLOTS,

        startEdge: startsUsed - oppStartsUsed,

        userDay,
        oppDay,
      };
    });
  }, [weekDates, userStats, oppStats, youCap.byDate, oppCap.byDate, todayStr]);

  const projectedFinalEdge = useMemo(() => {
    if (!hasOpponent) return 0;
    return youCap.totals.projectedFinalStarts - oppCap.totals.projectedFinalStarts;
  }, [hasOpponent, youCap.totals.projectedFinalStarts, oppCap.totals.projectedFinalStarts]);

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
                    <span
                      className={cn(
                        "font-mono text-[10px]",
                        day.rosterGames > 0 ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {day.rosterGames > 0 ? `${day.startsUsed}/${day.maxSlots}` : "—"}
                    </span>

                    {/* Roster games today */}
                    {day.rosterGames > 0 && (
                      <span className="text-[8px] text-muted-foreground">
                        {day.rosterGames}g{hasOpponent && ` v ${day.oppRosterGames}g`}
                      </span>
                    )}

                    {/* Daily edge */}
                    {hasOpponent && !day.isElapsed && day.rosterGames > 0 && day.startEdge !== 0 && (
                      <span
                        className={cn(
                          "text-[8px] font-medium",
                          day.startEdge > 0 ? "text-stat-positive" : "text-stat-negative"
                        )}
                      >
                        {day.startEdge > 0 ? "+" : ""}{day.startEdge}
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

      {/* Summary */}
      <div className="space-y-2 text-[10px] border-t border-border/50 pt-2">
        {/* You */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-primary font-medium w-8">You</span>
            <span className="font-mono">
              <span className="font-semibold">
                {youCap.totals.startsUsedSoFar}
              </span>
              <span className="text-muted-foreground">/{weeklyStartsCap}</span>
            </span>
            <span className="text-muted-foreground">starts used</span>
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
                <p className="text-xs">Max startable (optimized): {userStats.remainingStarts}</p>
                <p className="text-xs">Benched (schedule overflow): {userStats.remainingOverflow}</p>
                <p className="text-xs">Unfilled slot opportunities: {userStats.remainingUnusedSlots}</p>
                <p className="text-xs">Cap overflow (blocked): {youCap.totals.capOverflowTotal}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">+ Projected additional:</span>
          <span className="font-mono font-semibold">{youCap.totals.projectedAdditionalStarts}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">= Projected final:</span>
          <span className="font-mono font-semibold">{youCap.totals.projectedFinalStarts}</span>
        </div>

        {/* Opponent */}
        {hasOpponent && (
          <>
            <div className="flex items-start justify-between gap-2 pt-1 border-t border-border/30">
              <div className="flex items-center gap-2">
                <span className="text-stat-negative font-medium w-8">Opp</span>
                <span className="font-mono">
                  <span className="font-semibold">{oppCap.totals.startsUsedSoFar}</span>
                  <span className="text-muted-foreground">/{weeklyStartsCap}</span>
                </span>
                <span className="text-muted-foreground">starts used</span>
              </div>
              <span className="text-muted-foreground">{oppStats.remainingRosterGames}g</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">+ Projected additional:</span>
              <span className="font-mono font-semibold">{oppCap.totals.projectedAdditionalStarts}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">= Projected final:</span>
              <span className="font-mono font-semibold">{oppCap.totals.projectedFinalStarts}</span>
            </div>

            <div className="flex justify-end pt-1">
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-2",
                  projectedFinalEdge > 0
                    ? "border-stat-positive/50 text-stat-positive bg-stat-positive/5"
                    : projectedFinalEdge < 0
                      ? "border-stat-negative/50 text-stat-negative bg-stat-negative/5"
                      : "border-muted-foreground/30"
                )}
              >
                {projectedFinalEdge > 0 ? "+" : ""}{projectedFinalEdge} start edge
              </Badge>
            </div>
          </>
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
            <div className="mt-2 p-2 bg-muted/20 rounded text-[8px] font-mono space-y-3">
              <div className="text-muted-foreground mb-2">
                Today: {todayStr} | Elapsed: {userStats.todayIsElapsed ? "yes" : "no"}
              </div>
              
              <div className="space-y-2">
                {[
                  { label: "You", stats: userStats, cap: youCap, color: "text-primary" },
                  ...(hasOpponent ? [{ label: "Opp", stats: oppStats, cap: oppCap, color: "text-stat-negative" }] : [])
                ].map((t) => (
                  <div key={t.label}>
                    <p className={cn("font-semibold mb-1", t.color)}>
                      {t.label} · elapsed={t.stats.elapsedDays}d/{t.stats.elapsedStarts}s · remaining={t.stats.remainingDays}d · cap={t.cap.totals.remainingCap}
                    </p>

                    <div className="space-y-1">
                      {t.stats.allPerDay.map((d) => {
                        const isElapsed = t.stats.elapsedPerDay.some((e) => e.date === d.date);
                        const capRow = t.cap.byDate[d.date];
                        const used = isElapsed ? d.startsUsed : (capRow?.startsUsed ?? d.startsUsed);
                        const overflowByCap = isElapsed ? 0 : (capRow?.overflowByCap ?? 0);

                        return (
                          <details key={d.date} className="bg-muted/10 rounded p-1">
                            <summary className="cursor-pointer select-none">
                              {isElapsed ? "✓" : "○"} {d.date} · cand={d.playersWithGame} · slots={d.slotsCount} · opt={d.startsUsed} · unfilled={d.unusedSlots} · benched={d.overflow} · used={used} · capOv={overflowByCap}
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
                        );
                      })}
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
