/**
 * Card 1: Baseline (X40) - Roster-average baseline projection
 * 
 * Computes baseline from imported roster per-game stats.
 * Counting stats: stat_x40 = stat_pg * 40
 * Percent stats: keep as percent from aggregated makes/attempts
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/crisUtils";
import { Trophy, Target, Minus } from "lucide-react";

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

interface BaselineCardProps {
  myTeamName: string;
  opponentName: string;
  myBaselineStats: TeamStats;
  oppBaselineStats: TeamStats;
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

export const BaselineCard = ({
  myTeamName,
  opponentName,
  myBaselineStats,
  oppBaselineStats,
}: BaselineCardProps) => {
  // Get baseline value (x40 for counting, as-is for percentages)
  const getBaseline = (stats: TeamStats, key: StatKey): number => {
    const value = stats[key];
    const cat = CATEGORIES.find(c => c.key === key);
    if (cat?.isPercentage) return value;
    return value * 40;
  };

  const formatValue = (value: number, isPercentage: boolean): string => {
    if (isPercentage) return formatPct(value);
    return Math.round(value).toString();
  };

  // Determine winner for each category
  const results = CATEGORIES.map(cat => {
    const myVal = getBaseline(myBaselineStats, cat.key);
    const oppVal = getBaseline(oppBaselineStats, cat.key);
    
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
  });

  const myWins = results.filter(r => r.winner === 'my').length;
  const oppWins = results.filter(r => r.winner === 'opp').length;
  const ties = results.filter(r => r.winner === 'tie').length;

  const getCellBg = (winner: 'my' | 'opp' | 'tie', forTeam: 'my' | 'opp'): string => {
    if (winner === 'tie') return 'bg-muted/30';
    if (winner === forTeam) return 'bg-stat-positive/15';
    return 'bg-stat-negative/15';
  };

  return (
    <Card className="gradient-card border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-sm">Baseline (×40)</h3>
          <p className="text-[10px] text-muted-foreground">Roster average × 40 games</p>
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

      {/* Category Grid */}
      <div className="grid grid-cols-9 gap-1 text-center mb-3">
        {results.map(cat => (
          <div key={cat.key} className="text-[9px] text-muted-foreground font-medium">
            {cat.label}
            {cat.lowerBetter && <span className="text-[7px]">↓</span>}
          </div>
        ))}
      </div>

      {/* My Team Row */}
      <div className="space-y-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-stat-positive truncate max-w-[120px]">
              {myTeamName}
            </span>
          </div>
          <div className="grid grid-cols-9 gap-1 text-center">
            {results.map(cat => (
              <div 
                key={cat.key} 
                className={cn(
                  "rounded px-0.5 py-1",
                  getCellBg(cat.winner, 'my')
                )}
              >
                <p className="font-display font-bold text-[11px]">
                  {formatValue(cat.myVal, cat.isPercentage)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Opponent Row */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-stat-negative truncate max-w-[120px]">
              {opponentName}
            </span>
          </div>
          <div className="grid grid-cols-9 gap-1 text-center">
            {results.map(cat => (
              <div 
                key={cat.key} 
                className={cn(
                  "rounded px-0.5 py-1",
                  getCellBg(cat.winner, 'opp')
                )}
              >
                <p className="font-display font-bold text-[11px]">
                  {formatValue(cat.oppVal, cat.isPercentage)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div className="mt-3 pt-2 border-t border-border text-center">
        {myWins > oppWins ? (
          <div className="flex items-center justify-center gap-1.5 text-stat-positive text-xs font-medium">
            <Trophy className="w-3 h-3" />
            Baseline projects WIN {myWins}-{oppWins}-{ties}
          </div>
        ) : myWins < oppWins ? (
          <div className="flex items-center justify-center gap-1.5 text-stat-negative text-xs font-medium">
            <Target className="w-3 h-3" />
            Baseline projects LOSS {myWins}-{oppWins}-{ties}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs font-medium">
            <Minus className="w-3 h-3" />
            Baseline projects TIE {myWins}-{oppWins}-{ties}
          </div>
        )}
      </div>
    </Card>
  );
};
