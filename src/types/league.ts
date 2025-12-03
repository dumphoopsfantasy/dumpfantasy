export interface LeagueTeam {
  name: string;
  manager: string;
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
  record?: string;
}

export interface CategoryRanking {
  category: string;
  rank: number;
  value: number;
  leader: string;
  leaderValue: number;
}
