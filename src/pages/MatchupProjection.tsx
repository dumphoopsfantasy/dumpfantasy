import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ArrowRight, Trophy, Target, Minus, Upload, RefreshCw, Info, AlertTriangle, Lightbulb, X, ChevronDown, Calendar, Users, Loader2, Clock } from "lucide-react";
import { formatPct, CATEGORIES } from "@/lib/crisUtils";
import { validateParseInput, parseWithTimeout, createLoopGuard, MAX_INPUT_SIZE } from "@/lib/parseUtils";
import { RosterSlot, Player } from "@/types/fantasy";
import { useToast } from "@/hooks/use-toast";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { ProjectionModeToggle, ProjectionMode } from "@/components/ProjectionModeToggle";
import { useSlateAwareProjection } from "@/hooks/useSlateAwareProjection";
import { parseEspnRosterSlotsFromTeamPage } from "@/lib/espnRosterSlots";
import { parseEspnMatchupTotalsFromText } from "@/lib/espnMatchupTotals";
import { addTotals, totalsFromProjectedStats, withDerivedPct, TeamTotalsWithPct } from "@/lib/teamTotals";
import { normalizeMissingToken, isMissingToken, isMissingFractionToken } from "@/lib/espnTokenUtils";
import { safeNum, fmtInt, fmtPct as fmtPctSafe, fmtDec, formatStatValue, determineProjectionMode, ProjectionDataMode, formatAsOfTime } from "@/lib/projectionFormatters";
import { SlateStatusBadge } from "@/components/SlateStatusBadge";
import { getProjectionExplanation } from "@/lib/slateAwareProjection";
import { BaselineCard, ScheduleAwareCard, TodayImpactCard, PaceVsBaselineCard } from "@/components/matchup";
import { StartSitAdvisor } from "@/components/StartSitAdvisor";
import { useNBAUpcomingSchedule } from "@/hooks/useNBAUpcomingSchedule";
import { computeRestOfWeekStarts } from "@/lib/restOfWeekUtils";
import { getMatchupWeekDates } from "@/lib/scheduleAwareProjection";

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
  alignmentOffset?: number;
  parseWarnings?: string[];
}

interface MatchupData {
  myTeam: MatchupTeam;
  opponent: MatchupTeam;
  myRoster?: RosterSlot[];
  opponentRoster?: RosterSlot[];
  myParseInfo?: {
    playerCount: number;
    emptySlots: number;
    playersWithMissingStats: number;
    alignmentOffset?: number;
    parseWarnings?: string[];
  };
  oppParseInfo?: {
    playerCount: number;
    emptySlots: number;
    playersWithMissingStats: number;
    alignmentOffset?: number;
    parseWarnings?: string[];
  };
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
  return parseEspnRosterSlotsFromTeamPage(data);
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
  const [oppRosterParseAttempted, setOppRosterParseAttempted] = useState(false);
  const [oppRosterParseFailed, setOppRosterParseFailed] = useState(false);
  const [myTotalsData, setMyTotalsData] = useState("");
  const [oppTotalsData, setOppTotalsData] = useState("");
  const [statWindowMismatch, setStatWindowMismatch] = useState<{ myWindow: string | null; oppWindow: string | null } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [dismissedTip, setDismissedTip] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false); // Dynamic projection collapsed by default
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('schedule'); // Default to schedule-aware

  const dayInfo = getMatchupDayInfo();
  
  // Slate-aware projection hook (excludes started games from remaining)
  const {
    myProjection: slateMyProjection,
    myError: slateMyError,
    oppProjection: slateOppProjection,
    oppError: slateOppError,
    slateStatus,
    remainingDates,
    myTodayStats,
    oppTodayStats,
    excludedStartedGames,
    includedNotStartedGames,
    explanation: slateExplanation,
    isLoading: slateLoading,
  } = useSlateAwareProjection({
    roster: persistedMatchup?.myRoster ?? roster,
    opponentRoster: persistedMatchup?.opponentRoster,
  });
  
  // For backward compatibility
  const scheduleMyProjection = slateMyProjection;
  const scheduleMyError = slateMyError;
  const scheduleOppProjection = slateOppProjection;
  const scheduleOppError = slateOppError;
  const scheduleLoading = slateLoading;

  // Find my team's weekly data if available (used ONLY for W-L-T display)
  const myWeeklyData = useMemo(() => {
    if (!persistedMatchup || weeklyMatchups.length === 0) return null;

    const myTeamName = persistedMatchup.myTeam.name.toLowerCase();

    for (const matchup of weeklyMatchups) {
      if (
        matchup.teamA.name.toLowerCase().includes(myTeamName) ||
        myTeamName.includes(matchup.teamA.name.toLowerCase())
      ) {
        return {
          myTeam: matchup.teamA,
          opponent: matchup.teamB,
        };
      }
      if (
        matchup.teamB.name.toLowerCase().includes(myTeamName) ||
        myTeamName.includes(matchup.teamB.name.toLowerCase())
      ) {
        return {
          myTeam: matchup.teamB,
          opponent: matchup.teamA,
        };
      }
    }
    return null;
  }, [persistedMatchup, weeklyMatchups]);

  const weeklyCurrentRecord = useMemo(() => {
    if (!myWeeklyData) return null;
    return parseCurrentRecord(myWeeklyData.myTeam.currentMatchup);
  }, [myWeeklyData]);

  // =========================
  // CURRENT TOTALS (derived from Weekly Scoreboard OR explicit import)
  // =========================
  // First, try to derive from weeklyMatchups (Weekly tab scoreboard data)
  const weeklyDerivedCurrentTotals = useMemo(() => {
    if (!myWeeklyData) return null;
    
    // Convert WeeklyTeamStats to TeamTotalsWithPct
    // Note: Weekly scoreboard has FG%/FT% directly but not makes/attempts
    // We'll set fgm/fga/ftm/fta to 0 and use the percentage directly
    const convertToTotals = (stats: WeeklyTeamStats): TeamTotalsWithPct => ({
      fgm: 0,
      fga: 0,
      ftm: 0,
      fta: 0,
      threepm: stats.threepm,
      rebounds: stats.rebounds,
      assists: stats.assists,
      steals: stats.steals,
      blocks: stats.blocks,
      turnovers: stats.turnovers,
      points: stats.points,
      fgPct: stats.fgPct,
      ftPct: stats.ftPct,
    });
    
    return {
      myTotals: convertToTotals(myWeeklyData.myTeam.stats),
      oppTotals: convertToTotals(myWeeklyData.opponent.stats),
    };
  }, [myWeeklyData]);

  // Fallback: explicit paste (for advanced users)
  const myCurrentTotalsRes = useMemo(() => parseEspnMatchupTotalsFromText(myTotalsData), [myTotalsData]);
  const oppCurrentTotalsRes = useMemo(() => parseEspnMatchupTotalsFromText(oppTotalsData), [oppTotalsData]);

  // Use Weekly-derived if available, otherwise fall back to explicit paste
  const myCurrentTotalsWithPct = useMemo(() => {
    // Priority 1: Weekly scoreboard data
    if (weeklyDerivedCurrentTotals?.myTotals) {
      return weeklyDerivedCurrentTotals.myTotals;
    }
    // Priority 2: Explicit paste
    if (myCurrentTotalsRes.ok) {
      return withDerivedPct(myCurrentTotalsRes.totals);
    }
    return null;
  }, [weeklyDerivedCurrentTotals, myCurrentTotalsRes]);

  const oppCurrentTotalsWithPct = useMemo(() => {
    // Priority 1: Weekly scoreboard data
    if (weeklyDerivedCurrentTotals?.oppTotals) {
      return weeklyDerivedCurrentTotals.oppTotals;
    }
    // Priority 2: Explicit paste
    if (oppCurrentTotalsRes.ok) {
      return withDerivedPct(oppCurrentTotalsRes.totals);
    }
    return null;
  }, [weeklyDerivedCurrentTotals, oppCurrentTotalsRes]);

  // Track source of current totals for UI messaging
  const currentTotalsSource = useMemo(() => {
    if (weeklyDerivedCurrentTotals) return 'weekly' as const;
    if (myCurrentTotalsRes.ok && oppCurrentTotalsRes.ok) return 'explicit' as const;
    return null;
  }, [weeklyDerivedCurrentTotals, myCurrentTotalsRes, oppCurrentTotalsRes]);

  // =========================
  // REMAINING PROJECTION (schedule-aware started games)
  // =========================
  const myRemainingTotalsWithPct = useMemo(() => {
    if (!scheduleMyProjection) return null;
    const t = totalsFromProjectedStats(scheduleMyProjection.totalStats);
    return withDerivedPct(t);
  }, [scheduleMyProjection]);

  const oppRemainingTotalsWithPct = useMemo(() => {
    if (!scheduleOppProjection) return null;
    const t = totalsFromProjectedStats(scheduleOppProjection.totalStats);
    return withDerivedPct(t);
  }, [scheduleOppProjection]);

  // =========================
  // PROJECTED FINAL = Current + Remaining
  // =========================
  const myFinalTotalsWithPct = useMemo(() => {
    if (!myCurrentTotalsWithPct || !myRemainingTotalsWithPct) return null;
    return withDerivedPct(addTotals(myCurrentTotalsWithPct, myRemainingTotalsWithPct));
  }, [myCurrentTotalsWithPct, myRemainingTotalsWithPct]);

  const oppFinalTotalsWithPct = useMemo(() => {
    if (!oppCurrentTotalsWithPct || !oppRemainingTotalsWithPct) return null;
    return withDerivedPct(addTotals(oppCurrentTotalsWithPct, oppRemainingTotalsWithPct));
  }, [oppCurrentTotalsWithPct, oppRemainingTotalsWithPct]);

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

    const parseWarnings: string[] = [];

    const statTokens: string[] = [];
    for (let i = dataStartIdx; i < lines.length; i++) {
      const rawLine = lines[i];

      if (/^(Username|Password|ESPN\.com|Copyright|©|Sign\s*(Up|In)|Log\s*In|Terms\s*of|Privacy|Fantasy Basketball Support)/i.test(rawLine)) {
        break;
      }

      if (/^(Fantasy|Support|About|Help|Contact|Page|Showing|Results|\d+\s+of\s+\d+)$/i.test(rawLine)) continue;
      if (/^(\d+\s+)+\.\.\.\s*\d+$/.test(rawLine)) continue;

      const line = normalizeMissingToken(rawLine);

      // Handle missing fraction by expanding into two placeholder tokens
      if (isMissingFractionToken(line)) {
        statTokens.push("--", "--");
        continue;
      }

      // Split numeric fractions (e.g., 5.3/11.7 -> ['5.3', '11.7'])
      if (/^\d+\.?\d*\/\d+\.?\d*$/.test(line)) {
        const parts = line.split("/");
        statTokens.push(parts[0], parts[1]);
        continue;
      }

      if (/^[-+]?\d+\.?\d*$/.test(line) || /^\.\d+$/.test(line) || isMissingToken(line)) {
        statTokens.push(isMissingToken(line) ? "--" : line);
      }
    }

    devLog(`[parseESPNTeamPage] Collected ${statTokens.length} stat tokens`);

    // Alignment: try offsets 0..16 and pick the best one based on sanity checks.
    const alignStatTokens = (tokens: string[], cols: number): { aligned: string[]; offset: number } => {
      const getNum = (t?: string): number | null => {
        if (!t) return null;
        const n = parseFloat(t);
        return Number.isFinite(n) ? n : null;
      };

      const normalizePct = (v: number | null): number | null => {
        if (v === null) return null;
        if (v <= 1) return v;
        if (v <= 100) return v / 100;
        if (v <= 1000) return v / 1000;
        return null;
      };

      const scoreOffset = (offset: number): number => {
        const usable = Math.floor((tokens.length - offset) / cols) * cols;
        if (usable < cols) return -Infinity;

        let score = 0;
        const rowsToCheck = Math.min(3, Math.floor(usable / cols));

        for (let r = 0; r < rowsToCheck; r++) {
          const base = offset + r * cols;

          const read = (key: string): string | undefined => {
            const idx = indexMap[key];
            if (idx === undefined) return undefined;
            return tokens[base + idx];
          };

          const min = getNum(read("MIN"));
          const fgm = getNum(read("FGM"));
          const fga = getNum(read("FGA"));
          const fgPct = normalizePct(getNum(read("FG%")));
          const ftm = getNum(read("FTM"));
          const fta = getNum(read("FTA"));
          const ftPct = normalizePct(getNum(read("FT%")));
          const stl = getNum(read("STL"));
          const blk = getNum(read("BLK"));
          const pts = getNum(read("PTS"));

          // MIN sanity (allow 0 for partial rows but punish > 60)
          if (min !== null && min >= 0 && min <= 60) score += 3;
          else if (min !== null && min > 60) score -= 10;

          // Attempts + makes sanity
          if (fga !== null && fga >= 0 && fga <= 40) score += 2;
          else if (fga !== null && fga > 40) score -= 6;

          if (fgm !== null && fga !== null && fgm <= fga + 0.001) score += 1;
          if (ftm !== null && fta !== null && ftm <= fta + 0.001) score += 1;

          // Percent sanity
          if (fgPct !== null && fgPct >= 0 && fgPct <= 1) score += 2;
          else if (fgPct !== null) score -= 4;

          if (ftPct !== null && ftPct >= 0 && ftPct <= 1) score += 2;
          else if (ftPct !== null) score -= 4;

          // Category sanity
          if (stl !== null && stl >= 0 && stl <= 10) score += 1;
          else if (stl !== null && stl > 10) score -= 4;

          if (blk !== null && blk >= 0 && blk <= 10) score += 1;
          else if (blk !== null && blk > 10) score -= 4;

          if (pts !== null && pts >= 0 && pts <= 80) score += 1;
          else if (pts !== null && pts > 80) score -= 4;
        }

        return score;
      };

      let bestOffset = 0;
      let bestScore = scoreOffset(0);
      for (let off = 1; off < cols; off++) {
        const s = scoreOffset(off);
        if (s > bestScore) {
          bestScore = s;
          bestOffset = off;
        }
      }

      const usable = Math.floor((tokens.length - bestOffset) / cols) * cols;
      const aligned = usable > 0 ? tokens.slice(bestOffset, bestOffset + usable) : [];
      return { aligned, offset: bestOffset };
    };

    const { aligned: alignedStatTokensRaw, offset: alignmentOffset } = alignStatTokens(statTokens, COLS);
    if (alignmentOffset !== 0) {
      parseWarnings.push(`Alignment offset applied (+${alignmentOffset} tokens)`);
      devWarn(`[parseESPNTeamPage] Alignment offset ${alignmentOffset} applied to stat tokens`);
    }

    // Guardrail: truncate to prevent misaligned parsing
    const alignedStatTokens = [...alignedStatTokensRaw];
    const remainder = alignedStatTokens.length % COLS;
    if (remainder !== 0) {
      parseWarnings.push(`Token truncation applied (${alignedStatTokens.length} % ${COLS} != 0)`);
      devWarn(
        `[parseESPNTeamPage] Token count ${alignedStatTokens.length} not divisible by ${COLS} (remainder ${remainder}). Truncating to prevent misalignment.`
      );
      alignedStatTokens.length = Math.floor(alignedStatTokens.length / COLS) * COLS;
    }

    const numStatRows = Math.floor(alignedStatTokens.length / COLS);
    devLog(`[parseESPNTeamPage] Expected rows: ${numStatRows} (${alignedStatTokens.length} tokens / ${COLS} cols)`);
    
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
        const val = alignedStatTokens[base + idx];
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
    
    // Final sanity: baseline should be in realistic weekly ranges
    // If it's wildly off (e.g., BLK=931), fail the parse rather than output garbage.
    const REALISTIC_WEEKLY_RANGES: Record<string, [number, number]> = {
      threepm: [30, 150],
      rebounds: [100, 350],
      assists: [80, 250],
      steals: [20, 80],
      blocks: [10, 60],
      turnovers: [40, 120],
      points: [350, 1000],
    };

    // Hard cap specifically requested: baseline BLK must never be absurd.
    if (expectedBaseline.blocks > 250) {
      devWarn(`[SANITY] Baseline BLK = ${expectedBaseline.blocks} exceeds hard cap (250). Treating as parse error.`);
      return null;
    }

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
      alignmentOffset: alignmentOffset !== 0 ? alignmentOffset : undefined,
      parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
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
      
      // Parse BOTH rosters from the pasted ESPN team pages (canonical inputs for schedule-aware)
      const myRosterParsed = parseEspnRosterSlotsFromTeamPage(myTeamData);
      if (myRosterParsed.length === 0) {
        toast({
          title: "Roster parse failed",
          description:
            "Could not extract your roster + Last 15 stats. Make sure the paste includes the STATS table (MIN, FGM/FGA, ...).",
          variant: "destructive",
        });
        return;
      }

      setOppRosterParseAttempted(true);
      const oppRosterParsed = parseOpponentRoster(opponentData);
      const oppRosterOk = oppRosterParsed.length > 0;
      setOppRosterParseFailed(!oppRosterOk);

      if (!oppRosterOk) {
        toast({
          title: "Opponent roster parse failed",
          description:
            "Paste opponent roster page blob (Opposing Teams → Stats → Last 15 Totals) including the STATS table (MIN, FGM/FGA, ...).",
          variant: "destructive",
        });
      }

      onMatchupChange({
        myTeam: { ...myParsed.info, stats: myParsed.stats },
        opponent: { ...finalOppInfo, stats: oppParsed.stats },
        myRoster: myRosterParsed,
        opponentRoster: oppRosterOk ? oppRosterParsed : undefined,
        myParseInfo: {
          playerCount: myParsed.playerCount,
          emptySlots: myParsed.emptySlots,
          playersWithMissingStats: myParsed.playersWithMissingStats,
          alignmentOffset: myParsed.alignmentOffset,
          parseWarnings: myParsed.parseWarnings,
        },
        oppParseInfo: {
          playerCount: oppParsed.playerCount,
          emptySlots: oppParsed.emptySlots,
          playersWithMissingStats: oppParsed.playersWithMissingStats,
          alignmentOffset: oppParsed.alignmentOffset,
          parseWarnings: oppParsed.parseWarnings,
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
    setMyTotalsData("");
    setOppTotalsData("");
    setOppRosterParseAttempted(false);
    setOppRosterParseFailed(false);
  };

  // =====================================================
  // PROJECTION MODE STATE MACHINE (must be BEFORE early return to satisfy Rules of Hooks)
  // =====================================================
  const hasCurrentTotals = !!(myCurrentTotalsWithPct && oppCurrentTotalsWithPct);
  const hasRemainingTotals = !!(myRemainingTotalsWithPct && oppRemainingTotalsWithPct);
  const hasBaselineTotals = !!(persistedMatchup?.myTeam?.stats && persistedMatchup?.opponent?.stats);

  const projectionModeState = useMemo(() => {
    return determineProjectionMode({
      hasCurrentTotals,
      hasRemainingTotals,
      hasBaselineTotals,
    });
  }, [hasCurrentTotals, hasRemainingTotals, hasBaselineTotals]);

  // Compute "effective projected" totals based on available data
  const effectiveMyTotals: TeamTotalsWithPct | null = useMemo(() => {
    if (!persistedMatchup) return null;
    if (projectionModeState.mode === 'FINAL' && myFinalTotalsWithPct) {
      return myFinalTotalsWithPct;
    }
    if (projectionModeState.mode === 'REMAINING_ONLY' && myRemainingTotalsWithPct) {
      return myRemainingTotalsWithPct;
    }
    // BASELINE_ONLY: convert baseline stats (already per-game) to "x40" totals
    if (hasBaselineTotals && persistedMatchup.myTeam?.stats) {
      const stats = persistedMatchup.myTeam.stats;
      return {
        fgm: 0, fga: 0, ftm: 0, fta: 0,
        threepm: stats.threepm * 40,
        rebounds: stats.rebounds * 40,
        assists: stats.assists * 40,
        steals: stats.steals * 40,
        blocks: stats.blocks * 40,
        turnovers: stats.turnovers * 40,
        points: stats.points * 40,
        fgPct: stats.fgPct,
        ftPct: stats.ftPct,
      };
    }
    return null;
  }, [projectionModeState.mode, myFinalTotalsWithPct, myRemainingTotalsWithPct, hasBaselineTotals, persistedMatchup]);

  const effectiveOppTotals: TeamTotalsWithPct | null = useMemo(() => {
    if (!persistedMatchup) return null;
    if (projectionModeState.mode === 'FINAL' && oppFinalTotalsWithPct) {
      return oppFinalTotalsWithPct;
    }
    if (projectionModeState.mode === 'REMAINING_ONLY' && oppRemainingTotalsWithPct) {
      return oppRemainingTotalsWithPct;
    }
    // BASELINE_ONLY: convert baseline stats (already per-game) to "x40" totals
    if (hasBaselineTotals && persistedMatchup.opponent?.stats) {
      const stats = persistedMatchup.opponent.stats;
      return {
        fgm: 0, fga: 0, ftm: 0, fta: 0,
        threepm: stats.threepm * 40,
        rebounds: stats.rebounds * 40,
        assists: stats.assists * 40,
        steals: stats.steals * 40,
        blocks: stats.blocks * 40,
        turnovers: stats.turnovers * 40,
        points: stats.points * 40,
        fgPct: stats.fgPct,
        ftPct: stats.ftPct,
      };
    }
    return null;
  }, [projectionModeState.mode, oppFinalTotalsWithPct, oppRemainingTotalsWithPct, hasBaselineTotals, persistedMatchup]);

  // Safe format helpers for display
  const formatAverage = (value: unknown, format: string): string => {
    const n = safeNum(value);
    if (n === null) return '—';
    if (format === "pct") return formatPct(n);
    return n.toFixed(1);
  };

  const formatProjection = (value: unknown): string => {
    const n = safeNum(value);
    if (n === null) return '—';
    return Math.round(n).toString();
  };

  // =====================================================
  // EARLY RETURN: Show import UI if no matchup data
  // =====================================================
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

  // =====================================================
  // MATCHUP DATA EXISTS - RENDER PROJECTION VIEW
  // =====================================================
  devLog(`[ProjectionMode] Mode: ${projectionModeState.mode}, hasCurrentTotals=${hasCurrentTotals}, hasRemainingTotals=${hasRemainingTotals}`);

  const hasProjectedFinal = projectionModeState.mode === 'FINAL' && !!myFinalTotalsWithPct && !!oppFinalTotalsWithPct;
  const hasEffectiveProjection = !!(effectiveMyTotals && effectiveOppTotals);

  // Calculate comparisons using effective projections (works for all modes)
  const comparisons = CATEGORIES.map((cat) => {
    const key = cat.key as keyof TeamStats;
    const isPct = cat.format === 'pct';

    // Get values from effective totals, or NaN if missing
    const myEffectiveVal = effectiveMyTotals ? safeNum((effectiveMyTotals as any)[key]) : null;
    const oppEffectiveVal = effectiveOppTotals ? safeNum((effectiveOppTotals as any)[key]) : null;

    // Safe comparison
    let winner: "you" | "them" | "tie";
    if (myEffectiveVal === null || oppEffectiveVal === null) {
      winner = "tie";
    } else if (cat.key === "turnovers") {
      winner = myEffectiveVal < oppEffectiveVal ? "you" : myEffectiveVal > oppEffectiveVal ? "them" : "tie";
    } else {
      winner = myEffectiveVal > oppEffectiveVal ? "you" : myEffectiveVal < oppEffectiveVal ? "them" : "tie";
    }

    return {
      category: cat.label,
      key: cat.key,
      myAvg: persistedMatchup.myTeam.stats[key],
      theirAvg: persistedMatchup.opponent.stats[key],
      myProjected: myEffectiveVal ?? NaN,
      theirProjected: oppEffectiveVal ?? NaN,
      myCurrent: myCurrentTotalsWithPct ? safeNum((myCurrentTotalsWithPct as any)[key]) : null,
      myTodayExp: myTodayStats ? safeNum((myTodayStats as any)[key]) : null,
      theirCurrent: oppCurrentTotalsWithPct ? safeNum((oppCurrentTotalsWithPct as any)[key]) : null,
      theirTodayExp: oppTodayStats ? safeNum((oppTodayStats as any)[key]) : null,
      winner,
      format: cat.format,
      isCountingStat: COUNTING_STATS.includes(cat.key),
      isEstimated: projectionModeState.mode !== 'FINAL',
    };
  });

  const wins = hasEffectiveProjection ? comparisons.filter((c) => c.winner === "you").length : 0;
  const losses = hasEffectiveProjection ? comparisons.filter((c) => c.winner === "them").length : 0;
  const ties = hasEffectiveProjection ? comparisons.filter((c) => c.winner === "tie").length : 0;

  // Get current record from Weekly if available
  const currentRecord = weeklyCurrentRecord;

  // Check for data completeness warnings
  const hasMyWarnings = (persistedMatchup.myParseInfo?.emptySlots || 0) > 0 || (persistedMatchup.myParseInfo?.playersWithMissingStats || 0) > 0;
  const hasOppWarnings = (persistedMatchup.oppParseInfo?.emptySlots || 0) > 0 || (persistedMatchup.oppParseInfo?.playersWithMissingStats || 0) > 0;
  const hasDataWarnings = hasMyWarnings || hasOppWarnings;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl">Matchup Projection</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-[10px] flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {dayInfo.dayLabel}
            </Badge>
            {projectionMode === 'schedule' && (
              <Badge variant="secondary" className="text-[10px]">
                {remainingDates.length} days remaining
              </Badge>
            )}
          </div>
          {((persistedMatchup.myParseInfo?.alignmentOffset ?? 0) !== 0 || (persistedMatchup.oppParseInfo?.alignmentOffset ?? 0) !== 0) && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Parse warnings:{' '}
              {(persistedMatchup.myParseInfo?.alignmentOffset ?? 0) !== 0 && (
                <span>
                  Your Team aligned (+{persistedMatchup.myParseInfo?.alignmentOffset} tokens)
                </span>
              )}
              {(persistedMatchup.myParseInfo?.alignmentOffset ?? 0) !== 0 && (persistedMatchup.oppParseInfo?.alignmentOffset ?? 0) !== 0 && (
                <span> • </span>
              )}
              {(persistedMatchup.oppParseInfo?.alignmentOffset ?? 0) !== 0 && (
                <span>
                  Opponent aligned (+{persistedMatchup.oppParseInfo?.alignmentOffset} tokens)
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ProjectionModeToggle 
            mode={projectionMode} 
            onModeChange={setProjectionMode}
            disabled={scheduleLoading}
          />
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            New Matchup
          </Button>
        </div>
      </div>

      {/* Projected Final (Current + Remaining) */}
      <Card className="gradient-card border-primary/20 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1">
            <h3 className="font-display font-semibold text-sm">{projectionModeState.label}</h3>
            <p className="text-xs text-muted-foreground">
              {projectionModeState.mode === 'FINAL' 
                ? 'Uses makes/attempts for FG% and FT% (never averages percentages).'
                : projectionModeState.description}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Slate Status Badge */}
            {slateStatus && projectionMode === 'schedule' && (
              <SlateStatusBadge slateStatus={slateStatus} />
            )}
            {projectionModeState.mode !== 'FINAL' && (
              <Badge variant="secondary" className="text-[10px]">
                {projectionModeState.mode === 'REMAINING_ONLY' ? 'Partial data' : 'Baseline only'}
              </Badge>
            )}
          </div>
        </div>

        {/* Slate explanation line */}
        {slateStatus && slateExplanation && projectionMode === 'schedule' && (
          <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {slateExplanation}
          </p>
        )}

        {/* Mode-specific banners */}
        {projectionModeState.mode === 'REMAINING_ONLY' && (
          <Alert className="mt-3 border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-sm">
              <p className="font-medium">Current totals missing — showing Remaining-only projection.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Import this week's scoreboard in the <span className="font-medium text-foreground">Weekly</span> tab to enable Projected Final.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {projectionModeState.mode === 'BASELINE_ONLY' && (
          <Alert className="mt-3 border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-sm">
              <p className="font-medium">Current + schedule data missing — showing Baseline strength only.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Import this week's scoreboard in <span className="font-medium text-foreground">Weekly</span> and opponent roster for full projection.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Success banner when using Weekly data */}
        {currentTotalsSource === 'weekly' && projectionModeState.mode === 'FINAL' && (
          <Alert className="mt-3 border-green-500/50 bg-green-500/10">
            <Calendar className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-sm">
              <p className="font-medium text-green-600 dark:text-green-400">Using live scoreboard from Weekly tab</p>
              <p className="text-xs text-muted-foreground mt-1">
                Current totals are pulled automatically from this week's matchup scoreboard.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {!hasProjectedFinal && projectionModeState.mode === 'FINAL' && (
          <Alert className="mt-3 border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-sm">
              <div className="space-y-2">
                <p className="font-medium">Missing data for Projected Final.</p>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                  {!myCurrentTotalsWithPct && <li>Your Team current totals: Import Weekly scoreboard or paste manually below.</li>}
                  {!oppCurrentTotalsWithPct && <li>Opponent current totals: Import Weekly scoreboard or paste manually below.</li>}
                  {scheduleOppError?.code === 'OPP_ROSTER_MISSING' && <li>Opponent roster missing — schedule-aware remaining cannot run.</li>}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Current totals paste area - only show if Weekly data not available */}
        {!currentTotalsSource && !hasProjectedFinal && (
          <Collapsible defaultOpen={projectionModeState.mode !== 'BASELINE_ONLY'} className="mt-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
                <span>Or paste current matchup totals manually</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <p className="text-xs text-muted-foreground mb-2">
                Tip: Import this week's scoreboard in the Weekly tab instead—it's easier and auto-updates.
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Your Team current matchup totals</p>
                  <Textarea
                    value={myTotalsData}
                    onChange={(e) => setMyTotalsData(e.target.value)}
                    placeholder="Paste totals section containing: FGM/FGA, FTM/FTA, 3PM, REB, AST, STL, BLK, TO, PTS"
                    className="min-h-[100px] font-mono text-xs bg-muted/30"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Opponent current matchup totals</p>
                  <Textarea
                    value={oppTotalsData}
                    onChange={(e) => setOppTotalsData(e.target.value)}
                    placeholder="Paste totals section containing: FGM/FGA, FTM/FTA, 3PM, REB, AST, STL, BLK, TO, PTS"
                    className="min-h-[100px] font-mono text-xs bg-muted/30"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Projection table - shown whenever we have effective projections */}
        {hasEffectiveProjection && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-2">Cat</th>
                  {projectionModeState.mode === 'FINAL' && (
                    <>
                      <th className="text-right py-2">{persistedMatchup.myTeam.name} (Cur)</th>
                      <th className="text-right py-2">Rem</th>
                    </>
                  )}
                  <th className="text-right py-2">{persistedMatchup.myTeam.name} {projectionModeState.mode === 'FINAL' ? 'Final' : ''}</th>
                  {projectionModeState.mode === 'FINAL' && (
                    <>
                      <th className="text-right py-2">{persistedMatchup.opponent.name} (Cur)</th>
                      <th className="text-right py-2">Rem</th>
                    </>
                  )}
                  <th className="text-right py-2">{persistedMatchup.opponent.name} {projectionModeState.mode === 'FINAL' ? 'Final' : ''}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {CATEGORIES.map((cat) => {
                  const k = cat.key as keyof TeamStats;
                  const isPct = cat.format === 'pct';

                  const fmt = (v: unknown) => formatStatValue(v, isPct);

                  // Determine winner for highlighting
                  const myVal = safeNum(effectiveMyTotals ? (effectiveMyTotals as any)[k] : null);
                  const oppVal = safeNum(effectiveOppTotals ? (effectiveOppTotals as any)[k] : null);
                  let winClass = '';
                  if (myVal !== null && oppVal !== null) {
                    const lowerIsBetter = cat.key === 'turnovers';
                    const myWins = lowerIsBetter ? myVal < oppVal : myVal > oppVal;
                    const oppWins = lowerIsBetter ? oppVal < myVal : oppVal > myVal;
                    if (myWins) winClass = 'my';
                    else if (oppWins) winClass = 'opp';
                  }

                  return (
                    <tr key={cat.key}>
                      <td className="py-2 text-muted-foreground">{cat.label}</td>
                      {projectionModeState.mode === 'FINAL' && (
                        <>
                          <td className="py-2 text-right font-medium">{fmt(myCurrentTotalsWithPct ? (myCurrentTotalsWithPct as any)[k] : null)}</td>
                          <td className="py-2 text-right text-muted-foreground">{fmt(myRemainingTotalsWithPct ? (myRemainingTotalsWithPct as any)[k] : null)}</td>
                        </>
                      )}
                      <td className={cn("py-2 text-right font-semibold", winClass === 'my' && "text-stat-positive")}>
                        {fmt(effectiveMyTotals ? (effectiveMyTotals as any)[k] : null)}
                      </td>
                      {projectionModeState.mode === 'FINAL' && (
                        <>
                          <td className="py-2 text-right font-medium">{fmt(oppCurrentTotalsWithPct ? (oppCurrentTotalsWithPct as any)[k] : null)}</td>
                          <td className="py-2 text-right text-muted-foreground">{fmt(oppRemainingTotalsWithPct ? (oppRemainingTotalsWithPct as any)[k] : null)}</td>
                        </>
                      )}
                      <td className={cn("py-2 text-right font-semibold", winClass === 'opp' && "text-stat-negative")}>
                        {fmt(effectiveOppTotals ? (effectiveOppTotals as any)[k] : null)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="mt-2 text-[11px] text-muted-foreground">
              {projectionModeState.mode === 'FINAL' ? 'Final' : 'Projected'} outcome: <span className="font-display font-semibold text-foreground">{persistedMatchup.myTeam.name} </span>
              <span className="text-stat-positive font-display font-semibold">{wins}</span>–
              <span className="text-stat-negative font-display font-semibold">{losses}</span>–
              <span className="font-display font-semibold">{ties}</span>
              <span className="font-display font-semibold text-foreground"> {persistedMatchup.opponent.name}</span>
              {projectionModeState.mode !== 'FINAL' && (
                <span className="text-amber-500 ml-2">(estimated)</span>
              )}
            </p>
          </div>
        )}
      </Card>

      {/* 4 OUTCOME CARDS - New simplified layout */}
      <div className="space-y-4">
        {/* Card 1: Baseline (X40) */}
        <BaselineCard
          myTeamName={persistedMatchup.myTeam.name}
          opponentName={persistedMatchup.opponent.name}
          myBaselineStats={persistedMatchup.myTeam.stats}
          oppBaselineStats={persistedMatchup.opponent.stats}
        />

        {/* Card 2: Schedule-Aware (Current → Final) */}
        <ScheduleAwareCard
          myTeamName={persistedMatchup.myTeam.name}
          opponentName={persistedMatchup.opponent.name}
          myCurrentTotals={myCurrentTotalsWithPct}
          oppCurrentTotals={oppCurrentTotalsWithPct}
          myRemainingTotals={myRemainingTotalsWithPct}
          oppRemainingTotals={oppRemainingTotalsWithPct}
          myFinalTotals={myFinalTotalsWithPct}
          oppFinalTotals={oppFinalTotalsWithPct}
          remainingDays={remainingDates.length}
        />

        {/* Card 3: Today Impact */}
        <TodayImpactCard
          myTeamName={persistedMatchup.myTeam.name}
          opponentName={persistedMatchup.opponent.name}
          myCurrentTotals={myCurrentTotalsWithPct}
          oppCurrentTotals={oppCurrentTotalsWithPct}
          myTodayStats={myTodayStats ?? null}
          oppTodayStats={oppTodayStats ?? null}
          myFinalTotals={myFinalTotalsWithPct}
          oppFinalTotals={oppFinalTotalsWithPct}
        />

        {/* Card 4: Pace vs Baseline */}
        <PaceVsBaselineCard
          myTeamName={persistedMatchup.myTeam.name}
          opponentName={persistedMatchup.opponent.name}
          myBaselineStats={persistedMatchup.myTeam.stats}
          oppBaselineStats={persistedMatchup.opponent.stats}
          myCurrentStats={myWeeklyData?.myTeam.stats ?? null}
          oppCurrentStats={myWeeklyData?.opponent.stats ?? null}
          daysCompleted={dayInfo.dayOfWeek === 0 ? 7 : dayInfo.dayOfWeek}
        />
      </div>

      {/* Strength (Per-40) Projection - Baseline Week */}
      {projectionMode === 'strength' && (
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

            const getBaselineValue = (stats: TeamStats, key: StatKey, isPct: boolean): number | null => {
              const val = safeNum(stats[key as keyof TeamStats]);
              if (val === null) return null;
              return isPct ? val : val * 40;
            };

            const determineBaselineWinner = (myVal: number | null, oppVal: number | null, lowerIsBetter: boolean, isPct: boolean): 'my' | 'opp' | 'tie' | 'missing' => {
              if (myVal === null || oppVal === null) return 'missing';
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
              const winner = determineBaselineWinner(myVal, oppVal, cat.lowerIsBetter, cat.isPct);
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
                            {cat.isPct ? formatStatValue(cat.myVal, true) : fmtInt(cat.myVal)}
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
                            {cat.isPct ? formatStatValue(cat.oppVal, true) : fmtInt(cat.oppVal)}
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
      )}

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

      {/* Dynamic Projection (Current + Remaining Games) - collapsed by default */}
      <Collapsible open={showBreakdown} onOpenChange={setShowBreakdown}>
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
                          ? fmtInt(comp.myCurrent ?? 0)
                          : formatStatValue(comp.myCurrent ?? comp.myAvg, true)}
                      </span>
                      <span className="text-right text-primary">
                        {comp.isCountingStat 
                          ? `+${fmtInt(comp.myTodayExp ?? 0)}`
                          : '—'}
                      </span>
                      <span className={cn("text-right font-bold", comp.winner === "you" && "text-stat-positive")}>
                        {comp.isCountingStat 
                          ? fmtInt(comp.myProjected)
                          : formatStatValue(comp.myProjected, true)}
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
                  {!scheduleOppProjection && (
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
                          ? fmtInt(comp.theirCurrent ?? 0)
                          : formatStatValue(comp.theirCurrent ?? comp.theirAvg, true)}
                      </span>
                      <span className="text-right text-muted-foreground">
                        {scheduleOppProjection 
                          ? (comp.isCountingStat ? `+${fmtInt(comp.theirTodayExp ?? 0)}` : '—')
                          : <span className="text-amber-400/70">N/A</span>
                        }
                      </span>
                      <span className={cn("text-right font-bold", comp.winner === "them" && "text-stat-negative")}>
                        {comp.isCountingStat 
                          ? fmtInt(comp.theirProjected)
                          : formatStatValue(comp.theirProjected, true)}
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
                    <p className="text-xs text-muted-foreground">avg: {formatAverage(comp.myAvg, comp.format)}</p>
                  </>
                ) : (
                  <>
                    <p className="font-display font-bold text-2xl md:text-3xl">
                      {formatAverage(comp.myProjected, comp.format)}
                    </p>
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
                    <p className="text-xs text-muted-foreground">avg: {formatAverage(comp.theirAvg, comp.format)}</p>
                  </>
                ) : (
                  <>
                    <p className="font-display font-bold text-2xl md:text-3xl">{formatAverage(comp.theirProjected, comp.format)}</p>
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

        {/* Removed old BaselinePacePanel - now using 4-card layout above */}
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

const StatBox = ({ label, avg, multiplier = 40, isPct }: StatBoxProps) => {
  const n = safeNum(avg);
  return (
    <div className="text-center">
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      {isPct ? (
        <p className="font-display font-bold text-sm">{n !== null ? formatPct(n) : '—'}</p>
      ) : (
        <>
          <p className="font-display font-bold text-sm">{n !== null ? n.toFixed(1) : '—'}</p>
          <p className="text-[10px] text-muted-foreground">
            {n !== null ? Math.round(n * multiplier) : '—'}
          </p>
        </>
      )}
    </div>
  );
};
