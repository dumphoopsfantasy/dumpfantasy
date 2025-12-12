import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Calendar, TrendingUp, Wifi, WifiOff } from "lucide-react";
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

export function NBAScoresSidebar() {
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

  return (
    <>
      {/* Toggle Button - Always visible */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-20 rounded-l-none border-l-0 bg-card hover:bg-secondary px-1.5 py-6"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
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
          <div className="flex items-center gap-2 mb-4">
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
                yesterdayScores.map((game) => (
                  <div key={game.gameId} className="bg-secondary/50 rounded-lg p-2.5 hover:bg-secondary/70 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <NBATeamLogo teamCode={game.awayTeam} size="xs" />
                        <span className="text-sm font-medium">{game.awayTeam}</span>
                      </div>
                      <span className={`text-sm font-bold ${game.awayScore > game.homeScore ? "text-stat-positive" : "text-muted-foreground"}`}>
                        {game.awayScore}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <NBATeamLogo teamCode={game.homeTeam} size="xs" />
                        <span className="text-sm font-medium">{game.homeTeam}</span>
                      </div>
                      <span className={`text-sm font-bold ${game.homeScore > game.awayScore ? "text-stat-positive" : "text-muted-foreground"}`}>
                        {game.homeScore}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground text-center mt-1.5 pt-1.5 border-t border-border">
                      {game.isLive ? (
                        <span className="text-stat-positive animate-pulse font-medium">● LIVE - {game.status}</span>
                      ) : (
                        <span className="font-medium">{game.status}</span>
                      )}
                    </div>
                  </div>
                ))
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
                tonightGames.map((game) => (
                  <div key={game.gameId} className="bg-secondary/50 rounded-lg p-2.5 hover:bg-secondary/70 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <NBATeamLogo teamCode={game.awayTeam} size="xs" />
                        <span className="text-sm font-medium">{game.awayTeam}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">@</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <NBATeamLogo teamCode={game.homeTeam} size="xs" />
                        <span className="text-sm font-medium">{game.homeTeam}</span>
                      </div>
                    </div>
                    <div className="text-xs text-center mt-1.5 pt-1.5 border-t border-border font-semibold">
                      {game.gameTime === 'Final' ? (
                        <span className="text-muted-foreground">Final</span>
                      ) : game.gameTime.includes('Qtr') || game.gameTime === 'Halftime' ? (
                        <span className="text-stat-positive animate-pulse">● {game.gameTime}</span>
                      ) : (
                        <span className="text-primary">{game.gameTime}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

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
