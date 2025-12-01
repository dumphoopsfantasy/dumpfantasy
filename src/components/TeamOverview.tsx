import { PlayerStats } from "@/types/player";
import { Card } from "@/components/ui/card";
import { Users, TrendingUp, Target, Award } from "lucide-react";

interface TeamOverviewProps {
  players: PlayerStats[];
}

export const TeamOverview = ({ players }: TeamOverviewProps) => {
  const totalPoints = players.reduce((sum, p) => sum + p.points, 0);
  const totalRebounds = players.reduce((sum, p) => sum + p.rebounds, 0);
  const totalAssists = players.reduce((sum, p) => sum + p.assists, 0);
  const avgFgPct = players.reduce((sum, p) => sum + p.fgPct, 0) / players.length;

  const topScorer = players.reduce((max, p) => p.points > max.points ? p : max, players[0]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-fade-in">
      <StatCard
        icon={<Target className="w-6 h-6" />}
        label="Total Points"
        value={totalPoints.toFixed(1)}
        color="text-primary"
      />
      <StatCard
        icon={<TrendingUp className="w-6 h-6" />}
        label="Avg FG%"
        value={`${(avgFgPct * 100).toFixed(1)}%`}
        color="text-stat-positive"
      />
      <StatCard
        icon={<Users className="w-6 h-6" />}
        label="Total Assists"
        value={totalAssists.toFixed(1)}
        color="text-stat-neutral"
      />
      <StatCard
        icon={<Award className="w-6 h-6" />}
        label="Top Scorer"
        value={topScorer?.player || 'N/A'}
        subValue={`${topScorer?.points.toFixed(1)} PPG`}
        color="text-primary"
      />
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  color: string;
}

const StatCard = ({ icon, label, value, subValue, color }: StatCardProps) => (
  <Card className="gradient-card shadow-card border-border p-6 hover:border-primary/50 transition-all duration-300">
    <div className="flex items-start justify-between mb-4">
      <div className={`p-3 rounded-lg ${color.replace('text-', 'bg-')}/10`}>
        <div className={color}>
          {icon}
        </div>
      </div>
    </div>
    <p className="text-sm text-muted-foreground mb-1">{label}</p>
    <p className={`text-3xl font-display font-bold ${color}`}>{value}</p>
    {subValue && (
      <p className="text-sm text-muted-foreground mt-1">{subValue}</p>
    )}
  </Card>
);
