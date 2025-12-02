import { PlayerStats } from "@/types/player";
import { Card } from "@/components/ui/card";
import { Trophy, Target, Crosshair, Shield, Hand, Zap } from "lucide-react";

interface PlayerRankingsProps {
  players: PlayerStats[];
}

export const PlayerRankings = ({ players }: PlayerRankingsProps) => {
  const activePlayers = players.filter(p => p.minutes > 0);

  const getTopPlayer = (stat: keyof PlayerStats) => {
    return activePlayers.reduce((max, p) => 
      (p[stat] as number) > (max[stat] as number) ? p : max, activePlayers[0]
    );
  };

  const rankings = [
    { label: "Points Leader", icon: <Trophy className="w-4 h-4" />, player: getTopPlayer("points"), stat: "points", suffix: "PPG" },
    { label: "Rebounds Leader", icon: <Shield className="w-4 h-4" />, player: getTopPlayer("rebounds"), stat: "rebounds", suffix: "RPG" },
    { label: "Assists Leader", icon: <Target className="w-4 h-4" />, player: getTopPlayer("assists"), stat: "assists", suffix: "APG" },
    { label: "3PM Leader", icon: <Crosshair className="w-4 h-4" />, player: getTopPlayer("threepm"), stat: "threepm", suffix: "3PM" },
    { label: "Steals Leader", icon: <Hand className="w-4 h-4" />, player: getTopPlayer("steals"), stat: "steals", suffix: "SPG" },
    { label: "Blocks Leader", icon: <Zap className="w-4 h-4" />, player: getTopPlayer("blocks"), stat: "blocks", suffix: "BPG" },
  ];

  // Calculate overall player value score
  const getPlayerScore = (p: PlayerStats) => {
    return (p.points * 1) + (p.rebounds * 1.2) + (p.assists * 1.5) + 
           (p.steals * 3) + (p.blocks * 3) + (p.threepm * 1) - (p.turnovers * 1);
  };

  const rankedPlayers = [...activePlayers]
    .map(p => ({ ...p, score: getPlayerScore(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="grid gap-4 md:grid-cols-2 mb-6">
      {/* Category Leaders */}
      <Card className="gradient-card shadow-card border-border p-4">
        <h3 className="text-sm font-display font-bold text-muted-foreground mb-3">CATEGORY LEADERS</h3>
        <div className="grid grid-cols-2 gap-2">
          {rankings.map((r, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/30">
              <div className="text-primary">{r.icon}</div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground truncate">{r.label}</p>
                <p className="text-sm font-semibold truncate">{r.player?.player || 'N/A'}</p>
                <p className="text-xs text-primary">
                  {r.player ? (r.player[r.stat as keyof PlayerStats] as number).toFixed(1) : 0} {r.suffix}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Top 5 Overall */}
      <Card className="gradient-card shadow-card border-border p-4">
        <h3 className="text-sm font-display font-bold text-muted-foreground mb-3">TOP 5 OVERALL VALUE</h3>
        <div className="space-y-2">
          {rankedPlayers.map((p, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/30">
              <span className={`text-lg font-bold ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                #{i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{p.player}</p>
                <p className="text-xs text-muted-foreground">{p.team} • {p.position}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary">{p.score.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Value</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
