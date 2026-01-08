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
  RestOfWeekStats,
  DayStartsBreakdown,
} from "@/lib/restOfWeekUtils";

interface DayStats {
  dateStr: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;

  // You
  rosterGames: number; // candidates (players with games)
  optimizedStarts: number; // max starts (slot matching)
  startsUsed: number; // after weekly cap clamp (if cap known)
  capOverflow: number; // starts blocked by weekly cap
  maxSlots: number;
  benchedGames: number; // candidates - optimizedStarts

  // Opp
  oppRosterGames: number;
  oppOptimizedStarts: number;
  oppStartsUsed: number;
  oppCapOverflow: number;
  oppBenchedGames: number;

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
}

// Check if we're in dev mode
const isDevMode = import.meta.env.DEV;

const WEEKLY_STARTS_CAP = 32;
const DAILY_SLOTS = 8; // ESPN default (PG, SG, SF, PF, C, G, F, UTIL)

function getStartsSoFarFromRoster(roster: RosterSlot[]): number | null {
  const active = roster.filter((s) => s.slotType !== "ir");
  const hasAny = active.some((s) => typeof s.player.gamesPlayed === "number");
  if (!hasAny) return null;

  return active.reduce((sum, s) => sum + (s.player.gamesPlayed ?? 0), 0);
}

function allocateWeeklyCap(
  perDay: DayStartsBreakdown[],
  startsSoFar: number | null,
  weeklyCap: number
): {
  byDate: Record<
    string,
    {
      startsUsed: number;
      overflowByCap: number;
      remainingBefore: number | null;
      remainingAfter: number | null;
    }
  >;
  totals: {
    startsSoFar: number | null;
    remainingCap: number | null;
    projectedAdditionalStarts: number;
    projectedFinalStarts: number | null;
    capOverflowTotal: number;
  };
} {
  const byDate: Record<
    string,
    {
      startsUsed: number;
      overflowByCap: number;
      remainingBefore: number | null;
      remainingAfter: number | null;
    }
  > = {};

  // Cap unknown → no clamping
  if (startsSoFar === null) {
    let add = 0;
    for (const d of [...perDay].sort((a, b) => a.date.localeCompare(b.date))) {
      byDate[d.date] = {
        startsUsed: d.startsUsed,
        overflowByCap: 0,
        remainingBefore: null,
        remainingAfter: null,
      };
      add += d.startsUsed;
    }

    return {
      byDate,
      totals: {
        startsSoFar: null,
        remainingCap: null,
        projectedAdditionalStarts: add,
        projectedFinalStarts: null,
        capOverflowTotal: 0,
      },
    };
  }

  let remaining = Math.max(0, weeklyCap - startsSoFar);
  let add = 0;
  let overflowTotal = 0;

  for (const d of [...perDay].sort((a, b) => a.date.localeCompare(b.date))) {
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
      startsSoFar,
      remainingCap: Math.max(0, weeklyCap - startsSoFar),
      projectedAdditionalStarts: add,
      projectedFinalStarts: startsSoFar + add,
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
}: RestOfWeekPlannerProps) => {
  const [showDebug, setShowDebug] = useState(false);
  const hasOpponent = opponentRoster.length > 0;

  const dateStrings = useMemo(() => weekDates.map((wd) => wd.dateStr), [weekDates]);

  // Compute both teams using the SAME pipeline
  const userStats: RestOfWeekStats = useMemo(() => {
    return computeRestOfWeekStarts({
      rosterPlayers: roster,
      matchupDates: dateStrings,
      gamesByDate,
    });
  }, [roster, dateStrings, gamesByDate]);

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
    });
  }, [opponentRoster, dateStrings, gamesByDate, hasOpponent]);

  // Weekly cap (32) + starts-so-far from roster GP if present
  const youStartsSoFar = useMemo(() => getStartsSoFarFromRoster(roster), [roster]);
  const oppStartsSoFar = useMemo(
    () => (hasOpponent ? getStartsSoFarFromRoster(opponentRoster) : null),
    [opponentRoster, hasOpponent]
  );

  const youCap = useMemo(
    () => allocateWeeklyCap(userStats.perDay, youStartsSoFar, WEEKLY_STARTS_CAP),
    [userStats.perDay, youStartsSoFar]
  );

  const oppCap = useMemo(
    () => allocateWeeklyCap(oppStats.perDay, oppStartsSoFar, WEEKLY_STARTS_CAP),
    [oppStats.perDay, oppStartsSoFar]
  );

  // Build day stats for grid display
  const dayStats = useMemo((): DayStats[] => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    return weekDates.map((wd) => {
      const isPast = wd.dateStr < todayStr;

      const userDay = userStats.perDay.find((d) => d.date === wd.dateStr);
      const oppDay = oppStats.perDay.find((d) => d.date === wd.dateStr);

      const optimizedStarts = userDay?.startsUsed ?? 0;
      const startsUsed = isPast
        ? 0
        : (youCap.byDate[wd.dateStr]?.startsUsed ?? optimizedStarts);
      const capOverflow = isPast ? 0 : (youCap.byDate[wd.dateStr]?.overflowByCap ?? 0);

      const oppOptimizedStarts = oppDay?.startsUsed ?? 0;
      const oppStartsUsed = isPast
        ? 0
        : (oppCap.byDate[wd.dateStr]?.startsUsed ?? oppOptimizedStarts);
      const oppCapOverflow = isPast ? 0 : (oppCap.byDate[wd.dateStr]?.overflowByCap ?? 0);

      return {
        dateStr: wd.dateStr,
        dayLabel: wd.dayLabel,
        dateLabel: wd.dateLabel,
        isToday: wd.dateStr === todayStr,
        isPast,

        rosterGames: userDay?.playersWithGame ?? 0,
        optimizedStarts,
        startsUsed,
        capOverflow,
        maxSlots: DAILY_SLOTS,
        benchedGames: userDay?.overflow ?? 0,

        oppRosterGames: oppDay?.playersWithGame ?? 0,
        oppOptimizedStarts,
        oppStartsUsed,
        oppCapOverflow,
        oppBenchedGames: oppDay?.overflow ?? 0,

        startEdge: startsUsed - oppStartsUsed,

        userDay,
        oppDay,
      };
    });
  }, [weekDates, userStats, oppStats, youCap.byDate, oppCap.byDate]);

  const projectedAdditionalEdge = useMemo(() => {
    if (!hasOpponent) return 0;
    return youCap.totals.projectedAdditionalStarts - oppCap.totals.projectedAdditionalStarts;
  }, [hasOpponent, youCap.totals.projectedAdditionalStarts, oppCap.totals.projectedAdditionalStarts]);

  return (
    <Card className="border-border/50 bg-card/50 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays className="w-4 h-4 text-primary" />
        <h4 className="font-display font-semibold text-xs">Rest of Week</h4>

        <Badge variant="outline" className="text-[9px] ml-auto">
          {userStats.daysRemaining}d left
        </Badge>
      </div>

      {/* 7-day grid */}
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
                  <span
                    className={cn(
                      "font-medium",
                      day.isToday && "text-primary"
                    )}
                  >
                    {day.dayLabel}
                  </span>
                  <span className="text-[8px] text-muted-foreground">{day.dateLabel}</span>

                  {!day.isPast && (
                    <div className="flex flex-col items-center mt-0.5 gap-0">
                      {/* Starts used (after cap) */}
                      <span
                        className={cn(
                          "font-mono text-[10px]",
                          day.rosterGames > 0 ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {day.rosterGames > 0 ? `${day.startsUsed}/${day.maxSlots}` : "—"}
                      </span>

                      {/* Games today */}
                      {day.rosterGames > 0 && (
                        <span className="text-[8px] text-muted-foreground">{day.rosterGames}g</span>
                      )}

                      {/* Daily edge */}
                      {hasOpponent && !day.isPast && day.rosterGames > 0 && day.startEdge !== 0 && (
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
                  )}
                </button>
              </TooltipTrigger>

              <TooltipContent side="bottom" className="max-w-[260px]">
                <div className="text-xs space-y-2">
                  <p className="font-semibold">{day.dayLabel} {day.dateLabel}</p>

                  {day.isPast ? (
                    <p className="text-muted-foreground">Past</p>
                  ) : (
                    <>
                      <div className="border-b border-border pb-1">
                        <p className="text-primary font-medium">You</p>
                        <p>
                          Games: <span className="font-mono">{day.rosterGames}</span> · Max Starts: <span className="font-mono">{day.optimizedStarts}</span> · Benched: <span className="font-mono">{day.benchedGames}</span>
                        </p>
                        {youCap.totals.remainingCap !== null && (
                          <p>
                            Starts Used (cap): <span className="font-mono">{day.startsUsed}</span>
                            {day.capOverflow > 0 && (
                              <span className="text-warning"> · Cap Overflow: <span className="font-mono">{day.capOverflow}</span></span>
                            )}
                          </p>
                        )}
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
                            Games: <span className="font-mono">{day.oppRosterGames}</span> · Max Starts: <span className="font-mono">{day.oppOptimizedStarts}</span> · Benched: <span className="font-mono">{day.oppBenchedGames}</span>
                          </p>
                          {oppCap.totals.remainingCap !== null && (
                            <p>
                              Starts Used (cap): <span className="font-mono">{day.oppStartsUsed}</span>
                              {day.oppCapOverflow > 0 && (
                                <span className="text-warning"> · Cap Overflow: <span className="font-mono">{day.oppCapOverflow}</span></span>
                              )}
                            </p>
                          )}
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
                {youCap.totals.startsSoFar ?? "—"}
              </span>
              <span className="text-muted-foreground">/{WEEKLY_STARTS_CAP}</span>
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
                <p className="text-xs">Roster games remaining: {userStats.rosterGamesRemaining}</p>
                <p className="text-xs">Max startable remaining: {userStats.projectedStarts}</p>
                <p className="text-xs">Benched (schedule overflow): {userStats.overflowGames}</p>
                {youCap.totals.remainingCap !== null && (
                  <p className="text-xs">Cap overflow (blocked): {youCap.totals.capOverflowTotal}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Projected additional (cap):</span>
          <span className="font-mono font-semibold">{youCap.totals.projectedAdditionalStarts}</span>
        </div>

        {youCap.totals.projectedFinalStarts !== null && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Projected final starts:</span>
            <span className="font-mono font-semibold">{youCap.totals.projectedFinalStarts}</span>
          </div>
        )}

        {/* Opponent */}
        {hasOpponent && (
          <>
            <div className="flex items-start justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-stat-negative font-medium w-8">Opp</span>
                <span className="font-mono">
                  <span className="font-semibold">{oppCap.totals.startsSoFar ?? "—"}</span>
                  <span className="text-muted-foreground">/{WEEKLY_STARTS_CAP}</span>
                </span>
                <span className="text-muted-foreground">starts</span>
              </div>
              <span className="text-muted-foreground">{oppStats.rosterGamesRemaining}g</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Projected additional (cap):</span>
              <span className="font-mono font-semibold">{oppCap.totals.projectedAdditionalStarts}</span>
            </div>

            {oppCap.totals.projectedFinalStarts !== null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Projected final starts:</span>
                <span className="font-mono font-semibold">{oppCap.totals.projectedFinalStarts}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-2",
                  projectedAdditionalEdge > 0
                    ? "border-stat-positive/50 text-stat-positive bg-stat-positive/5"
                    : projectedAdditionalEdge < 0
                      ? "border-stat-negative/50 text-stat-negative bg-stat-negative/5"
                      : "border-muted-foreground/30"
                )}
              >
                {projectedAdditionalEdge > 0 ? "+" : ""}{projectedAdditionalEdge} start edge (proj)
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
              <div className="space-y-2">
                {[{ label: "You", stats: userStats, cap: youCap, color: "text-primary" }, ...(hasOpponent ? [{ label: "Opp", stats: oppStats, cap: oppCap, color: "text-stat-negative" }] : [])].map((t) => (
                  <div key={t.label}>
                    <p className={cn("font-semibold mb-1", t.color)}>
                      {t.label} · startsSoFar={t.cap.totals.startsSoFar ?? "unknown"} · remainingCap={t.cap.totals.remainingCap ?? "unknown"}
                    </p>

                    <div className="space-y-1">
                      {t.stats.perDay.map((d) => {
                        const capRow = t.cap.byDate[d.date];
                        const used = capRow?.startsUsed ?? d.startsUsed;
                        const overflowByCap = capRow?.overflowByCap ?? 0;

                        return (
                          <details key={d.date} className="bg-muted/10 rounded p-1">
                            <summary className="cursor-pointer select-none">
                              {d.date} · cand={d.playersWithGame} · slots={d.slotsCount} · opt={d.startsUsed} · benched={d.overflow} · used={used} · capOv={overflowByCap}
                            </summary>
                            <div className="mt-1 space-y-1">
                              <div className="text-muted-foreground">Assignments:</div>
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

                              <div className="text-muted-foreground mt-1">Excluded:</div>
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
