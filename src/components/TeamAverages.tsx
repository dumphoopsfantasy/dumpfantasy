import { PlayerStats } from "@/types/player";
import { LeagueTeam } from "@/types/league";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TeamAveragesProps {
  players: PlayerStats[];
  leagueTeams?: LeagueTeam[];
  teamName?: string;
}

const WEEKLY_MULTIPLIER = 40;

// Map category keys to league stat keys
const CATEGORY_TO_LEAGUE_KEY: Record<string, keyof LeagueTeam> = {
  pts: 'points',
  reb: 'rebounds',
  ast: 'assists',
  threepm: 'threepm',
  stl: 'steals',
  blk: 'blocks',
  fgPct: 'fgPct',
  ftPct: 'ftPct',
  to: 'turnovers',
};

export const TeamAverages = ({ players, leagueTeams = [], teamName }: TeamAveragesProps) => {
  // Only include active players (with minutes > 0)
  const activePlayers = players.filter(p => p.minutes > 0);
  const count = activePlayers.length || 1;

  // Find user's team in standings (Mr. Bane)
  const userTeam = leagueTeams.find(t => t.name.toLowerCase().includes('bane'));
  const hasStandings = leagueTeams.length > 0 && userTeam;

  // Derive team name from standings or use provided teamName
  const displayTeamName = teamName || userTeam?.name;

  // Get category rank color based on standings
  const getCategoryRankColor = (category: string): string => {
    if (!hasStandings || !userTeam) return '';
    
    const leagueKey = CATEGORY_TO_LEAGUE_KEY[category];
    if (!leagueKey) return '';
    
    const categoryStats = leagueTeams.map(t => ({
      team: t.name,
      value: t[leagueKey] as number ?? 0
    }));
    
    // Sort by value (higher is better, except TO where lower is better)
    const isLowerBetter = category === 'to';
    const sorted = [...categoryStats].sort((a, b) => 
      isLowerBetter ? a.value - b.value : b.value - a.value
    );
    
    const rank = sorted.findIndex(s => s.team === userTeam.name) + 1;
    
    // Top 3 = green, Bottom 3 = red
    if (rank <= 3) return 'text-stat-positive';
    if (rank >= leagueTeams.length - 2) return 'text-stat-negative';
    return '';
  };

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
        <div className="flex items-center gap-2">
          {displayTeamName && (
            <h3 className="text-sm font-display font-bold text-primary">{displayTeamName}</h3>
          )}
          <span className="text-xs text-muted-foreground">×{WEEKLY_MULTIPLIER}</span>
        </div>
        <span className="text-xs text-muted-foreground">Weekly projection</span>
      </div>
      <div className="grid grid-cols-5 md:grid-cols-9 gap-2">
        <StatBox label="FG%" value={`${(averages.fgPct * 100).toFixed(1)}%`} colorClass={getCategoryRankColor('fgPct')} />
        <StatBox label="FT%" value={`${(averages.ftPct * 100).toFixed(1)}%`} colorClass={getCategoryRankColor('ftPct')} />
        <StatBox label="3PM" value={averages.threepm.toFixed(1)} projection={projections.threepm} colorClass={getCategoryRankColor('threepm')} />
        <StatBox label="REB" value={averages.reb.toFixed(1)} projection={projections.reb} colorClass={getCategoryRankColor('reb')} />
        <StatBox label="AST" value={averages.ast.toFixed(1)} projection={projections.ast} colorClass={getCategoryRankColor('ast')} />
        <StatBox label="STL" value={averages.stl.toFixed(1)} projection={projections.stl} colorClass={getCategoryRankColor('stl')} />
        <StatBox label="BLK" value={averages.blk.toFixed(1)} projection={projections.blk} colorClass={getCategoryRankColor('blk')} />
        <StatBox label="TO" value={averages.to.toFixed(1)} projection={projections.to} negative colorClass={getCategoryRankColor('to')} />
        <StatBox label="PTS" value={averages.pts.toFixed(1)} projection={projections.pts} highlight colorClass={getCategoryRankColor('pts')} />
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
  colorClass?: string;
}

const StatBox = ({ label, value, projection, highlight, negative, colorClass }: StatBoxProps) => (
  <div className="text-center">
    <p className={cn("text-xs text-muted-foreground", colorClass)}>{label}</p>
    <p className={cn(
      "text-sm font-bold",
      colorClass || (highlight ? 'text-primary' : negative ? 'text-stat-negative' : 'text-foreground')
    )}>
      {value}
    </p>
    {projection !== undefined && (
      <p className={cn("text-xs text-muted-foreground font-semibold", colorClass)}>{projection}</p>
    )}
  </div>
);