export interface PlayerStats {
  player: string;
  team: string;
  position: string;
  opponent: string;
  minutes: number;
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
  status?: string;
  slot?: string;
}

export interface TeamData {
  starters: PlayerStats[];
  bench: PlayerStats[];
  injured: PlayerStats[];
}
