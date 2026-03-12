import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { RestOfWeekPlanner } from "@/components/RestOfWeekPlanner";
import { RosterSlot, Player, CategoryStats, SlotType } from "@/types/fantasy";
import { NBAGame, formatDateForAPI } from "@/lib/nbaApi";
import { normalizeNbaTeamCode, getMatchupWeekDates } from "@/lib/scheduleAwareProjection";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertCircle, Calendar, TrendingUp, Lock, AlertTriangle, Target, Settings2 } from "lucide-react";
import { CRIS_WEIGHTS } from "@/lib/crisUtils";
import { CustomWeights } from "@/components/WeightSettings";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
  currentDelta: number;
  lowerBetter: boolean;
}

// ESPN lineup slots and their eligible positions - exactly 8 starters per day
const LINEUP_SLOTS: { slot: string; eligible: string[] }[] = [
  { slot: "PG", eligible: ["PG"] },
  { slot: "SG", eligible: ["SG"] },
  { slot: "SF", eligible: ["SF"] },
  { slot: "PF", eligible: ["PF"] },
  { slot: "C", eligible: ["C"] },
  { slot: "G", eligible: ["PG", "SG"] },
  { slot: "F/C", eligible: ["SF", "PF", "C"] },
  { slot: "UTIL", eligible: ["PG", "SG", "SF", "PF", "C"] },
];

interface PlayerRecommendation {
  slot: RosterSlot;
  score: number;
  helps: string[];
  risks: string[];
  isCore: boolean;
  injuryStatus: "healthy" | "DTD" | "GTD" | "OUT";
  injuryMultiplier: number;
  assignedSlot?: string;
}

interface MatchupWeekDate {
  dateStr: string;
  date: Date;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isPast: boolean;
}

interface StartSitAdvisorProps {
  roster: RosterSlot[];
  opponentRoster?: RosterSlot[];
  useCris?: boolean;
  matchupData?: MatchupProjectionData | null;
  weeklyMatchups?: WeeklyMatchup[];
  leagueTeams?: { name: string }[];
  effectiveWeights?: CustomWeights;
  gamesByDate?: Map<string, NBAGame[]>;
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
function getInjuryMultiplier(injuryStatus: "healthy" | "DTD" | "GTD" | "OUT", applyInjury: boolean = true): number {
  if (!applyInjury) return injuryStatus === "OUT" ? 0 : 1.0;
  switch (injuryStatus) {
    case "OUT": return 0;
    case "DTD": return 0.70;
    case "GTD": return 0.85;
    default: return 1.0;
  }
}

// Check if player has game on a specific date based on schedule
function playerHasGameOnDate(
  player: Player,
  games: NBAGame[]
): boolean {
  const normalizedTeam = normalizeNbaTeamCode(player.nbaTeam);
  if (!normalizedTeam) return false;
  
  return games.some(
    (g) => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam
  );
}

// Get opponent from schedule
function getOpponentFromSchedule(
  player: Player,
  games: NBAGame[]
): string | null {
  const normalizedTeam = normalizeNbaTeamCode(player.nbaTeam);
  if (!normalizedTeam) return null;
  
  const game = games.find(
    (g) => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam
  );
  
  if (!game) return null;
  return game.homeTeam === normalizedTeam ? game.awayTeam : game.homeTeam;
}

// Generate matchup week dates
function generateMatchupWeekDates(): MatchupWeekDate[] {
  const weekDateStrs = getMatchupWeekDates();
  const now = new Date();
  const todayStr = formatDateForAPI(now);
  
  return weekDateStrs.map((dateStr) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const dayLabel = date.toLocaleDateString("en-US", { weekday: "short" });
    const dateLabel = `${month}/${day}`;
    
    return {
      dateStr,
      date,
      dayLabel,
      dateLabel,
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    };
  });
}

export const StartSitAdvisor = ({
  roster,
  opponentRoster = [],
  useCris = true,
  matchupData,
  weeklyMatchups = [],
  leagueTeams = [],
  effectiveWeights,
  gamesByDate = new Map(),
}: StartSitAdvisorProps) => {
  // Use effective weights if provided, otherwise fall back to default CRIS_WEIGHTS
  const weights = effectiveWeights || (CRIS_WEIGHTS as CustomWeights);
  
  // Generate matchup week dates
  const matchupWeekDates = useMemo(() => generateMatchupWeekDates(), []);
  
  // Get today's date string
  const todayStr = useMemo(() => formatDateForAPI(new Date()), []);
  
  // State for selected day
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  
  // Settings state
  const [applyInjuryMultipliers, setApplyInjuryMultipliers] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  // Ensure selected date is valid (not past, within week)
  useEffect(() => {
    const validDates = matchupWeekDates.filter((d) => !d.isPast);
    if (validDates.length > 0 && !validDates.some((d) => d.dateStr === selectedDateStr)) {
      setSelectedDateStr(validDates[0].dateStr);
    }
  }, [matchupWeekDates, selectedDateStr]);
  
  // Get games for the selected day
  const selectedDayGames = useMemo(() => {
    return gamesByDate.get(selectedDateStr) || [];
  }, [gamesByDate, selectedDateStr]);
  
  // Selected day info
  const selectedDayInfo = useMemo(() => {
    return matchupWeekDates.find((d) => d.dateStr === selectedDateStr);
  }, [matchupWeekDates, selectedDateStr]);
  
  // Get non-past days for selector
  const selectableDays = useMemo(() => {
    return matchupWeekDates.filter((d) => !d.isPast);
  }, [matchupWeekDates]);

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
    
    const currentMy = myWeeklyData?.myTeam.stats;
    const currentOpp = myWeeklyData?.opponent.stats;
    const hasWeeklyData = !!myWeeklyData;

    return CATEGORIES.map(cat => {
      const myCurrentVal = hasWeeklyData 
        ? (currentMy?.[cat.key as keyof MatchupStats] || 0)
        : (projectedMy[cat.key as keyof MatchupStats] * (cat.key === "fgPct" || cat.key === "ftPct" ? 1 : 40)) || 0;
      const oppCurrentVal = hasWeeklyData 
        ? (currentOpp?.[cat.key as keyof MatchupStats] || 0)
        : (projectedOpp[cat.key as keyof MatchupStats] * (cat.key === "fgPct" || cat.key === "ftPct" ? 1 : 40)) || 0;
      
      let delta: number;
      if (cat.lowerBetter) {
        delta = oppCurrentVal - myCurrentVal;
      } else {
        delta = myCurrentVal - oppCurrentVal;
      }

      const projMyVal = projectedMy[cat.key as keyof MatchupStats] || 0;
      const projOppVal = projectedOpp[cat.key as keyof MatchupStats] || 0;
      
      const projMyTotal = (cat.key === "fgPct" || cat.key === "ftPct") ? projMyVal : projMyVal * 40;
      const projOppTotal = (cat.key === "fgPct" || cat.key === "ftPct") ? projOppVal : projOppVal * 40;
      
      let projDelta: number;
      if (cat.lowerBetter) {
        projDelta = projOppTotal - projMyTotal;
      } else {
        projDelta = projMyTotal - projOppTotal;
      }

      const swingThreshold = 0.15;
      let isSwingable = false;
      
      if (cat.key === "fgPct" || cat.key === "ftPct") {
        isSwingable = Math.abs(delta) <= 0.020;
      } else {
        const remaining = Math.max(0, (projMyTotal + projOppTotal) / 2 - Math.max(myCurrentVal, oppCurrentVal));
        isSwingable = Math.abs(delta) <= remaining * swingThreshold || Math.abs(delta) <= 10;
      }

      let urgency: "HIGH" | "MED" | "LOW";
      if (delta < 0 && isSwingable) {
        urgency = "HIGH";
      } else if (Math.abs(delta) < (cat.key === "fgPct" || cat.key === "ftPct" ? 0.015 : 8) || 
                 (projDelta < 0 && delta >= 0)) {
        urgency = "MED";
      } else if (delta > 0) {
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

  // Check if player can fill a slot based on positions
  const canFillSlot = (player: Player, slotEligible: string[]): boolean => {
    const playerPositions = player.positions?.map(p => p.toUpperCase()) || [];
    return slotEligible.some(eligible => playerPositions.includes(eligible));
  };

  // Position-aware lineup optimizer for SELECTED DAY
  const lineupRecommendation = useMemo(() => {
    // Get players with games on selected day (not OUT)
    const dayPlayers = roster.filter(slot => {
      if (slot.slotType === "ir" || slot.player.minutes <= 0) return false;
      
      // Check if player has game on selected day
      const hasGame = selectedDayGames.length > 0 
        ? playerHasGameOnDate(slot.player, selectedDayGames)
        : !!slot.player.opponent; // Fall back to imported opponent if no schedule
      
      const injuryStatus = getInjuryStatus(slot.player.status);
      return hasGame && injuryStatus !== "OUT";
    });

    // Calculate effective score for each player
    const playersWithScores = dayPlayers.map(slot => {
      const injuryStatus = getInjuryStatus(slot.player.status);
      const injuryMultiplier = getInjuryMultiplier(injuryStatus, applyInjuryMultipliers);
      const isCore = corePlayers.has(slot.player.id);
      
      // Get opponent from schedule if available
      const opponent = selectedDayGames.length > 0
        ? getOpponentFromSchedule(slot.player, selectedDayGames)
        : slot.player.opponent;
      
      let impactScore = 0;
      const helps: string[] = [];
      const risks: string[] = [];

      categoryUrgency.forEach((cat) => {
        const playerVal = slot.player[cat.key as keyof Player] as number || 0;
        
        const urgencyWeight = cat.urgency === "HIGH" ? 1.2 : cat.urgency === "MED" ? 1.0 : 0.7;
        const importanceWeight = weights[cat.key as keyof typeof weights] || 1;
        
        let contribution: number;
        if (cat.key === "fgPct" || cat.key === "ftPct") {
          contribution = cat.lowerBetter ? (0.45 - playerVal) : (playerVal - 0.45);
        } else if (cat.key === "turnovers") {
          contribution = 3 - playerVal;
        } else {
          contribution = playerVal;
        }

        const catScore = contribution * urgencyWeight * importanceWeight;
        impactScore += catScore;

        if (cat.urgency === "HIGH" || cat.urgency === "MED") {
          if (cat.key === "turnovers") {
            if (playerVal > 2.5) risks.push(cat.label);
            else if (playerVal < 1.5) helps.push(cat.label);
          } else if (cat.key === "fgPct" || cat.key === "ftPct") {
            if (playerVal > 0.50) helps.push(cat.label);
            else if (playerVal < 0.40) risks.push(cat.label);
          } else {
            if (playerVal > 5) helps.push(cat.label);
          }
        }
      });

      // Apply injury multiplier to effective score
      impactScore *= injuryMultiplier;

      const baseScore = useCris ? (slot.player.cri ?? 0) : (slot.player.wCri ?? 0);
      const finalScore = impactScore * 0.5 + baseScore * 0.5;

      if (injuryStatus === "DTD") risks.push("DTD");
      else if (injuryStatus === "GTD") risks.push("GTD");

      return {
        slot: { ...slot, player: { ...slot.player, opponent: opponent || slot.player.opponent } },
        score: finalScore,
        helps: helps.slice(0, 2),
        risks: risks.slice(0, 2),
        isCore,
        injuryStatus,
        injuryMultiplier,
        assignedSlot: undefined as string | undefined,
      } as PlayerRecommendation;
    });

    // Sort by score descending
    playersWithScores.sort((a, b) => b.score - a.score);

    // Greedy slot assignment
    const usedSlots = new Set<number>();
    const assignedPlayers = new Set<string>();
    const startLineup: PlayerRecommendation[] = [];
    const benchToday: PlayerRecommendation[] = [];
    const unfilledSlots: string[] = [];

    for (let slotIdx = 0; slotIdx < LINEUP_SLOTS.length; slotIdx++) {
      const slotDef = LINEUP_SLOTS[slotIdx];
      
      const bestPlayer = playersWithScores.find(p => 
        !assignedPlayers.has(p.slot.player.id) && 
        canFillSlot(p.slot.player, slotDef.eligible)
      );

      if (bestPlayer) {
        bestPlayer.assignedSlot = slotDef.slot;
        startLineup.push(bestPlayer);
        assignedPlayers.add(bestPlayer.slot.player.id);
        usedSlots.add(slotIdx);
      } else {
        unfilledSlots.push(slotDef.slot);
      }
    }

    playersWithScores.forEach(p => {
      if (!assignedPlayers.has(p.slot.player.id)) {
        benchToday.push(p);
      }
    });

    return { startLineup, benchToday, unfilledSlots };
  }, [roster, selectedDayGames, categoryUrgency, corePlayers, useCris, weights, applyInjuryMultipliers]);

  // Get OUT players and no-game players for selected day
  const { outPlayers, noGamePlayers, monitorPlayers } = useMemo(() => {
    const out: PlayerRecommendation[] = [];
    const noGame: PlayerRecommendation[] = [];
    const monitor: PlayerRecommendation[] = [];

    roster.filter(slot => slot.slotType !== "ir" && slot.player.minutes > 0).forEach(slot => {
      const injuryStatus = getInjuryStatus(slot.player.status);
      const isCore = corePlayers.has(slot.player.id);
      
      // Check if player has game on selected day
      const hasGame = selectedDayGames.length > 0
        ? playerHasGameOnDate(slot.player, selectedDayGames)
        : !!slot.player.opponent;
      
      const opponent = selectedDayGames.length > 0
        ? getOpponentFromSchedule(slot.player, selectedDayGames)
        : slot.player.opponent;
      
      const rec: PlayerRecommendation = {
        slot: { ...slot, player: { ...slot.player, opponent: opponent || undefined } },
        score: slot.player.cri ?? 0,
        helps: [],
        risks: injuryStatus === "DTD" ? ["DTD"] : injuryStatus === "GTD" ? ["GTD"] : [],
        isCore,
        injuryStatus,
        injuryMultiplier: getInjuryMultiplier(injuryStatus, applyInjuryMultipliers),
      };

      if (injuryStatus === "OUT") {
        out.push(rec);
      } else if (!hasGame) {
        noGame.push(rec);
      } else if (isCore && injuryStatus === "DTD") {
        monitor.push(rec);
      }
    });

    return { outPlayers: out, noGamePlayers: noGame, monitorPlayers: monitor };
  }, [roster, selectedDayGames, corePlayers, applyInjuryMultipliers]);

  // Get close categories for summary line
  const closeCategories = useMemo(() => {
    return categoryUrgency
      .filter(c => c.urgency === "HIGH" || c.urgency === "MED")
      .slice(0, 3)
      .map(c => c.label);
  }, [categoryUrgency]);

  const hasWeeklyData = !!myWeeklyData;

  if (roster.length === 0) {
    return null;
  }

  const scoreLabel = useCris ? "CRI" : "wCRI";
  const { startLineup, benchToday, unfilledSlots } = lineupRecommendation;
  const hasAnyPlayers = startLineup.length > 0 || benchToday.length > 0 || noGamePlayers.length > 0 || outPlayers.length > 0;
  const selectedDayLabel = selectedDayInfo?.isToday ? "Today" : `${selectedDayInfo?.dayLabel} ${selectedDayInfo?.dateLabel}`;

  return (
    <div className="space-y-3">
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="font-display font-bold text-sm">Start/Sit Advisor</h3>
          <Badge variant="outline" className="text-[10px] ml-auto">
            {hasWeeklyData ? "Weekly + Proj" : matchupData ? "Projections" : scoreLabel}
          </Badge>
        </div>

        {/* Day Selector */}
        {selectableDays.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground font-medium">Select day:</span>
              <Collapsible open={showSettings} onOpenChange={setShowSettings}>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    <Settings2 className="w-3 h-3" />
                    Settings
                  </button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
            
            <ToggleGroup
              type="single"
              value={selectedDateStr}
              onValueChange={(val) => val && setSelectedDateStr(val)}
              className="flex flex-wrap gap-1 justify-start"
            >
              {selectableDays.map((day) => (
                <ToggleGroupItem
                  key={day.dateStr}
                  value={day.dateStr}
                  className={cn(
                    "text-[10px] px-2 py-1 h-auto",
                    day.isToday && "border-primary"
                  )}
                >
                  <div className="flex flex-col items-center leading-tight">
                    <span className="font-semibold">{day.isToday ? "Today" : day.dayLabel}</span>
                    <span className="text-muted-foreground">{day.dateLabel}</span>
                  </div>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            
            {/* Settings Panel */}
            <Collapsible open={showSettings} onOpenChange={setShowSettings}>
              <CollapsibleContent className="mt-2">
                <div className="bg-muted/30 rounded-md p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Label htmlFor="injury-toggle" className="text-[10px] cursor-help">
                            Apply injury probabilities
                          </Label>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[180px]">
                          <p className="text-xs">DTD = 70%, GTD = 85%, Q = 70%. Turn off to assume all play.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Switch
                      id="injury-toggle"
                      checked={applyInjuryMultipliers}
                      onCheckedChange={setApplyInjuryMultipliers}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Fallback notice if no game data */}
        {!matchupData && (
          <div className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Unable to read matchup — using {scoreLabel}-only logic
          </div>
        )}
        
        {/* Schedule data notice */}
        {selectedDayGames.length === 0 && !selectedDayInfo?.isToday && (
          <div className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            No schedule data for {selectedDayLabel} — using imported opponent info
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
            {/* Optimized for close categories notice */}
            {closeCategories.length > 0 && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Target className="w-3 h-3 text-primary" />
                Optimized for: {closeCategories.join(", ")}
              </div>
            )}

            {/* Recommended Lineup */}
            {startLineup.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-stat-positive" />
                  <span className="text-xs font-semibold text-stat-positive">
                    Recommended Lineup ({selectedDayLabel})
                  </span>
                  <span className="text-[10px] text-muted-foreground">({startLineup.length})</span>
                </div>
                <div className="space-y-1.5">
                  {startLineup.map((rec) => (
                    <PlayerRow
                      key={rec.slot.player.id}
                      rec={rec}
                      recommendation="start"
                    />
                  ))}
                </div>
                {unfilledSlots.length > 0 && (
                  <p className="text-[10px] text-stat-negative mt-1">
                    Unfilled slots: {unfilledSlots.length} ({unfilledSlots.join(", ")})
                  </p>
                )}
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

            {/* Bench */}
            {benchToday.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <XCircle className="w-3.5 h-3.5 text-stat-negative" />
                  <span className="text-xs font-semibold text-stat-negative">
                    Bench ({selectedDayLabel})
                  </span>
                  <span className="text-[10px] text-muted-foreground">({benchToday.length})</span>
                </div>
                <div className="space-y-1.5">
                  {benchToday.map((rec) => (
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

            {/* No Game on Selected Day */}
            {noGamePlayers.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    No Game ({selectedDayLabel})
                  </span>
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
      
      {/* Rest of Week Planner */}
      {roster.length > 0 && gamesByDate.size > 0 && (
        <RestOfWeekPlanner
          roster={roster}
          opponentRoster={opponentRoster}
          weekDates={matchupWeekDates.map((d) => ({
            dateStr: d.dateStr,
            dayLabel: d.dayLabel,
            dateLabel: d.dateLabel,
            isToday: d.isToday,
          }))}
          gamesByDate={gamesByDate}
          selectedDateStr={selectedDateStr}
          onSelectDate={setSelectedDateStr}
        />
      )}
    </div>
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
