// NBA API utilities for fetching scores and games
// Using NBA.com's public data endpoint (no API key required)

export interface NBAGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  gameTime?: string;
  isLive?: boolean;
}

export interface NBAScheduleGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  arena?: string;
}

// Format date as YYYYMMDD for NBA API
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

// Get yesterday's date
export const getYesterdayDate = (): Date => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday;
};

// Get today's date
export const getTodayDate = (): Date => {
  return new Date();
};

// Fetch games from NBA.com CDN (CORS proxy required in production)
// For now, we'll use static sample data since NBA.com has CORS restrictions
export const fetchNBAScores = async (date: Date): Promise<NBAGame[]> => {
  // NBA.com's scoreboard API has CORS restrictions
  // In production, this would need a backend proxy
  // For demo purposes, returning sample data
  console.log('Fetching NBA scores for:', formatDate(date));
  
  // Return empty to trigger fallback to sample data
  return [];
};

export const fetchTodaySchedule = async (): Promise<NBAScheduleGame[]> => {
  console.log('Fetching today\'s NBA schedule');
  
  // Return empty to trigger fallback to sample data
  return [];
};

// Sample data generator based on current date
export const getSampleYesterdayScores = (): NBAGame[] => {
  const games: NBAGame[] = [
    { gameId: "1", homeTeam: "LAL", awayTeam: "BOS", homeScore: 108, awayScore: 117, status: "Final" },
    { gameId: "2", homeTeam: "MIA", awayTeam: "PHI", homeScore: 102, awayScore: 98, status: "Final" },
    { gameId: "3", homeTeam: "GSW", awayTeam: "PHX", homeScore: 121, awayScore: 116, status: "Final" },
    { gameId: "4", homeTeam: "NYK", awayTeam: "BKN", homeScore: 112, awayScore: 104, status: "Final" },
  ];
  return games;
};

export const getSampleTodayGames = (): NBAScheduleGame[] => {
  const games: NBAScheduleGame[] = [
    { gameId: "5", homeTeam: "DAL", awayTeam: "HOU", gameTime: "7:30 PM" },
    { gameId: "6", homeTeam: "MIN", awayTeam: "LAC", gameTime: "8:00 PM" },
    { gameId: "7", homeTeam: "DEN", awayTeam: "MEM", gameTime: "9:00 PM" },
    { gameId: "8", homeTeam: "SAC", awayTeam: "POR", gameTime: "10:00 PM" },
  ];
  return games;
};
