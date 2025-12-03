import { PlayerStats } from "@/types/player";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";

interface PlayerCardProps {
  player: PlayerStats;
  rank?: number;
  allPlayers?: PlayerStats[];
}

export const PlayerCard = ({ player, rank, allPlayers = [] }: PlayerCardProps) => {
  const isOnIR = player.slot?.toLowerCase().includes('ir');
  // A player has valid stats if they have ANY stat data (from Last 15 averages)
  const hasValidStats = player.points > 0 || player.rebounds > 0 || player.assists > 0 || 
                        player.steals > 0 || player.blocks > 0 || player.threepm > 0 ||
                        player.fgPct > 0 || player.ftPct > 0;
  const hasNoStats = !hasValidStats;
  
  // For CRIS comparison: only include players WITH valid stats, regardless of IR status
  // IR players WITH stats (like RJ Barrett) should be compared
  // IR players WITHOUT stats (like Dejounte Murray) should be excluded
  const playersWithStats = allPlayers.filter(p => {
    const pHasStats = p.points > 0 || p.rebounds > 0 || p.assists > 0 || 
                      p.steals > 0 || p.blocks > 0 || p.threepm > 0 ||
                      p.fgPct > 0 || p.ftPct > 0;
    return pHasStats;
  });
  
  const getStatusBadgeStyle = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'O': return 'bg-destructive/20 text-destructive border-destructive/50';
      case 'IR': return 'bg-destructive/20 text-destructive border-destructive/50';
      case 'DTD': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'GTD': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Calculate CRIS score (always positive, 0-100 scale)
  const calculateCRIS = (p: PlayerStats): number => {
    if (p.minutes === 0) return 0;
    
    // Score based on fantasy value - normalized to always be positive
    const pts = Math.min(p.points / 30, 1) * 20;       // max 20 pts contribution
    const reb = Math.min(p.rebounds / 12, 1) * 15;     // max 15 pts
    const ast = Math.min(p.assists / 10, 1) * 15;      // max 15 pts
    const stl = Math.min(p.steals / 2.5, 1) * 10;      // max 10 pts
    const blk = Math.min(p.blocks / 2, 1) * 10;        // max 10 pts
    const tpm = Math.min(p.threepm / 4, 1) * 10;       // max 10 pts
    const fg = Math.min(p.fgPct / 0.55, 1) * 10;       // max 10 pts
    const ft = Math.min(p.ftPct / 0.90, 1) * 5;        // max 5 pts
    const to = Math.max(0, 5 - p.turnovers);           // max 5 pts (lower TO = more pts)
    
    return pts + reb + ast + stl + blk + tpm + fg + ft + to;
  };

  // Get category rank among players WITH VALID STATS (per CRIS spec)
  const getCategoryRank = (value: number, stat: string, lowerBetter = false): number => {
    // Use players with stats for ranking (includes IR players with stats like RJ Barrett)
    if (playersWithStats.length === 0) return 0;
    
    // Add current player if they have stats (for their own ranking calculation)
    const playersForRanking = hasValidStats 
      ? [...playersWithStats].filter((p, i, arr) => arr.findIndex(x => x.player === p.player) === i)
      : playersWithStats;
    
    const sorted = [...playersForRanking].sort((a, b) => {
      const aVal = a[stat as keyof PlayerStats] as number;
      const bVal = b[stat as keyof PlayerStats] as number;
      return lowerBetter ? aVal - bVal : bVal - aVal;
    });
    const idx = sorted.findIndex(p => p.player === player.player);
    return idx >= 0 ? idx + 1 : playersForRanking.length;
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

  // Count for ranking display - only players WITH valid stats
  const validPlayersCount = playersWithStats.length;
  const crisScore = calculateCRIS(player);

  // Format percentage to thousandths (.485 or 1.000 for 100%)
  const formatPct = (v: number) => {
    if (v >= 1) return v.toFixed(3);
    return `.${v.toFixed(3).slice(2)}`;
  };

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
        <NBATeamLogo teamCode={player.team} size="sm" />
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
        {/* CRI Score */}
        {!hasNoStats && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">CRI</p>
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
          Data not available
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
                isLeader && "ring-1 ring-stat-positive/50 bg-stat-positive/10"
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
