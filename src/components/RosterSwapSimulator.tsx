import { Player } from "@/types/fantasy";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowRightLeft, ChevronDown, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { calculateCRISForAll } from "@/lib/crisUtils";

interface RosterSwapSimulatorProps {
  freeAgent: Player;
  currentRoster: Player[];
}

interface SwapResult {
  rosterPlayer: Player;
  currentCRI: number;
  currentWCRI: number;
  newFreeAgentCRI: number;
  newFreeAgentWCRI: number;
  freeAgentRankCRI: number;
  freeAgentRankWCRI: number;
  netCRIDiff: number;
  netWCRIDiff: number;
  isTopTier: boolean; // Top 20% of roster
}

export const RosterSwapSimulator = ({ freeAgent, currentRoster }: RosterSwapSimulatorProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get active players only
  const activePlayers = useMemo(() => {
    return currentRoster.filter(
      (p) => p.minutes > 0 && p.status !== "IR" && p.status !== "O"
    );
  }, [currentRoster]);

  // Calculate current roster CRI/wCRI
  const currentRosterWithCRI = useMemo(() => {
    if (activePlayers.length === 0) return [];
    return calculateCRISForAll(activePlayers);
  }, [activePlayers]);

  // Determine top 20% threshold
  const topTierThreshold = useMemo(() => {
    if (currentRosterWithCRI.length === 0) return 0;
    const sorted = [...currentRosterWithCRI].sort((a, b) => b.cri - a.cri);
    const top20Index = Math.max(0, Math.ceil(sorted.length * 0.2) - 1);
    return sorted[top20Index]?.cri ?? 0;
  }, [currentRosterWithCRI]);

  // Simulate all possible swaps
  const swapResults = useMemo(() => {
    if (activePlayers.length === 0) return [];

    const results: SwapResult[] = [];

    currentRosterWithCRI.forEach((rosterPlayer) => {
      // Create new roster with free agent replacing this player
      const newRoster = activePlayers
        .filter((p) => p.id !== rosterPlayer.id)
        .concat([freeAgent]);

      // Recalculate CRI for the new roster
      const newRosterWithCRI = calculateCRISForAll(newRoster);

      // Find the free agent in the new roster
      const freeAgentInNewRoster = newRosterWithCRI.find((p) => p.id === freeAgent.id);
      if (!freeAgentInNewRoster) return;

      // Calculate ranks
      const sortedByCRI = [...newRosterWithCRI].sort((a, b) => b.cri - a.cri);
      const sortedByWCRI = [...newRosterWithCRI].sort((a, b) => b.wCri - a.wCri);
      
      const freeAgentRankCRI = sortedByCRI.findIndex((p) => p.id === freeAgent.id) + 1;
      const freeAgentRankWCRI = sortedByWCRI.findIndex((p) => p.id === freeAgent.id) + 1;

      // Net difference (what you gain vs what you lose)
      const netCRIDiff = freeAgentInNewRoster.cri - rosterPlayer.cri;
      const netWCRIDiff = freeAgentInNewRoster.wCri - rosterPlayer.wCri;

      results.push({
        rosterPlayer,
        currentCRI: rosterPlayer.cri,
        currentWCRI: rosterPlayer.wCri,
        newFreeAgentCRI: freeAgentInNewRoster.cri,
        newFreeAgentWCRI: freeAgentInNewRoster.wCri,
        freeAgentRankCRI,
        freeAgentRankWCRI,
        netCRIDiff,
        netWCRIDiff,
        isTopTier: rosterPlayer.cri >= topTierThreshold,
      });
    });

    // Sort by net wCRI gain (best swap first)
    return results.sort((a, b) => b.netWCRIDiff - a.netWCRIDiff);
  }, [activePlayers, currentRosterWithCRI, freeAgent, topTierThreshold]);

  // Find best recommended swap (excluding top tier players)
  const bestSwap = useMemo(() => {
    const eligibleSwaps = swapResults.filter((s) => !s.isTopTier && s.netWCRIDiff > 0);
    return eligibleSwaps[0] ?? null;
  }, [swapResults]);

  // Free agent's projected rank if added to roster
  const projectedRank = useMemo(() => {
    if (activePlayers.length === 0) return null;

    // Add free agent to current roster (no swap)
    const expandedRoster = [...activePlayers, freeAgent];
    const rosterWithCRI = calculateCRISForAll(expandedRoster);
    
    const freeAgentEntry = rosterWithCRI.find((p) => p.id === freeAgent.id);
    if (!freeAgentEntry) return null;

    const sortedByCRI = [...rosterWithCRI].sort((a, b) => b.cri - a.cri);
    const sortedByWCRI = [...rosterWithCRI].sort((a, b) => b.wCri - a.wCri);

    return {
      criRank: sortedByCRI.findIndex((p) => p.id === freeAgent.id) + 1,
      wCriRank: sortedByWCRI.findIndex((p) => p.id === freeAgent.id) + 1,
      total: rosterWithCRI.length,
      cri: freeAgentEntry.cri,
      wCri: freeAgentEntry.wCri,
    };
  }, [activePlayers, freeAgent]);

  const hasPositiveSwap = swapResults.some((s) => !s.isTopTier && s.netWCRIDiff > 0);

  if (activePlayers.length === 0) {
    return (
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ArrowRightLeft className="w-4 h-4" />
          <span className="text-sm">Import your roster to see swap analysis</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Projected Rank Summary */}
      <Card className="gradient-card border-primary/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ArrowRightLeft className="w-4 h-4 text-primary" />
          <span className="font-display font-bold text-sm">Roster Swap Simulator</span>
        </div>

        {projectedRank && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              If added, this player would rank:
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/30 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">CRI Rank</p>
                <p className="font-display font-bold text-xl">
                  #{projectedRank.criRank}
                  <span className="text-sm text-muted-foreground font-normal"> of {projectedRank.total}</span>
                </p>
                <p className="text-xs text-muted-foreground">Score: {projectedRank.cri.toFixed(1)}</p>
              </div>
              <div className="bg-secondary/30 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">wCRI Rank</p>
                <p className="font-display font-bold text-xl">
                  #{projectedRank.wCriRank}
                  <span className="text-sm text-muted-foreground font-normal"> of {projectedRank.total}</span>
                </p>
                <p className="text-xs text-muted-foreground">Score: {projectedRank.wCri.toFixed(1)}</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Best Swap Recommendation */}
      {hasPositiveSwap && bestSwap ? (
        <Card className="gradient-card border-stat-positive/30 bg-stat-positive/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-stat-positive" />
            <span className="font-display font-bold text-sm text-stat-positive">Recommended Swap</span>
          </div>
          <p className="text-sm mb-2">
            <span className="text-muted-foreground">Best replacement target: </span>
            <span className="font-semibold">{bestSwap.rosterPlayer.name}</span>
          </p>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Net CRI: </span>
              <span className={cn(
                "font-display font-bold",
                bestSwap.netCRIDiff > 0 ? "text-stat-positive" : "text-stat-negative"
              )}>
                {bestSwap.netCRIDiff > 0 ? "+" : ""}{bestSwap.netCRIDiff.toFixed(1)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Net wCRI: </span>
              <span className={cn(
                "font-display font-bold",
                bestSwap.netWCRIDiff > 0 ? "text-stat-positive" : "text-stat-negative"
              )}>
                {bestSwap.netWCRIDiff > 0 ? "+" : ""}{bestSwap.netWCRIDiff.toFixed(1)}
              </span>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="gradient-card border-border p-4">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              This player would rank below your current starters. No recommended swap.
            </span>
          </div>
        </Card>
      )}

      {/* Expandable Full Comparison */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
            <span>View all swap comparisons ({swapResults.length})</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {swapResults.map((swap) => (
              <div
                key={swap.rosterPlayer.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border text-sm",
                  swap.isTopTier && "opacity-50 bg-secondary/10 border-dashed",
                  !swap.isTopTier && swap.netWCRIDiff > 0 && "bg-stat-positive/5 border-stat-positive/20",
                  !swap.isTopTier && swap.netWCRIDiff <= 0 && "bg-secondary/20 border-border"
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="truncate">
                    <span className="font-medium">{swap.rosterPlayer.name}</span>
                    {swap.isTopTier && (
                      <Badge variant="outline" className="ml-2 text-[9px] border-yellow-500/50 text-yellow-500">
                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                        Top 20%
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 text-right shrink-0">
                  <div>
                    <p className="text-[10px] text-muted-foreground">CRI</p>
                    <p className={cn(
                      "font-display font-bold text-xs",
                      swap.netCRIDiff > 0 ? "text-stat-positive" : swap.netCRIDiff < 0 ? "text-stat-negative" : ""
                    )}>
                      {swap.netCRIDiff > 0 ? "+" : ""}{swap.netCRIDiff.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">wCRI</p>
                    <p className={cn(
                      "font-display font-bold text-xs",
                      swap.netWCRIDiff > 0 ? "text-stat-positive" : swap.netWCRIDiff < 0 ? "text-stat-negative" : ""
                    )}>
                      {swap.netWCRIDiff > 0 ? "+" : ""}{swap.netWCRIDiff.toFixed(1)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Sorted by net wCRI gain. Top 20% players are not recommended for swap.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};