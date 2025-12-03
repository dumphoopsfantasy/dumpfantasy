import { PlayerStats } from "@/types/player";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

  const isOnIR = player.slot?.toLowerCase().includes('ir');
  const hasNoStats = player.minutes === 0;
  
  const getStatusBadgeStyle = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'O': return 'bg-destructive/20 text-destructive border-destructive/50';
      case 'IR': return 'bg-destructive/20 text-destructive border-destructive/50';
      case 'DTD': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'GTD': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className={cn(
      "gradient-card shadow-card border-border hover:border-primary/50 transition-all duration-300 p-4 animate-slide-up",
      (isOnIR || hasNoStats) && "opacity-60"
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {rank && (
            <span className="text-primary font-display text-lg font-bold">
              #{rank}
            </span>
          )}
          <h3 className="text-base font-display font-bold text-foreground">
            {player.player}
          </h3>
          <Badge variant="secondary" className="text-xs">
            {player.team}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {player.position}
          </Badge>
          {/* Injury/IR status badge */}
          {(player.status || isOnIR) && (
            <Badge 
              variant="outline"
              className={cn("text-xs font-bold", getStatusBadgeStyle(player.status || (isOnIR ? 'IR' : '')))}
            >
              {player.status || (isOnIR ? 'IR' : '')}
            </Badge>
          )}
          {player.opponent && player.opponent !== '--' && (
            <span className="text-xs text-muted-foreground">
              vs {player.opponent}
            </span>
          )}
        </div>
      </div>

      {hasNoStats ? (
        <div className="text-center py-4 text-muted-foreground italic">
          No stats available — player has not played this season
        </div>
      ) : (
        <div className="grid grid-cols-4 md:grid-cols-10 gap-2">
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

          <StatItem 
            label="FG%" 
            value={`${(player.fgPct * 100).toFixed(0)}%`}
            color={getStatColor(player.fgPct, 'fgPct')}
          />
          <StatItem 
            label="FT%" 
            value={`${(player.ftPct * 100).toFixed(0)}%`}
            color={getStatColor(player.ftPct, 'ftPct')}
          />
          <StatItem 
            label="3PM" 
            value={player.threepm.toFixed(1)}
          />
          <StatItem 
            label="STL" 
            value={player.steals.toFixed(1)}
          />
          <StatItem 
            label="BLK" 
            value={player.blocks.toFixed(1)}
          />
          <StatItem 
            label="TO" 
            value={player.turnovers.toFixed(1)}
            color={getStatColor(player.turnovers, 'turnovers')}
          />
        </div>
      )}
    </Card>
  );
};

interface StatItemProps {
  label: string;
  value: string;
  highlight?: boolean;
  color?: string;
}

const StatItem = ({ label, value, highlight, color }: StatItemProps) => (
  <div className="text-center">
    <p className="text-muted-foreground text-xs">
      {label}
    </p>
    <p className={`
      font-display font-semibold text-sm
      ${highlight ? 'text-primary' : color || 'text-foreground'}
    `}>
      {value}
    </p>
  </div>
);
