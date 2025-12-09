import { PlayerStats } from "@/types/player";
import { Card } from "@/components/ui/card";

interface TeamAveragesProps {
  players: PlayerStats[];
}

const WEEKLY_MULTIPLIER = 40;

export const TeamAverages = ({ players }: TeamAveragesProps) => {
  // Only include active players (with minutes > 0)
  const activePlayers = players.filter(p => p.minutes > 0);
  const count = activePlayers.length || 1;

  // Calculate TEAM AVERAGES (sum of all player stats / player count)
  const averages = {
    fgPct: activePlayers.reduce((sum, p) => sum + p.fgPct, 0) / count,
    ftPct: activePlayers.reduce((sum, p) => sum + p.ftPct, 0) / count,
    threepm: activePlayers.reduce((sum, p) => sum + p.threepm, 0) / count,
    reb: activePlayers.reduce((sum, p) => sum + p.rebounds, 0) / count,
    ast: activePlayers.reduce((sum, p) => sum + p.assists, 0) / count,
    stl: activePlayers.reduce((sum, p) => sum + p.steals, 0) / count,
    blk: activePlayers.reduce((sum, p) => sum + p.blocks, 0) / count,
    to: activePlayers.reduce((sum, p) => sum + p.turnovers, 0) / count,
    pts: activePlayers.reduce((sum, p) => sum + p.points, 0) / count,
  };

  // Weekly projections: team average × 40
  const projections = {
    threepm: Math.round(averages.threepm * WEEKLY_MULTIPLIER),
    reb: Math.round(averages.reb * WEEKLY_MULTIPLIER),
    ast: Math.round(averages.ast * WEEKLY_MULTIPLIER),
    stl: Math.round(averages.stl * WEEKLY_MULTIPLIER),
    blk: Math.round(averages.blk * WEEKLY_MULTIPLIER),
    to: Math.round(averages.to * WEEKLY_MULTIPLIER),
    pts: Math.round(averages.pts * WEEKLY_MULTIPLIER),
  };

  return (
    <Card className="gradient-card shadow-card border-border p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-display font-bold text-muted-foreground">TEAM AVERAGES</h3>
        <span className="text-xs text-muted-foreground">Weekly projection (×{WEEKLY_MULTIPLIER})</span>
      </div>
      <div className="grid grid-cols-5 md:grid-cols-9 gap-2">
        <StatBox label="PTS" value={averages.pts.toFixed(1)} projection={projections.pts} highlight />
        <StatBox label="REB" value={averages.reb.toFixed(1)} projection={projections.reb} />
        <StatBox label="AST" value={averages.ast.toFixed(1)} projection={projections.ast} />
        <StatBox label="3PM" value={averages.threepm.toFixed(1)} projection={projections.threepm} />
        <StatBox label="STL" value={averages.stl.toFixed(1)} projection={projections.stl} />
        <StatBox label="BLK" value={averages.blk.toFixed(1)} projection={projections.blk} />
        <StatBox label="TO" value={averages.to.toFixed(1)} projection={projections.to} negative />
        <StatBox label="FG%" value={`${(averages.fgPct * 100).toFixed(1)}%`} />
        <StatBox label="FT%" value={`${(averages.ftPct * 100).toFixed(1)}%`} />
      </div>
    </Card>
  );
};

interface StatBoxProps {
  label: string;
  value: string;
  projection?: number;
  highlight?: boolean;
  negative?: boolean;
}

const StatBox = ({ label, value, projection, highlight, negative }: StatBoxProps) => (
  <div className="text-center">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-sm font-bold ${highlight ? 'text-primary' : negative ? 'text-stat-negative' : 'text-foreground'}`}>
      {value}
    </p>
    {projection !== undefined && (
      <p className="text-xs text-muted-foreground font-semibold">{projection}</p>
    )}
  </div>
);
