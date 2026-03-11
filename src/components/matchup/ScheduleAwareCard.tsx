/**
 * Card 2: Schedule-Aware (Current → Projected Final)
 * 
 * Shows: Current totals (from Weekly scoreboard if available)
 *        Remaining usable starts (you / opp) (integer)
 *        Projected final totals + projected W/L/T
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/crisUtils";
import { Trophy, Target, Minus, AlertTriangle, Calendar } from "lucide-react";
import { TeamTotalsWithPct } from "@/lib/teamTotals";
import { MetricTooltip } from "@/components/MetricTooltip";

interface ScheduleAwareCardProps {
  myTeamName: string;
  opponentName: string;
  myCurrentTotals: TeamTotalsWithPct | null;
  oppCurrentTotals: TeamTotalsWithPct | null;
  myRemainingTotals: TeamTotalsWithPct | null;
  oppRemainingTotals: TeamTotalsWithPct | null;
  myFinalTotals: TeamTotalsWithPct | null;
  oppFinalTotals: TeamTotalsWithPct | null;
  myRemainingStarts?: number;
  oppRemainingStarts?: number;
  remainingDays?: number;
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

export const ScheduleAwareCard = ({
  myTeamName,
  opponentName,
  myCurrentTotals,
  oppCurrentTotals,
  myFinalTotals,
  oppFinalTotals,
  myRemainingStarts = 0,
  oppRemainingStarts = 0,
  remainingDays = 0,
}: ScheduleAwareCardProps) => {
  const hasCurrent = !!(myCurrentTotals && oppCurrentTotals);
  const hasFinal = !!(myFinalTotals && oppFinalTotals);

  const formatValue = (value: number | null | undefined, isPercentage: boolean): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    if (isPercentage) return formatPct(value);
    return Math.round(value).toString();
  };

  const getValue = (totals: TeamTotalsWithPct | null, key: StatKey): number | null => {
    if (!totals) return null;
    return (totals as any)[key] ?? null;
  };

  // Calculate W/L/T from final totals
  const results = hasFinal ? CATEGORIES.map(cat => {
    const myVal = getValue(myFinalTotals, cat.key);
    const oppVal = getValue(oppFinalTotals, cat.key);
    
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

  const getCellBg = (winner: 'my' | 'opp' | 'tie', forTeam: 'my' | 'opp'): string => {
    if (winner === 'tie') return 'bg-muted/30';
    if (winner === forTeam) return 'bg-stat-positive/15';
    return 'bg-stat-negative/15';
  };

  if (!hasFinal) {
    return (
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="font-display font-semibold text-sm">Schedule-Aware: Current → Final</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span>Import Weekly scoreboard and opponent roster to enable this view.</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="gradient-card border-primary/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <MetricTooltip metricKey="schedule-aware">
            <h3 className="font-display font-semibold text-sm">Schedule-Aware: Current → Final</h3>
          </MetricTooltip>
          <p className="text-[10px] text-muted-foreground">
            <MetricTooltip metricKey="remaining-starts" inline>
              <span>{remainingDays} days remaining · {myRemainingStarts} vs {oppRemainingStarts} starts</span>
            </MetricTooltip>
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {myWins > oppWins ? (
            <span className="text-stat-positive">{myWins}-{oppWins}-{ties}</span>
          ) : myWins < oppWins ? (
            <span className="text-stat-negative">{myWins}-{oppWins}-{ties}</span>
          ) : (
            <span className="text-muted-foreground">{myWins}-{oppWins}-{ties}</span>
          )}
        </Badge>
      </div>

      {/* Category Headers */}
      <div className="grid grid-cols-9 gap-1 text-center mb-1">
        {CATEGORIES.map(cat => (
          <div key={cat.key} className="text-[9px] text-muted-foreground font-medium">
            {cat.label}
          </div>
        ))}
      </div>

      {/* My Team - Current Row */}
      {hasCurrent && (
        <div className="mb-1">
          <div className="text-[9px] text-muted-foreground mb-0.5">
            {myTeamName} (Current)
          </div>
          <div className="grid grid-cols-9 gap-1 text-center">
            {CATEGORIES.map(cat => (
              <div key={cat.key} className="text-[10px] text-muted-foreground">
                {formatValue(getValue(myCurrentTotals, cat.key), cat.isPercentage)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Team - Final Row */}
      <div className="mb-2">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[9px] font-medium text-stat-positive">{myTeamName} (Final)</span>
        </div>
        <div className="grid grid-cols-9 gap-1 text-center">
          {results.map(r => (
            <div 
              key={r.key} 
              className={cn(
                "rounded px-0.5 py-1",
                getCellBg(r.winner, 'my')
              )}
            >
              <p className="font-display font-bold text-[11px]">
                {formatValue(r.myVal, r.isPercentage)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Opponent - Current Row */}
      {hasCurrent && (
        <div className="mb-1">
          <div className="text-[9px] text-muted-foreground mb-0.5">
            {opponentName} (Current)
          </div>
          <div className="grid grid-cols-9 gap-1 text-center">
            {CATEGORIES.map(cat => (
              <div key={cat.key} className="text-[10px] text-muted-foreground">
                {formatValue(getValue(oppCurrentTotals, cat.key), cat.isPercentage)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Opponent - Final Row */}
      <div>
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[9px] font-medium text-stat-negative">{opponentName} (Final)</span>
        </div>
        <div className="grid grid-cols-9 gap-1 text-center">
          {results.map(r => (
            <div 
              key={r.key} 
              className={cn(
                "rounded px-0.5 py-1",
                getCellBg(r.winner, 'opp')
              )}
            >
              <p className="font-display font-bold text-[11px]">
                {formatValue(r.oppVal, r.isPercentage)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Verdict */}
      <div className="mt-3 pt-2 border-t border-border text-center">
        {myWins > oppWins ? (
          <div className="flex items-center justify-center gap-1.5 text-stat-positive text-xs font-medium">
            <Trophy className="w-3 h-3" />
            Projected WIN {myWins}-{oppWins}-{ties}
          </div>
        ) : myWins < oppWins ? (
          <div className="flex items-center justify-center gap-1.5 text-stat-negative text-xs font-medium">
            <Target className="w-3 h-3" />
            Projected LOSS {myWins}-{oppWins}-{ties}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs font-medium">
            <Minus className="w-3 h-3" />
            Projected TIE {myWins}-{oppWins}-{ties}
          </div>
        )}
      </div>
    </Card>
  );
};
