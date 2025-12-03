import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES, CategoryComparison } from "@/types/fantasy";
import { sampleMatchupProjection, sampleWeeklyStats } from "@/data/sampleData";
import { cn } from "@/lib/utils";
import { ArrowRight, Trophy, Target, Minus } from "lucide-react";

export const MatchupProjection = () => {
  const [opponent, setOpponent] = useState("t2");
  const matchup = sampleMatchupProjection;

  // Calculate category comparisons
  const comparisons: CategoryComparison[] = CATEGORIES.map(cat => {
    const myValue = matchup.myTeam.stats[cat.key as keyof typeof matchup.myTeam.stats] as number;
    const theirValue = matchup.opponent.stats[cat.key as keyof typeof matchup.opponent.stats] as number;
    
    let winner: 'you' | 'them' | 'tie';
    if (cat.lowerIsBetter) {
      winner = myValue < theirValue ? 'you' : myValue > theirValue ? 'them' : 'tie';
    } else {
      winner = myValue > theirValue ? 'you' : myValue < theirValue ? 'them' : 'tie';
    }

    return {
      category: cat.label,
      myValue,
      theirValue,
      winner,
      lowerIsBetter: cat.lowerIsBetter,
    };
  });

  const wins = comparisons.filter(c => c.winner === 'you').length;
  const losses = comparisons.filter(c => c.winner === 'them').length;
  const ties = comparisons.filter(c => c.winner === 'tie').length;

  const formatValue = (value: number, category: string) => {
    const cat = CATEGORIES.find(c => c.label === category);
    if (cat?.format === 'pct') {
      return value < 1 ? `.${Math.round(value * 1000).toString().padStart(3, '0')}` : `${value.toFixed(1)}%`;
    }
    return value.toFixed(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="font-display font-bold text-2xl">Matchup Projection</h2>
        <Select value={opponent} onValueChange={setOpponent}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Select opponent" />
          </SelectTrigger>
          <SelectContent>
            {sampleWeeklyStats[0]?.teams.filter(t => t.team.id !== "t1").map(t => (
              <SelectItem key={t.team.id} value={t.team.id}>
                {t.team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Matchup Summary */}
      <Card className="gradient-card border-border p-6">
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">You</p>
            <p className="font-display font-bold text-xl md:text-2xl">{matchup.myTeam.name}</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/30">
            <span className="font-display font-bold text-2xl md:text-4xl text-stat-positive">{wins}</span>
            <span className="text-muted-foreground">-</span>
            <span className="font-display font-bold text-2xl md:text-4xl text-stat-negative">{losses}</span>
            <span className="text-muted-foreground">-</span>
            <span className="font-display font-bold text-2xl md:text-4xl text-muted-foreground">{ties}</span>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Opponent</p>
            <p className="font-display font-bold text-xl md:text-2xl">{matchup.opponent.name}</p>
          </div>
        </div>

        <div className="text-center mt-4 pt-4 border-t border-border">
          {wins > losses ? (
            <p className="text-stat-positive font-display font-bold flex items-center justify-center gap-2">
              <Trophy className="w-5 h-5" />
              You are projected to WIN {wins}-{losses}-{ties}
            </p>
          ) : wins < losses ? (
            <p className="text-stat-negative font-display font-bold flex items-center justify-center gap-2">
              <Target className="w-5 h-5" />
              You are projected to LOSE {losses}-{wins}-{ties}
            </p>
          ) : (
            <p className="text-stat-neutral font-display font-bold flex items-center justify-center gap-2">
              <Minus className="w-5 h-5" />
              Projected TIE {wins}-{losses}-{ties}
            </p>
          )}
        </div>
      </Card>

      {/* Category Breakdown */}
      <div className="space-y-3">
        {comparisons.map((comp) => (
          <Card
            key={comp.category}
            className={cn(
              "border-border p-4 transition-all",
              comp.winner === 'you' && "bg-stat-positive/5 border-stat-positive/30",
              comp.winner === 'them' && "bg-stat-negative/5 border-stat-negative/30",
              comp.winner === 'tie' && "bg-stat-neutral/5 border-stat-neutral/30"
            )}
          >
            <div className="flex items-center justify-between">
              {/* Your Value */}
              <div className={cn(
                "flex-1 text-center",
                comp.winner === 'you' && "text-stat-positive"
              )}>
                <p className="font-display font-bold text-2xl md:text-3xl">
                  {formatValue(comp.myValue, comp.category)}
                </p>
                {comp.winner === 'you' && (
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <ArrowRight className="w-4 h-4" />
                    <span className="text-xs font-medium">WIN</span>
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="px-4 md:px-8">
                <div className={cn(
                  "px-4 py-2 rounded-lg font-display font-bold text-sm md:text-base",
                  comp.winner === 'you' && "bg-stat-positive/20 text-stat-positive",
                  comp.winner === 'them' && "bg-stat-negative/20 text-stat-negative",
                  comp.winner === 'tie' && "bg-stat-neutral/20 text-stat-neutral"
                )}>
                  {comp.category}
                  {comp.lowerIsBetter && <span className="text-xs ml-1">(lower)</span>}
                </div>
              </div>

              {/* Their Value */}
              <div className={cn(
                "flex-1 text-center",
                comp.winner === 'them' && "text-stat-negative"
              )}>
                <p className="font-display font-bold text-2xl md:text-3xl">
                  {formatValue(comp.theirValue, comp.category)}
                </p>
                {comp.winner === 'them' && (
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="text-xs font-medium">WIN</span>
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};