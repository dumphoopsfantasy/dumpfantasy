import { useState, useEffect } from "react";
import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatStat, getStatusColor, calculatePlayerScore } from "@/lib/playerUtils";
import { fetchPlayerNews, PlayerNews } from "@/lib/nbaApi";
import { cn } from "@/lib/utils";
import { Trophy, TrendingUp, Target, Calendar, Newspaper, ExternalLink, RefreshCw, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlayerDetailSheetProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allPlayers?: Player[];
}

// Get percentile-based color for stats
const getStatPercentileColor = (value: number, allValues: number[], lowerIsBetter = false): string => {
  if (allValues.length === 0) return "";
  
  // Sort descending for "higher is better", ascending for "lower is better"
  const sorted = [...allValues].sort((a, b) => lowerIsBetter ? a - b : b - a);
  const rank = sorted.indexOf(value) + 1;
  const percentile = rank / sorted.length;
  
  if (percentile <= 0.15) return "text-stat-positive bg-stat-positive/20"; // Top 15%
  if (percentile <= 0.33) return "text-emerald-400 bg-emerald-400/10"; // Top 33%
  if (percentile >= 0.85) return "text-stat-negative bg-stat-negative/20"; // Bottom 15%
  if (percentile >= 0.67) return "text-orange-400 bg-orange-400/10"; // Bottom 33%
  return "bg-secondary/30"; // Middle
};

export const PlayerDetailSheet = ({ player, open, onOpenChange, allPlayers = [] }: PlayerDetailSheetProps) => {
  const [news, setNews] = useState<PlayerNews[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(false);

  useEffect(() => {
    if (player && open) {
      loadPlayerNews(player.name);
    }
  }, [player, open]);

  const loadPlayerNews = async (playerName: string) => {
    setIsLoadingNews(true);
    try {
      const playerNews = await fetchPlayerNews(playerName);
      setNews(playerNews);
    } catch (error) {
      console.error("Error fetching player news:", error);
      setNews([]);
    } finally {
      setIsLoadingNews(false);
    }
  };

  if (!player) return null;

  const statusColor = getStatusColor(player.status);
  const fantasyScore = calculatePlayerScore(player);

  // Calculate percentile colors for each stat
  const getColorForStat = (statKey: string, value: number, lowerIsBetter = false) => {
    if (allPlayers.length === 0) return "bg-secondary/30";
    const validPlayers = allPlayers.filter(p => p.minutes > 0);
    const allValues = validPlayers.map(p => (p as any)[statKey] as number).filter(v => v !== undefined);
    return getStatPercentileColor(value, allValues, lowerIsBetter);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg gradient-card border-border p-0">
        <ScrollArea className="h-full">
          <div className="p-6">
            <SheetHeader className="text-left">
              <div className="flex items-start gap-4 mb-4">
                <PlayerPhoto name={player.name} size="xl" />
                <div className="flex-1">
                  <SheetTitle className="text-2xl font-display">{player.name}</SheetTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <NBATeamLogo teamCode={player.nbaTeam} size="sm" />
                    <Badge variant="secondary" className="font-medium">
                      {player.nbaTeam}
                    </Badge>
                    <span className="text-muted-foreground">{player.positions.join(" / ")}</span>
                  </div>
                  {player.status && player.status !== "healthy" && (
                    <Badge variant="outline" className={cn("mt-2", statusColor)}>
                      {player.status} {player.statusNote && `- ${player.statusNote}`}
                    </Badge>
                  )}
                </div>
              </div>
            </SheetHeader>

            {/* Game Info */}
            {player.opponent && (
              <div className="bg-secondary/30 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Next Game</p>
                </div>
                <p className="font-display font-bold text-lg">
                  vs {player.opponent} {player.gameTime && <span className="text-primary">@ {player.gameTime}</span>}
                </p>
              </div>
            )}

            {/* Fantasy Score */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-primary/10 rounded-lg p-4 text-center relative group">
                <Trophy className="w-5 h-5 mx-auto mb-1 text-primary" />
                <p className="text-xs text-muted-foreground">Fantasy Value</p>
                <p className="font-display font-bold text-xl text-primary">{fantasyScore.toFixed(1)}</p>
                {/* Tooltip explanation */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-popover border border-border rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  <p className="text-xs font-semibold mb-1">Fantasy Value Formula:</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    PTS×1 + REB×1.2 + AST×1.5 + STL×3 + BLK×3 + 3PM×1.2 - TO×1 + FG% impact + FT% impact
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Higher = more valuable in 9-cat leagues
                  </p>
                </div>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4 text-center">
                <TrendingUp className="w-5 h-5 mx-auto mb-1 text-stat-positive" />
                <p className="text-xs text-muted-foreground">CRI</p>
                <p className="font-display font-bold text-xl">{player.cri?.toFixed(1) ?? "--"}</p>
              </div>
            </div>

            {/* Full Stats with Color Coding */}
            <div className="space-y-4 mb-6">
              <h4 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wider">
                Season Averages
              </h4>
              
              {/* Row 1: MIN, PTS, REB */}
              <div className="grid grid-cols-3 gap-3">
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('minutes', player.minutes))}>
                  <p className="text-[10px] text-muted-foreground uppercase">MIN</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.minutes, "decimal")}</p>
                </div>
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('points', player.points))}>
                  <p className="text-[10px] text-muted-foreground uppercase">PTS</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.points, "decimal")}</p>
                </div>
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('rebounds', player.rebounds))}>
                  <p className="text-[10px] text-muted-foreground uppercase">REB</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.rebounds, "decimal")}</p>
                </div>
              </div>

              {/* Row 2: AST, STL, BLK */}
              <div className="grid grid-cols-3 gap-3">
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('assists', player.assists))}>
                  <p className="text-[10px] text-muted-foreground uppercase">AST</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.assists, "decimal")}</p>
                </div>
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('steals', player.steals))}>
                  <p className="text-[10px] text-muted-foreground uppercase">STL</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.steals, "decimal")}</p>
                </div>
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('blocks', player.blocks))}>
                  <p className="text-[10px] text-muted-foreground uppercase">BLK</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.blocks, "decimal")}</p>
                </div>
              </div>

              {/* Row 3: 3PM, FG%, FT% */}
              <div className="grid grid-cols-3 gap-3">
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('threepm', player.threepm))}>
                  <p className="text-[10px] text-muted-foreground uppercase">3PM</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.threepm, "decimal")}</p>
                </div>
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('fgPct', player.fgPct))}>
                  <p className="text-[10px] text-muted-foreground uppercase">FG%</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.fgPct, "pct")}</p>
                </div>
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('ftPct', player.ftPct))}>
                  <p className="text-[10px] text-muted-foreground uppercase">FT%</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.ftPct, "pct")}</p>
                </div>
              </div>

              {/* Row 4: TO */}
              <div className="grid grid-cols-3 gap-3">
                <div className={cn("rounded-lg p-3 text-center", getColorForStat('turnovers', player.turnovers, true))}>
                  <p className="text-[10px] text-muted-foreground uppercase">TO</p>
                  <p className="font-display font-bold text-lg">{formatStat(player.turnovers, "decimal")}</p>
                </div>
              </div>

              {/* Color Legend */}
              <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground mt-2">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-stat-positive"></span> Top 15%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Top 33%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-400"></span> Bottom 33%
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-stat-negative"></span> Bottom 15%
                </span>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Player News */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-muted-foreground" />
                  <h4 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wider">
                    {player.name.split(' ').slice(-1)[0]} Resources
                  </h4>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loadPlayerNews(player.name)}
                  disabled={isLoadingNews}
                  className="text-xs"
                >
                  <RefreshCw className={cn("w-3 h-3", isLoadingNews && "animate-spin")} />
                </Button>
              </div>
              
              {isLoadingNews ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-secondary/20 rounded-lg p-3 animate-pulse">
                      <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-muted/50 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : news.length === 0 ? (
                <div className="bg-secondary/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground">No resources available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {news.map((item, idx) => (
                    <a 
                      key={idx} 
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-secondary/20 rounded-lg p-3 hover:bg-primary/20 hover:border-primary/50 border border-transparent transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-tight group-hover:text-primary transition-colors">
                            {item.headline}
                          </p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                          )}
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {item.source}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{item.date}</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
