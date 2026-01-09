// NBA API utilities for fetching real scores and games
// Uses Lovable Cloud edge function for live data from ESPN

import { normalizeNbaTeamCode } from './scheduleAwareProjection';
export interface NBAGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  gameTime?: string;
  isLive?: boolean;
  arena?: string;
}

export interface NBAScheduleGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: string;
  arena?: string;
  startTime?: string;
}

export interface PlayerNews {
  headline: string;
  description: string;
  source: string;
  date: string;
  url: string;
}

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

// Format date for display
export const formatDisplayDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Fetch games from edge function (live data from ESPN)
export const fetchNBAGamesFromAPI = async (): Promise<{
  yesterday: { date: string; games: NBAGame[] };
  today: { date: string; games: NBAGame[] };
} | null> => {
  try {
    const response = await fetch(
      'https://tmgvvqvadqymlzmlbumi.supabase.co/functions/v1/nba-games',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.error('NBA games API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching NBA games:', error);
    return null;
  }
};

// Fetch games for a specific date (YYYY-MM-DD format)
export const fetchNBAGamesForDate = async (dateStr: string): Promise<NBAGame[]> => {
  try {
    const response = await fetch(
      `https://tmgvvqvadqymlzmlbumi.supabase.co/functions/v1/nba-games?date=${dateStr}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.error('NBA games API error for date:', dateStr, response.status);
      return [];
    }
    
    const data = await response.json();
    return data.games || [];
  } catch (error) {
    console.error('Error fetching NBA games for date:', dateStr, error);
    return [];
  }
};

// Fetch games for multiple dates in parallel
export const fetchNBAGamesForDates = async (dates: string[]): Promise<Map<string, NBAGame[]>> => {
  const results = await Promise.all(
    dates.map(async (dateStr) => {
      const games = await fetchNBAGamesForDate(dateStr);
      return { date: dateStr, games };
    })
  );
  
  const gamesByDate = new Map<string, NBAGame[]>();
  results.forEach(({ date, games }) => {
    gamesByDate.set(date, games);
  });
  
  return gamesByDate;
};

// Format date as YYYY-MM-DD
export const formatDateForAPI = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get an array of upcoming dates (including today)
export const getUpcomingDates = (days: number = 7): Date[] => {
  const dates: Date[] = [];
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date);
  }
  
  return dates;
};

// Get short day label (Mon, Tue, etc.)
export const getDayLabel = (date: Date): string => {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

// Get day/month label (1/5, 1/6, etc.)
export const getDateLabel = (date: Date): string => {
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

// Check if a team is playing on a specific date
export const isTeamPlayingOnDate = (
  teamCode: string, 
  games: NBAGame[]
): boolean => {
  const normalizedTeam = normalizeNbaTeamCode(teamCode);
  if (!normalizedTeam) return false;
  return games.some(
    game => game.homeTeam === normalizedTeam || game.awayTeam === normalizedTeam
  );
};

// Get opponent for a team on a specific date
export const getOpponentForTeam = (
  teamCode: string,
  games: NBAGame[]
): { opponent: string; isHome: boolean; gameTime?: string } | null => {
  const normalizedTeam = normalizeNbaTeamCode(teamCode);
  if (!normalizedTeam) return null;
  
  const game = games.find(
    g => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam
  );
  
  if (!game) return null;
  
  const isHome = game.homeTeam === normalizedTeam;
  const opponent = isHome ? game.awayTeam : game.homeTeam;
  
  return { opponent, isHome, gameTime: game.gameTime };
};

// Fallback sample data - December 11-12, 2024 actual games
export const getSampleYesterdayScores = (): NBAGame[] => {
  return [
    { gameId: "1", homeTeam: "SAC", awayTeam: "DEN", homeScore: 105, awayScore: 136, status: "Final" },
    { gameId: "2", homeTeam: "MIL", awayTeam: "BOS", homeScore: 116, awayScore: 101, status: "Final" },
  ];
};

export const getSampleTodayGames = (): NBAScheduleGame[] => {
  return [
    { gameId: "3", homeTeam: "DET", awayTeam: "ATL", gameTime: "7:00 PM", startTime: "7:00 PM ET" },
    { gameId: "4", homeTeam: "PHI", awayTeam: "IND", gameTime: "7:30 PM", startTime: "7:30 PM ET" },
  ];
};

// Generate player news with real, clickable URLs
export const fetchPlayerNews = async (playerName: string): Promise<PlayerNews[]> => {
  const encodedName = encodeURIComponent(playerName);
  const googleSearchName = playerName.replace(/\s+/g, '+');
  
  // Use ESPN search as the primary way to find player pages
  // This avoids the pageType validation error from invalid ESPN player URLs
  const espnSearchName = encodeURIComponent(playerName);
  
  // Generate news with real, working URLs
  return [
    {
      headline: `${playerName} - ESPN Player Profile`,
      description: `View complete stats, game logs, news and fantasy info for ${playerName} on ESPN.`,
      source: "ESPN",
      date: "Profile",
      url: `https://www.espn.com/nba/players?search=${espnSearchName}`,
    },
    {
      headline: `${playerName} on Basketball-Reference`,
      description: `Detailed career stats, game logs, and advanced analytics.`,
      source: "BBRef",
      date: "Stats",
      url: `https://www.basketball-reference.com/search/search.fcgi?search=${encodedName}`,
    },
    {
      headline: `Latest ${playerName} News`,
      description: `Search for the most recent news articles, injury updates, and analysis.`,
      source: "Google News",
      date: "Search",
      url: `https://www.google.com/search?q=${googleSearchName}+NBA+news&tbm=nws`,
    },
    {
      headline: `${playerName} Highlights`,
      description: `Watch recent game highlights, interviews, and top plays.`,
      source: "YouTube",
      date: "Video",
      url: `https://www.youtube.com/results?search_query=${encodedName}+highlights+2024`,
    },
  ];
};
