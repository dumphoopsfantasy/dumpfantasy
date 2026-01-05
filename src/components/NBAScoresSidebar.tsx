import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Calendar, TrendingUp, Wifi, WifiOff, Users, ExternalLink, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { 
  NBAGame, 
  NBAScheduleGame, 
  fetchNBAGamesFromAPI,
  getSampleYesterdayScores, 
  getSampleTodayGames,
  formatDisplayDate
} from "@/lib/nbaApi";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { devError } from "@/lib/devLog";

interface RosterPlayer {
  name: string;
  team: string;
  position?: string;
}

interface NBAScoresSidebarProps {
  rosterTeams?: string[]; // NBA team codes of players on user's roster
  rosterPlayers?: RosterPlayer[]; // Full roster player data for matching
}

interface GameWithPlayers extends NBAGame {
  matchingPlayers: RosterPlayer[];
  originalTipTime?: string;
}

export function NBAScoresSidebar({ rosterTeams = [], rosterPlayers = [] }: NBAScoresSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [yesterdayScores, setYesterdayScores] = useState<GameWithPlayers[]>([]);
  const [tonightGames, setTonightGames] = useState<GameWithPlayers[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [usingLiveData, setUsingLiveData] = useState(false);
  const [yesterdayDate, setYesterdayDate] = useState<string>("");
  const [todayDate, setTodayDate] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"yesterday" | "today">("today");
  const [expandedGames, setExpandedGames] = useState<Set<string>>(new Set());

  // Find matching roster players for a game
  const findMatchingPlayers = useCallback((homeTeam: string, awayTeam: string): RosterPlayer[] => {
    if (rosterPlayers.length === 0) {
      // Fallback to team-based matching if no roster players provided
      return [];
    }
    
    return rosterPlayers.filter(player => {
      const playerTeam = player.team?.toUpperCase();
      return playerTeam === homeTeam.toUpperCase() || playerTeam === awayTeam.toUpperCase();
    });
  }, [rosterPlayers]);

  // Check if user has players on a team (fallback for when rosterPlayers not available)
  const hasRosterTeam = useCallback((teamCode: string): boolean => {
    return rosterTeams.includes(teamCode) || rosterTeams.includes(teamCode.toUpperCase());
  }, [rosterTeams]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Try to fetch live data from edge function
      const apiData = await fetchNBAGamesFromAPI();
      
      if (apiData) {
        // Map yesterday's games with matching players
        const yesterdayWithPlayers: GameWithPlayers[] = apiData.yesterday.games.map(g => ({
          ...g,
          matchingPlayers: findMatchingPlayers(g.homeTeam, g.awayTeam),
          originalTipTime: g.gameTime !== 'Final' && g.gameTime !== 'Final/OT' ? g.gameTime : undefined
        }));
        
        // Map today's games with matching players
        const todayWithPlayers: GameWithPlayers[] = apiData.today.games.map(g => ({
          ...g,
          matchingPlayers: findMatchingPlayers(g.homeTeam, g.awayTeam),
          originalTipTime: g.gameTime
        }));
        
        setYesterdayScores(yesterdayWithPlayers);
        setTonightGames(todayWithPlayers);
        setYesterdayDate(apiData.yesterday.date);
        setTodayDate(apiData.today.date);
        setUsingLiveData(true);
      } else {
        // Fall back to sample data
        const sampleYesterday = getSampleYesterdayScores().map(g => ({
          ...g,
          matchingPlayers: findMatchingPlayers(g.homeTeam, g.awayTeam)
        }));
        const sampleToday = getSampleTodayGames().map(g => ({
          gameId: g.gameId,
          homeTeam: g.homeTeam,
          awayTeam: g.awayTeam,
          homeScore: 0,
          awayScore: 0,
          status: 'Scheduled',
          gameTime: g.gameTime,
          matchingPlayers: findMatchingPlayers(g.homeTeam, g.awayTeam),
          originalTipTime: g.gameTime
        }));
        
        setYesterdayScores(sampleYesterday);
        setTonightGames(sampleToday);
        setYesterdayDate(new Date(Date.now() - 86400000).toISOString().split('T')[0]);
        setTodayDate(new Date().toISOString().split('T')[0]);
        setUsingLiveData(false);
      }
      
      setLastUpdated(new Date());
    } catch (error) {
      devError("Error fetching NBA data:", error);
      // Fallback to sample data
      const sampleYesterday = getSampleYesterdayScores().map(g => ({
        ...g,
        matchingPlayers: findMatchingPlayers(g.homeTeam, g.awayTeam)
      }));
      setYesterdayScores(sampleYesterday);
      setTonightGames([]);
      setUsingLiveData(false);
      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  }, [findMatchingPlayers]);

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

  // Toggle game expansion
  const toggleGameExpansion = (gameId: string) => {
    setExpandedGames(prev => {
      const next = new Set(prev);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  };

  // Check if game has any of my players
  const hasMyPlayers = (game: GameWithPlayers): boolean => {
    if (game.matchingPlayers.length > 0) return true;
    // Fallback to team-based check
    return hasRosterTeam(game.homeTeam) || hasRosterTeam(game.awayTeam);
  };

  // Open ESPN game page
  const openGamePage = () => {
    window.open(`https://www.espn.com/nba/scoreboard`, '_blank');
  };

  // Render game card
  const renderGameCard = (game: GameWithPlayers, isYesterday: boolean) => {
    const hasPlayers = hasMyPlayers(game);
    const isExpanded = expandedGames.has(game.gameId);
    const isFinal = game.status === 'Final' || game.status?.includes('Final');
    const isLive = game.isLive || game.status?.includes('Qtr') || game.status === 'Halftime';
    
    // Determine what time to show
    const displayTime = game.gameTime || game.originalTipTime || 'TBD';
    const showScore = isFinal || isLive;
    
    return (
      <div
        key={game.gameId}
        className={`bg-accent/20 rounded-lg overflow-hidden transition-all ${
          hasPlayers ? 'ring-2 ring-primary/60 bg-primary/10' : ''
        }`}
      >
        {/* Main game info - clickable to ESPN */}
        <button
          onClick={openGamePage}
          className="w-full p-2.5 hover:bg-secondary/70 transition-colors text-left"
        >
          {/* Away Team Row */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <NBATeamLogo teamCode={game.awayTeam} size="xs" />
              <span className="text-sm font-medium truncate">{game.awayTeam}</span>
            </div>
            {showScore ? (
              <span className={`text-sm font-bold tabular-nums ${
                game.awayScore > game.homeScore ? "text-stat-positive" : "text-muted-foreground"
              }`}>
                {game.awayScore}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">@</span>
            )}
          </div>
          
          {/* Home Team Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <NBATeamLogo teamCode={game.homeTeam} size="xs" />
              <span className="text-sm font-medium truncate">{game.homeTeam}</span>
            </div>
            {showScore && (
              <span className={`text-sm font-bold tabular-nums ${
                game.homeScore > game.awayScore ? "text-stat-positive" : "text-muted-foreground"
              }`}>
                {game.homeScore}
              </span>
            )}
          </div>
          
          {/* Status & Time Row */}
          <div className="flex items-center justify-between text-xs mt-1.5 pt-1.5 border-t border-border/50">
            <div className="flex items-center gap-2">
              {isLive ? (
                <span className="text-stat-positive animate-pulse font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-stat-positive animate-pulse" />
                  {game.status}
                </span>
              ) : isFinal ? (
                <span className="text-muted-foreground font-medium">{game.status}</span>
              ) : (
                <span className="text-primary font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {displayTime}
                </span>
              )}
            </div>
            <ExternalLink className="w-3 h-3 opacity-50 text-muted-foreground" />
          </div>
        </button>
        
        {/* My Players Badge & Expandable Section */}
        {hasPlayers && (
          <div className="border-t border-border/50">
            <Collapsible open={isExpanded} onOpenChange={() => toggleGameExpansion(game.gameId)}>
              <CollapsibleTrigger asChild>
                <button className="w-full px-2.5 py-1.5 flex items-center justify-between hover:bg-primary/20 transition-colors">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-primary" />
                    <span className="text-xs font-semibold text-primary">
                      {game.matchingPlayers.length > 0 
                        ? `My Players: ${game.matchingPlayers.length}`
                        : 'My Team'
                      }
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3 text-primary" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-primary" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-2.5 pb-2 space-y-1">
                  {game.matchingPlayers.length > 0 ? (
                    game.matchingPlayers.map((player, idx) => (
                      <div key={idx} className="flex items-center gap-2 py-1 px-2 bg-primary/10 rounded">
                        <PlayerPhoto 
                          name={player.name} 
                          size="xs"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium truncate block">{player.name}</span>
                          <span className="text-[10px] text-muted-foreground">{player.team} • {player.position || 'N/A'}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground italic px-2">
                      You have players on {hasRosterTeam(game.homeTeam) ? game.homeTeam : game.awayTeam}
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </div>
    );
  };

  // Count games with my players
  const myGamesYesterday = yesterdayScores.filter(hasMyPlayers).length;
  const myGamesToday = tonightGames.filter(hasMyPlayers).length;

  return (
    <>
      {/* Toggle Button - Always visible */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-20 rounded-l-none border-l-0 bg-primary hover:bg-primary/90 px-2 py-8 shadow-lg"
        style={{ color: '#1a1a1a' }}
      >
        <div className="flex flex-col items-center gap-1">
          {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="text-[11px] font-extrabold writing-mode-vertical" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
            NBA
          </span>
        </div>
      </Button>

      {/* Sidebar Panel */}
      <div
        className={`fixed left-0 top-0 h-full z-10 bg-card border-r border-border shadow-elevated transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: "320px" }}
      >
        <div className="h-full overflow-y-auto pt-16 pb-6 px-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
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
          <div className="flex items-center gap-2 mb-3">
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

          {/* Your Players Legend */}
          {(rosterTeams.length > 0 || rosterPlayers.length > 0) && (
            <div className="mb-3 p-2 bg-primary/10 rounded-lg border border-primary/30">
              <p className="text-xs text-primary text-center flex items-center justify-center gap-1 font-semibold">
                <Users className="w-3 h-3" />
                Games with your players are highlighted
              </p>
            </div>
          )}

          {/* Tab Switcher */}
          <div className="flex gap-1 mb-4 p-1 bg-secondary/50 rounded-lg">
            <button
              onClick={() => setActiveTab("today")}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
                activeTab === "today"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="w-3 h-3 inline mr-1" />
              Today {myGamesToday > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1">{myGamesToday}</Badge>}
            </button>
            <button
              onClick={() => setActiveTab("yesterday")}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
                activeTab === "yesterday"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yesterday {myGamesYesterday > 0 && <Badge variant="secondary" className="ml-1 text-[10px] px-1">{myGamesYesterday}</Badge>}
            </button>
          </div>

          {/* Content based on active tab */}
          {activeTab === "today" && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-primary" />
                <h3 className="font-display font-semibold text-sm text-primary uppercase tracking-wide">
                  Today {todayDate && `• ${formatDateForDisplay(todayDate)}`}
                </h3>
              </div>
              <div className="space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="bg-secondary/50 rounded-lg p-3 animate-pulse">
                        <div className="h-4 bg-secondary rounded w-3/4 mb-2" />
                        <div className="h-4 bg-secondary rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : tonightGames.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6 bg-secondary/30 rounded-lg">
                    No games scheduled for today
                  </p>
                ) : (
                  tonightGames.map(game => renderGameCard(game, false))
                )}
              </div>
            </div>
          )}

          {activeTab === "yesterday" && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Yesterday {yesterdayDate && `• ${formatDateForDisplay(yesterdayDate)}`}
                </h3>
              </div>
              <div className="space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="bg-secondary/50 rounded-lg p-3 animate-pulse">
                        <div className="h-4 bg-secondary rounded w-3/4 mb-2" />
                        <div className="h-4 bg-secondary rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : yesterdayScores.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6 bg-secondary/30 rounded-lg">
                    No games played yesterday
                  </p>
                ) : (
                  yesterdayScores.map(game => renderGameCard(game, true))
                )}
              </div>
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
