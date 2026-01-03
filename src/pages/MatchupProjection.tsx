import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ArrowRight, Trophy, Target, Minus, Upload, RefreshCw, Info, AlertTriangle, Lightbulb, X, ChevronDown, Calendar, Users, Loader2 } from "lucide-react";
import { formatPct, CATEGORIES } from "@/lib/crisUtils";
import { validateParseInput, parseWithTimeout, createLoopGuard, MAX_INPUT_SIZE } from "@/lib/parseUtils";
import { RosterSlot, Player } from "@/types/fantasy";
import { useToast } from "@/hooks/use-toast";
import { BaselinePacePanel } from "@/components/BaselinePacePanel";
import { devLog, devWarn, devError } from "@/lib/devLog";

// Detect stat window from ESPN paste
const detectStatWindow = (data: string): string | null => {
  // Look for stat window patterns in the Stats section specifically
  const statsPattern = /Stats\s+(Last\s+\d+|2024|2025|2026|Season|Projections)/i;
  const match = data.match(statsPattern);
  if (match) {
    return match[1].replace(/\s+/g, ' ').trim();
  }
  
  // Fallback patterns
  const patterns = [
    /Last\s+7/i,
    /Last\s+15/i,
    /Last\s+30/i,
    /2024\s+Season/i,
    /2025\s+Season/i,
    /2026\s+Season/i,
    /Season\s+Averages/i,
    /Projections/i,
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(data)) {
      const m = data.match(pattern);
      return m ? m[0].replace(/\s+/g, ' ').trim() : null;
    }
  }
  
  return null;
};

interface TeamStats {
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

interface TeamInfo {
  name: string;
  abbr?: string;
  record: string;
  standing: string;
  owner?: string;
  lastMatchup?: string;
}

interface MatchupTeam extends TeamInfo {
  stats: TeamStats;
}

// Parse result with player counts for UI feedback
interface ParseResult {
  info: TeamInfo;
  stats: TeamStats;
  playerCount: number;
  emptySlots: number;
  playersWithMissingStats: number;
}

interface MatchupData {
  myTeam: MatchupTeam;
  opponent: MatchupTeam;
  opponentRoster?: RosterSlot[];
  myParseInfo?: { playerCount: number; emptySlots: number; playersWithMissingStats: number };
  oppParseInfo?: { playerCount: number; emptySlots: number; playersWithMissingStats: number };
}

interface WeeklyTeamStats {
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
  stats: WeeklyTeamStats;
}

interface WeeklyMatchup {
  teamA: WeeklyTeam;
  teamB: WeeklyTeam;
}

interface MatchupProjectionProps {
  persistedMatchup: MatchupData | null;
  onMatchupChange: (data: MatchupData | null) => void;
  weeklyMatchups?: WeeklyMatchup[];
  roster?: RosterSlot[];
  opponentRoster?: RosterSlot[];
  onUpdateMatchupContext?: (
    projectedMy: Record<string, number>,
    projectedOpp: Record<string, number>,
    currentMy?: Record<string, number>,
    currentOpp?: Record<string, number>,
    daysRemaining?: number
  ) => void;
}

const COUNTING_STATS = ["threepm", "rebounds", "assists", "steals", "blocks", "turnovers", "points"];

// Check if opponent field indicates a game today (contains vs/@ with time)
function hasGameToday(opponent?: string): boolean {
  if (!opponent) return false;
  const opp = opponent.trim();
  // Match patterns like "vs SAC 10:00 PM", "@LAL 7:30 PM", "vs @Sac 10:00 PM"
  const hasVsOrAt = /^(vs|@)/i.test(opp) || opp.includes('@') || opp.toLowerCase().includes('vs');
  const hasTime = /\d{1,2}:\d{2}\s*(AM|PM)/i.test(opp);
  // Also check for just time pattern if opponent is present
  return hasVsOrAt && hasTime;
}

// Compute "today expected" stats from any roster (works for both user and opponent)
function computeTodayExpectedFromRoster(roster: RosterSlot[]): TeamStats & { hasData: boolean; playerCount: number; estimatedFGA: number; estimatedFTA: number; estimatedFGM: number; estimatedFTM: number } {
  const playersWithGamesToday = roster.filter(slot => 
    hasGameToday(slot.player.opponent) && 
    slot.slotType !== "ir" &&
    !isPlayerOut(slot.player.status)
  );
  
  let totalFGM = 0, totalFGA = 0, totalFTM = 0, totalFTA = 0;
  let threepm = 0, rebounds = 0, assists = 0, steals = 0, blocks = 0, turnovers = 0, points = 0;
  
  playersWithGamesToday.forEach(slot => {
    const p = slot.player;
    const multiplier = getInjuryMultiplier(p.status);
    
    // Estimate FGA/FTA from FG%/FT% and points (rough heuristic)
    const estimatedFGA = Math.max(1, (p.minutes / 30) * 12);
    const estimatedFTA = Math.max(1, (p.minutes / 30) * 4);
    
    totalFGM += (p.fgPct * estimatedFGA) * multiplier;
    totalFGA += estimatedFGA * multiplier;
    totalFTM += (p.ftPct * estimatedFTA) * multiplier;
    totalFTA += estimatedFTA * multiplier;
    
    threepm += p.threepm * multiplier;
    rebounds += p.rebounds * multiplier;
    assists += p.assists * multiplier;
    steals += p.steals * multiplier;
    blocks += p.blocks * multiplier;
    turnovers += p.turnovers * multiplier;
    points += p.points * multiplier;
  });
  
  return {
    fgPct: totalFGA > 0 ? totalFGM / totalFGA : 0,
    ftPct: totalFTA > 0 ? totalFTM / totalFTA : 0,
    threepm,
    rebounds,
    assists,
    steals,
    blocks,
    turnovers,
    points,
    hasData: playersWithGamesToday.length > 0,
    playerCount: playersWithGamesToday.length,
    estimatedFGA: totalFGA,
    estimatedFTA: totalFTA,
    estimatedFGM: totalFGM,
    estimatedFTM: totalFTM,
  };
}

// Get day info for America/New_York timezone
function getMatchupDayInfo(): { dayOfWeek: number; dayName: string; isFinalDay: boolean; dayLabel: string } {
  const now = new Date();
  // Get current day in Eastern Time
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', timeZone: 'America/New_York' };
  const dayName = new Intl.DateTimeFormat('en-US', options).format(now);
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(dayName);
  
  // Fantasy weeks typically run Mon-Sun, so Sunday is day 7
  const isFinalDay = dayOfWeek === 0; // Sunday
  const dayNumber = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1-7 (Mon=1, Sun=7)
  const dayLabel = isFinalDay ? "Day 7/7 (Sunday) — Final day" : `Day ${dayNumber}/7 (${dayName})`;
  
  return { dayOfWeek, dayName, isFinalDay, dayLabel };
}

// Check if a player is OUT
function isPlayerOut(status?: string): boolean {
  if (!status) return false;
  const s = status.toUpperCase().trim();
  return s === "O" || s === "OUT" || s === "SUSP" || s.includes("(O)") || s.includes("INJ (O)");
}

// Get injury multiplier
function getInjuryMultiplier(status?: string): number {
  if (!status) return 1.0;
  const s = status.toUpperCase().trim();
  if (isPlayerOut(s)) return 0;
  if (s === "DTD" || s.includes("DTD") || s === "Q" || s === "QUESTIONABLE") return 0.70;
  if (s === "GTD" || s === "PROBABLE" || s === "P") return 0.85;
  return 1.0;
}

// Legacy computeTodayExpected for backwards compatibility (uses old logic)
function computeTodayExpected(roster: RosterSlot[]): TeamStats & { hasData: boolean; playerCount: number; estimatedFGA: number; estimatedFTA: number; estimatedFGM: number; estimatedFTM: number } {
  return computeTodayExpectedFromRoster(roster);
}

// Parse opponent roster from ESPN paste to extract players with their OPP field
function parseOpponentRoster(data: string): RosterSlot[] {
  if (!data) return [];
  
  const lines = data.trim().split("\n").map(l => l.trim()).filter(l => l);
  const roster: RosterSlot[] = [];
  
  // Find stats section start
  let statsStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === 'MIN' && i + 1 < lines.length) {
      const nextFew = lines.slice(i, i + 5).join(' ');
      if (nextFew.includes('FG') || nextFew.includes('3PM') || nextFew.includes('REB')) {
        statsStartIdx = i;
        break;
      }
    }
  }
  
  if (statsStartIdx === -1) return [];
  
  // Collect stat tokens
  const statTokens: string[] = [];
  let dataStartIdx = statsStartIdx + 1;
  while (
    dataStartIdx < lines.length &&
    /^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|MIN)$/i.test(lines[dataStartIdx])
  ) {
    dataStartIdx++;
  }
  
  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i];
    if (/^(Username|Password|ESPN\.com|Copyright|©)/i.test(line)) break;
    if (/^\d+\.?\d*\/\d+\.?\d*$/.test(line)) {
      const parts = line.split('/');
      statTokens.push(parts[0], parts[1]);
      continue;
    }
    if (/^[-+]?\d+\.?\d*$/.test(line) || /^\.\d+$/.test(line) || line === '--') {
      statTokens.push(line);
    }
  }
  
  // Parse player rows - look for slot patterns and player info
  // Pattern: Slot, Player Name, Team, OPP (with game info), Stats...
  const slotPattern = /^(PG|SG|SF|PF|C|G|F|UTIL|Bench|IR)$/i;
  const COLS = 17;
  const numStatRows = Math.floor(statTokens.length / COLS);
  
  // Also need to find player names/teams/opponents before stats
  // Look backwards from stats to find player info
  const playerInfoLines: { name: string; team: string; opp: string; status: string; slotType: string }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for slot pattern
    if (slotPattern.test(line)) {
      const slot = line.toUpperCase();
      const slotType = slot.includes('IR') ? 'ir' : slot === 'BENCH' ? 'bench' : 'starter';
      
      // Next lines should be: player name, injury status (optional), team, position, OPP info
      let playerName = '';
      let team = '';
      let opp = '';
      let status = '';
      
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const nextLine = lines[j];
        
        // Skip slot patterns
        if (slotPattern.test(nextLine)) break;
        
        // Check for injury status patterns
        if (/^(O|OUT|DTD|GTD|Q|SUSP|P)$/i.test(nextLine)) {
          status = nextLine.toUpperCase();
          continue;
        }
        
        // Check for team code (3-letter uppercase)
        if (/^[A-Z]{2,4}$/.test(nextLine) && !team) {
          team = nextLine;
          continue;
        }
        
        // Check for opponent pattern (vs/@ with team and optionally time)
        if ((nextLine.startsWith('@') || nextLine.toLowerCase().startsWith('vs')) && !opp) {
          opp = nextLine;
          continue;
        }
        
        // Check for time pattern (likely part of opponent info)
        if (/^\d{1,2}:\d{2}\s*(AM|PM)/i.test(nextLine) && opp) {
          opp += ' ' + nextLine;
          continue;
        }
        
        // If we haven't found player name yet and this isn't a stat/number
        if (!playerName && !(/^[\d.-]+$/.test(nextLine) || /^\d+\/\d+$/.test(nextLine))) {
          // Check if it looks like a player name (at least 2 words or single word > 3 chars)
          if (nextLine.length > 3 && !/^(MIN|FG|FT|3PM|REB|AST|STL|BLK|TO|PTS|Stats|--)/i.test(nextLine)) {
            playerName = nextLine;
          }
        }
        
        // Stop if we hit stats section markers
        if (nextLine === 'MIN' || /^[\d.]+$/.test(nextLine)) break;
      }
      
      if (playerName) {
        playerInfoLines.push({ name: playerName, team, opp, status, slotType });
      }
    }
  }
  
  // Match player info with stats
  for (let i = 0; i < Math.min(numStatRows, playerInfoLines.length); i++) {
    const info = playerInfoLines[i];
    const base = i * COLS;
    const parseVal = (idx: number): number => {
      const val = statTokens[base + idx];
      if (!val || val === '--') return 0;
      return parseFloat(val);
    };
    
    const min = parseVal(0);
    if (min === 0 || isNaN(min)) continue;
    
    let fgPct = parseVal(3);
    if (fgPct > 1) fgPct = fgPct / (fgPct >= 100 ? 1000 : 100);
    
    let ftPct = parseVal(6);
    if (ftPct > 1) ftPct = ftPct / (ftPct >= 100 ? 1000 : 100);
    
    roster.push({
      slot: info.slotType === 'ir' ? 'IR' : info.slotType === 'bench' ? 'Bench' : 'UTIL',
      slotType: info.slotType as 'starter' | 'bench' | 'ir',
      player: {
        id: info.name,
        name: info.name,
        nbaTeam: info.team,
        positions: [],
        opponent: info.opp,
        status: info.status as Player['status'],
        minutes: min,
        fgm: 0,
        fga: 0,
        fgPct: fgPct,
        ftm: 0,
        fta: 0,
        ftPct: ftPct,
        threepm: parseVal(7),
        rebounds: parseVal(8),
        assists: parseVal(9),
        steals: parseVal(10),
        blocks: parseVal(11),
        turnovers: parseVal(12),
        points: parseVal(13),
      },
    });
  }
  
  return roster;
}

// Parse current W-L-T from Weekly currentMatchup string (e.g., "6-3-0")
function parseCurrentRecord(currentMatchup: string): { wins: number; losses: number; ties: number } | null {
  const match = currentMatchup.match(/^(\d+)-(\d+)-(\d+)$/);
  if (!match) return null;
  return {
    wins: parseInt(match[1]),
    losses: parseInt(match[2]),
    ties: parseInt(match[3]),
  };
}

export const MatchupProjection = ({ 
  persistedMatchup, 
  onMatchupChange,
  weeklyMatchups = [],
  roster = [],
  onUpdateMatchupContext,
}: MatchupProjectionProps) => {
  const { toast } = useToast();
  const [myTeamData, setMyTeamData] = useState("");
  const [opponentData, setOpponentData] = useState("");
  const [statWindowMismatch, setStatWindowMismatch] = useState<{ myWindow: string | null; oppWindow: string | null } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [dismissedTip, setDismissedTip] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(true); // Dynamic projection expanded by default

  const dayInfo = getMatchupDayInfo();

  // Find my team's weekly data if available
  const myWeeklyData = useMemo(() => {
    if (!persistedMatchup || weeklyMatchups.length === 0) return null;
    
    const myTeamName = persistedMatchup.myTeam.name.toLowerCase();
    
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
  }, [persistedMatchup, weeklyMatchups]);

  // Compute today's expected stats from roster
  const todayExpected = useMemo(() => {
    return computeTodayExpected(roster);
  }, [roster]);

  // Compute opponent's today expected stats from persisted opponent roster
  const oppTodayExpected = useMemo(() => {
    if (!persistedMatchup?.opponentRoster) return computeTodayExpectedFromRoster([]);
    return computeTodayExpectedFromRoster(persistedMatchup.opponentRoster);
  }, [persistedMatchup?.opponentRoster]);

  // Compute dynamic projections: Current + Today Expected = Projected Final
  const dynamicProjection = useMemo(() => {
    if (!persistedMatchup) return null;

    const hasWeeklyData = !!myWeeklyData;
    const baselineStats = persistedMatchup.myTeam.stats;
    const oppBaselineStats = persistedMatchup.opponent.stats;
    
    // Current totals from Weekly (if available), otherwise use 0
    const currentMy = hasWeeklyData ? myWeeklyData.myTeam.stats : null;
    const currentOpp = hasWeeklyData ? myWeeklyData.opponent.stats : null;
    
    // Estimate days elapsed (for percentage calculations)
    const daysElapsed = dayInfo.dayOfWeek === 0 ? 6 : dayInfo.dayOfWeek - 1;
    
    // For each category, compute projected final
    const computeProjectedFinal = (
      current: number | null,
      todayExp: number,
      baseline: number,
      isPercentage: boolean,
      currentMakes?: number,
      currentAttempts?: number,
      todayMakes?: number,
      todayAttempts?: number
    ): { projected: number; current: number; today: number; isEstimated?: boolean } => {
      if (isPercentage) {
        // For percentages, use makes/attempts
        if (current !== null && currentMakes !== undefined && currentAttempts !== undefined) {
          const projMakes = currentMakes + (todayMakes || 0);
          const projAttempts = currentAttempts + (todayAttempts || 0);
          return {
            projected: projAttempts > 0 ? projMakes / projAttempts : baseline,
            current: current,
            today: todayAttempts && todayAttempts > 0 ? (todayMakes || 0) / todayAttempts : 0,
          };
        }
        // Estimate current attempts from baseline
        const estAttemptsPerDay = baseline > 0 ? 15 : 10; // rough estimate
        const estCurrentAttempts = estAttemptsPerDay * Math.max(1, daysElapsed);
        const estCurrentMakes = (current ?? baseline) * estCurrentAttempts;
        const projMakes = estCurrentMakes + (todayMakes || 0);
        const projAttempts = estCurrentAttempts + (todayAttempts || 0);
        return {
          projected: projAttempts > 0 ? projMakes / projAttempts : baseline,
          current: current ?? baseline,
          today: todayAttempts && todayAttempts > 0 ? (todayMakes || 0) / todayAttempts : 0,
          isEstimated: true,
        };
      }
      
      // Counting stats
      const currentVal = current ?? 0;
      return {
        projected: currentVal + todayExp,
        current: currentVal,
        today: todayExp,
      };
    };

    // My team projections
    const myProjections = {
      fgPct: computeProjectedFinal(
        currentMy?.fgPct ?? null, 0, baselineStats.fgPct, true,
        currentMy ? currentMy.fgPct * (daysElapsed * 40) : undefined,
        currentMy ? daysElapsed * 40 : undefined,
        todayExpected.estimatedFGM, todayExpected.estimatedFGA
      ),
      ftPct: computeProjectedFinal(
        currentMy?.ftPct ?? null, 0, baselineStats.ftPct, true,
        currentMy ? currentMy.ftPct * (daysElapsed * 15) : undefined,
        currentMy ? daysElapsed * 15 : undefined,
        todayExpected.estimatedFTM, todayExpected.estimatedFTA
      ),
      threepm: computeProjectedFinal(currentMy?.threepm ?? null, todayExpected.threepm, baselineStats.threepm * 40, false),
      rebounds: computeProjectedFinal(currentMy?.rebounds ?? null, todayExpected.rebounds, baselineStats.rebounds * 40, false),
      assists: computeProjectedFinal(currentMy?.assists ?? null, todayExpected.assists, baselineStats.assists * 40, false),
      steals: computeProjectedFinal(currentMy?.steals ?? null, todayExpected.steals, baselineStats.steals * 40, false),
      blocks: computeProjectedFinal(currentMy?.blocks ?? null, todayExpected.blocks, baselineStats.blocks * 40, false),
      turnovers: computeProjectedFinal(currentMy?.turnovers ?? null, todayExpected.turnovers, baselineStats.turnovers * 40, false),
      points: computeProjectedFinal(currentMy?.points ?? null, todayExpected.points, baselineStats.points * 40, false),
    };

    // Opponent projections - use their roster data if available
    const oppHasRoster = persistedMatchup.opponentRoster && persistedMatchup.opponentRoster.length > 0;
    const oppProjections = {
      fgPct: computeProjectedFinal(
        currentOpp?.fgPct ?? null, 0, oppBaselineStats.fgPct, true,
        currentOpp ? currentOpp.fgPct * (daysElapsed * 40) : undefined,
        currentOpp ? daysElapsed * 40 : undefined,
        oppTodayExpected.estimatedFGM, oppTodayExpected.estimatedFGA
      ),
      ftPct: computeProjectedFinal(
        currentOpp?.ftPct ?? null, 0, oppBaselineStats.ftPct, true,
        currentOpp ? currentOpp.ftPct * (daysElapsed * 15) : undefined,
        currentOpp ? daysElapsed * 15 : undefined,
        oppTodayExpected.estimatedFTM, oppTodayExpected.estimatedFTA
      ),
      threepm: computeProjectedFinal(currentOpp?.threepm ?? null, oppTodayExpected.threepm, oppBaselineStats.threepm * 40, false),
      rebounds: computeProjectedFinal(currentOpp?.rebounds ?? null, oppTodayExpected.rebounds, oppBaselineStats.rebounds * 40, false),
      assists: computeProjectedFinal(currentOpp?.assists ?? null, oppTodayExpected.assists, oppBaselineStats.assists * 40, false),
      steals: computeProjectedFinal(currentOpp?.steals ?? null, oppTodayExpected.steals, oppBaselineStats.steals * 40, false),
      blocks: computeProjectedFinal(currentOpp?.blocks ?? null, oppTodayExpected.blocks, oppBaselineStats.blocks * 40, false),
      turnovers: computeProjectedFinal(currentOpp?.turnovers ?? null, oppTodayExpected.turnovers, oppBaselineStats.turnovers * 40, false),
      points: computeProjectedFinal(currentOpp?.points ?? null, oppTodayExpected.points, oppBaselineStats.points * 40, false),
    };

    return {
      myProjections,
      oppProjections,
      hasWeeklyData,
      currentRecord: hasWeeklyData ? parseCurrentRecord(myWeeklyData.myTeam.currentMatchup) : null,
      oppHasSchedule: oppHasRoster && oppTodayExpected.hasData,
    };
  }, [persistedMatchup, myWeeklyData, todayExpected, oppTodayExpected, dayInfo]);

  // Update dynamic weights context when matchup data changes
  useEffect(() => {
    if (!persistedMatchup || !onUpdateMatchupContext) return;
    
    const myStats = persistedMatchup.myTeam.stats;
    const oppStats = persistedMatchup.opponent.stats;
    
    // Create projections as Record<string, number>
    const projectedMy: Record<string, number> = {
      fgPct: myStats.fgPct,
      ftPct: myStats.ftPct,
      threepm: myStats.threepm,
      rebounds: myStats.rebounds,
      assists: myStats.assists,
      steals: myStats.steals,
      blocks: myStats.blocks,
      turnovers: myStats.turnovers,
      points: myStats.points,
    };
    
    const projectedOpp: Record<string, number> = {
      fgPct: oppStats.fgPct,
      ftPct: oppStats.ftPct,
      threepm: oppStats.threepm,
      rebounds: oppStats.rebounds,
      assists: oppStats.assists,
      steals: oppStats.steals,
      blocks: oppStats.blocks,
      turnovers: oppStats.turnovers,
      points: oppStats.points,
    };
    
    // If we have weekly data, include current stats
    let currentMy: Record<string, number> | undefined;
    let currentOpp: Record<string, number> | undefined;
    
    if (myWeeklyData) {
      currentMy = {
        fgPct: myWeeklyData.myTeam.stats.fgPct,
        ftPct: myWeeklyData.myTeam.stats.ftPct,
        threepm: myWeeklyData.myTeam.stats.threepm,
        rebounds: myWeeklyData.myTeam.stats.rebounds,
        assists: myWeeklyData.myTeam.stats.assists,
        steals: myWeeklyData.myTeam.stats.steals,
        blocks: myWeeklyData.myTeam.stats.blocks,
        turnovers: myWeeklyData.myTeam.stats.turnovers,
        points: myWeeklyData.myTeam.stats.points,
      };
      currentOpp = {
        fgPct: myWeeklyData.opponent.stats.fgPct,
        ftPct: myWeeklyData.opponent.stats.ftPct,
        threepm: myWeeklyData.opponent.stats.threepm,
        rebounds: myWeeklyData.opponent.stats.rebounds,
        assists: myWeeklyData.opponent.stats.assists,
        steals: myWeeklyData.opponent.stats.steals,
        blocks: myWeeklyData.opponent.stats.blocks,
        turnovers: myWeeklyData.opponent.stats.turnovers,
        points: myWeeklyData.opponent.stats.points,
      };
    }
    
    // Calculate days remaining (Sun = 0 = final day, so 0 remaining)
    const dayOfWeek = new Date().getDay();
    const daysRemaining = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    
    onUpdateMatchupContext(projectedMy, projectedOpp, currentMy, currentOpp, daysRemaining);
  }, [persistedMatchup, myWeeklyData, onUpdateMatchupContext]);
  const extractOpponentFromCurrentMatchup = (data: string, myTeamName: string): string | null => {
    const lines = data.trim().split("\n").map(l => l.trim()).filter(l => l);
    
    // Find "Current Matchup" section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase() === 'current matchup') {
        // Look at the next few lines for team names and W-L-T records
        // Format: "Team Name" followed by "W-L-T" (e.g., "Mr. Bane" then "6-3-0")
        const matchupTeams: string[] = [];
        
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const line = lines[j];
          // Skip stat headers and navigation
          if (/^(FG%|FT%|3PM|REB|AST|STL|BLK|TO|PTS|Last Matchup|Matchup History|Season|Stats|MIN)$/i.test(line)) break;
          
          // Check if next line is a W-L-T record - if so, current line is a team name
          const nextLine = lines[j + 1];
          if (nextLine && /^\d+-\d+-\d+$/.test(nextLine) && line.length >= 2 && line.length <= 50) {
            // Skip ESPN navigation-like text
            if (!/^(Start|Bench|Set|Trade|Waiver|Full|LM Tools)/i.test(line)) {
              matchupTeams.push(line);
            }
          }
        }
        
        // Find the team that is NOT myTeamName (case-insensitive)
        if (matchupTeams.length >= 2) {
          const opponent = matchupTeams.find(t => t.toLowerCase() !== myTeamName.toLowerCase());
          if (opponent) return opponent;
        } else if (matchupTeams.length === 1 && matchupTeams[0].toLowerCase() !== myTeamName.toLowerCase()) {
          return matchupTeams[0];
        }
        break;
      }
    }
    return null;
  };

  // Parse ESPN full page paste - extract team info and calculate averages from active players
  // Returns ParseResult with player counts for UI feedback
  const parseESPNTeamPage = (data: string): ParseResult | null => {
    // Validate input
    validateParseInput(data);
    
    const lines = data
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);
    
    const loopGuard = createLoopGuard();

    // Skip ESPN navigation and irrelevant text like "Team Settings"
    const skipPatterns =
      /^(hsb\.|ESPN|NFL|NBA|MLB|NCAAF|NHL|Soccer|WNBA|More Sports|Watch|Fantasy|Where to Watch|Fantasy Basketball Home|My Team|League|Settings|Members|Rosters|Schedule|Message Board|Transaction Counter|History|Draft Recap|Email League|Recent Activity|Players|Add Players|Watch List|Daily Leaders|Live Draft Trends|Added \/ Dropped|Player Rater|Player News|Projections|Waiver Order|Waiver Report|Undroppables|FantasyCast|Scoreboard|Standings|Opposing Teams|ESPN BET|Copyright|ESPN\.com|Member Services|Interest-Based|Privacy|Terms|NBPA|Team Settings|LM Tools)$/i;

    let teamName = "";
    let teamAbbr = "";
    let record = "";
    let standing = "";
    let owner = "";
    let lastMatchup = "";

    // Find team info block pattern - look for "Team Name" followed by record and standing
    for (let i = 0; i < lines.length; i++) {
      loopGuard.check();
      const line = lines[i];
      if (skipPatterns.test(line)) continue;
      
      // Look for standing pattern like "(5th of 10)" which uniquely identifies the team header block
      const standingMatch = line.match(/^\((\d+)(st|nd|rd|th)\s+of\s+(\d+)\)$/i);
      if (standingMatch && i >= 2) {
        // Standing found - look backwards for record and team name
        const recordLine = lines[i - 1];
        let teamLine = lines[i - 2];
        
        // Skip "Team Settings" if it's the team line
        if (skipPatterns.test(teamLine) && i >= 3) {
          teamLine = lines[i - 3];
        }
        
        const recordMatch = recordLine.match(/^(\d+-\d+-\d+)$/);
        if (recordMatch && teamLine && !skipPatterns.test(teamLine) && 
            !teamLine.match(/^(PG|SG|SF|PF|C|G|F|UTIL|Bench|IR|STARTERS|STATS|MIN|FG|FT|3PM|REB|AST|STL|BLK|TO|PTS|LM Tools|Get Another Team|Team Settings)/i)) {
          teamName = teamLine;
          record = recordMatch[1];
          standing = `${standingMatch[1]}${standingMatch[2]} of ${standingMatch[3]}`;
          
          // Look for owner name after standing - typically "FirstName LastName" pattern
          // Skip "Team Settings" and similar
          for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
            const ownerLine = lines[j];
            // Skip navigation/settings text
            if (skipPatterns.test(ownerLine)) continue;
            if (ownerLine.length < 5) continue;
            if (/^(Waiver|Full|Last|Current|Set|Trade|Matchup|Season|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Today|Fri|Sat|Sun|Mon|Tue|Wed|Thu)/i.test(ownerLine)) continue;
            
            // Match owner pattern: "FirstName LastName" (two capitalized words)
            const ownerMatch = ownerLine.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)$/);
            if (ownerMatch) {
              owner = ownerMatch[1];
              break;
            }
          }
          break; // Found the main team info block
        }
      }
    }

    // Look for "Last Matchup" section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === "Last Matchup" && i + 4 < lines.length) {
        const team1 = lines[i + 1];
        const score1 = lines[i + 2];
        const team2 = lines[i + 3];
        const score2 = lines[i + 4];
        if (score1?.match(/^\d+-\d+-\d+$/) && score2?.match(/^\d+-\d+-\d+$/)) {
          lastMatchup = `${team1} ${score1} vs ${team2} ${score2}`;
        }
        break;
      }
    }

    // Try to extract team abbreviation from "Opposing Teams" section or team name pattern
    // Common pattern: "Team Name (ABBR)" in league listing
    const abbrMatch = teamName.match(/^(.+?)\s*\(([A-Z]{2,6})\)$/i);
    if (abbrMatch) {
      teamName = abbrMatch[1].trim();
      teamAbbr = abbrMatch[2].toUpperCase();
    } else {
      // Generate abbreviation from first letters of team name words
      const words = teamName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2) {
        teamAbbr = words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
      } else if (words.length === 1 && words[0].length >= 3) {
        teamAbbr = words[0].slice(0, 4).toUpperCase();
      }
    }

    // Build header-driven index map for robust stat parsing
    const buildHeaderIndexMap = (headers: string[]): Record<string, number> => {
      const map: Record<string, number> = {};
      let tokenIdx = 0;
      
      for (const h of headers) {
        const hUpper = h.toUpperCase().replace(/[^A-Z0-9%/+-]/g, '');
        
        // Map header to token index
        if (hUpper === 'MIN') map['MIN'] = tokenIdx++;
        else if (hUpper === 'FGM/FGA' || hUpper === 'FGMFGA') {
          map['FGM'] = tokenIdx++;
          map['FGA'] = tokenIdx++;
        }
        else if (hUpper === 'FG%') map['FG%'] = tokenIdx++;
        else if (hUpper === 'FTM/FTA' || hUpper === 'FTMFTA') {
          map['FTM'] = tokenIdx++;
          map['FTA'] = tokenIdx++;
        }
        else if (hUpper === 'FT%') map['FT%'] = tokenIdx++;
        else if (hUpper === '3PM') map['3PM'] = tokenIdx++;
        else if (hUpper === 'REB') map['REB'] = tokenIdx++;
        else if (hUpper === 'AST') map['AST'] = tokenIdx++;
        else if (hUpper === 'STL') map['STL'] = tokenIdx++;
        else if (hUpper === 'BLK') map['BLK'] = tokenIdx++;
        else if (hUpper === 'TO') map['TO'] = tokenIdx++;
        else if (hUpper === 'PTS') map['PTS'] = tokenIdx++;
        // IGNORE: PR15, %ROST, +/- - just advance tokenIdx
        else if (hUpper === 'PR15' || hUpper === '%ROST' || hUpper === '+/-') {
          map[hUpper] = tokenIdx++;
        }
        else tokenIdx++;
      }
      
      return map;
    };

    // Find the stats section - look for "MIN" followed by stat headers
    let statsStartIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'MIN' && i + 1 < lines.length) {
        const nextFew = lines.slice(i, i + 5).join(' ');
        if (nextFew.includes('FG') || nextFew.includes('3PM') || nextFew.includes('REB')) {
          statsStartIdx = i;
          break;
        }
      }
    }

    if (statsStartIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/^STATS$/i.test(lines[i]) || /^Research$/i.test(lines[i])) {
          for (let j = i; j < Math.min(i + 20, lines.length); j++) {
            if (lines[j] === 'MIN') {
              statsStartIdx = j;
              break;
            }
          }
          if (statsStartIdx > -1) break;
        }
      }
    }

    // Extract headers from statsStartIdx
    const headers: string[] = [];
    let dataStartIdx = statsStartIdx;
    if (statsStartIdx > -1) {
      dataStartIdx = statsStartIdx;
      while (
        dataStartIdx < lines.length &&
        /^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|MIN)$/i.test(
          lines[dataStartIdx]
        )
      ) {
        headers.push(lines[dataStartIdx]);
        dataStartIdx++;
      }
    }
    
    const indexMap = buildHeaderIndexMap(headers);
    devLog('[parseESPNTeamPage] Headers:', headers);
    devLog('[parseESPNTeamPage] Index map:', indexMap);
    
    // Columns after split: MIN, FGM, FGA, FG%, FTM, FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/- = 17 tokens
    const COLS = 17;
    
    const statTokens: string[] = [];
    for (let i = dataStartIdx; i < lines.length; i++) {
      const line = lines[i];

      if (/^(Username|Password|ESPN\.com|Copyright|©|Sign\s*(Up|In)|Log\s*In|Terms\s*of|Privacy|Fantasy Basketball Support)/i.test(line)) {
        break;
      }

      if (/^(Fantasy|Support|About|Help|Contact|Page|Showing|Results|\d+\s+of\s+\d+)$/i.test(line)) continue;
      if (/^(\d+\s+)+\.\.\.\s*\d+$/.test(line)) continue;

      if (/^\d+\.?\d*\/\d+\.?\d*$/.test(line)) {
        const parts = line.split('/');
        statTokens.push(parts[0], parts[1]);
        continue;
      }

      if (/^[-+]?\d+\.?\d*$/.test(line) || /^\.\d+$/.test(line) || line === '--') {
        statTokens.push(line);
      }
    }

    devLog(`[parseESPNTeamPage] Collected ${statTokens.length} stat tokens`);
    
    const numStatRows = Math.floor(statTokens.length / COLS);
    devLog(`[parseESPNTeamPage] Expected rows: ${numStatRows} (${statTokens.length} tokens / ${COLS} cols)`);
    
    // Count empty slots by looking for "Empty" in the text before stats
    let emptySlots = 0;
    const emptyPattern = /^Empty$/i;
    for (const line of lines) {
      if (emptyPattern.test(line)) {
        emptySlots++;
        devLog(`[parseESPNTeamPage] Found Empty slot`);
      }
    }
    
    // Parse all player stats first
    interface PlayerParsedStats {
      row: number;
      name?: string;
      min: number;
      fgm: number;
      fga: number;
      ftm: number;
      fta: number;
      threepm: number;
      rebounds: number;
      assists: number;
      steals: number;
      blocks: number;
      turnovers: number;
      points: number;
      hasMissingStats: boolean;
    }
    
    const allPlayerStats: PlayerParsedStats[] = [];
    const seenRows = new Set<number>();
    let playersWithMissingStats = 0;
    
    for (let i = 0; i < numStatRows; i++) {
      if (seenRows.has(i)) {
        devWarn(`[parseESPNTeamPage] Duplicate row ${i} - skipping`);
        continue;
      }
      seenRows.add(i);
      
      const base = i * COLS;
      let rowHasMissing = false;
      
      const parseVal = (key: string): number => {
        const idx = indexMap[key];
        if (idx === undefined) return 0;
        const val = statTokens[base + idx];
        if (!val || val === '--') {
          rowHasMissing = true;
          return 0;
        }
        const parsed = parseFloat(val);
        if (isNaN(parsed)) {
          rowHasMissing = true;
          return 0;
        }
        return parsed;
      };

      const min = parseVal('MIN');
      // Allow players with 0 MIN if they have other stats (partial data case)
      // Only skip if MIN > 48 (invalid)
      if (min > 48) {
        devWarn(`[parseESPNTeamPage] Row ${i}: MIN=${min} > 48, skipping`);
        continue;
      }
      
      // Skip rows that are completely empty (all zeros/dashes)
      // But keep rows with at least some valid data
      const rawFgm = parseVal('FGM');
      const rawFga = parseVal('FGA');
      const rawFtm = parseVal('FTM');
      const rawFta = parseVal('FTA');
      const threepm = parseVal('3PM');
      const rebounds = parseVal('REB');
      const assists = parseVal('AST');
      const steals = parseVal('STL');
      const blocks = parseVal('BLK');
      const turnovers = parseVal('TO');
      const points = parseVal('PTS');
      
      // Check if row has any meaningful data
      const hasAnyData = min > 0 || rawFgm > 0 || rawFga > 0 || points > 0 || rebounds > 0 || assists > 0;
      if (!hasAnyData) {
        devLog(`[parseESPNTeamPage] Row ${i}: No meaningful data, skipping`);
        continue;
      }
      
      if (rowHasMissing) {
        playersWithMissingStats++;
        devLog(`[parseESPNTeamPage] Row ${i}: Has missing stats (--)`);
      }
      
      // Sanity: individual player stats should be reasonable (per-game averages)
      // Log warnings but don't skip - allow partial data
      if (threepm > 8) devWarn(`[parseESPNTeamPage] Row ${i}: 3PM=${threepm} > 8 - suspicious`);
      if (blocks > 6) devWarn(`[parseESPNTeamPage] Row ${i}: BLK=${blocks} > 6 - suspicious`);
      if (points > 60) devWarn(`[parseESPNTeamPage] Row ${i}: PTS=${points} > 60 - suspicious`);
      if (rawFga > 30) devWarn(`[parseESPNTeamPage] Row ${i}: FGA=${rawFga} > 30 - suspicious`);
      if (rawFta > 20) devWarn(`[parseESPNTeamPage] Row ${i}: FTA=${rawFta} > 20 - suspicious`);
      
      // CRITICAL: Validate makes <= attempts to prevent impossible percentages
      // This can happen when empty slots cause stat token misalignment
      const fgm = Math.min(rawFgm, rawFga);
      const fga = rawFga;
      const ftm = Math.min(rawFtm, rawFta);
      const fta = rawFta;
      
      if (rawFgm > rawFga && rawFga > 0) {
        devWarn(`[parseESPNTeamPage] Row ${i}: FGM=${rawFgm} > FGA=${rawFga} - clamped to ${fgm}`);
      }
      if (rawFtm > rawFta && rawFta > 0) {
        devWarn(`[parseESPNTeamPage] Row ${i}: FTM=${rawFtm} > FTA=${rawFta} - clamped to ${ftm}`);
      }
      
      allPlayerStats.push({
        row: i,
        min,
        fgm, fga, ftm, fta,
        threepm, rebounds, assists, steals, blocks, turnovers, points,
        hasMissingStats: rowHasMissing,
      });
    }
    
    devLog(`[parseESPNTeamPage] Total players parsed: ${allPlayerStats.length}, empty slots: ${emptySlots}, with missing stats: ${playersWithMissingStats}`);
    devLog(`[parseESPNTeamPage] All player stats:`, allPlayerStats);

    // Minimum viable parse: need at least 1 player with stats
    if (allPlayerStats.length === 0) {
      devWarn(`[parseESPNTeamPage] No players with valid stats found`);
      return null;
    }

    // BASELINE DEFINITION:
    // - Use first 8 players (starters: PG, SG, SF, PF, C, G, F/C, UTIL) or all if fewer
    // - Compute MEAN of their per-game stats (not sum!)
    // - Baseline = mean × 40
    // 
    // This simulates 40 "roster games" where each game slot gets the average production.
    
    const STARTER_COUNT = 8;
    const starters = allPlayerStats.slice(0, Math.min(STARTER_COUNT, allPlayerStats.length));
    const starterCount = starters.length;
    
    devLog(`[parseESPNTeamPage] Using ${starterCount} STARTERS for baseline (first ${STARTER_COUNT} players):`);
    devLog(`[parseESPNTeamPage] Starters:`, starters.map((p, i) => ({
      slot: i,
      tpm: p.threepm.toFixed(1),
      reb: p.rebounds.toFixed(1),
      ast: p.assists.toFixed(1),
      stl: p.steals.toFixed(1),
      blk: p.blocks.toFixed(1),
      to: p.turnovers.toFixed(1),
      pts: p.points.toFixed(1),
      fgm: p.fgm.toFixed(1),
      fga: p.fga.toFixed(1),
      hasMissing: p.hasMissingStats,
    })));
    
    // Sum starters' stats (ignoring null/missing - they're already 0)
    const starterSums = starters.reduce((acc, p) => ({
      fgm: acc.fgm + p.fgm,
      fga: acc.fga + p.fga,
      ftm: acc.ftm + p.ftm,
      fta: acc.fta + p.fta,
      threepm: acc.threepm + p.threepm,
      rebounds: acc.rebounds + p.rebounds,
      assists: acc.assists + p.assists,
      steals: acc.steals + p.steals,
      blocks: acc.blocks + p.blocks,
      turnovers: acc.turnovers + p.turnovers,
      points: acc.points + p.points,
    }), { fgm: 0, fga: 0, ftm: 0, fta: 0, threepm: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, points: 0 });
    
    devLog(`[parseESPNTeamPage] Starter sums:`, starterSums);
    
    // Compute MEAN (per roster-game average)
    const meanStats = {
      fgm: starterSums.fgm / starterCount,
      fga: starterSums.fga / starterCount,
      ftm: starterSums.ftm / starterCount,
      fta: starterSums.fta / starterCount,
      threepm: starterSums.threepm / starterCount,
      rebounds: starterSums.rebounds / starterCount,
      assists: starterSums.assists / starterCount,
      steals: starterSums.steals / starterCount,
      blocks: starterSums.blocks / starterCount,
      turnovers: starterSums.turnovers / starterCount,
      points: starterSums.points / starterCount,
    };
    
    devLog(`[parseESPNTeamPage] MEAN per roster-game (sum / ${starterCount}):`, meanStats);
    
    // Relaxed sanity checks - warn but don't throw for partial data scenarios
    if (meanStats.points > 60) {
      devWarn(`[SANITY] Mean PTS/roster-game = ${meanStats.points.toFixed(1)} > 60. Unusually high.`);
    }
    if (meanStats.blocks > 6) {
      devWarn(`[SANITY] Mean BLK/roster-game = ${meanStats.blocks.toFixed(1)} > 6. Unusually high.`);
    }
    if (meanStats.threepm > 8) {
      devWarn(`[SANITY] Mean 3PM/roster-game = ${meanStats.threepm.toFixed(1)} > 8. High but possible.`);
    }
    
    // TEAM COMPOSITE: the MEAN stats that will be multiplied by 40 in BaselinePacePanel
    // FG%/FT% are attempt-weighted from the starters
    const rawFgPct = starterSums.fga > 0 ? starterSums.fgm / starterSums.fga : 0;
    const rawFtPct = starterSums.fta > 0 ? starterSums.ftm / starterSums.fta : 0;
    
    // CRITICAL: Clamp percentages to valid 0-1 range to prevent impossible values
    // This can happen when empty roster slots cause stat parsing misalignment
    let hasDataQualityIssues = false;
    
    if (rawFgPct > 1 || rawFgPct < 0) {
      devWarn(`[parseESPNTeamPage] Invalid FG% ${(rawFgPct * 100).toFixed(1)}% - clamping to valid range`);
      hasDataQualityIssues = true;
    }
    if (rawFtPct > 1 || rawFtPct < 0) {
      devWarn(`[parseESPNTeamPage] Invalid FT% ${(rawFtPct * 100).toFixed(1)}% - clamping to valid range`);
      hasDataQualityIssues = true;
    }
    
    const teamComposite = {
      fgPct: Math.min(Math.max(rawFgPct, 0), 1),
      ftPct: Math.min(Math.max(rawFtPct, 0), 1),
      threepm: meanStats.threepm,
      rebounds: meanStats.rebounds,
      assists: meanStats.assists,
      steals: meanStats.steals,
      blocks: meanStats.blocks,
      turnovers: meanStats.turnovers,
      points: meanStats.points,
    };
    
    devLog(`[parseESPNTeamPage] Team composite (MEAN per roster-game):`, teamComposite);
    if (hasDataQualityIssues) {
      devWarn(`[parseESPNTeamPage] Data quality issues detected - percentages were clamped`);
    }
    
    // Compute expected baseline (×40) for verification
    const expectedBaseline = {
      threepm: Math.round(teamComposite.threepm * 40),
      rebounds: Math.round(teamComposite.rebounds * 40),
      assists: Math.round(teamComposite.assists * 40),
      steals: Math.round(teamComposite.steals * 40),
      blocks: Math.round(teamComposite.blocks * 40),
      turnovers: Math.round(teamComposite.turnovers * 40),
      points: Math.round(teamComposite.points * 40),
    };
    
    devLog(`[parseESPNTeamPage] Expected Baseline (×40):`, expectedBaseline);
    devLog(`[parseESPNTeamPage] FG% = ${(teamComposite.fgPct * 100).toFixed(1)}%, FT% = ${(teamComposite.ftPct * 100).toFixed(1)}%`);
    
    // Final sanity: baseline should be in realistic weekly ranges (warn only)
    const REALISTIC_WEEKLY_RANGES: Record<string, [number, number]> = {
      threepm: [30, 150],
      rebounds: [100, 350],
      assists: [80, 250],
      steals: [20, 80],
      blocks: [10, 60],
      turnovers: [40, 120],
      points: [350, 1000],
    };
    
    for (const [cat, [min, max]] of Object.entries(REALISTIC_WEEKLY_RANGES)) {
      const val = expectedBaseline[cat as keyof typeof expectedBaseline];
      if (val < min || val > max) {
        devWarn(`[SANITY] Baseline ${cat} = ${val} outside typical range [${min}, ${max}]`);
      }
    }
    
    return {
      info: { name: teamName || "Team", abbr: teamAbbr, record, standing, owner, lastMatchup },
      stats: teamComposite,
      playerCount: allPlayerStats.length,
      emptySlots,
      playersWithMissingStats,
    };

    // Note: removed fallback simple number extraction - better to return null and show clear error
  };

  const handleCompare = async () => {
    // Validate that both fields have data
    if (!myTeamData.trim()) {
      toast({
        title: "Missing data",
        description: "Please paste your team's ESPN page in the 'Your Team' field.",
        variant: "destructive",
      });
      return;
    }
    
    if (!opponentData.trim()) {
      toast({
        title: "Missing data",
        description: "Please paste your opponent's ESPN page in the 'Opponent' field.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate input sizes
    if (myTeamData.length > MAX_INPUT_SIZE || opponentData.length > MAX_INPUT_SIZE) {
      toast({
        title: "Input too large",
        description: "The pasted data is too large. Try copying just the team stats section.",
        variant: "destructive",
      });
      return;
    }
    
    setIsParsing(true);
    
    try {
      const [myParsed, oppParsed] = await Promise.all([
        parseWithTimeout(() => parseESPNTeamPage(myTeamData)),
        parseWithTimeout(() => parseESPNTeamPage(opponentData))
      ]);

      // Detect stat windows
      const myWindow = detectStatWindow(myTeamData);
      const oppWindow = detectStatWindow(opponentData);
      
      // Check for mismatch
      if (myWindow && oppWindow && myWindow.toLowerCase() !== oppWindow.toLowerCase()) {
        setStatWindowMismatch({ myWindow, oppWindow });
      } else {
        setStatWindowMismatch(null);
      }

      // Check if parsing succeeded - use soft validation (at least 1 player)
      if (!myParsed) {
        toast({
          title: "Parse failed",
          description: "Could not parse your team data. Make sure you copied the entire ESPN team page.",
          variant: "destructive",
        });
        return;
      }
      
      if (!oppParsed) {
        toast({
          title: "Parse failed", 
          description: "Could not parse opponent data. Make sure you copied the entire ESPN team page.",
          variant: "destructive",
        });
        return;
      }

      // Log parse results for debugging
      devLog(`[handleCompare] My team: ${myParsed.playerCount} players, ${myParsed.emptySlots} empty, ${myParsed.playersWithMissingStats} with missing stats`);
      devLog(`[handleCompare] Opponent: ${oppParsed.playerCount} players, ${oppParsed.emptySlots} empty, ${oppParsed.playersWithMissingStats} with missing stats`);

      const finalOppInfo = { ...oppParsed.info };
      
      // Try to extract opponent from "Current Matchup" section of my team's paste
      const opponentFromCurrentMatchup = extractOpponentFromCurrentMatchup(myTeamData, myParsed.info.name);
      
      // If opponent name is same as my team or empty, try to find the correct opponent
      if (finalOppInfo.name === myParsed.info.name || !finalOppInfo.name || finalOppInfo.name === "Team") {
        if (opponentFromCurrentMatchup) {
          finalOppInfo.name = opponentFromCurrentMatchup;
        } else {
          // Fallback: Try to find a different team name in opponent data
          const oppLines = opponentData.trim().split("\n").map(l => l.trim()).filter(l => l);
          const skipPatterns = /^(Team Settings|LM Tools|hsb\.|ESPN|Settings|Get Another Team)$/i;
          
          for (let i = 0; i < oppLines.length; i++) {
            const line = oppLines[i];
            // Look for record pattern and get preceding line
            if (/^\d+-\d+-\d+$/.test(line) && i > 0) {
              const prevLine = oppLines[i - 1];
              if (prevLine !== myParsed.info.name && 
                  !skipPatterns.test(prevLine) &&
                  prevLine.length >= 2 && 
                  prevLine.length <= 50 && 
                  !/^(PG|SG|SF|PF|C|G|F|UTIL|Bench|IR|STARTERS|STATS|MIN)/i.test(prevLine)) {
                finalOppInfo.name = prevLine;
                finalOppInfo.record = line;
                break;
              }
            }
          }
          
          // If still same name, set to "—" to indicate parsing failure
          if (finalOppInfo.name === myParsed.info.name) {
            finalOppInfo.name = "—";
          }
        }
      }
      
      // Validate: opponent name must differ from my team name
      if (finalOppInfo.name.toLowerCase() === myParsed.info.name.toLowerCase()) {
        finalOppInfo.name = "—";
      }
      
      // Parse opponent roster to get players with game info
      const oppRoster = parseOpponentRoster(opponentData);
      
      onMatchupChange({
        myTeam: { ...myParsed.info, stats: myParsed.stats },
        opponent: { ...finalOppInfo, stats: oppParsed.stats },
        opponentRoster: oppRoster,
        myParseInfo: {
          playerCount: myParsed.playerCount,
          emptySlots: myParsed.emptySlots,
          playersWithMissingStats: myParsed.playersWithMissingStats,
        },
        oppParseInfo: {
          playerCount: oppParsed.playerCount,
          emptySlots: oppParsed.emptySlots,
          playersWithMissingStats: oppParsed.playersWithMissingStats,
        },
      });
      
      // Show success with data completeness info
      const myIssues: string[] = [];
      const oppIssues: string[] = [];
      
      if (myParsed.emptySlots > 0) myIssues.push(`${myParsed.emptySlots} empty`);
      if (myParsed.playersWithMissingStats > 0) myIssues.push(`${myParsed.playersWithMissingStats} partial`);
      if (oppParsed.emptySlots > 0) oppIssues.push(`${oppParsed.emptySlots} empty`);
      if (oppParsed.playersWithMissingStats > 0) oppIssues.push(`${oppParsed.playersWithMissingStats} partial`);
      
      const hasIssues = myIssues.length > 0 || oppIssues.length > 0;
      
      toast({
        title: hasIssues ? "Matchup loaded (with warnings)" : "Matchup loaded",
        description: hasIssues 
          ? `Your Team: ${myParsed.playerCount} players${myIssues.length > 0 ? ` (${myIssues.join(', ')})` : ''} • Opponent: ${oppParsed.playerCount} players${oppIssues.length > 0 ? ` (${oppIssues.join(', ')})` : ''}`
          : `${myParsed.info.name} vs ${finalOppInfo.name}`,
        variant: hasIssues ? "default" : "default",
      });
    } catch (error) {
      devError('Parse error:', error);
      toast({
        title: "Parse error",
        description: "An error occurred while parsing. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleReset = () => {
    onMatchupChange(null);
    setMyTeamData("");
    setOpponentData("");
  };

  const formatAverage = (value: number, format: string) => {
    if (format === "pct") return formatPct(value);
    return value.toFixed(1);
  };

  const formatProjection = (value: number) => Math.round(value).toString();

  if (!persistedMatchup) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h2 className="font-display font-bold text-2xl text-center">Matchup Projection</h2>
        <p className="text-center text-muted-foreground">
          Paste the full ESPN team page for each team (Your Team & Opponent)
        </p>

        {/* Guidance Tip */}
        {!dismissedTip && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
            <Lightbulb className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> Once you import both teams here, go to <span className="text-primary font-medium">Free Agents</span> to see "Recommended Adds for This Matchup"—we'll highlight players that help swing toss-up categories.
            </p>
            <button onClick={() => setDismissedTip(true)} className="p-1 hover:bg-muted rounded-md transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}

        <Card className="p-4 bg-primary/10 border-primary/30">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-semibold text-primary">How Projections Work</p>
              <ul className="text-sm text-muted-foreground space-y-1 mt-1">
                <li>• Stats match the view you selected on ESPN (Last 7, Last 15, Last 30, or Season Stats)</li>
                <li>• <strong>Team Average</strong> = (Sum of all active player stats) ÷ (Number of active players)</li>
                <li>• <strong>Weekly projection</strong> = Team Average × <strong>40</strong></li>
                <li>• <strong>Percentages</strong> (FG%, FT%) = Team average (NOT multiplied)</li>
                <li>• <strong>TO (Turnovers)</strong>: Lower is better - fewer turnovers wins the category</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Stat Window Mismatch Alert */}
        {statWindowMismatch && (
          <Alert variant="destructive" className="border-stat-negative/50 bg-stat-negative/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              <span className="font-semibold">Stat window mismatch detected!</span> Your team is using <span className="font-bold text-primary">{statWindowMismatch.myWindow}</span> stats, 
              but your opponent is using <span className="font-bold text-primary">{statWindowMismatch.oppWindow}</span> stats. 
              For accurate comparison, ensure both teams use the same stat window on ESPN before pasting.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="gradient-card shadow-card p-4 border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-bold text-stat-positive">Your Team</h3>
              {/* Use My Roster Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Try to get the raw blob first
                  const rawBlob = localStorage.getItem('dumphoops-roster-raw');
                  if (rawBlob && rawBlob.length > 0) {
                    setMyTeamData(rawBlob);
                    toast({
                      title: "Roster data loaded",
                      description: "Raw roster data imported from Roster tab.",
                    });
                    return;
                  }
                  
                  // Fallback: check if roster exists but no raw blob
                  if (roster.length === 0) {
                    toast({
                      title: "No roster data",
                      description: "Import on Roster tab first.",
                      variant: "destructive"
                    });
                    return;
                  }
                  
                  toast({
                    title: "No raw data available",
                    description: "Re-import your roster on the Roster tab to enable this feature.",
                    variant: "destructive"
                  });
                }}
                className="font-display text-xs"
              >
                <Users className="w-3 h-3 mr-1" />
                Use My Roster
              </Button>
            </div>
            <Textarea
              placeholder={`Paste the full ESPN page for your team...

Navigate to your team page and copy the whole page.`}
              value={myTeamData}
              onChange={(e) => {
                setMyTeamData(e.target.value);
                // Real-time stat window mismatch detection
                const myWindow = detectStatWindow(e.target.value);
                const oppWindow = opponentData ? detectStatWindow(opponentData) : null;
                if (myWindow && oppWindow && myWindow !== oppWindow) {
                  setStatWindowMismatch({ myWindow, oppWindow });
                } else if (!myWindow || !oppWindow || myWindow === oppWindow) {
                  setStatWindowMismatch(null);
                }
              }}
              className="min-h-[200px] font-mono text-sm bg-muted/50"
            />
          </Card>

          <Card className="gradient-card shadow-card p-4 border-border">
            <h3 className="font-display font-bold mb-2 text-stat-negative">Opponent</h3>
            <Textarea
              placeholder={`Paste the full ESPN page for opponent...

Navigate to their team page and copy the whole page.`}
              value={opponentData}
              onChange={(e) => {
                setOpponentData(e.target.value);
                // Real-time stat window mismatch detection
                const myWindow = myTeamData ? detectStatWindow(myTeamData) : null;
                const oppWindow = detectStatWindow(e.target.value);
                if (myWindow && oppWindow && myWindow !== oppWindow) {
                  setStatWindowMismatch({ myWindow, oppWindow });
                } else if (!myWindow || !oppWindow || myWindow === oppWindow) {
                  setStatWindowMismatch(null);
                }
              }}
              className="min-h-[200px] font-mono text-sm bg-muted/50"
            />
          </Card>
        </div>

        <Button 
          onClick={handleCompare} 
          className="w-full gradient-primary font-display font-bold"
          disabled={isParsing}
        >
          {isParsing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Compare Matchup
            </>
          )}
        </Button>
      </div>
    );
  }

  // Use dynamic projections if available, otherwise fallback to static ×40
  const usesDynamicProjection = dynamicProjection?.hasWeeklyData && roster.length > 0;

  // Calculate comparisons with projected values
  const comparisons = CATEGORIES.map((cat) => {
    const isCountingStat = COUNTING_STATS.includes(cat.key);
    const key = cat.key as keyof TeamStats;
    
    let myProjected: number;
    let theirProjected: number;
    let myCurrent: number | null = null;
    let myTodayExp: number | null = null;
    let theirCurrent: number | null = null;
    let theirTodayExp: number | null = null;
    let isEstimated = false;
    
    if (usesDynamicProjection && dynamicProjection) {
      const myProj = dynamicProjection.myProjections[key];
      const oppProj = dynamicProjection.oppProjections[key];
      myProjected = myProj.projected;
      theirProjected = oppProj.projected;
      myCurrent = myProj.current;
      myTodayExp = myProj.today;
      theirCurrent = oppProj.current;
      theirTodayExp = oppProj.today;
      isEstimated = myProj.isEstimated || false;
    } else {
      const myAvg = persistedMatchup.myTeam.stats[key];
      const theirAvg = persistedMatchup.opponent.stats[key];
      myProjected = isCountingStat ? myAvg * 40 : myAvg;
      theirProjected = isCountingStat ? theirAvg * 40 : theirAvg;
    }

    let winner: "you" | "them" | "tie";
    if (cat.key === "turnovers") {
      // Lower TO is better
      winner = myProjected < theirProjected ? "you" : myProjected > theirProjected ? "them" : "tie";
    } else {
      winner = myProjected > theirProjected ? "you" : myProjected < theirProjected ? "them" : "tie";
    }

    return {
      category: cat.label,
      key: cat.key,
      myAvg: persistedMatchup.myTeam.stats[key],
      theirAvg: persistedMatchup.opponent.stats[key],
      myProjected, 
      theirProjected,
      myCurrent,
      myTodayExp,
      theirCurrent,
      theirTodayExp,
      winner,
      format: cat.format,
      isCountingStat,
      isEstimated,
    };
  });

  const wins = comparisons.filter((c) => c.winner === "you").length;
  const losses = comparisons.filter((c) => c.winner === "them").length;
  const ties = comparisons.filter((c) => c.winner === "tie").length;

  // Get current record from Weekly if available
  const currentRecord = dynamicProjection?.currentRecord;

  // Check for data completeness warnings
  const hasMyWarnings = (persistedMatchup.myParseInfo?.emptySlots || 0) > 0 || (persistedMatchup.myParseInfo?.playersWithMissingStats || 0) > 0;
  const hasOppWarnings = (persistedMatchup.oppParseInfo?.emptySlots || 0) > 0 || (persistedMatchup.oppParseInfo?.playersWithMissingStats || 0) > 0;
  const hasDataWarnings = hasMyWarnings || hasOppWarnings;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl">Matchup Projection</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {dayInfo.dayLabel}
            </Badge>
            {usesDynamicProjection && (
              <Badge variant="secondary" className="text-[10px]">
                Dynamic (Weekly + Today)
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RefreshCw className="w-4 h-4 mr-2" />
          New Matchup
        </Button>
      </div>

      {/* Data Completeness Warning Banner */}
      {hasDataWarnings && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">
            <span className="font-medium">Data Completeness:</span>
            <div className="flex flex-wrap gap-3 mt-1">
              {persistedMatchup.myParseInfo && (
                <span className="text-muted-foreground">
                  Your Team: {persistedMatchup.myParseInfo.playerCount} players
                  {persistedMatchup.myParseInfo.emptySlots > 0 && <span className="text-amber-500"> ({persistedMatchup.myParseInfo.emptySlots} empty slots)</span>}
                  {persistedMatchup.myParseInfo.playersWithMissingStats > 0 && <span className="text-amber-500"> ({persistedMatchup.myParseInfo.playersWithMissingStats} with partial stats)</span>}
                </span>
              )}
              {persistedMatchup.oppParseInfo && (
                <span className="text-muted-foreground">
                  • Opponent: {persistedMatchup.oppParseInfo.playerCount} players
                  {persistedMatchup.oppParseInfo.emptySlots > 0 && <span className="text-amber-500"> ({persistedMatchup.oppParseInfo.emptySlots} empty slots)</span>}
                  {persistedMatchup.oppParseInfo.playersWithMissingStats > 0 && <span className="text-amber-500"> ({persistedMatchup.oppParseInfo.playersWithMissingStats} with partial stats)</span>}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Empty slots are ignored. Players with partial stats (--) use 0 for missing values.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Baseline Week Projection (collapsed by default) */}
      <Collapsible defaultOpen={true}>
        <CollapsibleTrigger asChild>
          <Card className="p-3 bg-muted/30 border-border cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span className="font-display font-semibold text-sm">Baseline Week Projection (Team Composite × 40)</span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </div>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          {(() => {
            // Baseline category comparison logic
            const baselineCategories = [
              { key: 'fgPct', label: 'FG%', lowerIsBetter: false, isPct: true },
              { key: 'ftPct', label: 'FT%', lowerIsBetter: false, isPct: true },
              { key: 'threepm', label: '3PM', lowerIsBetter: false, isPct: false },
              { key: 'rebounds', label: 'REB', lowerIsBetter: false, isPct: false },
              { key: 'assists', label: 'AST', lowerIsBetter: false, isPct: false },
              { key: 'steals', label: 'STL', lowerIsBetter: false, isPct: false },
              { key: 'blocks', label: 'BLK', lowerIsBetter: false, isPct: false },
              { key: 'turnovers', label: 'TO', lowerIsBetter: true, isPct: false },
              { key: 'points', label: 'PTS', lowerIsBetter: false, isPct: false },
            ] as const;

            type StatKey = typeof baselineCategories[number]['key'];

            const getBaselineValue = (stats: TeamStats, key: StatKey, isPct: boolean): number => {
              const val = stats[key as keyof TeamStats];
              return isPct ? val : val * 40;
            };

            const determineWinner = (myVal: number, oppVal: number, lowerIsBetter: boolean, isPct: boolean): 'my' | 'opp' | 'tie' | 'missing' => {
              if (myVal === null || myVal === undefined || oppVal === null || oppVal === undefined) return 'missing';
              const epsilon = isPct ? 0.0005 : 0.5;
              const diff = Math.abs(myVal - oppVal);
              if (diff < epsilon) return 'tie';
              if (lowerIsBetter) {
                return myVal < oppVal ? 'my' : 'opp';
              } else {
                return myVal > oppVal ? 'my' : 'opp';
              }
            };

            const results = baselineCategories.map(cat => {
              const myVal = getBaselineValue(persistedMatchup.myTeam.stats, cat.key, cat.isPct);
              const oppVal = getBaselineValue(persistedMatchup.opponent.stats, cat.key, cat.isPct);
              const winner = determineWinner(myVal, oppVal, cat.lowerIsBetter, cat.isPct);
              return { ...cat, myVal, oppVal, winner };
            });

            const myWins = results.filter(r => r.winner === 'my').length;
            const oppWins = results.filter(r => r.winner === 'opp').length;
            const ties = results.filter(r => r.winner === 'tie').length;

            const getCellBg = (winner: 'my' | 'opp' | 'tie' | 'missing', forTeam: 'my' | 'opp'): string => {
              if (winner === 'missing') return '';
              if (winner === 'tie') return 'bg-muted/50';
              if (winner === forTeam) return 'bg-stat-positive/15';
              return 'bg-stat-negative/15';
            };

            return (
              <div className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  {/* My Team Baseline */}
                  <Card className="gradient-card border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-display font-semibold text-sm text-stat-positive">{persistedMatchup.myTeam.name}</h3>
                      <span className="text-[10px] text-muted-foreground">Avg × 40</span>
                    </div>
                    <div className="grid grid-cols-9 gap-1 text-center">
                      {results.map(cat => (
                        <div key={cat.key} className={cn("rounded px-0.5 py-1", getCellBg(cat.winner, 'my'))}>
                          <p className="text-[9px] text-muted-foreground">{cat.label}</p>
                          <p className="font-display font-bold text-xs">
                            {cat.isPct ? formatPct(cat.myVal) : Math.round(cat.myVal)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Opponent Baseline */}
                  <Card className="gradient-card border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-display font-semibold text-sm text-stat-negative">{persistedMatchup.opponent.name}</h3>
                      <span className="text-[10px] text-muted-foreground">Avg × 40</span>
                    </div>
                    <div className="grid grid-cols-9 gap-1 text-center">
                      {results.map(cat => (
                        <div key={cat.key} className={cn("rounded px-0.5 py-1", getCellBg(cat.winner, 'opp'))}>
                          <p className="text-[9px] text-muted-foreground">{cat.label}</p>
                          <p className="font-display font-bold text-xs">
                            {cat.isPct ? formatPct(cat.oppVal) : Math.round(cat.oppVal)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                {/* Projected Baseline Outcome */}
                <p className="text-center text-xs text-muted-foreground">
                  Projected baseline outcome:{' '}
                  <span className="font-display font-semibold text-foreground">
                    {persistedMatchup.myTeam.name}{' '}
                    <span className="text-stat-positive">{myWins}</span>–<span className="text-stat-negative">{oppWins}</span>–<span className="text-muted-foreground">{ties}</span>{' '}
                    {persistedMatchup.opponent.name}
                  </span>
                </p>
              </div>
            );
          })()}
        </CollapsibleContent>
      </Collapsible>

      {/* Removed misleading "players playing today" count */}

      {/* Matchup Summary - Compact */}
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center justify-center gap-3 md:gap-6">
          <div className="text-center flex-1 max-w-[200px]">
            <p className="text-xs text-muted-foreground mb-0.5">Your Team</p>
            <p className="font-display font-bold text-base md:text-lg truncate">
              {persistedMatchup.myTeam.name}
            </p>
            {persistedMatchup.myTeam.owner && (
              <p className="text-[10px] text-muted-foreground">{persistedMatchup.myTeam.owner}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {persistedMatchup.myTeam.record}
              {persistedMatchup.myTeam.standing && ` (${persistedMatchup.myTeam.standing})`}
            </p>
          </div>
          
          <div className="flex flex-col items-center gap-1">
            {/* Current score from Weekly */}
            {currentRecord && (
              <div className="text-[10px] text-muted-foreground">
                Current: {currentRecord.wins}-{currentRecord.losses}-{currentRecord.ties}
              </div>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/30">
              <span className="font-display font-bold text-xl md:text-2xl text-stat-positive">{wins}</span>
              <span className="text-muted-foreground text-sm">-</span>
              <span className="font-display font-bold text-xl md:text-2xl text-stat-negative">{losses}</span>
              <span className="text-muted-foreground text-sm">-</span>
              <span className="font-display font-bold text-xl md:text-2xl text-muted-foreground">{ties}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">Projected</div>
          </div>
          
          <div className="text-center flex-1 max-w-[200px]">
            <p className="text-xs text-muted-foreground mb-0.5">Opponent</p>
            <p className="font-display font-bold text-base md:text-lg truncate">
              {persistedMatchup.opponent.name}
            </p>
            {persistedMatchup.opponent.owner && (
              <p className="text-[10px] text-muted-foreground">{persistedMatchup.opponent.owner}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {persistedMatchup.opponent.record && persistedMatchup.opponent.record !== '—' 
                ? persistedMatchup.opponent.record.replace(/[^0-9-]/g, '') 
                : '—'}
              {persistedMatchup.opponent.standing && ` (${persistedMatchup.opponent.standing})`}
            </p>
          </div>
        </div>

        <div className="text-center mt-3 pt-3 border-t border-border">
          {wins > losses ? (
            <p className="text-stat-positive font-display font-semibold text-sm flex items-center justify-center gap-1.5">
              <Trophy className="w-4 h-4" />
              Projected WIN {wins}-{losses}-{ties}
            </p>
          ) : wins < losses ? (
            <p className="text-stat-negative font-display font-semibold text-sm flex items-center justify-center gap-1.5">
              <Target className="w-4 h-4" />
              Projected LOSS {wins}-{losses}-{ties}
            </p>
          ) : (
            <p className="text-muted-foreground font-display font-semibold text-sm flex items-center justify-center gap-1.5">
              <Minus className="w-4 h-4" />
              Projected TIE {wins}-{losses}-{ties}
            </p>
          )}
        </div>
      </Card>

      {/* Dynamic Projection (Current + Remaining Games) - expanded by default */}
      <Collapsible open={showBreakdown} onOpenChange={setShowBreakdown} defaultOpen={true}>
        <CollapsibleTrigger asChild>
          <Card className="p-3 bg-primary/5 border-primary/20 cursor-pointer hover:bg-primary/10 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="font-display font-semibold text-sm">Dynamic Projection (Current + Remaining Games)</span>
                {!myWeeklyData && (
                  <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30">
                    Weekly data required
                  </Badge>
                )}
              </div>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", showBreakdown && "rotate-180")} />
            </div>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          {!myWeeklyData ? (
            <Card className="p-4 bg-muted/30 border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Import Weekly Scoreboard data to enable dynamic projection.</span>
              </div>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {/* My Team Dynamic */}
              <Card className="gradient-card border-border p-3">
                <h3 className="font-display font-semibold text-sm text-stat-positive mb-3">{persistedMatchup.myTeam.name}</h3>
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-4 gap-1 text-muted-foreground text-[10px] font-medium">
                    <span>Cat</span>
                    <span className="text-right">Current</span>
                    <span className="text-right">+Today</span>
                    <span className="text-right">Proj Final</span>
                  </div>
                  {comparisons.map((comp) => (
                    <div key={comp.key} className="grid grid-cols-4 gap-1 items-center">
                      <span className="font-medium">{comp.category}</span>
                      <span className="text-right text-muted-foreground">
                        {comp.isCountingStat 
                          ? Math.round(comp.myCurrent ?? 0)
                          : formatPct(comp.myCurrent ?? comp.myAvg)}
                      </span>
                      <span className="text-right text-primary">
                        {comp.isCountingStat 
                          ? `+${Math.round(comp.myTodayExp ?? 0)}`
                          : '—'}
                      </span>
                      <span className={cn("text-right font-bold", comp.winner === "you" && "text-stat-positive")}>
                        {comp.isCountingStat 
                          ? Math.round(comp.myProjected)
                          : formatPct(comp.myProjected)}
                        {comp.isEstimated && !comp.isCountingStat && <span className="text-[8px] text-muted-foreground ml-0.5">(est)</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Opponent Dynamic */}
              <Card className="gradient-card border-border p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-semibold text-sm text-stat-negative">{persistedMatchup.opponent.name}</h3>
                  {!dynamicProjection?.oppHasSchedule && (
                    <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30">
                      No roster imported
                    </Badge>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-4 gap-1 text-muted-foreground text-[10px] font-medium">
                    <span>Cat</span>
                    <span className="text-right">Current</span>
                    <span className="text-right">+Today</span>
                    <span className="text-right">Proj Final</span>
                  </div>
                  {comparisons.map((comp) => (
                    <div key={comp.key} className="grid grid-cols-4 gap-1 items-center">
                      <span className="font-medium">{comp.category}</span>
                      <span className="text-right text-muted-foreground">
                        {comp.isCountingStat 
                          ? Math.round(comp.theirCurrent ?? 0)
                          : formatPct(comp.theirCurrent ?? comp.theirAvg)}
                      </span>
                      <span className="text-right text-muted-foreground">
                        {/* Show N/A for opponent +Today if roster not imported */}
                        {dynamicProjection?.oppHasSchedule 
                          ? (comp.isCountingStat ? `+${Math.round(comp.theirTodayExp ?? 0)}` : '—')
                          : <span className="text-amber-400/70">N/A</span>
                        }
                      </span>
                      <span className={cn("text-right font-bold", comp.winner === "them" && "text-stat-negative")}>
                        {comp.isCountingStat 
                          ? Math.round(comp.theirProjected)
                          : formatPct(comp.theirProjected)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Category Breakdown with Baseline Pace Panel */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        {/* Main Category Breakdown */}
        <div className="space-y-3">
        {comparisons.map((comp) => (
          <Card
            key={comp.category}
            className={cn(
              "border-border p-4 transition-all",
              comp.winner === "you" && "bg-stat-positive/5 border-stat-positive/30",
              comp.winner === "them" && "bg-stat-negative/5 border-stat-negative/30",
              comp.winner === "tie" && "bg-muted/20"
            )}
          >
            <div className="flex items-center justify-between">
              <div className={cn("flex-1 text-center", comp.winner === "you" && "text-stat-positive")}>
                {comp.isCountingStat ? (
                  <>
                    <p className="font-display font-bold text-2xl md:text-3xl">{formatProjection(comp.myProjected)}</p>
                    {usesDynamicProjection && comp.myCurrent !== null ? (
                      <p className="text-xs text-muted-foreground">
                        {Math.round(comp.myCurrent)} + <span className="text-primary">{Math.round(comp.myTodayExp ?? 0)}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">avg: {formatAverage(comp.myAvg, comp.format)}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-display font-bold text-2xl md:text-3xl">
                      {formatAverage(comp.myProjected, comp.format)}
                      {comp.isEstimated && <span className="text-xs text-muted-foreground ml-1">(est)</span>}
                    </p>
                    {usesDynamicProjection && comp.myCurrent !== null && (
                      <p className="text-xs text-muted-foreground">was: {formatAverage(comp.myCurrent, comp.format)}</p>
                    )}
                  </>
                )}
                {comp.winner === "you" && (
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <ArrowRight className="w-4 h-4" />
                    <span className="text-xs font-medium">WIN</span>
                  </div>
                )}
              </div>

              <div className="px-4 md:px-8">
                <div
                  className={cn(
                    "px-4 py-2 rounded-lg font-display font-bold text-sm md:text-base",
                    comp.winner === "you" && "bg-stat-positive/20 text-stat-positive",
                    comp.winner === "them" && "bg-stat-negative/20 text-stat-negative",
                    comp.winner === "tie" && "bg-muted text-muted-foreground"
                  )}
                >
                  {comp.category}
                  {comp.key === "turnovers" && <span className="text-xs ml-1">(lower)</span>}
                </div>
              </div>

              <div className={cn("flex-1 text-center", comp.winner === "them" && "text-stat-negative")}>
                {comp.isCountingStat ? (
                  <>
                    <p className="font-display font-bold text-2xl md:text-3xl">{formatProjection(comp.theirProjected)}</p>
                    {usesDynamicProjection && comp.theirCurrent !== null ? (
                      <p className="text-xs text-muted-foreground">
                        {Math.round(comp.theirCurrent)} + <span className="text-muted-foreground">{Math.round(comp.theirTodayExp ?? 0)}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">avg: {formatAverage(comp.theirAvg, comp.format)}</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-display font-bold text-2xl md:text-3xl">{formatAverage(comp.theirProjected, comp.format)}</p>
                    {usesDynamicProjection && comp.theirCurrent !== null && (
                      <p className="text-xs text-muted-foreground">was: {formatAverage(comp.theirCurrent, comp.format)}</p>
                    )}
                  </>
                )}
                {comp.winner === "them" && (
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="text-xs font-medium">WIN</span>
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
        </div>

        {/* Baseline Pace Panel - Right side on desktop, below on mobile */}
        <BaselinePacePanel
          myTeamName={persistedMatchup.myTeam.name}
          opponentName={persistedMatchup.opponent.name}
          myBaselineStats={persistedMatchup.myTeam.stats}
          oppBaselineStats={persistedMatchup.opponent.stats}
          myCurrentStats={myWeeklyData?.myTeam.stats ?? null}
          oppCurrentStats={myWeeklyData?.opponent.stats ?? null}
          dayOfWeek={dayInfo.dayOfWeek}
        />
      </div>
    </div>
  );
};

// StatBox component for team averages display - avg bold, projection smaller
interface StatBoxProps {
  label: string;
  avg: number;
  projected?: boolean;
  multiplier?: number;
  isPct?: boolean;
}

const StatBox = ({ label, avg, multiplier = 40, isPct }: StatBoxProps) => (
  <div className="text-center">
    <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
    {isPct ? (
      <p className="font-display font-bold text-sm">{formatPct(avg)}</p>
    ) : (
      <>
        <p className="font-display font-bold text-sm">{avg.toFixed(1)}</p>
        <p className="text-[10px] text-muted-foreground">
          {Math.round(avg * multiplier)}
        </p>
      </>
    )}
  </div>
);
