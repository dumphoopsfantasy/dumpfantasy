import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ArrowUp, ArrowDown, Minus, TrendingUp, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface FreeAgentImpactSheetProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRoster: Player[];
  allFreeAgents?: Player[];
}

const WEEKLY_MULTIPLIER = 40;

export const FreeAgentImpactSheet = ({
  player,
  open,
  onOpenChange,
  currentRoster,
  allFreeAgents = [],
}: FreeAgentImpactSheetProps) => {
  // Calculate player's rank among free agents for each category
  const playerRanks = useMemo(() => {
    if (!player || allFreeAgents.length === 0) return null;
    
    const categories = [
      { key: "fgPct", lowerBetter: false },
      { key: "ftPct", lowerBetter: false },
      { key: "threepm", lowerBetter: false },
      { key: "rebounds", lowerBetter: false },
      { key: "assists", lowerBetter: false },
      { key: "steals", lowerBetter: false },
      { key: "blocks", lowerBetter: false },
      { key: "turnovers", lowerBetter: true },
      { key: "points", lowerBetter: false },
    ];
    
    const ranks: Record<string, { rank: number; total: number; percentile: number }> = {};
    
    categories.forEach((cat) => {
      const sorted = [...allFreeAgents].sort((a, b) => {
        const aVal = a[cat.key as keyof Player] as number;
        const bVal = b[cat.key as keyof Player] as number;
        return cat.lowerBetter ? aVal - bVal : bVal - aVal;
      });
      
      const rank = sorted.findIndex((p) => p.id === player.id) + 1;
      const total = allFreeAgents.length;
      const percentile = rank / total;
      
      ranks[cat.key] = { rank, total, percentile };
    });
    
    return ranks;
  }, [player, allFreeAgents]);
  // Calculate current team stats and projected stats with the free agent
  const impactData = useMemo(() => {
    if (!player) return null;

    // Get active players (non-IR with stats)
    const activePlayers = currentRoster.filter(
      (p) => p.minutes > 0 && p.status !== "IR" && p.status !== "O"
    );
    const count = activePlayers.length || 1;

    // Current team averages
    const currentAvg = {
      fgPct: activePlayers.reduce((sum, p) => sum + p.fgPct, 0) / count,
      ftPct: activePlayers.reduce((sum, p) => sum + p.ftPct, 0) / count,
      threepm: activePlayers.reduce((sum, p) => sum + p.threepm, 0) / count,
      rebounds: activePlayers.reduce((sum, p) => sum + p.rebounds, 0) / count,
      assists: activePlayers.reduce((sum, p) => sum + p.assists, 0) / count,
      steals: activePlayers.reduce((sum, p) => sum + p.steals, 0) / count,
      blocks: activePlayers.reduce((sum, p) => sum + p.blocks, 0) / count,
      turnovers: activePlayers.reduce((sum, p) => sum + p.turnovers, 0) / count,
      points: activePlayers.reduce((sum, p) => sum + p.points, 0) / count,
    };

    // New team averages with the free agent added
    const newCount = count + 1;
    const newAvg = {
      fgPct: (currentAvg.fgPct * count + player.fgPct) / newCount,
      ftPct: (currentAvg.ftPct * count + player.ftPct) / newCount,
      threepm: (currentAvg.threepm * count + player.threepm) / newCount,
      rebounds: (currentAvg.rebounds * count + player.rebounds) / newCount,
      assists: (currentAvg.assists * count + player.assists) / newCount,
      steals: (currentAvg.steals * count + player.steals) / newCount,
      blocks: (currentAvg.blocks * count + player.blocks) / newCount,
      turnovers: (currentAvg.turnovers * count + player.turnovers) / newCount,
      points: (currentAvg.points * count + player.points) / newCount,
    };

    // Calculate differences and weekly projections
    const categories = [
      { key: "fgPct", label: "FG%", isPct: true, lowerBetter: false },
      { key: "ftPct", label: "FT%", isPct: true, lowerBetter: false },
      { key: "threepm", label: "3PM", isPct: false, lowerBetter: false },
      { key: "rebounds", label: "REB", isPct: false, lowerBetter: false },
      { key: "assists", label: "AST", isPct: false, lowerBetter: false },
      { key: "steals", label: "STL", isPct: false, lowerBetter: false },
      { key: "blocks", label: "BLK", isPct: false, lowerBetter: false },
      { key: "turnovers", label: "TO", isPct: false, lowerBetter: true },
      { key: "points", label: "PTS", isPct: false, lowerBetter: false },
    ];

    const comparisons = categories.map((cat) => {
      const current = currentAvg[cat.key as keyof typeof currentAvg];
      const projected = newAvg[cat.key as keyof typeof newAvg];
      const diff = projected - current;
      const playerVal = player[cat.key as keyof Player] as number;

      // Weekly projections (counting stats x40)
      const currentWeekly = cat.isPct ? current : current * WEEKLY_MULTIPLIER;
      const projectedWeekly = cat.isPct ? projected : projected * WEEKLY_MULTIPLIER;
      const weeklyDiff = projectedWeekly - currentWeekly;

      // Determine if the change is positive (considering lowerBetter)
      const isPositive = cat.lowerBetter ? diff < 0 : diff > 0;
      const isNegative = cat.lowerBetter ? diff > 0 : diff < 0;

      return {
        ...cat,
        current,
        projected,
        diff,
        playerVal,
        currentWeekly,
        projectedWeekly,
        weeklyDiff,
        isPositive,
        isNegative,
      };
    });

    return {
      currentCount: count,
      newCount,
      comparisons,
    };
  }, [player, currentRoster]);

  if (!player || !impactData) return null;

  const formatValue = (val: number, isPct: boolean) => {
    if (isPct) return `${(val * 100).toFixed(1)}%`;
    return val.toFixed(1);
  };

  const formatWeekly = (val: number, isPct: boolean) => {
    if (isPct) return `${(val * 100).toFixed(1)}%`;
    return Math.round(val).toString();
  };

  const formatDiff = (diff: number, isPct: boolean) => {
    const sign = diff > 0 ? "+" : "";
    if (isPct) return `${sign}${(diff * 100).toFixed(2)}%`;
    return `${sign}${diff.toFixed(2)}`;
  };

  const getStatColor = (key: string) => {
    if (!playerRanks || !playerRanks[key]) return "";
    const { percentile } = playerRanks[key];
    if (percentile <= 0.25) return "text-stat-positive";
    if (percentile <= 0.5) return "text-emerald-400";
    if (percentile <= 0.75) return "text-yellow-400";
    return "text-stat-negative";
  };

  const getStatBgColor = (key: string) => {
    if (!playerRanks || !playerRanks[key]) return "bg-secondary/30";
    const { percentile } = playerRanks[key];
    if (percentile <= 0.25) return "bg-stat-positive/20 border border-stat-positive/30";
    if (percentile <= 0.5) return "bg-emerald-500/10 border border-emerald-500/20";
    if (percentile <= 0.75) return "bg-yellow-500/10 border border-yellow-500/20";
    return "bg-stat-negative/20 border border-stat-negative/30";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-background border-border">
        <SheetHeader className="space-y-4 pb-4 border-b border-border">
          {/* Player Header */}
          <div className="flex items-center gap-4">
            <PlayerPhoto name={player.name} size="lg" />
            <div className="flex-1">
              <SheetTitle className="text-xl font-display">{player.name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <NBATeamLogo teamCode={player.nbaTeam} size="sm" />
                <span className="text-sm text-muted-foreground">{player.nbaTeam}</span>
                <Badge variant="outline" className="text-xs">
                  {player.positions.join("/")}
                </Badge>
              </div>
            </div>
          </div>

          {/* Impact Summary */}
          <Card className="gradient-card border-primary/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="font-display font-bold text-sm">Team Impact Preview</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing how your team's stats would change if you added this player.
              Current roster: {impactData.currentCount} active players → {impactData.newCount} players
            </p>
          </Card>
        </SheetHeader>

        {/* Player Stats */}
        <div className="py-4 space-y-4">
          <div>
            <h4 className="font-display font-bold text-sm text-muted-foreground mb-2 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              PLAYER'S STATS VS FREE AGENT POOL
            </h4>
            <div className="grid grid-cols-5 gap-2">
              {impactData.comparisons.slice(2).map((cat) => (
                <div key={cat.key} className={cn("text-center rounded-lg p-2", getStatBgColor(cat.key))}>
                  <p className="text-[10px] text-muted-foreground">{cat.label}</p>
                  <p className={cn("font-display font-bold text-sm", getStatColor(cat.key))}>
                    {formatValue(cat.playerVal, cat.isPct)}
                  </p>
                  {playerRanks && playerRanks[cat.key] && (
                    <p className="text-[9px] text-muted-foreground">
                      #{playerRanks[cat.key].rank}/{playerRanks[cat.key].total}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {impactData.comparisons.slice(0, 2).map((cat) => (
                <div key={cat.key} className={cn("text-center rounded-lg p-2", getStatBgColor(cat.key))}>
                  <p className="text-[10px] text-muted-foreground">{cat.label}</p>
                  <p className={cn("font-display font-bold text-sm", getStatColor(cat.key))}>
                    {formatValue(cat.playerVal, cat.isPct)}
                  </p>
                  {playerRanks && playerRanks[cat.key] && (
                    <p className="text-[9px] text-muted-foreground">
                      #{playerRanks[cat.key].rank}/{playerRanks[cat.key].total}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Category Impact Comparison */}
          <div>
            <h4 className="font-display font-bold text-sm text-muted-foreground mb-3">
              WEEKLY PROJECTION IMPACT (×{WEEKLY_MULTIPLIER})
            </h4>
            <div className="space-y-2">
              {impactData.comparisons.map((cat) => (
                <div
                  key={cat.key}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    cat.isPositive && "bg-stat-positive/10 border-stat-positive/30",
                    cat.isNegative && "bg-stat-negative/10 border-stat-negative/30",
                    !cat.isPositive && !cat.isNegative && "bg-secondary/30 border-border"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display font-bold text-sm w-10">{cat.label}</span>
                    <div className="text-xs text-muted-foreground">
                      <span>{formatWeekly(cat.currentWeekly, cat.isPct)}</span>
                      <span className="mx-1">→</span>
                      <span className={cn(
                        "font-semibold",
                        cat.isPositive && "text-stat-positive",
                        cat.isNegative && "text-stat-negative"
                      )}>
                        {formatWeekly(cat.projectedWeekly, cat.isPct)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {cat.isPositive && <ArrowUp className="w-4 h-4 text-stat-positive" />}
                    {cat.isNegative && <ArrowDown className="w-4 h-4 text-stat-negative" />}
                    {!cat.isPositive && !cat.isNegative && <Minus className="w-4 h-4 text-muted-foreground" />}
                    <span className={cn(
                      "font-display font-bold text-sm min-w-[60px] text-right",
                      cat.isPositive && "text-stat-positive",
                      cat.isNegative && "text-stat-negative"
                    )}>
                      {cat.isPct ? formatDiff(cat.weeklyDiff, true) : (cat.weeklyDiff > 0 ? "+" : "") + Math.round(cat.weeklyDiff)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <Card className="gradient-card border-border p-3">
            <h4 className="font-display font-bold text-sm mb-2">IMPACT SUMMARY</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Categories Up</p>
                <p className="font-display font-bold text-lg text-stat-positive">
                  {impactData.comparisons.filter((c) => c.isPositive).length}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Neutral</p>
                <p className="font-display font-bold text-lg">
                  {impactData.comparisons.filter((c) => !c.isPositive && !c.isNegative).length}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Categories Down</p>
                <p className="font-display font-bold text-lg text-stat-negative">
                  {impactData.comparisons.filter((c) => c.isNegative).length}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
};
