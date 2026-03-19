/**
 * PickupImpactPanel — Shows which free agents most improve your win probability.
 * 
 * Displays a ranked list of FAs sorted by win probability delta,
 * with their optimal drop suggestion and remaining games this week.
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, ArrowRightLeft, Loader2, CalendarDays, Dice5, Info } from "lucide-react";
import { PickupImpactResult } from "@/lib/pickupImpactEngine";

interface PickupImpactPanelProps {
  results: PickupImpactResult[];
  baselineWinProb: number;
  isComputing: boolean;
  error: string | null;
  maxDisplay?: number;
}

const pctInt = (v: number) => `${Math.round(v * 100)}%`;
const pctSigned = (v: number) => {
  const val = Math.round(v * 100);
  if (val > 0) return `+${val}%`;
  if (val < 0) return `${val}%`;
  return "0%";
};

const deltaPctSigned = (v: number) => {
  const val = v * 100;
  if (Math.abs(val) < 0.05) return "+0.0%";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
};

export const PickupImpactPanel = ({
  results,
  baselineWinProb,
  isComputing,
  error,
  maxDisplay = 10,
}: PickupImpactPanelProps) => {
  const displayResults = results.slice(0, maxDisplay);

  // Determine how many are positive impact
  const positiveCount = results.filter(r => r.winProbDelta > 0.005).length;

  return (
    <Card className="gradient-card border-border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Dice5 className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Pickup Win Impact</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Monte Carlo simulation · Who moves the needle most
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isComputing && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Simulating...
            </div>
          )}
          <Badge variant="outline" className="text-[10px]">
            Baseline: {pctInt(baselineWinProb)}
          </Badge>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-center py-4 text-stat-negative text-xs">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isComputing && displayResults.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">
            Running Monte Carlo simulations for top free agents...
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isComputing && !error && displayResults.length === 0 && (
        <div className="text-center py-6">
          <Info className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Import free agents and matchup data to see pickup recommendations
          </p>
        </div>
      )}

      {/* Results list */}
      {displayResults.length > 0 && (
        <div className="space-y-2">
          {/* Summary bar */}
          {positiveCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-stat-positive/10 mb-2">
              <TrendingUp className="w-3 h-3 text-stat-positive flex-shrink-0" />
              <span className="text-[10px] text-stat-positive font-medium">
                {positiveCount} free agent{positiveCount !== 1 ? 's' : ''} can improve your odds
              </span>
            </div>
          )}

          {displayResults.map((result, index) => (
            <PickupImpactRow
              key={result.freeAgent.id}
              result={result}
              rank={index + 1}
              baselineWinProb={baselineWinProb}
            />
          ))}

          {results.length > maxDisplay && (
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              +{results.length - maxDisplay} more evaluated
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

// ── Individual Row ─────────────────────────────────────────────────────

interface PickupImpactRowProps {
  result: PickupImpactResult;
  rank: number;
  baselineWinProb: number;
}

const PickupImpactRow = ({ result, rank, baselineWinProb }: PickupImpactRowProps) => {
  const { freeAgent, bestDrop, winProbWithSwap, winProbDelta, remainingGames, catWinsDelta } = result;

  const isPositive = winProbDelta > 0.005;
  const isNegative = winProbDelta < -0.005;
  const isNeutral = !isPositive && !isNegative;

  const deltaColor = isPositive
    ? "text-stat-positive"
    : isNegative
    ? "text-stat-negative"
    : "text-muted-foreground";

  const deltaBg = isPositive
    ? "bg-stat-positive/10"
    : isNegative
    ? "bg-stat-negative/10"
    : "bg-muted/30";

  return (
    <div className={cn(
      "flex items-center gap-3 px-2.5 py-2 rounded-lg border border-border/50 transition-colors",
      isPositive && "bg-stat-positive/5 border-stat-positive/20",
      isNegative && "bg-stat-negative/5 border-stat-negative/20",
    )}>
      {/* Rank */}
      <span className={cn(
        "font-display font-bold text-sm w-5 text-center flex-shrink-0",
        rank <= 3 ? "text-primary" : "text-muted-foreground",
      )}>
        {rank}
      </span>

      {/* FA Info */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <PlayerPhoto name={freeAgent.name} size="xs" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium truncate">{freeAgent.name}</span>
            {freeAgent.nbaTeam && (
              <NBATeamLogo teamCode={freeAgent.nbaTeam} size="xs" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {freeAgent.positions?.join("/") || "—"}
            </span>
            <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <CalendarDays className="w-2.5 h-2.5" />
              {remainingGames} game{remainingGames !== 1 ? "s" : ""} left
            </div>
          </div>
        </div>
      </div>

      {/* Drop suggestion */}
      {bestDrop && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground leading-tight">Drop</p>
            <p className="text-[10px] font-medium truncate max-w-[80px] leading-tight">
              {bestDrop.name.split(' ').pop()}
            </p>
          </div>
        </div>
      )}

      {/* Win Prob Delta */}
      <div className={cn(
        "flex flex-col items-center justify-center px-2 py-1 rounded-md flex-shrink-0 min-w-[52px]",
        deltaBg,
      )}>
        <span className={cn("font-display font-bold text-sm leading-tight", deltaColor)}>
          {deltaPctSigned(winProbDelta)}
        </span>
        <span className="text-[8px] text-muted-foreground leading-tight">
          win prob
        </span>
      </div>
    </div>
  );
};
