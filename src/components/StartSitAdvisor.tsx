import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { RosterSlot, Player, CategoryStats } from "@/types/fantasy";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertCircle, Calendar, TrendingUp, Lock, AlertTriangle } from "lucide-react";
import { CRIS_WEIGHTS } from "@/lib/crisUtils";

// Category definitions with labels
const CATEGORIES = [
  { key: "fgPct", label: "FG%", lowerBetter: false },
  { key: "ftPct", label: "FT%", lowerBetter: false },
  { key: "threepm", label: "3PM", lowerBetter: false },
  { key: "rebounds", label: "REB", lowerBetter: false },
  { key: "assists", label: "AST", lowerBetter: false },
  { key: "steals", label: "STL", lowerBetter: false },
  { key: "blocks", label: "BLK", lowerBetter: false },
  { key: "turnovers", label: "TO", lowerBetter: true },
  { key: "points", label: "PTS", lowerBetter: false },
] as const;

type CategoryKey = typeof CATEGORIES[number]["key"];

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

interface WeeklyTeam {
  token: string;
  tokenUpper: string;
  name: string;
  recordStanding: string;
  currentMatchup: string;
  stats: MatchupStats;
}

interface WeeklyMatchup {
  teamA: WeeklyTeam;
  teamB: WeeklyTeam;
}

interface MatchupProjectionData {
  myTeam: { name: string; stats: MatchupStats };
  opponent: { name: string; stats: MatchupStats };
}

interface CategoryUrgency {
  key: CategoryKey;
  label: string;
  urgency: "HIGH" | "MED" | "LOW";
  currentDelta: number; // positive = winning, negative = losing
  lowerBetter: boolean;
}

interface PlayerRecommendation {
  slot: RosterSlot;
  score: number;
  helps: string[];
  risks: string[];
  isCore: boolean;
  injuryStatus: "healthy" | "DTD" | "GTD" | "OUT";
  injuryMultiplier: number;
}

interface StartSitAdvisorProps {
  roster: RosterSlot[];
  useCris?: boolean;
  matchupData?: MatchupProjectionData | null;
  weeklyMatchups?: WeeklyMatchup[];
  leagueTeams?: { name: string }[];
}

// Check if a player is OUT (various formats)
function isPlayerOut(status?: string): boolean {
  if (!status) return false;
  const s = status.toUpperCase().trim();
  return s === "O" || s === "OUT" || s === "SUSP" || s.includes("(O)") || s.includes("INJ (O)");
}

// Get injury status category
function getInjuryStatus(status?: string): "healthy" | "DTD" | "GTD" | "OUT" {
  if (!status) return "healthy";
  const s = status.toUpperCase().trim();
  if (isPlayerOut(s)) return "OUT";
  if (s === "DTD" || s.includes("DTD") || s === "Q" || s === "QUESTIONABLE") return "DTD";
  if (s === "GTD" || s === "PROBABLE" || s === "P") return "GTD";
  return "healthy";
}

// Get injury multiplier
function getInjuryMultiplier(injuryStatus: "healthy" | "DTD" | "GTD" | "OUT"): number {
  switch (injuryStatus) {
    case "OUT": return 0;
    case "DTD": return 0.70;
    case "GTD": return 0.85;
    default: return 1.0;
  }
}

export const StartSitAdvisor = ({
  roster,
  useCris = true,
  matchupData,
  weeklyMatchups = [],
  leagueTeams = [],
}: StartSitAdvisorProps) => {
  // Find my team's weekly data if available
  const myWeeklyData = useMemo(() => {
    if (!matchupData || weeklyMatchups.length === 0) return null;
    
    const myTeamName = matchupData.myTeam.name.toLowerCase();
    
    for (const matchup of weeklyMatchups) {
      if (matchup.teamA.name.toLowerCase().includes(myTeamName) || 
          myTeamName.includes(matchup.teamA.name.toLowerCase())) {
        return {
          myTeam: matchup.teamA,
          opponent: matchup.teamB,
        };
      }
      if (matchup.teamB.name.toLowerCase().includes(myTeamName) ||
          myTeamName.includes(matchup.teamB.name.toLowerCase())) {
        return {
          myTeam: matchup.teamB,
          opponent: matchup.teamA,
        };
      }
    }
    return null;
  }, [matchupData, weeklyMatchups]);

  // Calculate category urgency based on Weekly + Matchup projections
  const categoryUrgency = useMemo((): CategoryUrgency[] => {
    if (!matchupData) {
      // No matchup data - return all MED urgency
      return CATEGORIES.map(cat => ({
        key: cat.key,
        label: cat.label,
        urgency: "MED" as const,
        currentDelta: 0,
        lowerBetter: cat.lowerBetter,
      }));
    }

    const projectedMy = matchupData.myTeam.stats;
    const projectedOpp = matchupData.opponent.stats;
    
    // Use weekly actuals if available, otherwise use projections
    const currentMy = myWeeklyData?.myTeam.stats || projectedMy;
    const currentOpp = myWeeklyData?.opponent.stats || projectedOpp;

    return CATEGORIES.map(cat => {
      const myVal = currentMy[cat.key as keyof MatchupStats] || 0;
      const oppVal = currentOpp[cat.key as keyof MatchupStats] || 0;
      
      // Calculate delta (positive = winning)
      let delta: number;
      if (cat.lowerBetter) {
        // For TO, lower is better, so if I have less, I'm winning
        delta = oppVal - myVal;
      } else {
        delta = myVal - oppVal;
      }

      // Determine urgency based on current state and projections
      const projMyVal = projectedMy[cat.key as keyof MatchupStats] || 0;
      const projOppVal = projectedOpp[cat.key as keyof MatchupStats] || 0;
      
      let projDelta: number;
      if (cat.lowerBetter) {
        projDelta = projOppVal - projMyVal;
      } else {
        projDelta = projMyVal - projOppVal;
      }

      // Swingable thresholds (percentage of projected totals)
      const swingThreshold = 0.15;
      let isSwingable = false;
      
      if (cat.key === "fgPct" || cat.key === "ftPct") {
        // Percentages: swingable if difference <= 0.020
        isSwingable = Math.abs(delta) <= 0.020;
      } else {
        // Counting stats: swingable if deficit <= 15% of remaining projection
        const remaining = Math.max(0, (projMyVal + projOppVal) / 2 - Math.max(myVal, oppVal));
        isSwingable = Math.abs(delta) <= remaining * swingThreshold || Math.abs(delta) <= 10;
      }

      let urgency: "HIGH" | "MED" | "LOW";
      if (delta < 0 && isSwingable) {
        // Currently losing but swingable
        urgency = "HIGH";
      } else if (Math.abs(delta) < (cat.key === "fgPct" || cat.key === "ftPct" ? 0.015 : 8) || 
                 (projDelta < 0 && delta >= 0)) {
        // Close or projected to lose
        urgency = "MED";
      } else if (delta > 0) {
        // Winning comfortably
        urgency = "LOW";
      } else {
        urgency = "MED";
      }

      return {
        key: cat.key,
        label: cat.label,
        urgency,
        currentDelta: delta,
        lowerBetter: cat.lowerBetter,
      };
    });
  }, [matchupData, myWeeklyData]);

  // Identify core players (top 6 by CRI on the team)
  const corePlayers = useMemo(() => {
    const activePlayers = roster.filter(
      (slot) => slot.slotType !== "ir" && slot.player.minutes > 0
    );
    
    const sorted = [...activePlayers].sort((a, b) => {
      const aScore = a.player.cri ?? 0;
      const bScore = b.player.cri ?? 0;
      return bScore - aScore;
    });

    return new Set(sorted.slice(0, 6).map(s => s.player.id));
  }, [roster]);

  // Calculate player recommendations with urgency-aware scoring
  const recommendations = useMemo(() => {
    // Get active players (starters + bench with stats)
    const activePlayers = roster.filter(
      (slot) => slot.slotType !== "ir" && slot.player.minutes > 0
    );

    // Separate by availability
    const outPlayers: PlayerRecommendation[] = [];
    const availablePlayers: PlayerRecommendation[] = [];
    const noGamePlayers: PlayerRecommendation[] = [];

    activePlayers.forEach((slot) => {
      const injuryStatus = getInjuryStatus(slot.player.status);
      const injuryMultiplier = getInjuryMultiplier(injuryStatus);
      const isCore = corePlayers.has(slot.player.id);
      const hasGameToday = !!slot.player.opponent;

      // Calculate impact score based on category urgency
      let impactScore = 0;
      const helps: string[] = [];
      const risks: string[] = [];

      categoryUrgency.forEach((cat) => {
        const playerVal = slot.player[cat.key as keyof Player] as number || 0;
        
        // Weight based on urgency
        const urgencyWeight = cat.urgency === "HIGH" ? 1.0 : cat.urgency === "MED" ? 0.6 : 0.2;
        const importanceWeight = CRIS_WEIGHTS[cat.key as keyof typeof CRIS_WEIGHTS] || 1;
        
        // Normalize player contribution (rough estimate)
        let contribution: number;
        if (cat.key === "fgPct" || cat.key === "ftPct") {
          // Percentages: compare to league average ~0.45-0.50
          contribution = cat.lowerBetter ? (0.45 - playerVal) : (playerVal - 0.45);
        } else if (cat.key === "turnovers") {
          // TO: lower is better, so negative contribution for high TO
          contribution = 3 - playerVal; // Assume 3 is average
        } else {
          // Counting stats: use raw value scaled
          contribution = playerVal;
        }

        const catScore = contribution * urgencyWeight * importanceWeight;
        impactScore += catScore;

        // Track helps/risks for top 2 categories
        if (cat.urgency === "HIGH" || cat.urgency === "MED") {
          if (cat.key === "turnovers") {
            if (playerVal > 2.5) {
              risks.push(cat.label);
            } else if (playerVal < 1.5) {
              helps.push(cat.label);
            }
          } else if (cat.key === "fgPct" || cat.key === "ftPct") {
            if (playerVal > 0.50) {
              helps.push(cat.label);
            } else if (playerVal < 0.40) {
              risks.push(cat.label);
            }
          } else {
            if (playerVal > 5) helps.push(cat.label);
          }
        }
      });

      // Apply injury multiplier
      impactScore *= injuryMultiplier;

      // Add base CRI/wCRI component (50% weight)
      const baseScore = useCris ? (slot.player.cri ?? 0) : (slot.player.wCri ?? 0);
      impactScore = impactScore * 0.5 + baseScore * 0.5;

      // Add DTD risk if applicable
      if (injuryStatus === "DTD") {
        risks.push("DTD");
      } else if (injuryStatus === "GTD") {
        risks.push("GTD");
      }

      const recommendation: PlayerRecommendation = {
        slot,
        score: impactScore,
        helps: helps.slice(0, 2),
        risks: risks.slice(0, 2),
        isCore,
        injuryStatus,
        injuryMultiplier,
      };

      if (injuryStatus === "OUT") {
        outPlayers.push(recommendation);
      } else if (!hasGameToday) {
        noGamePlayers.push(recommendation);
      } else {
        availablePlayers.push(recommendation);
      }
    });

    // Sort available players by impact score
    const sortedAvailable = [...availablePlayers].sort((a, b) => b.score - a.score);

    // Count starter slots
    const starterSlots = roster.filter((s) => s.slotType === "starter").length;

    // Recommended starters (top N by score)
    const startThese = sortedAvailable.slice(0, starterSlots);
    
    // Consider benching (remaining available players)
    // Never recommend benching core players unless they're out
    const considerBenching = sortedAvailable.slice(starterSlots).filter(p => {
      if (p.isCore) return false; // Core players get "Monitor" instead
      return true;
    });

    // Core players that are DTD get "Monitor" treatment
    const monitorPlayers = sortedAvailable.filter(p => p.isCore && p.injuryStatus === "DTD");

    return {
      startThese,
      considerBenching,
      monitorPlayers,
      outPlayers,
      noGamePlayers,
    };
  }, [roster, categoryUrgency, corePlayers, useCris]);

  // Determine if we have weekly data
  const hasWeeklyData = !!myWeeklyData;

  // Don't render if no roster
  if (roster.length === 0) {
    return null;
  }

  const scoreLabel = useCris ? "CRI" : "wCRI";
  const { startThese, considerBenching, monitorPlayers, outPlayers, noGamePlayers } = recommendations;
  const hasAnyPlayers = startThese.length > 0 || considerBenching.length > 0 || noGamePlayers.length > 0 || outPlayers.length > 0;

  return (
    <Card className="gradient-card border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="font-display font-bold text-sm">Start/Sit Advisor</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {hasWeeklyData ? "Weekly + Proj" : matchupData ? "Projections" : scoreLabel}
        </Badge>
      </div>

      {/* Fallback notice if no game data */}
      {!matchupData && (
        <div className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Unable to read matchup — using {scoreLabel}-only logic
        </div>
      )}

      {!hasAnyPlayers ? (
        <div className="text-center py-4 text-muted-foreground text-sm">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No players with games detected.</p>
          <p className="text-xs mt-1">Import your roster on the Roster tab first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Start These */}
          {startThese.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-stat-positive" />
                <span className="text-xs font-semibold text-stat-positive">Start These</span>
                <span className="text-[10px] text-muted-foreground">({startThese.length})</span>
              </div>
              <div className="space-y-1.5">
                {startThese.map((rec) => (
                  <PlayerRow
                    key={rec.slot.player.id}
                    rec={rec}
                    recommendation="start"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Monitor (Core + DTD) */}
          {monitorPlayers.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                <span className="text-xs font-semibold text-warning">Monitor</span>
                <span className="text-[10px] text-muted-foreground">({monitorPlayers.length})</span>
              </div>
              <div className="space-y-1.5">
                {monitorPlayers.map((rec) => (
                  <PlayerRow
                    key={rec.slot.player.id}
                    rec={rec}
                    recommendation="monitor"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Consider Benching */}
          {considerBenching.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <XCircle className="w-3.5 h-3.5 text-stat-negative" />
                <span className="text-xs font-semibold text-stat-negative">Consider Benching</span>
                <span className="text-[10px] text-muted-foreground">({considerBenching.length})</span>
              </div>
              <div className="space-y-1.5">
                {considerBenching.map((rec) => (
                  <PlayerRow
                    key={rec.slot.player.id}
                    rec={rec}
                    recommendation="bench"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Unavailable (OUT) */}
          {outPlayers.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Unavailable (OUT)</span>
                <span className="text-[10px] text-muted-foreground">({outPlayers.length})</span>
              </div>
              <div className="space-y-1.5 opacity-50">
                {outPlayers.map((rec) => (
                  <PlayerRow
                    key={rec.slot.player.id}
                    rec={rec}
                    recommendation="out"
                  />
                ))}
              </div>
            </div>
          )}

          {/* No Game Today */}
          {noGamePlayers.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">No Game Today</span>
                <span className="text-[10px] text-muted-foreground">({noGamePlayers.length})</span>
              </div>
              <div className="space-y-1.5 opacity-60">
                {noGamePlayers.slice(0, 5).map((rec) => (
                  <PlayerRow
                    key={rec.slot.player.id}
                    rec={rec}
                    recommendation="none"
                  />
                ))}
                {noGamePlayers.length > 5 && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    +{noGamePlayers.length - 5} more without games
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
  rec: PlayerRecommendation;
  recommendation: "start" | "bench" | "monitor" | "out" | "none";
}

const PlayerRow = ({ rec, recommendation }: PlayerRowProps) => {
  const { slot, helps, risks, isCore, injuryStatus, score } = rec;
  const player = slot.player;
  const isCurrentlyBenched = slot.slotType === "bench";
  const shouldSwap = (recommendation === "start" && isCurrentlyBenched) || 
                     (recommendation === "bench" && slot.slotType === "starter");

  const showExplanation = (recommendation === "start" || recommendation === "bench" || recommendation === "monitor") && 
                          (helps.length > 0 || risks.length > 0);

  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-2 rounded-lg transition-colors",
        recommendation === "start" && "bg-stat-positive/10 border border-stat-positive/20",
        recommendation === "bench" && "bg-stat-negative/10 border border-stat-negative/20",
        recommendation === "monitor" && "bg-warning/10 border border-warning/20",
        recommendation === "out" && "bg-muted/30",
        recommendation === "none" && "bg-muted/30"
      )}
    >
      <div className="flex items-center gap-2">
        <PlayerPhoto name={player.name} size="sm" className="w-8 h-8" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs truncate">{player.name}</span>
            {isCore && (
              <span title="Core player (Top 6 CRI)">
                <Lock className="w-3 h-3 text-primary" />
              </span>
            )}
            {injuryStatus === "DTD" && (
              <Badge 
                variant="outline" 
                className="text-[9px] px-1 py-0 border-warning text-warning"
              >
                DTD
              </Badge>
            )}
            {injuryStatus === "GTD" && (
              <Badge 
                variant="outline" 
                className="text-[9px] px-1 py-0 border-yellow-500 text-yellow-500"
              >
                GTD
              </Badge>
            )}
            {injuryStatus === "OUT" && (
              <Badge 
                variant="outline" 
                className="text-[9px] px-1 py-0 border-stat-negative text-stat-negative"
              >
                OUT
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
            {player.opponent && injuryStatus !== "OUT" && (
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
              slot.slotType === "starter" && "bg-primary/20",
              slot.slotType === "bench" && "bg-muted"
            )}
          >
            {slot.slot}
          </Badge>
          {player.cri !== undefined && recommendation !== "out" && (
            <p className={cn(
              "text-[10px] font-medium mt-0.5",
              recommendation === "start" && "text-stat-positive",
              recommendation === "bench" && "text-stat-negative",
              recommendation === "monitor" && "text-warning"
            )}>
              CRI: {player.cri.toFixed(1)}
            </p>
          )}
        </div>
      </div>

      {/* Explanation line */}
      {showExplanation && (
        <div className="text-[9px] text-muted-foreground pl-10 flex items-center gap-2 flex-wrap">
          {helps.length > 0 && (
            <span className="text-stat-positive">
              Helps: {helps.join(", ")}
            </span>
          )}
          {risks.length > 0 && (
            <span className="text-stat-negative">
              Risk: {risks.join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
