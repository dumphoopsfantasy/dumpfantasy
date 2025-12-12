import { PlayerStats } from "@/types/player";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { Card } from "@/components/ui/card";
import { Trophy, Target, Crosshair, Shield, Hand, Zap, Percent, TrendingDown } from "lucide-react";
import { formatPct } from "@/lib/crisUtils";
import { cn } from "@/lib/utils";

interface PlayerRankingsProps {
  players: PlayerStats[];
  onPlayerClick?: (player: Player) => void;
  leagueTeams?: LeagueTeam[];
}

// Map category keys to league stat keys
const CATEGORY_TO_LEAGUE_KEY: Record<string, keyof LeagueTeam> = {
  points: 'points',
  rebounds: 'rebounds',
  assists: 'assists',
  threepm: 'threepm',
  steals: 'steals',
  blocks: 'blocks',
  fgPct: 'fgPct',
  ftPct: 'ftPct',
  turnovers: 'turnovers',
};

export const PlayerRankings = ({ players, onPlayerClick, leagueTeams = [] }: PlayerRankingsProps) => {
  const activePlayers = players.filter(p => p.minutes > 0);

  // Find user's team in standings (Mr. Bane)
  const userTeam = leagueTeams.find(t => t.name.toLowerCase().includes('bane'));
  const hasStandings = leagueTeams.length > 0 && userTeam;

  // Get category ranks from standings
  const getCategoryRankColor = (category: string): string => {
    if (!hasStandings || !userTeam) return '';
    
    const leagueKey = CATEGORY_TO_LEAGUE_KEY[category];
    if (!leagueKey) return '';
    
    const categoryStats = leagueTeams.map(t => ({
      team: t.name,
      value: t[leagueKey] as number ?? 0
    }));
    
    // Sort by value (higher is better, except TO where lower is better)
    const sorted = [...categoryStats].sort((a, b) => 
      category === 'turnovers' ? a.value - b.value : b.value - a.value
    );
    
    const rank = sorted.findIndex(s => s.team === userTeam.name) + 1;
    
    // Top 3 = green, Bottom 3 = red
    if (rank <= 3) return 'text-stat-positive';
    if (rank >= leagueTeams.length - 2) return 'text-stat-negative';
    return '';
  };

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
    { label: "FG% Leader", icon: <Percent className="w-4 h-4" />, player: getTopPlayer("fgPct"), stat: "fgPct", suffix: "FG%", format: "pct" },
    { label: "FT% Leader", icon: <Percent className="w-4 h-4" />, player: getTopPlayer("ftPct"), stat: "ftPct", suffix: "FT%", format: "pct" },
    { label: "3PM Leader", icon: <Crosshair className="w-4 h-4" />, player: getTopPlayer("threepm"), stat: "threepm", suffix: "3PM", format: "num" },
    { label: "Rebounds Leader", icon: <Shield className="w-4 h-4" />, player: getTopPlayer("rebounds"), stat: "rebounds", suffix: "RPG", format: "num" },
    { label: "Assists Leader", icon: <Target className="w-4 h-4" />, player: getTopPlayer("assists"), stat: "assists", suffix: "APG", format: "num" },
    { label: "Steals Leader", icon: <Hand className="w-4 h-4" />, player: getTopPlayer("steals"), stat: "steals", suffix: "SPG", format: "num" },
    { label: "Blocks Leader", icon: <Zap className="w-4 h-4" />, player: getTopPlayer("blocks"), stat: "blocks", suffix: "BPG", format: "num" },
    { label: "Fewest TO", icon: <TrendingDown className="w-4 h-4" />, player: getTopPlayer("turnovers", true), stat: "turnovers", suffix: "TO", format: "num" },
    { label: "Points Leader", icon: <Trophy className="w-4 h-4" />, player: getTopPlayer("points"), stat: "points", suffix: "PPG", format: "num" },
  ];

  const formatValue = (value: number, format: string) => {
    if (format === 'pct') return formatPct(value);
    return value.toFixed(1);
  };

  const handlePlayerClick = (playerStats: PlayerStats | null) => {
    if (!playerStats || !onPlayerClick) return;
    
    // Convert PlayerStats to Player format
    const player: Player = {
      id: playerStats.player,
      name: playerStats.player,
      nbaTeam: playerStats.team || '',
      positions: playerStats.position ? [playerStats.position] : [],
      minutes: playerStats.minutes,
      fgm: 0,
      fga: 0,
      fgPct: playerStats.fgPct,
      ftm: 0,
      fta: 0,
      ftPct: playerStats.ftPct,
      threepm: playerStats.threepm,
      rebounds: playerStats.rebounds,
      assists: playerStats.assists,
      steals: playerStats.steals,
      blocks: playerStats.blocks,
      turnovers: playerStats.turnovers,
      points: playerStats.points,
    };
    
    onPlayerClick(player);
  };

  return (
    <Card className="gradient-card shadow-card border-border p-4 mb-6">
      <h3 className="text-sm font-display font-bold text-muted-foreground mb-3">CATEGORY LEADERS</h3>
      <div className="grid grid-cols-3 md:grid-cols-9 gap-2">
        {rankings.map((r, i) => {
          const categoryColor = getCategoryRankColor(r.stat);
          return (
            <button
              key={i}
              type="button"
              onClick={() => handlePlayerClick(r.player)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded bg-muted/30 text-center transition-colors",
                onPlayerClick && r.player && "hover:bg-primary/20 cursor-pointer"
              )}
            >
              <div className={cn("text-primary", categoryColor)}>{r.icon}</div>
              <p className={cn("text-xs text-muted-foreground", categoryColor)}>
                {r.label.replace(' Leader', '').replace('Fewest ', '')}
              </p>
              <p className="text-xs font-semibold truncate max-w-full">{r.player?.player || 'N/A'}</p>
              <p className={cn("text-xs text-primary font-bold", categoryColor)}>
                {r.player ? formatValue(r.player[r.stat as keyof PlayerStats] as number, r.format) : '-'}
              </p>
            </button>
          );
        })}
      </div>
    </Card>
  );
};