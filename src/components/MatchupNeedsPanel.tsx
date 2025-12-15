import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { Player } from "@/types/fantasy";
import { Target, TrendingUp, TrendingDown, Minus, Trophy, Zap, Info, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES, formatPct } from "@/lib/crisUtils";

interface MatchupStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

interface MatchupData {
  myTeam: { name: string; stats: MatchupStats };
  opponent: { name: string; stats: MatchupStats };
}

interface FreeAgent extends Player {
  cri: number;
  wCri: number;
  criRank: number;
  wCriRank: number;
  // Bonus stats from ESPN
  pr15?: number;
  rosterPct?: number;
  plusMinus?: number;
}

interface MatchupNeedsPanelProps {
  matchupData: MatchupData;
  freeAgents: FreeAgent[];
  useCris: boolean;
  onPlayerClick?: (player: FreeAgent) => void;
}

type CategoryStatus = "win" | "tossup" | "loss";

interface CategoryNeed {
  key: string;
  label: string;
  margin: number;
  status: CategoryStatus;
  myValue: number;
  oppValue: number;
  lowerBetter: boolean;
}

// Thresholds for determining category status (using projected weekly values)
const COUNTING_STATS = ["threepm", "rebounds", "assists", "steals", "blocks", "turnovers", "points"];
const MULTIPLIER = 40;

// Margin thresholds for counting stats (after x40 projection)
const TOSSUP_THRESHOLD_COUNT = 20; // Within 20 projected points = toss-up
// Margin thresholds for percentages
const TOSSUP_THRESHOLD_PCT = 0.015; // Within 1.5% = toss-up

export const MatchupNeedsPanel = ({ 
  matchupData, 
  freeAgents, 
  useCris,
  onPlayerClick 
}: MatchupNeedsPanelProps) => {
  
  // Calculate category needs based on matchup projections
  const categoryNeeds = useMemo((): CategoryNeed[] => {
    const myStats = matchupData.myTeam.stats;
    const oppStats = matchupData.opponent.stats;
    
    return CATEGORIES.map(cat => {
      const key = cat.key as keyof MatchupStats;
      const lowerBetter = key === "turnovers";
      const isPct = cat.format === "pct";
      
      const myValue = myStats[key];
      const oppValue = oppStats[key];
      
      // Calculate projected values for counting stats
      const myProjected = isPct ? myValue : myValue * MULTIPLIER;
      const oppProjected = isPct ? oppValue : oppValue * MULTIPLIER;
      
      // Calculate margin (positive = winning)
      let margin = lowerBetter 
        ? oppProjected - myProjected 
        : myProjected - oppProjected;
      
      // Determine status
      const threshold = isPct ? TOSSUP_THRESHOLD_PCT : TOSSUP_THRESHOLD_COUNT;
      let status: CategoryStatus;
      if (margin > threshold) {
        status = "win";
      } else if (margin < -threshold) {
        status = "loss";
      } else {
        status = "tossup";
      }
      
      return {
        key: cat.key,
        label: cat.label,
        margin,
        status,
        myValue: myProjected,
        oppValue: oppProjected,
        lowerBetter,
      };
    });
  }, [matchupData]);
  
  // Separate categories by status
  const tossups = categoryNeeds.filter(c => c.status === "tossup");
  const losses = categoryNeeds.filter(c => c.status === "loss");
  const wins = categoryNeeds.filter(c => c.status === "win");
  
  // Priority categories: toss-ups first (highest leverage), then close losses
  const priorityCategories = useMemo(() => {
    // Sort losses by how close they are (closest first)
    const sortedLosses = [...losses].sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin));
    // Take toss-ups + up to 2 closest losses
    return [...tossups, ...sortedLosses.slice(0, 2)];
  }, [tossups, losses]);
  
  // Calculate matchup fit score for each free agent
  const scoredAgents = useMemo(() => {
    if (!freeAgents.length || !priorityCategories.length) return [];
    
    // Get category ranks for all free agents
    const catRanks: Record<string, Record<string, number>> = {};
    
    CATEGORIES.forEach(cat => {
      const key = cat.key as keyof FreeAgent;
      const lowerBetter = cat.key === "turnovers";
      const sorted = [...freeAgents]
        .filter(p => p.minutes > 0)
        .sort((a, b) => {
          const aVal = (a as any)[key] as number;
          const bVal = (b as any)[key] as number;
          return lowerBetter ? aVal - bVal : bVal - aVal;
        });
      
      catRanks[cat.key] = {};
      sorted.forEach((p, idx) => {
        catRanks[cat.key][p.id] = idx + 1;
      });
    });
    
    const N = freeAgents.filter(p => p.minutes > 0).length;
    
    return freeAgents
      .filter(p => p.minutes > 0)
      .map(player => {
        let fitScore = 0;
        const helpCategories: string[] = [];
        
        priorityCategories.forEach(cat => {
          const rank = catRanks[cat.key]?.[player.id] || N;
          // Invert rank: best = N points, worst = 1 point
          const invertedRank = N + 1 - rank;
          
          // Weight toss-ups higher than losses
          const weight = cat.status === "tossup" ? 1.5 : 1.0;
          fitScore += invertedRank * weight;
          
          // Track categories where this player is top 20%
          if (rank <= Math.ceil(N * 0.2)) {
            helpCategories.push(cat.label);
          }
        });
        
        return {
          player,
          fitScore,
          helpCategories,
          criRank: useCris ? player.criRank : player.wCriRank,
        };
      })
      .sort((a, b) => b.fitScore - a.fitScore);
  }, [freeAgents, priorityCategories, useCris]);
  
  const topRecommendations = scoredAgents.slice(0, 10);
  
  const getStatusIcon = (status: CategoryStatus) => {
    switch (status) {
      case "win": return <TrendingUp className="w-3 h-3" />;
      case "loss": return <TrendingDown className="w-3 h-3" />;
      case "tossup": return <Minus className="w-3 h-3" />;
    }
  };
  
  const getStatusColor = (status: CategoryStatus) => {
    switch (status) {
      case "win": return "bg-stat-positive/20 text-stat-positive border-stat-positive/30";
      case "loss": return "bg-stat-negative/20 text-stat-negative border-stat-negative/30";
      case "tossup": return "bg-warning/20 text-warning border-warning/30";
    }
  };
  
  const formatValue = (value: number, key: string) => {
    if (key === "fgPct" || key === "ftPct") {
      return formatPct(value);
    }
    return Math.round(value).toString();
  };
  
  const [bestAddsOpen, setBestAddsOpen] = useState(true);
  const [priorityCatsOpen, setPriorityCatsOpen] = useState(false);
  
  return (
    <div className="space-y-4">
      {/* Matchup Needs Summary Bar */}
      <Card className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30">
        <div className="flex items-start gap-3">
          <Target className="w-5 h-5 text-primary mt-0.5" />
          <div className="flex-1">
            <h3 className="font-display font-bold text-primary flex items-center gap-2">
              Matchup Research
              <Badge variant="outline" className="text-xs font-normal">
                vs {matchupData.opponent.name}
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Prioritizing categories closest in your projected matchup—they're easiest to swing with adds/streams.
            </p>
          </div>
        </div>
        
        {/* Category Status Grid */}
        <div className="grid grid-cols-9 gap-1.5 mt-4">
          {categoryNeeds.map(cat => (
            <div
              key={cat.key}
              className={cn(
                "flex flex-col items-center p-2 rounded-md border text-center",
                getStatusColor(cat.status)
              )}
            >
              <span className="text-[10px] font-medium">{cat.label}</span>
              {getStatusIcon(cat.status)}
              <span className="text-[9px] mt-0.5 opacity-75">
                {cat.status === "win" ? "Win" : cat.status === "loss" ? "Loss" : "Flip"}
              </span>
            </div>
          ))}
        </div>
        
        {/* Summary counts */}
        <div className="flex items-center gap-4 mt-3 text-xs">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-stat-positive" />
            <span className="text-muted-foreground">{wins.length} projected wins</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-warning" />
            <span className="text-muted-foreground">{tossups.length} toss-ups</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-stat-negative" />
            <span className="text-muted-foreground">{losses.length} projected losses</span>
          </span>
        </div>
      </Card>
      
      {/* Top Recommendations - Collapsible */}
      {topRecommendations.length > 0 && (
        <Collapsible open={bestAddsOpen} onOpenChange={setBestAddsOpen}>
          <Card className="p-4">
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity">
                <h4 className="font-display font-bold flex items-center gap-2">
                  {bestAddsOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  <Zap className="w-4 h-4 text-warning" />
                  Best Adds for This Matchup
                </h4>
                <span className="text-xs text-muted-foreground">
                  Top 10 based on {tossups.length} toss-up{tossups.length !== 1 ? "s" : ""} + {Math.min(losses.length, 2)} close loss{Math.min(losses.length, 2) !== 1 ? "es" : ""}
                </span>
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                {topRecommendations.map((item, idx) => (
                  <button
                    key={item.player.id}
                    onClick={() => onPlayerClick?.(item.player)}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left group"
                  >
                    <span className="text-xs font-mono text-muted-foreground w-5">
                      #{idx + 1}
                    </span>
                    <PlayerPhoto 
                      name={item.player.name} 
                      size="sm" 
                      className="ring-2 ring-primary/20 group-hover:ring-primary/40"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{item.player.name}</span>
                        <NBATeamLogo teamCode={item.player.nbaTeam} size="xs" />
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {item.player.positions?.join(", ")}
                        </span>
                        {item.helpCategories.length > 0 && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-[10px] text-primary font-medium">
                              Boosts {item.helpCategories.slice(0, 3).join(", ")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {useCris ? "CRI" : "wCRI"} #{item.criRank}
                    </Badge>
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      
      {/* Priority Categories Details - Collapsible */}
      {priorityCategories.length > 0 && (
        <Collapsible open={priorityCatsOpen} onOpenChange={setPriorityCatsOpen}>
          <Card className="p-4">
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity">
                <h4 className="font-display font-bold flex items-center gap-2">
                  {priorityCatsOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  <Info className="w-4 h-4 text-muted-foreground" />
                  Priority Categories
                </h4>
                <span className="text-xs text-muted-foreground">
                  {priorityCategories.length} categories to target
                </span>
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {priorityCategories.map(cat => (
                  <div 
                    key={cat.key}
                    className={cn(
                      "p-3 rounded-lg border",
                      getStatusColor(cat.status)
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-display font-bold text-sm">{cat.label}</span>
                      {getStatusIcon(cat.status)}
                    </div>
                    <div className="text-xs space-y-0.5">
                      <div className="flex justify-between">
                        <span className="opacity-75">You:</span>
                        <span className="font-mono">{formatValue(cat.myValue, cat.key)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="opacity-75">Opp:</span>
                        <span className="font-mono">{formatValue(cat.oppValue, cat.key)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
};
