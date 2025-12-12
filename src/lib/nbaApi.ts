// NBA API utilities for fetching real scores and games
// Using balldontlie.io free API (no key required for basic endpoints)

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

export interface PlayerNews {
  headline: string;
  description: string;
  source: string;
  date: string;
  url?: string;
}

// Team abbreviation mapping for balldontlie API
const TEAM_ABBR_MAP: Record<string, string> = {
  "Atlanta Hawks": "ATL",
  "Boston Celtics": "BOS",
  "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA",
  "Chicago Bulls": "CHI",
  "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL",
  "Denver Nuggets": "DEN",
  "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW",
  "Houston Rockets": "HOU",
  "Indiana Pacers": "IND",
  "LA Clippers": "LAC",
  "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM",
  "Miami Heat": "MIA",
  "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN",
  "New Orleans Pelicans": "NOP",
  "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC",
  "Orlando Magic": "ORL",
  "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX",
  "Portland Trail Blazers": "POR",
  "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS",
  "Toronto Raptors": "TOR",
  "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

// Format date as YYYY-MM-DD for balldontlie API
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

// Parse time from ISO string to readable format
const formatGameTime = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return "TBD";
  }
};

// Fetch games from balldontlie.io API
export const fetchNBAGames = async (date: Date): Promise<NBAGame[]> => {
  const dateStr = formatDate(date);
  
  try {
    const response = await fetch(`https://api.balldontlie.io/v1/games?dates[]=${dateStr}`, {
      headers: {
        'Authorization': 'YOUR_API_KEY' // Free tier doesn't require key for basic requests
      }
    });
    
    if (!response.ok) {
      console.warn('BallDontLie API request failed, falling back to sample data');
      return [];
    }
    
    const data = await response.json();
    
    return (data.data || []).map((game: any) => ({
      gameId: String(game.id),
      homeTeam: TEAM_ABBR_MAP[game.home_team?.full_name] || game.home_team?.abbreviation || "UNK",
      awayTeam: TEAM_ABBR_MAP[game.visitor_team?.full_name] || game.visitor_team?.abbreviation || "UNK",
      homeScore: game.home_team_score || 0,
      awayScore: game.visitor_team_score || 0,
      status: game.status === "Final" ? "Final" : game.status === "1st Qtr" || game.status === "2nd Qtr" || game.status === "3rd Qtr" || game.status === "4th Qtr" || game.status === "Halftime" ? "Live" : game.time || "Scheduled",
      gameTime: formatGameTime(game.date),
      isLive: game.status !== "Final" && game.home_team_score > 0,
    }));
  } catch (error) {
    console.error("Error fetching NBA games:", error);
    return [];
  }
};

// Fetch today's schedule
export const fetchTodaySchedule = async (): Promise<NBAScheduleGame[]> => {
  const today = getTodayDate();
  const games = await fetchNBAGames(today);
  
  return games.map(game => ({
    gameId: game.gameId,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    gameTime: game.status === "Final" ? "Final" : game.gameTime || "TBD",
  }));
};

// Fetch yesterday's scores
export const fetchYesterdayScores = async (): Promise<NBAGame[]> => {
  const yesterday = getYesterdayDate();
  return fetchNBAGames(yesterday);
};

// Sample data generator based on current date (fallback)
export const getSampleYesterdayScores = (): NBAGame[] => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  // Vary games based on day of week for more realistic feel
  const gamesByDay: NBAGame[][] = [
    // Sunday
    [
      { gameId: "1", homeTeam: "LAL", awayTeam: "BOS", homeScore: 108, awayScore: 117, status: "Final" },
      { gameId: "2", homeTeam: "MIA", awayTeam: "PHI", homeScore: 102, awayScore: 98, status: "Final" },
    ],
    // Monday
    [
      { gameId: "3", homeTeam: "GSW", awayTeam: "PHX", homeScore: 121, awayScore: 116, status: "Final" },
      { gameId: "4", homeTeam: "NYK", awayTeam: "BKN", homeScore: 112, awayScore: 104, status: "Final" },
      { gameId: "5", homeTeam: "CHI", awayTeam: "CLE", homeScore: 95, awayScore: 108, status: "Final" },
    ],
    // Tuesday
    [
      { gameId: "6", homeTeam: "DAL", awayTeam: "HOU", homeScore: 118, awayScore: 109, status: "Final" },
      { gameId: "7", homeTeam: "DEN", awayTeam: "UTA", homeScore: 126, awayScore: 115, status: "Final" },
    ],
    // Wednesday
    [
      { gameId: "8", homeTeam: "MIL", awayTeam: "IND", homeScore: 131, awayScore: 124, status: "Final" },
      { gameId: "9", homeTeam: "ATL", awayTeam: "ORL", homeScore: 108, awayScore: 104, status: "Final" },
      { gameId: "10", homeTeam: "POR", awayTeam: "SAC", homeScore: 112, awayScore: 118, status: "Final" },
    ],
    // Thursday
    [
      { gameId: "11", homeTeam: "BOS", awayTeam: "MIA", homeScore: 115, awayScore: 102, status: "Final" },
      { gameId: "12", homeTeam: "LAC", awayTeam: "LAL", homeScore: 108, awayScore: 112, status: "Final" },
    ],
    // Friday
    [
      { gameId: "13", homeTeam: "PHX", awayTeam: "OKC", homeScore: 104, awayScore: 118, status: "Final" },
      { gameId: "14", homeTeam: "MIN", awayTeam: "DEN", homeScore: 121, awayScore: 114, status: "Final" },
      { gameId: "15", homeTeam: "TOR", awayTeam: "CHA", homeScore: 108, awayScore: 95, status: "Final" },
      { gameId: "16", homeTeam: "WAS", awayTeam: "DET", homeScore: 102, awayScore: 108, status: "Final" },
    ],
    // Saturday
    [
      { gameId: "17", homeTeam: "SAS", awayTeam: "NOP", homeScore: 115, awayScore: 122, status: "Final" },
      { gameId: "18", homeTeam: "MEM", awayTeam: "DAL", homeScore: 118, awayScore: 115, status: "Final" },
      { gameId: "19", homeTeam: "GSW", awayTeam: "LAC", homeScore: 124, awayScore: 116, status: "Final" },
    ],
  ];
  
  return gamesByDay[dayOfWeek] || gamesByDay[0];
};

export const getSampleTodayGames = (): NBAScheduleGame[] => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  // Vary games based on day of week
  const scheduleByDay: NBAScheduleGame[][] = [
    // Sunday
    [
      { gameId: "20", homeTeam: "CHI", awayTeam: "MIL", gameTime: "3:30 PM" },
      { gameId: "21", homeTeam: "PHX", awayTeam: "DAL", gameTime: "6:00 PM" },
    ],
    // Monday
    [
      { gameId: "22", homeTeam: "ATL", awayTeam: "NYK", gameTime: "7:30 PM" },
      { gameId: "23", homeTeam: "DEN", awayTeam: "MIN", gameTime: "9:00 PM" },
    ],
    // Tuesday
    [
      { gameId: "24", homeTeam: "BOS", awayTeam: "CLE", gameTime: "7:00 PM" },
      { gameId: "25", homeTeam: "LAL", awayTeam: "GSW", gameTime: "10:00 PM" },
      { gameId: "26", homeTeam: "MIA", awayTeam: "ORL", gameTime: "7:30 PM" },
    ],
    // Wednesday
    [
      { gameId: "27", homeTeam: "PHI", awayTeam: "BKN", gameTime: "7:30 PM" },
      { gameId: "28", homeTeam: "HOU", awayTeam: "SAS", gameTime: "8:00 PM" },
    ],
    // Thursday
    [
      { gameId: "29", homeTeam: "OKC", awayTeam: "MEM", gameTime: "8:00 PM" },
      { gameId: "30", homeTeam: "POR", awayTeam: "UTA", gameTime: "10:00 PM" },
      { gameId: "31", homeTeam: "SAC", awayTeam: "LAC", gameTime: "10:30 PM" },
    ],
    // Friday
    [
      { gameId: "32", homeTeam: "NYK", awayTeam: "MIL", gameTime: "7:30 PM" },
      { gameId: "33", homeTeam: "TOR", awayTeam: "IND", gameTime: "7:00 PM" },
    ],
    // Saturday
    [
      { gameId: "34", homeTeam: "CLE", awayTeam: "CHI", gameTime: "5:00 PM" },
      { gameId: "35", homeTeam: "NOP", awayTeam: "ATL", gameTime: "7:00 PM" },
      { gameId: "36", homeTeam: "GSW", awayTeam: "BOS", gameTime: "8:30 PM" },
      { gameId: "37", homeTeam: "LAL", awayTeam: "PHX", gameTime: "10:30 PM" },
    ],
  ];
  
  return scheduleByDay[dayOfWeek] || scheduleByDay[0];
};

// Fetch player news using a public RSS/News aggregator approach
// Note: For production, you'd want to use a dedicated sports news API
export const fetchPlayerNews = async (playerName: string): Promise<PlayerNews[]> => {
  // In production, this would call a real API
  // For now, we'll generate contextual mock news based on player name
  // This provides a better UX than completely generic news
  
  const firstName = playerName.split(' ')[0];
  const lastName = playerName.split(' ').slice(1).join(' ');
  
  const newsTemplates: PlayerNews[] = [
    {
      headline: `${lastName} leads team in latest victory`,
      description: `${playerName} contributed significantly in the team's recent game with an impressive stat line.`,
      source: "ESPN",
      date: "2 hours ago",
    },
    {
      headline: `Coach praises ${firstName}'s recent performance`,
      description: `The coaching staff highlighted ${playerName}'s work ethic and on-court contributions.`,
      source: "The Athletic",
      date: "5 hours ago",
    },
    {
      headline: `${lastName} expected to maintain starting role`,
      description: `${playerName} continues to be a key part of the team's rotation moving forward.`,
      source: "Yahoo Sports",
      date: "1 day ago",
    },
  ];
  
  return newsTemplates;
};
