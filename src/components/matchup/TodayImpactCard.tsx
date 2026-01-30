/**
 * Card: Today Impact (Current → After Today)
 * 
 * Shows the matchup state after today's games complete:
 * - Current: Existing scoreboard totals
 * - +Today: Stats projected from today's games (not started yet)
 * - After Today: Current + Today's projection
 * 
 * This is distinct from ScheduleAwareCard which shows the full week projection.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/crisUtils";
import { Trophy, Target, Minus, AlertTriangle, Zap, Clock } from "lucide-react";
import { ProjectedStats } from "@/lib/scheduleAwareProjection";
import { TeamTotalsWithPct, addTotals, withDerivedPct, totalsFromProjectedStats } from "@/lib/teamTotals";

interface TodayImpactCardProps {
  myTeamName: string;
  opponentName: string;
  myCurrentTotals: TeamTotalsWithPct | null;
  oppCurrentTotals: TeamTotalsWithPct | null;
  myTodayStats: ProjectedStats | null;
  oppTodayStats: ProjectedStats | null;
  myTodayStarts?: number;
  oppTodayStarts?: number;
  slateStatus?: {
    mode: 'pre-slate' | 'mixed' | 'post-slate';
    label: string;
  };
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

export const TodayImpactCard = ({
  myTeamName,
  opponentName,
  myCurrentTotals,
  oppCurrentTotals,
  myTodayStats,
  oppTodayStats,
  myTodayStarts = 0,
  oppTodayStarts = 0,
  slateStatus,
}: TodayImpactCardProps) => {
  const hasData = !!(myTodayStats || oppTodayStats);
  const hasCurrent = !!(myCurrentTotals && oppCurrentTotals);

  // Calculate "After Today" totals = Current + Today's projection
  const myAfterTodayTotals = useMemo(() => {
    if (!myCurrentTotals) return null;
    if (!myTodayStats) return myCurrentTotals; // No today games = current stays the same
    const todayTotals = totalsFromProjectedStats(myTodayStats);
    return withDerivedPct(addTotals(myCurrentTotals, todayTotals));
  }, [myCurrentTotals, myTodayStats]);

  const oppAfterTodayTotals = useMemo(() => {
    if (!oppCurrentTotals) return null;
    if (!oppTodayStats) return oppCurrentTotals;
    const todayTotals = totalsFromProjectedStats(oppTodayStats);
    return withDerivedPct(addTotals(oppCurrentTotals, todayTotals));
  }, [oppCurrentTotals, oppTodayStats]);

  const hasAfterToday = !!(myAfterTodayTotals && oppAfterTodayTotals);

  const formatValue = (value: number | null | undefined, isPercentage: boolean): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    if (isPercentage) return formatPct(value);
    return Math.round(value).toString();
  };

  const formatDelta = (value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "—";
    const sign = value > 0 ? "+" : "";
    return `${sign}${Math.round(value)}`;
  };

  const getTodayValue = (stats: ProjectedStats | null, key: StatKey): number | null => {
    if (!stats) return null;
    const keyMap: Record<StatKey, keyof ProjectedStats> = {
      fgPct: 'fgPct',
      ftPct: 'ftPct',
      threepm: 'threepm',
      rebounds: 'rebounds',
      assists: 'assists',
      steals: 'steals',
      blocks: 'blocks',
      turnovers: 'turnovers',
      points: 'points',
    };
    return stats[keyMap[key]] ?? null;
  };

  const getValue = (totals: TeamTotalsWithPct | null, key: StatKey): number | null => {
    if (!totals) return null;
    return (totals as any)[key] ?? null;
  };

  // Calculate W/L/T from AFTER TODAY totals (not full week final)
  const results = hasAfterToday ? CATEGORIES.map(cat => {
    const myVal = getValue(myAfterTodayTotals, cat.key);
    const oppVal = getValue(oppAfterTodayTotals, cat.key);
    
    if (myVal === null || oppVal === null) {
      return { ...cat, myVal, oppVal, winner: 'tie' as const };
    }
    
    const epsilon = 0.0001;
    const diff = Math.abs(myVal - oppVal);
    
    let winner: 'my' | 'opp' | 'tie';
    if (diff < epsilon) {
      winner = 'tie';
    } else if (cat.lowerBetter) {
      winner = myVal < oppVal ? 'my' : 'opp';
    } else {
      winner = myVal > oppVal ? 'my' : 'opp';
    }
    
    return { ...cat, myVal, oppVal, winner };
  }) : [];

  const myWins = results.filter(r => r.winner === 'my').length;
  const oppWins = results.filter(r => r.winner === 'opp').length;
  const ties = results.filter(r => r.winner === 'tie').length;

  if (!hasData && !hasCurrent) {
    return (
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Today Impact</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>Import roster and Weekly scoreboard to see today's impact.</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="gradient-card border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Today Impact</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Today: {myTodayStarts} vs {oppTodayStarts} usable starts
          </p>
        </div>
        {slateStatus && (
          <Badge variant="outline" className="text-[10px]">
            <Clock className="w-3 h-3 mr-1" />
            {slateStatus.label}
          </Badge>
        )}
      </div>

      {/* Today's Impact Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-1 px-0.5 font-medium text-muted-foreground">Cat</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-positive/70">Curr</th>
              <th className="text-right py-1 px-0.5 font-medium text-primary">+Today</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-positive/70">After</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-negative/70">Curr</th>
              <th className="text-right py-1 px-0.5 font-medium text-primary">+Today</th>
              <th className="text-right py-1 px-0.5 font-medium text-stat-negative/70">After</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => {
              const myCurrent = getValue(myCurrentTotals, cat.key);
              const myToday = getTodayValue(myTodayStats, cat.key);
              const myAfter = getValue(myAfterTodayTotals, cat.key);
              
              const oppCurrent = getValue(oppCurrentTotals, cat.key);
              const oppToday = getTodayValue(oppTodayStats, cat.key);
              const oppAfter = getValue(oppAfterTodayTotals, cat.key);

              const result = results.find(r => r.key === cat.key);
              const winner = result?.winner ?? 'tie';

              return (
                <tr key={cat.key} className="border-b border-border/30 last:border-0">
                  <td className="py-1 px-0.5 font-medium">
                    {cat.label}
                    {cat.lowerBetter && <span className="text-[7px] text-muted-foreground ml-0.5">↓</span>}
                  </td>
                  <td className="text-right py-1 px-0.5 text-muted-foreground">
                    {formatValue(myCurrent, cat.isPercentage)}
                  </td>
                  <td className="text-right py-1 px-0.5 text-primary font-medium">
                    {cat.isPercentage ? "—" : formatDelta(myToday)}
                  </td>
                  <td className={cn(
                    "text-right py-1 px-0.5 font-bold",
                    winner === 'my' && "text-stat-positive"
                  )}>
                    {formatValue(myAfter, cat.isPercentage)}
                  </td>
                  <td className="text-right py-1 px-0.5 text-muted-foreground">
                    {formatValue(oppCurrent, cat.isPercentage)}
                  </td>
                  <td className="text-right py-1 px-0.5 text-primary font-medium">
                    {cat.isPercentage ? "—" : formatDelta(oppToday)}
                  </td>
                  <td className={cn(
                    "text-right py-1 px-0.5 font-bold",
                    winner === 'opp' && "text-stat-negative"
                  )}>
                    {formatValue(oppAfter, cat.isPercentage)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Verdict - After Today */}
      {hasAfterToday && (
        <div className="mt-3 pt-2 border-t border-border text-center">
          {myWins > oppWins ? (
            <div className="flex items-center justify-center gap-1.5 text-stat-positive text-xs font-medium">
              <Trophy className="w-3 h-3" />
              After Today: WIN {myWins}-{oppWins}-{ties}
            </div>
          ) : myWins < oppWins ? (
            <div className="flex items-center justify-center gap-1.5 text-stat-negative text-xs font-medium">
              <Target className="w-3 h-3" />
              After Today: LOSS {myWins}-{oppWins}-{ties}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs font-medium">
              <Minus className="w-3 h-3" />
              After Today: TIE {myWins}-{oppWins}-{ties}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
