import { PlayerStats } from "@/types/player";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PlayerPhoto } from "@/components/PlayerPhoto";

interface PlayerCardProps {
  player: PlayerStats;
  rank?: number;
  allPlayers?: PlayerStats[];
}

export const PlayerCard = ({ player, rank, allPlayers = [] }: PlayerCardProps) => {
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

  // Calculate CRIS score
  const calculateCRIS = (p: PlayerStats): number => {
    if (p.minutes === 0) return -999; // Players with no stats get lowest score
    
    const weights = {
      points: 1.0, rebounds: 1.2, assists: 1.5, steals: 2.0, blocks: 2.0,
      threepm: 1.3, fgPct: 1.0, ftPct: 0.8, turnovers: -1.5,
    };
    const baselines = {
      points: 12, rebounds: 5, assists: 3, steals: 1, blocks: 0.5,
      threepm: 1.5, fgPct: 0.45, ftPct: 0.75, turnovers: 2,
    };
    
    let score = 0;
    score += ((p.points - baselines.points) / baselines.points) * weights.points * 10;
    score += ((p.rebounds - baselines.rebounds) / baselines.rebounds) * weights.rebounds * 10;
    score += ((p.assists - baselines.assists) / baselines.assists) * weights.assists * 10;
    score += ((p.steals - baselines.steals) / baselines.steals) * weights.steals * 10;
    score += ((p.blocks - baselines.blocks) / Math.max(baselines.blocks, 0.1)) * weights.blocks * 10;
    score += ((p.threepm - baselines.threepm) / baselines.threepm) * weights.threepm * 10;
    score += ((p.fgPct - baselines.fgPct) / baselines.fgPct) * weights.fgPct * 10;
    score += ((p.ftPct - baselines.ftPct) / baselines.ftPct) * weights.ftPct * 10;
    score += ((baselines.turnovers - p.turnovers) / baselines.turnovers) * Math.abs(weights.turnovers) * 10;
    
    return score;
  };

  // Get category rank among roster
  const getCategoryRank = (value: number, stat: string, lowerBetter = false): number => {
    if (allPlayers.length === 0) return 0;
    const validPlayers = allPlayers.filter(p => p.minutes > 0);
    const sorted = [...validPlayers].sort((a, b) => {
      const aVal = a[stat as keyof PlayerStats] as number;
      const bVal = b[stat as keyof PlayerStats] as number;
      return lowerBetter ? aVal - bVal : bVal - aVal;
    });
    const idx = sorted.findIndex(p => p.player === player.player);
    return idx >= 0 ? idx + 1 : validPlayers.length;
  };

  // Get color based on rank (green = good, red = bad)
  const getRankColor = (rank: number, total: number, lowerBetter = false): string => {
    if (total === 0) return 'text-foreground';
    const percentile = rank / total;
    if (percentile <= 0.25) return 'text-stat-positive';
    if (percentile <= 0.5) return 'text-emerald-400';
    if (percentile <= 0.75) return 'text-yellow-400';
    return 'text-stat-negative';
  };

  const validPlayersCount = allPlayers.filter(p => p.minutes > 0).length;
  const crisScore = calculateCRIS(player);

  // Format percentage to thousandths (.485)
  const formatPct = (v: number) => `.${v.toFixed(3).slice(2)}`;

  // Stat configuration: order is MIN, FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS
  const stats = [
    { key: 'minutes', label: 'MIN', value: player.minutes, format: (v: number) => v.toFixed(1) },
    { key: 'fgPct', label: 'FG%', value: player.fgPct, format: formatPct, highlightLeader: true },
    { key: 'ftPct', label: 'FT%', value: player.ftPct, format: formatPct, highlightLeader: true },
    { key: 'threepm', label: '3PM', value: player.threepm, format: (v: number) => v.toFixed(1) },
    { key: 'rebounds', label: 'REB', value: player.rebounds, format: (v: number) => v.toFixed(1) },
    { key: 'assists', label: 'AST', value: player.assists, format: (v: number) => v.toFixed(1) },
    { key: 'steals', label: 'STL', value: player.steals, format: (v: number) => v.toFixed(1) },
    { key: 'blocks', label: 'BLK', value: player.blocks, format: (v: number) => v.toFixed(1) },
    { key: 'turnovers', label: 'TO', value: player.turnovers, format: (v: number) => v.toFixed(1), lowerBetter: true, highlightLeader: true },
    { key: 'points', label: 'PTS', value: player.points, format: (v: number) => v.toFixed(1) },
  ];

  // Check if player is category leader
  const isCategoryLeader = (key: string, lowerBetter = false): boolean => {
    if (allPlayers.length === 0) return false;
    const validPlayers = allPlayers.filter(p => p.minutes > 0);
    if (validPlayers.length === 0) return false;
    const sorted = [...validPlayers].sort((a, b) => {
      const aVal = a[key as keyof PlayerStats] as number;
      const bVal = b[key as keyof PlayerStats] as number;
      return lowerBetter ? aVal - bVal : bVal - aVal;
    });
    return sorted[0]?.player === player.player;
  };

  return (
    <Card className={cn(
      "gradient-card shadow-card border-border hover:border-primary/50 transition-all duration-300 p-4 animate-slide-up",
      (isOnIR || hasNoStats) && "opacity-60"
    )}>
      <div className="flex items-center gap-3 mb-3">
        <PlayerPhoto name={player.player} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {rank && !hasNoStats && (
              <span className="text-primary font-display text-lg font-bold">
                #{rank}
              </span>
            )}
            <h3 className="text-base font-display font-bold text-foreground truncate">
              {player.player}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
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
        {/* CRIS Score */}
        {!hasNoStats && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">CRIS</p>
            <p className={cn(
              "font-display font-bold text-lg",
              crisScore > 5 ? "text-stat-positive" : crisScore < 0 ? "text-stat-negative" : "text-primary"
            )}>
              {crisScore.toFixed(1)}
            </p>
          </div>
        )}
      </div>

      {hasNoStats ? (
        <div className="text-center py-4 text-muted-foreground italic">
          No stats available — player has not played this season
        </div>
      ) : (
        <div className="grid grid-cols-5 md:grid-cols-11 gap-1">
          {stats.map(stat => {
            const rank = getCategoryRank(stat.value, stat.key, stat.lowerBetter);
            const color = getRankColor(rank, validPlayersCount, stat.lowerBetter);
            const isLeader = stat.highlightLeader && isCategoryLeader(stat.key, stat.lowerBetter);
            
            return (
              <div key={stat.key} className={cn(
                "text-center rounded px-1",
                isLeader && "ring-2 ring-primary bg-primary/20"
              )}>
                <p className="text-muted-foreground text-[10px] uppercase">
                  {stat.label}
                </p>
                <p className={cn("font-display font-semibold text-sm", color)}>
                  {stat.format(stat.value)}
                </p>
                {allPlayers.length > 1 && (
                  <p className="text-[9px] text-muted-foreground">
                    #{rank}
                  </p>
                )}
              </div>
            );
          })}
          {/* Empty cell for alignment on mobile */}
          <div className="hidden md:block" />
        </div>
      )}
    </Card>
  );
};
