import { PlayerStats } from "@/types/player";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

interface PlayerCardProps {
  player: PlayerStats;
  rank?: number;
}

export const PlayerCard = ({ player, rank }: PlayerCardProps) => {
  const getStatColor = (value: number, stat: string) => {
    if (stat === 'turnovers') {
      return value < 2 ? 'text-stat-positive' : value > 3 ? 'text-stat-negative' : 'text-foreground';
    }
    if (stat === 'fgPct' || stat === 'ftPct') {
      return value > 0.5 ? 'text-stat-positive' : value < 0.4 ? 'text-stat-negative' : 'text-foreground';
    }
    return 'text-foreground';
  };

  return (
    <Card className="gradient-card shadow-card border-border hover:border-primary/50 transition-all duration-300 p-6 animate-slide-up">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {rank && (
              <span className="text-primary font-display text-2xl font-bold">
                #{rank}
              </span>
            )}
            <h3 className="text-xl font-display font-bold text-foreground">
              {player.player}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="font-medium">
              {player.team}
            </Badge>
            <Badge variant="outline" className="font-medium">
              {player.position}
            </Badge>
            {player.opponent && (
              <span className="text-sm text-muted-foreground">
                vs {player.opponent}
              </span>
            )}
          </div>
        </div>
        {player.status && (
          <Badge 
            variant={player.status === 'O' ? 'destructive' : 'default'}
            className="ml-2"
          >
            {player.status}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatItem 
          label="PTS" 
          value={player.points.toFixed(1)} 
          highlight 
        />
        <StatItem 
          label="REB" 
          value={player.rebounds.toFixed(1)} 
        />
        <StatItem 
          label="AST" 
          value={player.assists.toFixed(1)} 
        />
        <StatItem 
          label="MIN" 
          value={player.minutes.toFixed(1)} 
        />
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4 pt-4 border-t border-border">
        <StatItem 
          label="FG%" 
          value={`${(player.fgPct * 100).toFixed(1)}%`}
          color={getStatColor(player.fgPct, 'fgPct')}
          small 
        />
        <StatItem 
          label="FT%" 
          value={`${(player.ftPct * 100).toFixed(1)}%`}
          color={getStatColor(player.ftPct, 'ftPct')}
          small 
        />
        <StatItem 
          label="3PM" 
          value={player.threepm.toFixed(1)}
          small 
        />
        <StatItem 
          label="STL" 
          value={player.steals.toFixed(1)}
          small 
        />
        <StatItem 
          label="BLK" 
          value={player.blocks.toFixed(1)}
          small 
        />
        <StatItem 
          label="TO" 
          value={player.turnovers.toFixed(1)}
          color={getStatColor(player.turnovers, 'turnovers')}
          small 
        />
      </div>
    </Card>
  );
};

interface StatItemProps {
  label: string;
  value: string;
  highlight?: boolean;
  color?: string;
  small?: boolean;
}

const StatItem = ({ label, value, highlight, color, small }: StatItemProps) => (
  <div className={`${small ? 'text-center' : ''}`}>
    <p className={`text-muted-foreground ${small ? 'text-xs' : 'text-sm'} mb-1`}>
      {label}
    </p>
    <p className={`
      font-display font-bold 
      ${highlight ? 'text-primary text-2xl' : color || 'text-foreground'}
      ${small ? 'text-lg' : 'text-xl'}
    `}>
      {value}
    </p>
  </div>
);
