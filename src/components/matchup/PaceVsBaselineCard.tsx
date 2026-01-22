/**
 * Card 4: Pace vs Baseline (X40)
 * 
 * Computes pace as "what X40 would look like if current production rate continues"
 * pace_x40 = (current_total / starts_so_far) * 40
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/crisUtils";
import { TrendingUp, TrendingDown, AlertTriangle, Activity } from "lucide-react";

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

interface PaceVsBaselineCardProps {
  myTeamName: string;
  opponentName: string;
  myBaselineStats: TeamStats;
  oppBaselineStats: TeamStats;
  myCurrentStats: WeeklyTeamStats | null;
  oppCurrentStats: WeeklyTeamStats | null;
  myStartsSoFar?: number;
  oppStartsSoFar?: number;
  daysCompleted?: number;
}

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

export const PaceVsBaselineCard = ({
  myTeamName,
  opponentName,
  myBaselineStats,
  oppBaselineStats,
  myCurrentStats,
  oppCurrentStats,
  myStartsSoFar = 0,
  oppStartsSoFar = 0,
  daysCompleted = 0,
}: PaceVsBaselineCardProps) => {
  const hasCurrentData = !!(myCurrentStats && oppCurrentStats);
  const hasStarts = myStartsSoFar > 0 && oppStartsSoFar > 0;

  // Get baseline value (x40 for counting, as-is for percentages)
  const getBaseline = (stats: TeamStats, key: StatKey): number => {
    const value = stats[key];
    const cat = CATEGORIES.find(c => c.key === key);
    if (cat?.isPercentage) return value;
    return value * 40;
  };

  // Calculate pace x40
  const getPaceX40 = (current: number | null, startsSoFar: number, isPercentage: boolean): number | null => {
    if (current === null || startsSoFar === 0) return null;
    if (isPercentage) return current; // Percentages don't scale
    return (current / startsSoFar) * 40;
  };

  const getCurrent = (stats: WeeklyTeamStats | null, key: StatKey): number | null => {
    if (!stats) return null;
    return stats[key];
  };

  const formatValue = (value: number | null, isPercentage: boolean): string => {
    if (value === null || !Number.isFinite(value)) return "—";
    if (isPercentage) return formatPct(value);
    return Math.round(value).toString();
  };

  const formatDelta = (delta: number | null, isPercentage: boolean, lowerBetter: boolean): { text: string; isPositive: boolean } => {
    if (delta === null || !Number.isFinite(delta)) return { text: "—", isPositive: true };
    
    // For turnovers, negative delta means fewer turnovers = good
    const isGood = lowerBetter ? delta < 0 : delta > 0;
    
    if (isPercentage) {
      const sign = delta > 0 ? "+" : "";
      return { text: `${sign}${(delta * 100).toFixed(1)}%`, isPositive: isGood };
    }
    
    const sign = delta > 0 ? "+" : "";
    return { text: `${sign}${Math.round(delta)}`, isPositive: isGood };
  };

  // Calculate pace deltas
  const paceData = useMemo(() => {
    if (!hasCurrentData || !hasStarts) return null;

    return CATEGORIES.map(cat => {
      const myBaseline = getBaseline(myBaselineStats, cat.key);
      const oppBaseline = getBaseline(oppBaselineStats, cat.key);
      
      const myCurrent = getCurrent(myCurrentStats, cat.key);
      const oppCurrent = getCurrent(oppCurrentStats, cat.key);
      
      const myPace = getPaceX40(myCurrent, myStartsSoFar, cat.isPercentage);
      const oppPace = getPaceX40(oppCurrent, oppStartsSoFar, cat.isPercentage);
      
      const myDelta = myPace !== null && Number.isFinite(myBaseline) ? myPace - myBaseline : null;
      const oppDelta = oppPace !== null && Number.isFinite(oppBaseline) ? oppPace - oppBaseline : null;

      return {
        ...cat,
        myBaseline,
        oppBaseline,
        myPace,
        oppPace,
        myDelta,
        oppDelta,
      };
    });
  }, [myBaselineStats, oppBaselineStats, myCurrentStats, oppCurrentStats, myStartsSoFar, oppStartsSoFar, hasCurrentData, hasStarts]);

  if (!hasCurrentData) {
    return (
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Pace vs Baseline (×40)</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>Import Weekly scoreboard to see pace comparison.</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="gradient-card border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Pace vs Baseline (×40)</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Day {daysCompleted}/7 · You: {myStartsSoFar} starts · Opp: {oppStartsSoFar} starts
          </p>
        </div>
      </div>

      {/* Pace Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-1 px-0.5 font-medium text-muted-foreground">Cat</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-positive/70">Base</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-positive/70">Pace</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-positive/70">Δ</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-negative/70">Base</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-negative/70">Pace</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-negative/70">Δ</th>
            </tr>
          </thead>
          <tbody>
            {paceData?.map((cat) => {
              const myDeltaInfo = formatDelta(cat.myDelta, cat.isPercentage, cat.lowerBetter);
              const oppDeltaInfo = formatDelta(cat.oppDelta, cat.isPercentage, cat.lowerBetter);

              return (
                <tr key={cat.key} className="border-b border-border/30 last:border-0">
                  <td className="py-1 px-0.5 font-medium">
                    {cat.label}
                    {cat.lowerBetter && <span className="text-[7px] text-muted-foreground ml-0.5">↓</span>}
                  </td>
                  <td className="text-right py-1 px-0.5 text-muted-foreground">
                    {formatValue(cat.myBaseline, cat.isPercentage)}
                  </td>
                  <td className="text-right py-1 px-0.5 font-medium">
                    {formatValue(cat.myPace, cat.isPercentage)}
                  </td>
                  <td className={cn(
                    "text-right py-1 px-0.5",
                    myDeltaInfo.text !== "—" && (myDeltaInfo.isPositive ? "text-stat-positive" : "text-stat-negative")
                  )}>
                    <span className="flex items-center justify-end gap-0.5">
                      {myDeltaInfo.text !== "—" && (
                        myDeltaInfo.isPositive ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )
                      )}
                      {myDeltaInfo.text}
                    </span>
                  </td>
                  <td className="text-right py-1 px-0.5 text-muted-foreground">
                    {formatValue(cat.oppBaseline, cat.isPercentage)}
                  </td>
                  <td className="text-right py-1 px-0.5 font-medium">
                    {formatValue(cat.oppPace, cat.isPercentage)}
                  </td>
                  <td className={cn(
                    "text-right py-1 px-0.5",
                    oppDeltaInfo.text !== "—" && (oppDeltaInfo.isPositive ? "text-stat-positive" : "text-stat-negative")
                  )}>
                    <span className="flex items-center justify-end gap-0.5">
                      {oppDeltaInfo.text !== "—" && (
                        oppDeltaInfo.isPositive ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )
                      )}
                      {oppDeltaInfo.text}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="mt-3 pt-2 border-t border-border text-[10px] text-muted-foreground text-center">
        Pace shows what weekly totals would be if current per-start rate continues
      </div>
    </Card>
  );
};
