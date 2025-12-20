import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { RosterSlot, Player } from "@/types/fantasy";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertCircle, Calendar, TrendingUp } from "lucide-react";

interface StartSitAdvisorProps {
  roster: RosterSlot[];
  useCris?: boolean;
}

export const StartSitAdvisor = ({ roster, useCris = true }: StartSitAdvisorProps) => {
  // Separate players into those with games today vs those without
  const { playingToday, notPlaying, fringePlayers, injuredPlayers } = useMemo(() => {
    // Get active players (starters + bench with stats)
    const activePlayers = roster.filter(
      (slot) => slot.slotType !== "ir" && slot.player.minutes > 0
    );

    // Filter out injured players (OUT, O, or status indicating they can't play)
    const injured = activePlayers.filter((slot) => {
      const status = slot.player.status?.toUpperCase();
      return status === "O" || status === "OUT" || status === "SUSP";
    });
    
    const availablePlayers = activePlayers.filter((slot) => {
      const status = slot.player.status?.toUpperCase();
      return status !== "O" && status !== "OUT" && status !== "SUSP";
    });

    // Players with opponent = playing today
    const playing = availablePlayers.filter((slot) => slot.player.opponent);
    const notPlayingList = availablePlayers.filter((slot) => !slot.player.opponent);

    // Sort by CRI/wCRI (higher = better)
    const scoreKey = useCris ? "cri" : "wCri";
    const sortedPlaying = [...playing].sort((a, b) => {
      const aScore = a.player[scoreKey] ?? 0;
      const bScore = b.player[scoreKey] ?? 0;
      return bScore - aScore;
    });

    // Identify fringe players: bench players who are playing today
    // These are decision points for the user
    const fringe = sortedPlaying.filter((slot) => slot.slotType === "bench");

    return {
      playingToday: sortedPlaying,
      notPlaying: notPlayingList,
      fringePlayers: fringe,
      injuredPlayers: injured,
    };
  }, [roster, useCris]);

  // Get the recommended starters (top N by CRI who are playing)
  const recommendations = useMemo(() => {
    // Count current starter slots (excluding those without games)
    const starterSlots = roster.filter((s) => s.slotType === "starter").length;
    
    // Players playing today, sorted by score
    const scoreKey = useCris ? "cri" : "wCri";
    const allPlayingWithScore = playingToday.map((slot) => ({
      ...slot,
      score: slot.player[scoreKey] ?? 0,
    }));

    // Take top N as recommended starters
    const recommended = allPlayingWithScore.slice(0, starterSlots);
    const shouldBench = allPlayingWithScore.slice(starterSlots);

    return { recommended, shouldBench };
  }, [playingToday, roster, useCris]);

  if (roster.length === 0) {
    return null;
  }

  const scoreLabel = useCris ? "CRI" : "wCRI";

  return (
    <Card className="gradient-card border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="font-display font-bold text-sm">Start/Sit Advisor</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">
          Based on {scoreLabel}
        </Badge>
      </div>

      {playingToday.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground text-sm">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No players with games detected.</p>
          <p className="text-xs mt-1">Import your roster on the Roster tab first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Recommended Starters */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-stat-positive" />
              <span className="text-xs font-semibold text-stat-positive">Start These</span>
              <span className="text-[10px] text-muted-foreground">({recommendations.recommended.length})</span>
            </div>
            <div className="space-y-1.5">
              {recommendations.recommended.map((slot) => (
                <PlayerRow
                  key={slot.player.id}
                  player={slot.player}
                  slot={slot.slot}
                  slotType={slot.slotType}
                  scoreLabel={scoreLabel}
                  recommendation="start"
                />
              ))}
            </div>
          </div>

          {/* Bench These (playing but lower ranked) */}
          {recommendations.shouldBench.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <XCircle className="w-3.5 h-3.5 text-stat-negative" />
                <span className="text-xs font-semibold text-stat-negative">Consider Benching</span>
                <span className="text-[10px] text-muted-foreground">({recommendations.shouldBench.length})</span>
              </div>
              <div className="space-y-1.5">
                {recommendations.shouldBench.map((slot) => (
                  <PlayerRow
                    key={slot.player.id}
                    player={slot.player}
                    slot={slot.slot}
                    slotType={slot.slotType}
                    scoreLabel={scoreLabel}
                    recommendation="bench"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Injured / Out */}
          {injuredPlayers.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <XCircle className="w-3.5 h-3.5 text-stat-negative" />
                <span className="text-xs font-semibold text-stat-negative">Out / Injured</span>
                <span className="text-[10px] text-muted-foreground">({injuredPlayers.length})</span>
              </div>
              <div className="space-y-1.5 opacity-60">
                {injuredPlayers.map((slot) => (
                  <PlayerRow
                    key={slot.player.id}
                    player={slot.player}
                    slot={slot.slot}
                    slotType={slot.slotType}
                    scoreLabel={scoreLabel}
                    recommendation="none"
                    isInjured
                  />
                ))}
              </div>
            </div>
          )}

          {/* Not Playing Today */}
          {notPlaying.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">No Game Today</span>
                <span className="text-[10px] text-muted-foreground">({notPlaying.length})</span>
              </div>
              <div className="space-y-1.5 opacity-60">
                {notPlaying.slice(0, 5).map((slot) => (
                  <PlayerRow
                    key={slot.player.id}
                    player={slot.player}
                    slot={slot.slot}
                    slotType={slot.slotType}
                    scoreLabel={scoreLabel}
                    recommendation="none"
                  />
                ))}
                {notPlaying.length > 5 && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    +{notPlaying.length - 5} more without games
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

interface PlayerRowProps {
  player: Player;
  slot: string;
  slotType: "starter" | "bench" | "ir";
  scoreLabel: string;
  recommendation: "start" | "bench" | "none";
  isInjured?: boolean;
}

const PlayerRow = ({ player, slot, slotType, scoreLabel, recommendation, isInjured }: PlayerRowProps) => {
  const score = scoreLabel === "CRI" ? player.cri : player.wCri;
  const isCurrentlyBenched = slotType === "bench";
  const shouldSwap = (recommendation === "start" && isCurrentlyBenched) || 
                     (recommendation === "bench" && slotType === "starter");

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg transition-colors",
        recommendation === "start" && "bg-stat-positive/10 border border-stat-positive/20",
        recommendation === "bench" && "bg-stat-negative/10 border border-stat-negative/20",
        recommendation === "none" && "bg-muted/30"
      )}
    >
      <PlayerPhoto name={player.name} size="sm" className="w-8 h-8" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-xs truncate">{player.name}</span>
          {isInjured && (
            <Badge 
              variant="outline" 
              className="text-[9px] px-1 py-0 border-stat-negative text-stat-negative"
            >
              {player.status?.toUpperCase()}
            </Badge>
          )}
          {shouldSwap && (
            <Badge 
              variant="outline" 
              className={cn(
                "text-[9px] px-1 py-0",
                recommendation === "start" ? "border-stat-positive text-stat-positive" : "border-stat-negative text-stat-negative"
              )}
            >
              {recommendation === "start" ? "↑ Move to lineup" : "↓ Move to bench"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{player.nbaTeam}</span>
          <span>•</span>
          <span>{player.positions?.join("/")}</span>
          {player.opponent && !isInjured && (
            <>
              <span>•</span>
              <span className="text-primary font-medium">vs {player.opponent}</span>
            </>
          )}
        </div>
      </div>

      <div className="text-right">
        <Badge 
          variant="secondary" 
          className={cn(
            "text-[10px] font-mono",
            slotType === "starter" && "bg-primary/20",
            slotType === "bench" && "bg-muted"
          )}
        >
          {slot}
        </Badge>
        {score !== undefined && (
          <p className={cn(
            "text-[10px] font-medium mt-0.5",
            recommendation === "start" && "text-stat-positive",
            recommendation === "bench" && "text-stat-negative"
          )}>
            {scoreLabel}: {score.toFixed(1)}
          </p>
        )}
      </div>
    </div>
  );
};
