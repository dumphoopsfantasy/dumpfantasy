import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NBAGame {
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

// Team name to abbreviation mapping
const TEAM_ABBR: Record<string, string> = {
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
  "Los Angeles Clippers": "LAC",
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

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Fetch from ESPN's public scoreboard API (no auth required)
async function fetchESPNGames(dateStr: string): Promise<NBAGame[]> {
  try {
    // ESPN's scoreboard endpoint is publicly accessible
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr.replace(/-/g, '')}`;
    console.log(`Fetching ESPN games for ${dateStr}: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NBA-Scores/1.0)',
      }
    });
    
    if (!response.ok) {
      console.error(`ESPN API error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    console.log(`Found ${events.length} games for ${dateStr}`);
    
    return events.map((event: any) => {
      const competition = event.competitions?.[0];
      const homeTeam = competition?.competitors?.find((c: any) => c.homeAway === 'home');
      const awayTeam = competition?.competitors?.find((c: any) => c.homeAway === 'away');
      
      const status = event.status?.type?.description || 'Scheduled';
      const isLive = status === 'In Progress' || status.includes('Qtr') || status === 'Halftime';
      
      return {
        gameId: event.id,
        homeTeam: TEAM_ABBR[homeTeam?.team?.displayName] || homeTeam?.team?.abbreviation || 'UNK',
        awayTeam: TEAM_ABBR[awayTeam?.team?.displayName] || awayTeam?.team?.abbreviation || 'UNK',
        homeScore: parseInt(homeTeam?.score || '0'),
        awayScore: parseInt(awayTeam?.score || '0'),
        status: status === 'Final' ? 'Final' : status,
        gameTime: event.status?.type?.shortDetail || '',
        isLive,
        arena: competition?.venue?.fullName,
      };
    });
  } catch (error) {
    console.error('Error fetching ESPN games:', error);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get('date');
    
    // Get yesterday's and today's dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const todayStr = formatDate(today);
    const yesterdayStr = formatDate(yesterday);
    
    console.log(`Processing request. Today: ${todayStr}, Yesterday: ${yesterdayStr}`);
    
    if (dateParam) {
      // Fetch specific date
      const games = await fetchESPNGames(dateParam);
      return new Response(JSON.stringify({ games, date: dateParam }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Fetch both yesterday and today
    const [yesterdayGames, todayGames] = await Promise.all([
      fetchESPNGames(yesterdayStr),
      fetchESPNGames(todayStr),
    ]);
    
    console.log(`Results: ${yesterdayGames.length} yesterday, ${todayGames.length} today`);
    
    return new Response(JSON.stringify({
      yesterday: {
        date: yesterdayStr,
        games: yesterdayGames,
      },
      today: {
        date: todayStr,
        games: todayGames,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in nba-games function:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
