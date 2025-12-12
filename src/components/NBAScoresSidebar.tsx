import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Calendar, TrendingUp, Wifi, WifiOff, Users, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { 
  NBAGame, 
  NBAScheduleGame, 
  fetchNBAGamesFromAPI,
  getSampleYesterdayScores, 
  getSampleTodayGames,
  formatDisplayDate
} from "@/lib/nbaApi";

interface NBAScoresSidebarProps {
  rosterTeams?: string[]; // NBA team codes of players on user's roster
}

export function NBAScoresSidebar({ rosterTeams = [] }: NBAScoresSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [yesterdayScores, setYesterdayScores] = useState<NBAGame[]>([]);
  const [tonightGames, setTonightGames] = useState<NBAScheduleGame[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [usingLiveData, setUsingLiveData] = useState(false);
  const [yesterdayDate, setYesterdayDate] = useState<string>("");
  const [todayDate, setTodayDate] = useState<string>("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Try to fetch live data from edge function
      const apiData = await fetchNBAGamesFromAPI();
      
      if (apiData) {
        setYesterdayScores(apiData.yesterday.games.length > 0 ? apiData.yesterday.games : getSampleYesterdayScores());
        setTonightGames(apiData.today.games.map(g => ({
          gameId: g.gameId,
          homeTeam: g.homeTeam,
          awayTeam: g.awayTeam,
          gameTime: g.status === 'Final' ? 'Final' : g.status || g.gameTime || 'TBD',
        })));
        setYesterdayDate(apiData.yesterday.date);
        setTodayDate(apiData.today.date);
        setUsingLiveData(true);
      } else {
        // Fall back to sample data
        setYesterdayScores(getSampleYesterdayScores());
        setTonightGames(getSampleTodayGames());
        setYesterdayDate(new Date(Date.now() - 86400000).toISOString().split('T')[0]);
        setTodayDate(new Date().toISOString().split('T')[0]);
        setUsingLiveData(false);
      }
      
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching NBA data:", error);
      // Fallback to sample data
      setYesterdayScores(getSampleYesterdayScores());
      setTonightGames(getSampleTodayGames());
      setUsingLiveData(false);
      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 2 minutes when sidebar is open
    const interval = setInterval(() => {
      if (isOpen) {
        loadData();
      }
    }, 2 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [loadData, isOpen]);

  // Refresh data when day changes
  useEffect(() => {
    const checkDayChange = setInterval(() => {
      const now = new Date();
      if (lastUpdated && now.getDate() !== lastUpdated.getDate()) {
        loadData();
      }
    }, 60 * 1000);
    
    return () => clearInterval(checkDayChange);
  }, [lastUpdated, loadData]);

  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    return formatDisplayDate(date);
  };

  // Check if user has players on a team
  const hasRosterPlayer = (teamCode: string) => {
    return rosterTeams.includes(teamCode) || rosterTeams.includes(teamCode.toUpperCase());
  };

  // Open ESPN game page
  const openGamePage = (homeTeam: string, awayTeam: string) => {
    // ESPN game URLs follow a pattern, but we'll use the scoreboard for simplicity
    window.open(`https://www.espn.com/nba/scoreboard`, '_blank');
  };

  return (
    <>
      {/* Toggle Button - Always visible */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-20 rounded-l-none border-l-0 bg-primary/90 hover:bg-primary text-primary-foreground px-2 py-8 shadow-lg"
      >
        <div className="flex flex-col items-center gap-1">
          {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="text-[10px] font-semibold writing-mode-vertical" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
            NBA
          </span>
        </div>
      </Button>

      {/* Sidebar Panel */}
      <div
        className={`fixed left-0 top-0 h-full z-10 bg-card border-r border-border shadow-elevated transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: "300px" }}
      >
        <div className="h-full overflow-y-auto pt-16 pb-6 px-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="font-display font-bold text-lg">NBA Scores</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="text-xs text-muted-foreground"
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2 mb-2">
            <Badge 
              variant={usingLiveData ? "default" : "secondary"} 
              className={`text-xs flex items-center gap-1 ${usingLiveData ? 'bg-stat-positive text-white' : ''}`}
            >
              {usingLiveData ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {usingLiveData ? "Live from ESPN" : "Sample Data"}
            </Badge>
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                {lastUpdated.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Yesterday's Scores */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Yesterday {yesterdayDate && `• ${formatDateForDisplay(yesterdayDate)}`}
              </h3>
            </div>
            <div className="space-y-2">
              {yesterdayScores.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 bg-secondary/30 rounded-lg">
                  No games played
                </p>
              ) : (
                yesterdayScores.map((game) => {
                  const hasPlayerInGame = hasRosterPlayer(game.homeTeam) || hasRosterPlayer(game.awayTeam);
                  return (
                    <button
                      key={game.gameId}
                      onClick={() => openGamePage(game.homeTeam, game.awayTeam)}
                      className={`w-full bg-secondary/50 rounded-lg p-2.5 hover:bg-secondary/70 transition-colors text-left ${
                        hasPlayerInGame ? 'ring-1 ring-primary/50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <NBATeamLogo teamCode={game.awayTeam} size="xs" />
                          <span className="text-sm font-medium">{game.awayTeam}</span>
                          {hasRosterPlayer(game.awayTeam) && (
                            <Users className="w-3 h-3 text-primary" />
                          )}
                        </div>
                        <span className={`text-sm font-bold ${game.awayScore > game.homeScore ? "text-stat-positive" : "text-muted-foreground"}`}>
                          {game.awayScore}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <NBATeamLogo teamCode={game.homeTeam} size="xs" />
                          <span className="text-sm font-medium">{game.homeTeam}</span>
                          {hasRosterPlayer(game.homeTeam) && (
                            <Users className="w-3 h-3 text-primary" />
                          )}
                        </div>
                        <span className={`text-sm font-bold ${game.homeScore > game.awayScore ? "text-stat-positive" : "text-muted-foreground"}`}>
                          {game.homeScore}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border">
                        {game.isLive ? (
                          <span className="text-stat-positive animate-pulse font-medium">● LIVE - {game.status}</span>
                        ) : (
                          <span className="font-medium">{game.status}</span>
                        )}
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Today's Matchups */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm text-primary uppercase tracking-wide">
                Today {todayDate && `• ${formatDateForDisplay(todayDate)}`}
              </h3>
            </div>
            <div className="space-y-2">
              {tonightGames.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 bg-secondary/30 rounded-lg">
                  No games scheduled
                </p>
              ) : (
                tonightGames.map((game) => {
                  const hasPlayerInGame = hasRosterPlayer(game.homeTeam) || hasRosterPlayer(game.awayTeam);
                  return (
                    <button
                      key={game.gameId}
                      onClick={() => openGamePage(game.homeTeam, game.awayTeam)}
                      className={`w-full bg-secondary/50 rounded-lg p-2.5 hover:bg-secondary/70 transition-colors text-left ${
                        hasPlayerInGame ? 'ring-1 ring-primary/50' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <NBATeamLogo teamCode={game.awayTeam} size="xs" />
                          <span className="text-sm font-medium">{game.awayTeam}</span>
                          {hasRosterPlayer(game.awayTeam) && (
                            <Users className="w-3 h-3 text-primary" />
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">@</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <NBATeamLogo teamCode={game.homeTeam} size="xs" />
                          <span className="text-sm font-medium">{game.homeTeam}</span>
                          {hasRosterPlayer(game.homeTeam) && (
                            <Users className="w-3 h-3 text-primary" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1.5 pt-1.5 border-t border-border">
                        <span className="font-semibold">
                          {game.gameTime === 'Final' ? (
                            <span className="text-muted-foreground">Final</span>
                          ) : game.gameTime.includes('Qtr') || game.gameTime === 'Halftime' ? (
                            <span className="text-stat-positive animate-pulse">● {game.gameTime}</span>
                          ) : (
                            <span className="text-primary">{game.gameTime}</span>
                          )}
                        </span>
                        <ExternalLink className="w-3 h-3 opacity-50 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Your Players Legend - At Top */}
          {rosterTeams.length > 0 && (
            <div className="mb-4 p-2 bg-primary/10 rounded-lg border border-primary/30">
              <p className="text-xs text-primary text-center flex items-center justify-center gap-1 font-semibold">
                <Users className="w-3 h-3" />
                = Your players in this game
              </p>
            </div>
          )}

          {/* Footer Note */}
          <div className="mt-6 p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground text-center">
              {usingLiveData ? (
                <>Data from ESPN. Auto-refreshes every 2 min.</>
              ) : (
                <>Sample data shown. Refresh to try live data.</>
              )}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
