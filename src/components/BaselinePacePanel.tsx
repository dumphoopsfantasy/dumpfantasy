import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDown, TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import { formatPct } from "@/lib/crisUtils";
import { useState, useMemo } from "react";

interface TeamStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

interface WeeklyTeamStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

interface BaselinePacePanelProps {
  myTeamName: string;
  opponentName: string;
  myBaselineStats: TeamStats;
  oppBaselineStats: TeamStats;
  myCurrentStats: WeeklyTeamStats | null;
  oppCurrentStats: WeeklyTeamStats | null;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  nbaGamesStatus?: { hasGamesToday: boolean; gamesStarted: boolean; gamesCompleted: boolean };
}

// ESPN stat order
const CATEGORIES = [
  { key: "fgPct", label: "FG%", isPercentage: true, lowerBetter: false },
  { key: "ftPct", label: "FT%", isPercentage: true, lowerBetter: false },
  { key: "threepm", label: "3PM", isPercentage: false, lowerBetter: false },
  { key: "rebounds", label: "REB", isPercentage: false, lowerBetter: false },
  { key: "assists", label: "AST", isPercentage: false, lowerBetter: false },
  { key: "steals", label: "STL", isPercentage: false, lowerBetter: false },
  { key: "blocks", label: "BLK", isPercentage: false, lowerBetter: false },
  { key: "turnovers", label: "TO", isPercentage: false, lowerBetter: true },
  { key: "points", label: "PTS", isPercentage: false, lowerBetter: false },
] as const;

type StatKey = typeof CATEGORIES[number]["key"];

type AsOfMode = "through-yesterday" | "through-today" | "live";

export const BaselinePacePanel = ({
  myTeamName,
  opponentName,
  myBaselineStats,
  oppBaselineStats,
  myCurrentStats,
  oppCurrentStats,
  dayOfWeek,
  nbaGamesStatus,
}: BaselinePacePanelProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Calculate pace factor with "as-of" cutoff logic
  // Fantasy weeks run Mon-Sun: dayOfWeek 1=Mon, 2=Tue, ... 0=Sun(day 7)
  const dayNumber = dayOfWeek === 0 ? 7 : dayOfWeek;
  
  // Determine as-of mode based on current time and game status
  const { asOfMode, daysCompleted, asOfLabel } = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Default NBA game times: first tip ~12pm ET, last game ends ~1am ET next day
    // We use local time approximations:
    // - Before 12pm local: assume pre-tip (through yesterday)
    // - Between 12pm-1am: check if games are live (if we have status)
    // - After 1am: through today (if games completed)
    
    let mode: AsOfMode;
    let completed: number;
    let label: string;
    
    if (nbaGamesStatus) {
      // Use actual game status if available
      if (!nbaGamesStatus.hasGamesToday) {
        // No games today - through yesterday makes most sense
        mode = "through-yesterday";
        completed = Math.max(0, dayNumber - 1);
        label = "Through yesterday (no games today)";
      } else if (!nbaGamesStatus.gamesStarted) {
        // Games haven't started yet
        mode = "through-yesterday";
        completed = Math.max(0, dayNumber - 1);
        label = "Through yesterday (pre-tip)";
      } else if (nbaGamesStatus.gamesCompleted) {
        // All games completed
        mode = "through-today";
        completed = dayNumber;
        label = "Through today";
      } else {
        // Games in progress
        mode = "live";
        completed = Math.max(0, dayNumber - 1); // Don't count partial day
        label = "Through yesterday (games live)";
      }
    } else {
      // Fallback: use time-based heuristic
      if (currentHour < 12) {
        // Before noon - assume pre-tip
        mode = "through-yesterday";
        completed = Math.max(0, dayNumber - 1);
        label = "Through yesterday";
      } else if (currentHour >= 12 && currentHour < 24) {
        // Afternoon/evening - games likely in progress, use through yesterday
        mode = "live";
        completed = Math.max(0, dayNumber - 1);
        label = "Through yesterday (games may be live)";
      } else {
        // Late night/early morning after 12am - assume games done
        mode = "through-today";
        completed = dayNumber;
        label = "Through today";
      }
    }
    
    return { asOfMode: mode, daysCompleted: completed, asOfLabel: label };
  }, [dayNumber, nbaGamesStatus]);

  const paceFactor = daysCompleted / 7;

  const getBaseline = (stats: TeamStats, key: StatKey): number => {
    const value = stats[key];
    // For counting stats, multiply by 40
    const cat = CATEGORIES.find(c => c.key === key);
    if (cat?.isPercentage) {
      return value; // Percentages are averages, not multiplied
    }
    return value * 40;
  };

  const getCurrent = (stats: WeeklyTeamStats | null, key: StatKey): number | null => {
    if (!stats) return null;
    return stats[key];
  };

  const getPaceStatus = (
    current: number | null,
    baseline: number,
    isPercentage: boolean,
    lowerBetter: boolean
  ): { status: "on-pace" | "behind" | "—"; delta: number | null } => {
    if (isPercentage) {
      return { status: "—", delta: null };
    }
    if (current === null) {
      return { status: "—", delta: null };
    }

    const expectedByNow = baseline * paceFactor;
    
    if (lowerBetter) {
      // For TO: lower is better, so if current <= expected, on pace
      const delta = expectedByNow - current; // Positive = good (under budget)
      return {
        status: current <= expectedByNow ? "on-pace" : "behind",
        delta: Math.round(delta),
      };
    } else {
      // For other counting stats: higher is better
      const delta = current - expectedByNow; // Positive = ahead
      return {
        status: current >= expectedByNow ? "on-pace" : "behind",
        delta: Math.round(delta),
      };
    }
  };

  // Count on-pace categories for badges
  const countOnPace = (stats: WeeklyTeamStats | null, baselineStats: TeamStats): number => {
    if (!stats) return 0;
    return CATEGORIES.filter(cat => {
      if (cat.isPercentage) return false; // Don't count percentages
      const current = getCurrent(stats, cat.key);
      const baseline = getBaseline(baselineStats, cat.key);
      const pace = getPaceStatus(current, baseline, cat.isPercentage, cat.lowerBetter);
      return pace.status === "on-pace";
    }).length;
  };

  const myOnPaceCount = countOnPace(myCurrentStats, myBaselineStats);
  const oppOnPaceCount = countOnPace(oppCurrentStats, oppBaselineStats);

  const formatValue = (value: number, isPercentage: boolean): string => {
    if (isPercentage) {
      return formatPct(value);
    }
    return Math.round(value).toString();
  };

  const renderPaceIndicator = (pace: { status: "on-pace" | "behind" | "—"; delta: number | null }) => {
    if (pace.status === "—") {
      return <span className="text-muted-foreground">—</span>;
    }
    
    const isOnPace = pace.status === "on-pace";
    const Icon = isOnPace ? TrendingUp : TrendingDown;
    const deltaStr = pace.delta !== null 
      ? (pace.delta >= 0 ? `+${pace.delta}` : `${pace.delta}`)
      : "";

    return (
      <span className={cn(
        "flex items-center gap-0.5 text-[10px]",
        isOnPace ? "text-stat-positive" : "text-stat-negative"
      )}>
        <Icon className="w-3 h-3" />
        <span>{deltaStr}</span>
      </span>
    );
  };

  // Desktop table component
  const DesktopTable = () => (
    <div className="hidden lg:block">
      <Card className="gradient-card border-border p-3">
        <div className="mb-3">
          <h3 className="font-display font-semibold text-sm">Baseline (×40) + Pace</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1 px-1 font-medium text-muted-foreground">Cat</th>
                <th className="text-right py-1 px-1 font-medium text-stat-positive/70">Base</th>
                <th className="text-right py-1 px-1 font-medium text-stat-positive/70">Curr</th>
                <th className="text-center py-1 px-1 font-medium text-stat-positive/70">Pace</th>
                <th className="text-right py-1 px-1 font-medium text-stat-negative/70">Base</th>
                <th className="text-right py-1 px-1 font-medium text-stat-negative/70">Curr</th>
                <th className="text-center py-1 px-1 font-medium text-stat-negative/70">Pace</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => {
                const myBaseline = getBaseline(myBaselineStats, cat.key);
                const myCurrent = getCurrent(myCurrentStats, cat.key);
                const myPace = getPaceStatus(myCurrent, myBaseline, cat.isPercentage, cat.lowerBetter);
                
                const oppBaseline = getBaseline(oppBaselineStats, cat.key);
                const oppCurrent = getCurrent(oppCurrentStats, cat.key);
                const oppPace = getPaceStatus(oppCurrent, oppBaseline, cat.isPercentage, cat.lowerBetter);

                return (
                  <tr key={cat.key} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 px-1 font-medium">
                      {cat.label}
                      {cat.lowerBetter && <span className="text-[8px] text-muted-foreground ml-0.5">↓</span>}
                    </td>
                    <td className="text-right py-1.5 px-1 text-muted-foreground">
                      {formatValue(myBaseline, cat.isPercentage)}
                    </td>
                    <td className="text-right py-1.5 px-1 font-medium">
                      {myCurrent !== null ? formatValue(myCurrent, cat.isPercentage) : "—"}
                    </td>
                    <td className="text-center py-1.5 px-1">
                      {renderPaceIndicator(myPace)}
                    </td>
                    <td className="text-right py-1.5 px-1 text-muted-foreground">
                      {formatValue(oppBaseline, cat.isPercentage)}
                    </td>
                    <td className="text-right py-1.5 px-1 font-medium">
                      {oppCurrent !== null ? formatValue(oppCurrent, cat.isPercentage) : "—"}
                    </td>
                    <td className="text-center py-1.5 px-1">
                      {renderPaceIndicator(oppPace)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground text-center space-y-0.5">
          <div className="flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Day {dayNumber}/7 · {asOfLabel}</span>
          </div>
          <div>Pace factor: {daysCompleted}/7 ({(paceFactor * 100).toFixed(0)}%)</div>
        </div>
      </Card>
    </div>
  );

  // Mobile accordion component
  const MobileAccordion = () => (
    <div className="lg:hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Card className="p-3 bg-muted/30 border-border cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Minus className="w-4 h-4 text-muted-foreground" />
                <span className="font-display font-semibold text-sm">Baseline (×40) + Pace</span>
              </div>
              <div className="flex items-center gap-2">
                <ChevronDown className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform",
                  isOpen && "rotate-180"
                )} />
              </div>
            </div>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Card className="gradient-card border-border p-3">
            <div className="space-y-3">
              {/* My Team Section */}
              <div>
                <h4 className="font-display font-semibold text-xs text-stat-positive mb-2">{myTeamName}</h4>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <span className="text-muted-foreground">Cat</span>
                  <span className="text-right text-muted-foreground">Base / Curr</span>
                  <span className="text-center text-muted-foreground">Pace</span>
                </div>
                {CATEGORIES.map((cat) => {
                  const myBaseline = getBaseline(myBaselineStats, cat.key);
                  const myCurrent = getCurrent(myCurrentStats, cat.key);
                  const myPace = getPaceStatus(myCurrent, myBaseline, cat.isPercentage, cat.lowerBetter);

                  return (
                    <div key={cat.key} className="grid grid-cols-3 gap-1 text-xs py-0.5">
                      <span className="font-medium">{cat.label}</span>
                      <span className="text-right text-muted-foreground">
                        {formatValue(myBaseline, cat.isPercentage)} / {myCurrent !== null ? formatValue(myCurrent, cat.isPercentage) : "—"}
                      </span>
                      <span className="flex justify-center">{renderPaceIndicator(myPace)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Opponent Section */}
              <div className="pt-2 border-t border-border">
                <h4 className="font-display font-semibold text-xs text-stat-negative mb-2">{opponentName}</h4>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <span className="text-muted-foreground">Cat</span>
                  <span className="text-right text-muted-foreground">Base / Curr</span>
                  <span className="text-center text-muted-foreground">Pace</span>
                </div>
                {CATEGORIES.map((cat) => {
                  const oppBaseline = getBaseline(oppBaselineStats, cat.key);
                  const oppCurrent = getCurrent(oppCurrentStats, cat.key);
                  const oppPace = getPaceStatus(oppCurrent, oppBaseline, cat.isPercentage, cat.lowerBetter);

                  return (
                    <div key={cat.key} className="grid grid-cols-3 gap-1 text-xs py-0.5">
                      <span className="font-medium">{cat.label}</span>
                      <span className="text-right text-muted-foreground">
                        {formatValue(oppBaseline, cat.isPercentage)} / {oppCurrent !== null ? formatValue(oppCurrent, cat.isPercentage) : "—"}
                      </span>
                      <span className="flex justify-center">{renderPaceIndicator(oppPace)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground text-center space-y-0.5">
              <div className="flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{asOfLabel}</span>
              </div>
              <div>Pace: {daysCompleted}/7 ({(paceFactor * 100).toFixed(0)}%)</div>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );

  return (
    <>
      <DesktopTable />
      <MobileAccordion />
    </>
  );
};
