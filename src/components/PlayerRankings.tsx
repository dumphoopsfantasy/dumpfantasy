import { PlayerStats } from "@/types/player";
import { Card } from "@/components/ui/card";
import { Trophy, Target, Crosshair, Shield, Hand, Zap, Percent, TrendingDown } from "lucide-react";
import { formatPct } from "@/lib/crisUtils";

interface PlayerRankingsProps {
  players: PlayerStats[];
}

export const PlayerRankings = ({ players }: PlayerRankingsProps) => {
  const activePlayers = players.filter(p => p.minutes > 0);

  const getTopPlayer = (stat: keyof PlayerStats, lowerIsBetter = false) => {
    if (activePlayers.length === 0) return null;
    return activePlayers.reduce((best, p) => {
      const pVal = p[stat] as number;
      const bestVal = best[stat] as number;
      if (lowerIsBetter) {
        return pVal < bestVal ? p : best;
      }
      return pVal > bestVal ? p : best;
    }, activePlayers[0]);
  };

  const rankings = [
    { label: "Points Leader", icon: <Trophy className="w-4 h-4" />, player: getTopPlayer("points"), stat: "points", suffix: "PPG", format: "num" },
    { label: "Rebounds Leader", icon: <Shield className="w-4 h-4" />, player: getTopPlayer("rebounds"), stat: "rebounds", suffix: "RPG", format: "num" },
    { label: "Assists Leader", icon: <Target className="w-4 h-4" />, player: getTopPlayer("assists"), stat: "assists", suffix: "APG", format: "num" },
    { label: "3PM Leader", icon: <Crosshair className="w-4 h-4" />, player: getTopPlayer("threepm"), stat: "threepm", suffix: "3PM", format: "num" },
    { label: "Steals Leader", icon: <Hand className="w-4 h-4" />, player: getTopPlayer("steals"), stat: "steals", suffix: "SPG", format: "num" },
    { label: "Blocks Leader", icon: <Zap className="w-4 h-4" />, player: getTopPlayer("blocks"), stat: "blocks", suffix: "BPG", format: "num" },
    { label: "FG% Leader", icon: <Percent className="w-4 h-4" />, player: getTopPlayer("fgPct"), stat: "fgPct", suffix: "FG%", format: "pct" },
    { label: "FT% Leader", icon: <Percent className="w-4 h-4" />, player: getTopPlayer("ftPct"), stat: "ftPct", suffix: "FT%", format: "pct" },
    { label: "Fewest TO", icon: <TrendingDown className="w-4 h-4" />, player: getTopPlayer("turnovers", true), stat: "turnovers", suffix: "TO", format: "num" },
  ];

  const formatValue = (value: number, format: string) => {
    if (format === 'pct') return formatPct(value);
    return value.toFixed(1);
  };

  return (
    <Card className="gradient-card shadow-card border-border p-4 mb-6">
      <h3 className="text-sm font-display font-bold text-muted-foreground mb-3">CATEGORY LEADERS</h3>
      <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
        {rankings.map((r, i) => (
          <div key={i} className="flex flex-col items-center gap-1 p-2 rounded bg-muted/30 text-center">
            <div className="text-primary">{r.icon}</div>
            <p className="text-xs text-muted-foreground">{r.label.replace(' Leader', '').replace('Fewest ', '')}</p>
            <p className="text-xs font-semibold truncate max-w-full">{r.player?.player || 'N/A'}</p>
            <p className="text-xs text-primary font-bold">
              {r.player ? formatValue(r.player[r.stat as keyof PlayerStats] as number, r.format) : '-'}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
};
