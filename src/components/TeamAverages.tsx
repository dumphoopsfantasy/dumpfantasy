import { PlayerStats } from "@/types/player";
import { Card } from "@/components/ui/card";

interface TeamAveragesProps {
  players: PlayerStats[];
}

export const TeamAverages = ({ players }: TeamAveragesProps) => {
  const activePlayers = players.filter(p => p.minutes > 0);
  const count = activePlayers.length || 1;

  const averages = {
    min: activePlayers.reduce((sum, p) => sum + p.minutes, 0) / count,
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

  const totals = {
    pts: activePlayers.reduce((sum, p) => sum + p.points, 0),
    reb: activePlayers.reduce((sum, p) => sum + p.rebounds, 0),
    ast: activePlayers.reduce((sum, p) => sum + p.assists, 0),
    threepm: activePlayers.reduce((sum, p) => sum + p.threepm, 0),
    stl: activePlayers.reduce((sum, p) => sum + p.steals, 0),
    blk: activePlayers.reduce((sum, p) => sum + p.blocks, 0),
  };

  return (
    <Card className="gradient-card shadow-card border-border p-4 mb-6">
      <h3 className="text-sm font-display font-bold text-muted-foreground mb-3">TEAM AVERAGES</h3>
      <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
        <StatBox label="PTS" value={averages.pts.toFixed(1)} total={totals.pts.toFixed(0)} highlight />
        <StatBox label="REB" value={averages.reb.toFixed(1)} total={totals.reb.toFixed(0)} />
        <StatBox label="AST" value={averages.ast.toFixed(1)} total={totals.ast.toFixed(0)} />
        <StatBox label="3PM" value={averages.threepm.toFixed(1)} total={totals.threepm.toFixed(0)} />
        <StatBox label="STL" value={averages.stl.toFixed(1)} total={totals.stl.toFixed(0)} />
        <StatBox label="BLK" value={averages.blk.toFixed(1)} total={totals.blk.toFixed(0)} />
        <StatBox label="TO" value={averages.to.toFixed(1)} negative />
        <StatBox label="FG%" value={`${(averages.fgPct * 100).toFixed(1)}%`} />
        <StatBox label="FT%" value={`${(averages.ftPct * 100).toFixed(1)}%`} />
        <StatBox label="MIN" value={averages.min.toFixed(1)} />
      </div>
    </Card>
  );
};

interface StatBoxProps {
  label: string;
  value: string;
  total?: string;
  highlight?: boolean;
  negative?: boolean;
}

const StatBox = ({ label, value, total, highlight, negative }: StatBoxProps) => (
  <div className="text-center">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-sm font-bold ${highlight ? 'text-primary' : negative ? 'text-stat-negative' : 'text-foreground'}`}>
      {value}
    </p>
    {total && <p className="text-xs text-muted-foreground">Tot: {total}</p>}
  </div>
);
