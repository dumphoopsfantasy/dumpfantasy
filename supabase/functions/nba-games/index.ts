import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// SECURITY: Restrict CORS to specific origins in production
// For now, allow the Lovable preview domains and localhost
const ALLOWED_ORIGINS = [
  'https://lovable.dev',
  'https://preview--',
  'http://localhost:',
  'http://127.0.0.1:',
];

const getCorsHeaders = (origin: string | null) => {
  // Check if origin matches allowed patterns
  const isAllowed = !origin || ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed) || origin.includes('.lovable.dev'));
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : 'https://lovable.dev',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
};

// Simple in-memory rate limiting (per-function instance)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 60; // requests per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window

const checkRateLimit = (clientIP: string): boolean => {
  const now = Date.now();
  const record = rateLimitMap.get(clientIP);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_REQUESTS) {
    return false;
  }
  
  record.count++;
  return true;
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
      
      // Extract scheduled start time for upcoming games
      let gameTime = event.status?.type?.shortDetail || '';
      
      // If game hasn't started, try to get the scheduled time
      if (status === 'Scheduled' && event.date) {
        try {
          const gameDate = new Date(event.date);
          gameTime = gameDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true,
            timeZone: 'America/New_York'
          }) + ' ET';
        } catch (e) {
          console.log('Error parsing game date:', e);
        }
      }
      
      return {
        gameId: event.id,
        homeTeam: TEAM_ABBR[homeTeam?.team?.displayName] || homeTeam?.team?.abbreviation || 'UNK',
        awayTeam: TEAM_ABBR[awayTeam?.team?.displayName] || awayTeam?.team?.abbreviation || 'UNK',
        homeScore: parseInt(homeTeam?.score || '0'),
        awayScore: parseInt(awayTeam?.score || '0'),
        status: status === 'Final' ? 'Final' : status,
        gameTime,
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
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Extract client IP for rate limiting
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                   req.headers.get('cf-connecting-ip') || 
                   'unknown';
  
  // Check rate limit
  if (!checkRateLimit(clientIP)) {
    console.log(`Rate limit exceeded for IP: ${clientIP}`);
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
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
