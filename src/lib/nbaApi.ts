// NBA API utilities for fetching real scores and games
// Uses Lovable Cloud edge function for live data from ESPN

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
}

export interface PlayerNews {
  headline: string;
  description: string;
  source: string;
  date: string;
  url?: string;
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

// Fallback sample data - December 11-12, 2024 actual games
export const getSampleYesterdayScores = (): NBAGame[] => {
  return [
    { gameId: "1", homeTeam: "SAC", awayTeam: "DEN", homeScore: 105, awayScore: 136, status: "Final" },
    { gameId: "2", homeTeam: "MIL", awayTeam: "BOS", homeScore: 116, awayScore: 101, status: "Final" },
  ];
};

export const getSampleTodayGames = (): NBAScheduleGame[] => {
  return [
    { gameId: "3", homeTeam: "DET", awayTeam: "ATL", gameTime: "7:00 PM" },
    { gameId: "4", homeTeam: "PHI", awayTeam: "IND", gameTime: "7:30 PM" },
  ];
};

// ESPN player ID database for direct links
const ESPN_PLAYER_IDS: Record<string, string> = {
  "LeBron James": "1966",
  "Stephen Curry": "3975",
  "Kevin Durant": "3202",
  "Giannis Antetokounmpo": "3032977",
  "Luka Doncic": "3945274",
  "Nikola Jokic": "3112335",
  "Joel Embiid": "3059318",
  "Jayson Tatum": "4065648",
  "Damian Lillard": "6606",
  "Anthony Davis": "6583",
  "Jimmy Butler": "6430",
  "Kawhi Leonard": "6450",
  "Paul George": "4251",
  "Kyrie Irving": "6442",
  "Devin Booker": "3136193",
  "Ja Morant": "4279888",
  "Trae Young": "4277905",
  "Donovan Mitchell": "3908809",
  "Bam Adebayo": "4066261",
  "Jaylen Brown": "3917376",
  "Zion Williamson": "4395628",
  "Anthony Edwards": "4594327",
  "Tyrese Haliburton": "4395725",
  "De'Aaron Fox": "4066259",
  "Domantas Sabonis": "3155942",
  "Pascal Siakam": "3149673",
  "Karl-Anthony Towns": "4066533",
  "Rudy Gobert": "3032976",
  "DeMar DeRozan": "3978",
  "Bradley Beal": "6580",
  "Khris Middleton": "6609",
  "Jrue Holiday": "4238",
  "Chris Paul": "2779",
  "Jamal Murray": "3936299",
  "James Harden": "3992",
  "Russell Westbrook": "3468",
  "Kristaps Porzingis": "3102531",
  "Brandon Ingram": "4066328",
  "CJ McCollum": "2490149",
  "Fred VanVleet": "2991230",
  "Tyrese Maxey": "4431678",
  "Scottie Barnes": "4594268",
  "Cade Cunningham": "4432158",
  "Evan Mobley": "4594327",
  "Franz Wagner": "4432166",
  "Paolo Banchero": "4433134",
  "Victor Wembanyama": "4871934",
  "Chet Holmgren": "4432809",
};

// Generate ESPN player URL
const getESPNPlayerUrl = (playerName: string): string => {
  const playerId = ESPN_PLAYER_IDS[playerName];
  if (playerId) {
    // Direct ESPN player page
    return `https://www.espn.com/nba/player/_/id/${playerId}`;
  }
  // Fallback to ESPN search
  const searchName = playerName.toLowerCase().replace(/\s+/g, '+');
  return `https://www.espn.com/nba/player/_/name/${searchName}`;
};

// Generate player news with real, clickable URLs
export const fetchPlayerNews = async (playerName: string): Promise<PlayerNews[]> => {
  const firstName = playerName.split(' ')[0];
  const lastName = playerName.split(' ').slice(1).join(' ') || firstName;
  const encodedName = encodeURIComponent(playerName);
  const espnUrl = getESPNPlayerUrl(playerName);
  
  // Generate news with real, working URLs
  const newsTemplates: PlayerNews[] = [
    {
      headline: `${playerName} - Full Player Profile & Stats`,
      description: `View ${playerName}'s complete career statistics, game logs, news, and fantasy projections on ESPN.`,
      source: "ESPN",
      date: "Live",
      url: espnUrl,
    },
    {
      headline: `Latest news and updates for ${lastName}`,
      description: `Search Google News for the most recent stories, injury reports, and analysis about ${playerName}.`,
      source: "Google News",
      date: "Search",
      url: `https://news.google.com/search?q=${encodedName}+NBA`,
    },
    {
      headline: `${playerName} Fantasy Basketball Analysis`,
      description: `Expert fantasy basketball analysis, rankings, and trade values for ${playerName}.`,
      source: "Yahoo Fantasy",
      date: "Analysis",
      url: `https://sports.yahoo.com/search?query=${encodedName}`,
    },
    {
      headline: `${lastName} Highlights & Game Recaps`,
      description: `Watch ${playerName}'s latest highlights, interviews, and game recaps on YouTube.`,
      source: "YouTube",
      date: "Video",
      url: `https://www.youtube.com/results?search_query=${encodedName}+highlights`,
    },
  ];
  
  return newsTemplates;
};
