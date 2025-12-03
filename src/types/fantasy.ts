export interface Player {
  id: string;
  name: string;
  nbaTeam: string;
  positions: string[];
  photoUrl?: string;
  
  // Game info
  opponent?: string;
  gameTime?: string;
  gamesPlayed?: number;
  gamesThisWeek?: number;
  
  // Status
  status?: 'healthy' | 'DTD' | 'O' | 'IR' | 'SUSP';
  statusNote?: string;
  
  // 9-cat stats
  minutes: number;
  fgm: number;
  fga: number;
  fgPct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
  
  // Advanced metrics
  gamescore?: number;
  cri?: number;
  cris?: number;
  playoffRank?: number;
  rostPct?: number;
  plusMinus?: number;
}

export interface RosterSlot {
  slot: string;
  slotType: 'starter' | 'bench' | 'ir';
  player: Player;
}

export interface FantasyTeam {
  id: string;
  name: string;
  manager?: string;
  roster?: RosterSlot[];
  
  // Weekly totals
  fgPct?: number;
  ftPct?: number;
  threepm?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  turnovers?: number;
  points?: number;
  
  // Advanced
  cri?: number;
  cris?: number;
}

export interface WeeklyStats {
  week: number;
  teams: {
    team: FantasyTeam;
    stats: CategoryStats;
    wins?: number;
    losses?: number;
    ties?: number;
  }[];
}

export interface CategoryStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

export interface MatchupProjection {
  myTeam: {
    name: string;
    stats: CategoryStats;
  };
  opponent: {
    name: string;
    stats: CategoryStats;
  };
}

export interface CategoryComparison {
  category: string;
  myValue: number;
  theirValue: number;
  winner: 'you' | 'them' | 'tie';
  lowerIsBetter?: boolean;
}

export type SlotType = 'PG' | 'SG' | 'SF' | 'PF' | 'C' | 'G' | 'F' | 'F/C' | 'UTIL' | 'Bench' | 'IR';

export const SLOT_ORDER: SlotType[] = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'F/C', 'UTIL', 'Bench', 'IR'];

export const NBA_TEAMS: Record<string, string> = {
  'ATL': 'Atlanta Hawks',
  'BOS': 'Boston Celtics',
  'BKN': 'Brooklyn Nets',
  'CHA': 'Charlotte Hornets',
  'CHI': 'Chicago Bulls',
  'CLE': 'Cleveland Cavaliers',
  'DAL': 'Dallas Mavericks',
  'DEN': 'Denver Nuggets',
  'DET': 'Detroit Pistons',
  'GSW': 'Golden State Warriors',
  'HOU': 'Houston Rockets',
  'IND': 'Indiana Pacers',
  'LAC': 'LA Clippers',
  'LAL': 'Los Angeles Lakers',
  'MEM': 'Memphis Grizzlies',
  'MIA': 'Miami Heat',
  'MIL': 'Milwaukee Bucks',
  'MIN': 'Minnesota Timberwolves',
  'NOP': 'New Orleans Pelicans',
  'NO': 'New Orleans Pelicans',
  'NYK': 'New York Knicks',
  'OKC': 'Oklahoma City Thunder',
  'ORL': 'Orlando Magic',
  'PHI': 'Philadelphia 76ers',
  'PHX': 'Phoenix Suns',
  'POR': 'Portland Trail Blazers',
  'SAC': 'Sacramento Kings',
  'SAS': 'San Antonio Spurs',
  'SA': 'San Antonio Spurs',
  'TOR': 'Toronto Raptors',
  'UTA': 'Utah Jazz',
  'WAS': 'Washington Wizards',
};

export const CATEGORIES: Array<{ key: string; label: string; format: 'pct' | 'num'; lowerIsBetter?: boolean }> = [
  { key: 'fgPct', label: 'FG%', format: 'pct' },
  { key: 'ftPct', label: 'FT%', format: 'pct' },
  { key: 'threepm', label: '3PM', format: 'num' },
  { key: 'rebounds', label: 'REB', format: 'num' },
  { key: 'assists', label: 'AST', format: 'num' },
  { key: 'steals', label: 'STL', format: 'num' },
  { key: 'blocks', label: 'BLK', format: 'num' },
  { key: 'turnovers', label: 'TO', format: 'num', lowerIsBetter: true },
  { key: 'points', label: 'PTS', format: 'num' },
];