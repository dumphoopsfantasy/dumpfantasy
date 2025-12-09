import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { 
  NBAGame, 
  NBAScheduleGame, 
  getSampleYesterdayScores, 
  getSampleTodayGames 
} from "@/lib/nbaApi";

export function NBAScoresSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [yesterdayScores, setYesterdayScores] = useState<NBAGame[]>([]);
  const [tonightGames, setTonightGames] = useState<NBAScheduleGame[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // For now, use sample data (NBA APIs require authentication)
      setYesterdayScores(getSampleYesterdayScores());
      setTonightGames(getSampleTodayGames());
    } catch (error) {
      console.error("Error fetching NBA data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
        style={{ width: "280px" }}
      >
        <div className="h-full overflow-y-auto pt-16 pb-6 px-4">
          {/* Refresh Button */}
          <div className="flex justify-end mb-2">
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

          {/* Yesterday's Scores */}
          <div className="mb-6">
            <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
              Yesterday's Scores
            </h3>
            <div className="space-y-2">
              {yesterdayScores.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No games yesterday</p>
              ) : (
                yesterdayScores.map((game) => (
                  <div key={game.gameId} className="bg-secondary/50 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <NBATeamLogo teamCode={game.awayTeam} size="xs" />
                        <span className="text-sm font-medium">{game.awayTeam}</span>
                      </div>
                      <span className={`text-sm font-bold ${game.awayScore > game.homeScore ? "text-foreground" : "text-muted-foreground"}`}>
                        {game.awayScore}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <NBATeamLogo teamCode={game.homeTeam} size="xs" />
                        <span className="text-sm font-medium">{game.homeTeam}</span>
                      </div>
                      <span className={`text-sm font-bold ${game.homeScore > game.awayScore ? "text-foreground" : "text-muted-foreground"}`}>
                        {game.homeScore}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground text-center mt-1.5 pt-1.5 border-t border-border">
                      {game.isLive ? <span className="text-stat-positive animate-pulse">● LIVE</span> : game.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Tonight's Matchups */}
          <div>
            <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
              Tonight's Games
            </h3>
            <div className="space-y-2">
              {tonightGames.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No games tonight</p>
              ) : (
                tonightGames.map((game) => (
                  <div key={game.gameId} className="bg-secondary/50 rounded-lg p-2.5">
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
                    <div className="text-xs text-primary text-center mt-1.5 pt-1.5 border-t border-border font-medium">
                      {game.gameTime}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Note about data */}
          <p className="text-xs text-muted-foreground text-center mt-6 px-2">
            Sample data shown. Live scores require API integration.
          </p>
        </div>
      </div>
    </>
  );
}