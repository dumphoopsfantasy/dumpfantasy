/**
 * Card: Win Probability (Monte Carlo)
 * 
 * Displays the result of a Monte Carlo simulation showing
 * the probability of winning the matchup. Includes:
 * - Headline win probability with visual bar
 * - Per-category win probabilities
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dice5, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { MonteCarloResult } from "@/lib/monteCarloEngine";

interface WinProbabilityCardProps {
  result: MonteCarloResult;
  myTeamName: string;
  opponentName: string;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const pctInt = (v: number) => `${Math.round(v * 100)}%`;

export const WinProbabilityCard = ({
  result,
  myTeamName,
  opponentName,
}: WinProbabilityCardProps) => {
  const wp = result.winProbability;
  const isConfident = wp >= 0.65 || wp <= 0.35;
  const isFavorite = wp >= 0.5;

  // Color based on probability
  const probColor = wp >= 0.6
    ? 'text-stat-positive'
    : wp <= 0.4
    ? 'text-stat-negative'
    : 'text-amber-400';

  const probBg = wp >= 0.6
    ? 'bg-stat-positive'
    : wp <= 0.4
    ? 'text-stat-negative bg-stat-negative'
    : 'bg-amber-400';

  // Confidence label
  const confidenceLabel = wp >= 0.80
    ? 'Strong Favorite'
    : wp >= 0.65
    ? 'Likely Win'
    : wp >= 0.55
    ? 'Slight Edge'
    : wp >= 0.45
    ? 'Toss-Up'
    : wp >= 0.35
    ? 'Slight Underdog'
    : wp >= 0.20
    ? 'Likely Loss'
    : 'Heavy Underdog';

  return (
    <Card className="gradient-card border-border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Dice5 className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold text-sm">Win Probability</h3>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Monte Carlo simulation · {result.simulations.toLocaleString()} scenarios
          </p>
        </div>
        <Badge variant="outline" className={cn("text-xs", probColor)}>
          {confidenceLabel}
        </Badge>
      </div>

      {/* Main Probability Display */}
      <div className="text-center mb-4">
        <div className={cn("font-display font-bold text-4xl tracking-tight", probColor)}>
          {pctInt(wp)}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          chance to win
        </p>
      </div>

      {/* Probability Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span className="truncate max-w-[120px]">{myTeamName}</span>
          <span className="truncate max-w-[120px] text-right">{opponentName}</span>
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
          <div
            className="bg-stat-positive transition-all duration-500 ease-out"
            style={{ width: `${wp * 100}%` }}
          />
          {result.tieProbability > 0.005 && (
            <div
              className="bg-muted-foreground/30"
              style={{ width: `${result.tieProbability * 100}%` }}
            />
          )}
          <div
            className="bg-stat-negative transition-all duration-500 ease-out flex-1"
          />
        </div>
        <div className="flex justify-between text-[10px] mt-1">
          <span className="text-stat-positive font-medium">{pct(wp)}</span>
          {result.tieProbability > 0.005 && (
            <span className="text-muted-foreground">{pct(result.tieProbability)}</span>
          )}
          <span className="text-stat-negative font-medium">{pct(result.lossProbability)}</span>
        </div>
      </div>

      {/* Expected Record */}
      <div className="flex items-center justify-center gap-3 mb-3 px-3 py-2 rounded-lg bg-secondary/30">
        <div className="text-center">
          <p className="font-display font-bold text-sm text-stat-positive">
            {result.avgWins.toFixed(1)}
          </p>
          <p className="text-[9px] text-muted-foreground">Avg Wins</p>
        </div>
        <span className="text-muted-foreground text-xs">–</span>
        <div className="text-center">
          <p className="font-display font-bold text-sm text-stat-negative">
            {result.avgLosses.toFixed(1)}
          </p>
          <p className="text-[9px] text-muted-foreground">Avg Losses</p>
        </div>
        <span className="text-muted-foreground text-xs">–</span>
        <div className="text-center">
          <p className="font-display font-bold text-sm text-muted-foreground">
            {(9 - result.avgWins - result.avgLosses).toFixed(1)}
          </p>
          <p className="text-[9px] text-muted-foreground">Avg Ties</p>
        </div>
      </div>

      {/* Per-Category Win Probabilities */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted-foreground font-medium mb-1">Category Win Probability</p>
        {result.categoryWinProbabilities.map((cat) => {
          const isWinning = cat.winProb > cat.lossProb;
          const isTossUp = Math.abs(cat.winProb - cat.lossProb) < 0.1;

          return (
            <div key={cat.key} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-8 text-right font-medium">
                {cat.label}
              </span>
              <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-muted/30">
                <div
                  className="bg-stat-positive/80 transition-all duration-300"
                  style={{ width: `${cat.winProb * 100}%` }}
                />
                <div className="flex-1 bg-stat-negative/80" />
              </div>
              <span className={cn(
                "text-[10px] font-medium w-10 text-right",
                isTossUp ? "text-amber-400" : isWinning ? "text-stat-positive" : "text-stat-negative"
              )}>
                {pctInt(cat.winProb)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-border text-center">
        {isFavorite ? (
          <div className="flex items-center justify-center gap-1.5 text-stat-positive text-xs font-medium">
            <TrendingUp className="w-3 h-3" />
            Favored to win ({pctInt(wp)})
          </div>
        ) : wp >= 0.45 ? (
          <div className="flex items-center justify-center gap-1.5 text-amber-400 text-xs font-medium">
            <Minus className="w-3 h-3" />
            Too close to call ({pctInt(wp)})
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 text-stat-negative text-xs font-medium">
            <TrendingDown className="w-3 h-3" />
            Underdog ({pctInt(wp)})
          </div>
        )}
      </div>
    </Card>
  );
};
