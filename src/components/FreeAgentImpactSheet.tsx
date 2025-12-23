import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, Minus, TrendingUp, Users, BarChart3, Newspaper, RefreshCw, ArrowUpRight, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useState, useEffect } from "react";
import { fetchPlayerNews, PlayerNews } from "@/lib/nbaApi";
import { RosterSwapSimulator } from "@/components/RosterSwapSimulator";

interface FreeAgentImpactSheetProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRoster: Player[];
  allFreeAgents?: Player[];
}

const WEEKLY_MULTIPLIER = 40;

export const FreeAgentImpactSheet = ({
  player,
  open,
  onOpenChange,
  currentRoster,
  allFreeAgents = [],
}: FreeAgentImpactSheetProps) => {
  const [dropPlayerId, setDropPlayerId] = useState<string | "none">("none");
  const [news, setNews] = useState<PlayerNews[]>([]);
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const [activeTab, setActiveTab] = useState<"impact" | "swap" | "news">("impact");

  // Load player news when sheet opens
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

  // Calculate player's rank among free agents for each category
  const playerRanks = useMemo(() => {
    if (!player || allFreeAgents.length === 0) return null;
    
    const categories = [
      { key: "fgPct", lowerBetter: false },
      { key: "ftPct", lowerBetter: false },
      { key: "threepm", lowerBetter: false },
      { key: "rebounds", lowerBetter: false },
      { key: "assists", lowerBetter: false },
      { key: "steals", lowerBetter: false },
      { key: "blocks", lowerBetter: false },
      { key: "turnovers", lowerBetter: true },
      { key: "points", lowerBetter: false },
    ];
    
    const ranks: Record<string, { rank: number; total: number; percentile: number }> = {};
    
    categories.forEach((cat) => {
      const sorted = [...allFreeAgents].sort((a, b) => {
        const aVal = a[cat.key as keyof Player] as number;
        const bVal = b[cat.key as keyof Player] as number;
        return cat.lowerBetter ? aVal - bVal : bVal - aVal;
      });
      
      const rank = sorted.findIndex((p) => p.id === player.id) + 1;
      const total = allFreeAgents.length;
      const percentile = rank / total;
      
      ranks[cat.key] = { rank, total, percentile };
    });
    
    return ranks;
  }, [player, allFreeAgents]);
  // Calculate current team stats and projected stats with the free agent
  const impactData = useMemo(() => {
    if (!player) return null;

    // Get active players (non-IR with stats)
    const activePlayers = currentRoster.filter(
      (p) => p.minutes > 0 && p.status !== "IR" && p.status !== "O"
    );

    const dropPlayer = dropPlayerId === "none" ? null : activePlayers.find(p => p.id === dropPlayerId);

    const basePlayers = activePlayers;
    const swappedPlayers = dropPlayer
      ? activePlayers.filter(p => p.id !== dropPlayer.id)
      : activePlayers;

    const baseCount = basePlayers.length || 1;
    const newCount = swappedPlayers.length + 1 || 1;

    // Current team averages (before any move)
    const currentAvg = {
      fgPct: basePlayers.reduce((sum, p) => sum + p.fgPct, 0) / baseCount,
      ftPct: basePlayers.reduce((sum, p) => sum + p.ftPct, 0) / baseCount,
      threepm: basePlayers.reduce((sum, p) => sum + p.threepm, 0) / baseCount,
      rebounds: basePlayers.reduce((sum, p) => sum + p.rebounds, 0) / baseCount,
      assists: basePlayers.reduce((sum, p) => sum + p.assists, 0) / baseCount,
      steals: basePlayers.reduce((sum, p) => sum + p.steals, 0) / baseCount,
      blocks: basePlayers.reduce((sum, p) => sum + p.blocks, 0) / baseCount,
      turnovers: basePlayers.reduce((sum, p) => sum + p.turnovers, 0) / baseCount,
      points: basePlayers.reduce((sum, p) => sum + p.points, 0) / baseCount,
    };

    // New team averages with the free agent added (and optional dropped player removed)
    const newAvg = {
      fgPct: (swappedPlayers.reduce((sum, p) => sum + p.fgPct, 0) + player.fgPct) / newCount,
      ftPct: (swappedPlayers.reduce((sum, p) => sum + p.ftPct, 0) + player.ftPct) / newCount,
      threepm: (swappedPlayers.reduce((sum, p) => sum + p.threepm, 0) + player.threepm) / newCount,
      rebounds: (swappedPlayers.reduce((sum, p) => sum + p.rebounds, 0) + player.rebounds) / newCount,
      assists: (swappedPlayers.reduce((sum, p) => sum + p.assists, 0) + player.assists) / newCount,
      steals: (swappedPlayers.reduce((sum, p) => sum + p.steals, 0) + player.steals) / newCount,
      blocks: (swappedPlayers.reduce((sum, p) => sum + p.blocks, 0) + player.blocks) / newCount,
      turnovers: (swappedPlayers.reduce((sum, p) => sum + p.turnovers, 0) + player.turnovers) / newCount,
      points: (swappedPlayers.reduce((sum, p) => sum + p.points, 0) + player.points) / newCount,
    };

    // Calculate differences and weekly projections
    const categories = [
      { key: "fgPct", label: "FG%", isPct: true, lowerBetter: false },
      { key: "ftPct", label: "FT%", isPct: true, lowerBetter: false },
      { key: "threepm", label: "3PM", isPct: false, lowerBetter: false },
      { key: "rebounds", label: "REB", isPct: false, lowerBetter: false },
      { key: "assists", label: "AST", isPct: false, lowerBetter: false },
      { key: "steals", label: "STL", isPct: false, lowerBetter: false },
      { key: "blocks", label: "BLK", isPct: false, lowerBetter: false },
      { key: "turnovers", label: "TO", isPct: false, lowerBetter: true },
      { key: "points", label: "PTS", isPct: false, lowerBetter: false },
    ];

    const comparisons = categories.map((cat) => {
      const current = currentAvg[cat.key as keyof typeof currentAvg];
      const projected = newAvg[cat.key as keyof typeof newAvg];
      const diff = projected - current;
      const playerVal = player[cat.key as keyof Player] as number;

      // Weekly projections (counting stats x40)
      const currentWeekly = cat.isPct ? current : current * WEEKLY_MULTIPLIER;
      const projectedWeekly = cat.isPct ? projected : projected * WEEKLY_MULTIPLIER;
      const weeklyDiff = projectedWeekly - currentWeekly;

      // Determine if the change is positive (considering lowerBetter)
      const isPositive = cat.lowerBetter ? diff < 0 : diff > 0;
      const isNegative = cat.lowerBetter ? diff > 0 : diff < 0;

      return {
        ...cat,
        current,
        projected,
        diff,
        playerVal,
        currentWeekly,
        projectedWeekly,
        weeklyDiff,
        isPositive,
        isNegative,
      };
    });

    return {
      currentCount: basePlayers.length,
      newCount,
      comparisons,
      dropPlayerName: dropPlayer?.name ?? null,
    };
  }, [player, currentRoster, dropPlayerId]);

  if (!player || !impactData) return null;

  const formatValue = (val: number, isPct: boolean) => {
    if (isPct) return `${(val * 100).toFixed(1)}%`;
    return val.toFixed(1);
  };

  const formatWeekly = (val: number, isPct: boolean) => {
    if (isPct) return `${(val * 100).toFixed(1)}%`;
    return Math.round(val).toString();
  };

  const formatDiff = (diff: number, isPct: boolean) => {
    const sign = diff > 0 ? "+" : "";
    if (isPct) return `${sign}${(diff * 100).toFixed(2)}%`;
    return `${sign}${diff.toFixed(2)}`;
  };

  const getStatColor = (key: string) => {
    if (!playerRanks || !playerRanks[key]) return "";
    const { percentile } = playerRanks[key];
    if (percentile <= 0.25) return "text-stat-positive";
    if (percentile <= 0.5) return "text-emerald-400";
    if (percentile <= 0.75) return "text-yellow-400";
    return "text-stat-negative";
  };

  const getStatBgColor = (key: string) => {
    if (!playerRanks || !playerRanks[key]) return "bg-secondary/30";
    const { percentile } = playerRanks[key];
    if (percentile <= 0.25) return "bg-stat-positive/20 border border-stat-positive/30";
    if (percentile <= 0.5) return "bg-emerald-500/10 border border-emerald-500/20";
    if (percentile <= 0.75) return "bg-yellow-500/10 border border-yellow-500/20";
    return "bg-stat-negative/20 border border-stat-negative/30";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-background border-border">
        <SheetHeader className="space-y-4 pb-4 border-b border-border">
          {/* Player Header */}
          <div className="flex items-center gap-4">
            <PlayerPhoto name={player.name} size="lg" />
            <div className="flex-1">
              <SheetTitle className="text-xl font-display">{player.name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <NBATeamLogo teamCode={player.nbaTeam} size="sm" />
                <span className="text-sm text-muted-foreground">{player.nbaTeam}</span>
                <Badge variant="outline" className="text-xs">
                  {player.positions.join("/")}
                </Badge>
              </div>
            </div>
          </div>

          {/* Impact Summary */}
          <Card className="gradient-card border-primary/30 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="font-display font-bold text-sm">Team Impact Preview</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing how your team's stats would change if you added this player
              {impactData.dropPlayerName ? ` and dropped ${impactData.dropPlayerName}` : ""}.
              Current roster: {impactData.currentCount} active players → {impactData.newCount} players
            </p>
            <div className="flex items-center gap-2 text-xs">
              <Users className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Compare as:</span>
              <Select
                value={dropPlayerId}
                onValueChange={(value) => setDropPlayerId(value as string)}
              >
                <SelectTrigger className="h-7 px-2 py-1 text-xs w-full max-w-[220px]">
                  <SelectValue placeholder="Add without dropping" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Add without dropping anyone</SelectItem>
                  {currentRoster
                    .filter(p => p.minutes > 0 && p.status !== "IR" && p.status !== "O")
                    .map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        Drop {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </Card>
        </SheetHeader>

        {/* Tabs for Impact vs Swap vs News */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "impact" | "swap" | "news")} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="impact" className="text-xs font-display">
              <TrendingUp className="w-3 h-3 mr-1" />
              Impact
            </TabsTrigger>
            <TabsTrigger value="swap" className="text-xs font-display">
              <ArrowRightLeft className="w-3 h-3 mr-1" />
              Swap
            </TabsTrigger>
            <TabsTrigger value="news" className="text-xs font-display">
              <Newspaper className="w-3 h-3 mr-1" />
              Resources
            </TabsTrigger>
          </TabsList>

          <TabsContent value="impact" className="space-y-4 mt-4">
            {/* Player Stats */}
            <div>
              <h4 className="font-display font-bold text-sm text-muted-foreground mb-2 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                PLAYER'S STATS VS FREE AGENT POOL
              </h4>
              <div className="grid grid-cols-5 gap-2">
                {impactData.comparisons.slice(2).map((cat) => (
                  <div key={cat.key} className={cn("text-center rounded-lg p-2", getStatBgColor(cat.key))}>
                    <p className="text-[10px] text-muted-foreground">{cat.label}</p>
                    <p className={cn("font-display font-bold text-sm", getStatColor(cat.key))}>
                      {formatValue(cat.playerVal, cat.isPct)}
                    </p>
                    {playerRanks && playerRanks[cat.key] && (
                      <p className="text-[9px] text-muted-foreground">
                        #{playerRanks[cat.key].rank}/{playerRanks[cat.key].total}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {impactData.comparisons.slice(0, 2).map((cat) => (
                  <div key={cat.key} className={cn("text-center rounded-lg p-2", getStatBgColor(cat.key))}>
                    <p className="text-[10px] text-muted-foreground">{cat.label}</p>
                    <p className={cn("font-display font-bold text-sm", getStatColor(cat.key))}>
                      {formatValue(cat.playerVal, cat.isPct)}
                    </p>
                    {playerRanks && playerRanks[cat.key] && (
                      <p className="text-[9px] text-muted-foreground">
                        #{playerRanks[cat.key].rank}/{playerRanks[cat.key].total}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Category Impact Comparison */}
            <div>
              <h4 className="font-display font-bold text-sm text-muted-foreground mb-3">
                WEEKLY PROJECTION IMPACT (×{WEEKLY_MULTIPLIER})
              </h4>
              <div className="space-y-2">
                {impactData.comparisons.map((cat) => (
                  <div
                    key={cat.key}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      cat.isPositive && "bg-stat-positive/10 border-stat-positive/30",
                      cat.isNegative && "bg-stat-negative/10 border-stat-negative/30",
                      !cat.isPositive && !cat.isNegative && "bg-secondary/30 border-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-sm w-10">{cat.label}</span>
                      <div className="text-xs text-muted-foreground">
                        <span>{formatWeekly(cat.currentWeekly, cat.isPct)}</span>
                        <span className="mx-1">→</span>
                        <span className={cn(
                          "font-semibold",
                          cat.isPositive && "text-stat-positive",
                          cat.isNegative && "text-stat-negative"
                        )}>
                          {formatWeekly(cat.projectedWeekly, cat.isPct)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {cat.isPositive && <ArrowUp className="w-4 h-4 text-stat-positive" />}
                      {cat.isNegative && <ArrowDown className="w-4 h-4 text-stat-negative" />}
                      {!cat.isPositive && !cat.isNegative && <Minus className="w-4 h-4 text-muted-foreground" />}
                      <span className={cn(
                        "font-display font-bold text-sm min-w-[60px] text-right",
                        cat.isPositive && "text-stat-positive",
                        cat.isNegative && "text-stat-negative"
                      )}>
                        {cat.isPct ? formatDiff(cat.weeklyDiff, true) : (cat.weeklyDiff > 0 ? "+" : "") + Math.round(cat.weeklyDiff)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <Card className="gradient-card border-border p-3">
              <h4 className="font-display font-bold text-sm mb-2">IMPACT SUMMARY</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Categories Up</p>
                  <p className="font-display font-bold text-lg text-stat-positive">
                    {impactData.comparisons.filter((c) => c.isPositive).length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Neutral</p>
                  <p className="font-display font-bold text-lg">
                    {impactData.comparisons.filter((c) => !c.isPositive && !c.isNegative).length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Categories Down</p>
                  <p className="font-display font-bold text-lg text-stat-negative">
                    {impactData.comparisons.filter((c) => c.isNegative).length}
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="swap" className="mt-4">
            <RosterSwapSimulator freeAgent={player} currentRoster={currentRoster} />
          </TabsContent>

          <TabsContent value="news" className="mt-4">
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
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
