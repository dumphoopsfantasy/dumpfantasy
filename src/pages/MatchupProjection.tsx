import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ArrowRight, Trophy, Target, Minus, Upload, RefreshCw, Info, AlertTriangle, Lightbulb, X, ChevronDown, Calendar } from "lucide-react";
import { formatPct, CATEGORIES } from "@/lib/crisUtils";
import { validateParseInput, parseWithTimeout, createLoopGuard, MAX_INPUT_SIZE } from "@/lib/parseUtils";
import { RosterSlot, Player } from "@/types/fantasy";

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

interface MatchupData {
  myTeam: MatchupTeam;
  opponent: MatchupTeam;
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
}

const COUNTING_STATS = ["threepm", "rebounds", "assists", "steals", "blocks", "turnovers", "points"];

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

// Compute "today expected" stats from roster players with games today
function computeTodayExpected(roster: RosterSlot[]): TeamStats & { hasData: boolean; playerCount: number; estimatedFGA: number; estimatedFTA: number; estimatedFGM: number; estimatedFTM: number } {
  const playersWithGamesToday = roster.filter(slot => 
    slot.player.opponent && 
    slot.slotType !== "ir" &&
    !isPlayerOut(slot.player.status)
  );
  
  let totalFGM = 0, totalFGA = 0, totalFTM = 0, totalFTA = 0;
  let threepm = 0, rebounds = 0, assists = 0, steals = 0, blocks = 0, turnovers = 0, points = 0;
  
  playersWithGamesToday.forEach(slot => {
    const p = slot.player;
    const multiplier = getInjuryMultiplier(p.status);
    
    // Estimate FGA/FTA from FG%/FT% and points (rough heuristic)
    // Assume ~18 FGA per game for average player based on minutes
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
}: MatchupProjectionProps) => {
  const [myTeamData, setMyTeamData] = useState("");
  const [opponentData, setOpponentData] = useState("");
  const [statWindowMismatch, setStatWindowMismatch] = useState<{ myWindow: string | null; oppWindow: string | null } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [dismissedTip, setDismissedTip] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

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

    // Opponent projections (use Weekly current + baseline if no opponent schedule)
    // For opponent, we don't have their today expected (no roster data), so use 0 or baseline
    const oppProjections = {
      fgPct: computeProjectedFinal(currentOpp?.fgPct ?? null, 0, oppBaselineStats.fgPct, true),
      ftPct: computeProjectedFinal(currentOpp?.ftPct ?? null, 0, oppBaselineStats.ftPct, true),
      threepm: computeProjectedFinal(currentOpp?.threepm ?? null, 0, oppBaselineStats.threepm * 40, false),
      rebounds: computeProjectedFinal(currentOpp?.rebounds ?? null, 0, oppBaselineStats.rebounds * 40, false),
      assists: computeProjectedFinal(currentOpp?.assists ?? null, 0, oppBaselineStats.assists * 40, false),
      steals: computeProjectedFinal(currentOpp?.steals ?? null, 0, oppBaselineStats.steals * 40, false),
      blocks: computeProjectedFinal(currentOpp?.blocks ?? null, 0, oppBaselineStats.blocks * 40, false),
      turnovers: computeProjectedFinal(currentOpp?.turnovers ?? null, 0, oppBaselineStats.turnovers * 40, false),
      points: computeProjectedFinal(currentOpp?.points ?? null, 0, oppBaselineStats.points * 40, false),
    };

    return {
      myProjections,
      oppProjections,
      hasWeeklyData,
      currentRecord: hasWeeklyData ? parseCurrentRecord(myWeeklyData.myTeam.currentMatchup) : null,
      oppHasSchedule: false, // We don't have opponent roster
    };
  }, [persistedMatchup, myWeeklyData, todayExpected, dayInfo]);

  // Extract opponent name from "Current Matchup" section
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
  const parseESPNTeamPage = (data: string): { info: TeamInfo; stats: TeamStats } | null => {
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

    // Parse stats - align with Free Agents / Roster table structure
    const statTokens: string[] = [];

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

    const COLS = 17;
    let validCount = 0;
    let sums = {
      fgPct: 0,
      ftPct: 0,
      threepm: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      points: 0,
    };

    if (statsStartIdx > -1) {
      let dataStartIdx = statsStartIdx + 1;
      while (
        dataStartIdx < lines.length &&
        /^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|MIN)$/i.test(
          lines[dataStartIdx]
        )
      ) {
        dataStartIdx++;
      }

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

      const numStatRows = Math.floor(statTokens.length / COLS);
      for (let i = 0; i < numStatRows; i++) {
        const base = i * COLS;
        const parseVal = (idx: number): number => {
          const val = statTokens[base + idx];
          if (!val || val === '--') return 0;
          return parseFloat(val);
        };

        const min = parseVal(0);
        if (!min || isNaN(min) || min === 0) continue;

        let fgPct = parseVal(3);
        if (fgPct > 1) fgPct = fgPct / (fgPct >= 100 ? 1000 : 100);

        let ftPct = parseVal(6);
        if (ftPct > 1) ftPct = ftPct / (ftPct >= 100 ? 1000 : 100);

        sums.fgPct += fgPct;
        sums.ftPct += ftPct;
        sums.threepm += parseVal(7);
        sums.rebounds += parseVal(8);
        sums.assists += parseVal(9);
        sums.steals += parseVal(10);
        sums.blocks += parseVal(11);
        sums.turnovers += parseVal(12);
        sums.points += parseVal(13);
        validCount++;
      }
    }

    if (validCount > 0) {
      return {
        info: { name: teamName || "Team", abbr: teamAbbr, record, standing, owner, lastMatchup },
        stats: {
          fgPct: sums.fgPct / validCount,
          ftPct: sums.ftPct / validCount,
          threepm: sums.threepm / validCount,
          rebounds: sums.rebounds / validCount,
          assists: sums.assists / validCount,
          steals: sums.steals / validCount,
          blocks: sums.blocks / validCount,
          turnovers: sums.turnovers / validCount,
          points: sums.points / validCount,
        },
      };
    }

    // Fallback: simple number extraction
    const simpleNumbers: number[] = [];
    for (const line of lines) {
      const numMatch = line.match(/^([.\d]+)$/);
      if (numMatch) simpleNumbers.push(parseFloat(numMatch[1]));
    }

    if (simpleNumbers.length >= 9) {
      return {
        info: { name: teamName || "Team", abbr: teamAbbr, record, standing, owner, lastMatchup },
        stats: {
          fgPct: simpleNumbers[0] < 1 ? simpleNumbers[0] : simpleNumbers[0] / 100,
          ftPct: simpleNumbers[1] < 1 ? simpleNumbers[1] : simpleNumbers[1] / 100,
          threepm: simpleNumbers[2],
          rebounds: simpleNumbers[3],
          assists: simpleNumbers[4],
          steals: simpleNumbers[5],
          blocks: simpleNumbers[6],
          turnovers: simpleNumbers[7],
          points: simpleNumbers[8],
        },
      };
    }

    return null;
  };

  const handleCompare = async () => {
    // Validate input sizes
    if (myTeamData.length > MAX_INPUT_SIZE || opponentData.length > MAX_INPUT_SIZE) {
      return; // Size validation message would show inline
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

      if (myParsed && oppParsed) {
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
        
        onMatchupChange({
          myTeam: { ...myParsed.info, stats: myParsed.stats },
          opponent: { ...finalOppInfo, stats: oppParsed.stats },
        });
      }
    } catch (error) {
      console.error('Parse error:', error);
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
            <h3 className="font-display font-bold mb-2 text-stat-positive">Your Team</h3>
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

        <Button onClick={handleCompare} className="w-full gradient-primary font-display font-bold">
          <Upload className="w-4 h-4 mr-2" />
          Compare Matchup
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

      {/* Stats Info Notice */}
      <Card className="p-3 bg-amber-500/10 border-amber-500/30">
        <div className="flex items-center gap-2 text-xs">
          <Info className="w-4 h-4 text-amber-400" />
          <span className="text-muted-foreground">
            {usesDynamicProjection ? (
              <>
                <strong className="text-amber-400">Dynamic projection:</strong> Current (Weekly) + Today Expected = Projected Final.
                <strong className="text-amber-400 ml-1">TO: Lower wins.</strong>
              </>
            ) : (
              <>
                Team average × <strong className="text-amber-400">40</strong> = weekly projection.
                FG%/FT% = team average. <strong className="text-amber-400">TO: Lower wins.</strong>
              </>
            )}
          </span>
        </div>
      </Card>

      {/* Opponent schedule notice */}
      {usesDynamicProjection && !dynamicProjection?.oppHasSchedule && (
        <Card className="p-2 bg-muted/30 border-muted">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Info className="w-3 h-3" />
            <span>Opponent projection uses baseline averages (schedule not imported).</span>
          </div>
        </Card>
      )}

      {/* Today's Players Summary */}
      {todayExpected.hasData && (
        <Card className="p-3 bg-primary/5 border-primary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Today's Games</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {todayExpected.playerCount} player{todayExpected.playerCount !== 1 ? 's' : ''} playing
            </Badge>
          </div>
        </Card>
      )}

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

      {/* Projection Breakdown Toggle */}
      {usesDynamicProjection && (
        <Collapsible open={showBreakdown} onOpenChange={setShowBreakdown}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <ChevronDown className={cn("w-4 h-4 mr-2 transition-transform", showBreakdown && "rotate-180")} />
              {showBreakdown ? "Hide" : "Show"} Projection Breakdown
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="grid md:grid-cols-2 gap-3">
              {/* Your Team Breakdown */}
              <Card className="gradient-card border-border p-3">
                <h3 className="font-display font-semibold text-sm text-stat-positive mb-3">{persistedMatchup.myTeam.name}</h3>
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-4 gap-1 text-muted-foreground text-[10px] font-medium">
                    <span>Cat</span>
                    <span className="text-right">Current</span>
                    <span className="text-right">+Today</span>
                    <span className="text-right">Final</span>
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

              {/* Opponent Breakdown */}
              <Card className="gradient-card border-border p-3">
                <h3 className="font-display font-semibold text-sm text-stat-negative mb-3">{persistedMatchup.opponent.name}</h3>
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-4 gap-1 text-muted-foreground text-[10px] font-medium">
                    <span>Cat</span>
                    <span className="text-right">Current</span>
                    <span className="text-right">+Today</span>
                    <span className="text-right">Final</span>
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
                        {comp.isCountingStat 
                          ? `+${Math.round(comp.theirTodayExp ?? 0)}`
                          : '—'}
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
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Team Averages Summary - Compact (only show when NOT using dynamic projection) */}
      {!usesDynamicProjection && (
        <div className="grid md:grid-cols-2 gap-3">
          {/* Your Team */}
          <Card className="gradient-card border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold text-sm text-stat-positive">{persistedMatchup.myTeam.name}</h3>
              <span className="text-[10px] text-muted-foreground">×40</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              <StatBox label="FG%" avg={persistedMatchup.myTeam.stats.fgPct} isPct />
              <StatBox label="FT%" avg={persistedMatchup.myTeam.stats.ftPct} isPct />
              <StatBox label="3PM" avg={persistedMatchup.myTeam.stats.threepm} multiplier={40} />
              <StatBox label="REB" avg={persistedMatchup.myTeam.stats.rebounds} multiplier={40} />
              <StatBox label="AST" avg={persistedMatchup.myTeam.stats.assists} multiplier={40} />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <StatBox label="STL" avg={persistedMatchup.myTeam.stats.steals} multiplier={40} />
              <StatBox label="BLK" avg={persistedMatchup.myTeam.stats.blocks} multiplier={40} />
              <StatBox label="TO" avg={persistedMatchup.myTeam.stats.turnovers} multiplier={40} />
              <StatBox label="PTS" avg={persistedMatchup.myTeam.stats.points} multiplier={40} />
            </div>
          </Card>

          <Card className="gradient-card border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold text-sm text-stat-negative">{persistedMatchup.opponent.name}</h3>
              <span className="text-[10px] text-muted-foreground">×40</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              <StatBox label="FG%" avg={persistedMatchup.opponent.stats.fgPct} isPct />
              <StatBox label="FT%" avg={persistedMatchup.opponent.stats.ftPct} isPct />
              <StatBox label="3PM" avg={persistedMatchup.opponent.stats.threepm} multiplier={40} />
              <StatBox label="REB" avg={persistedMatchup.opponent.stats.rebounds} multiplier={40} />
              <StatBox label="AST" avg={persistedMatchup.opponent.stats.assists} multiplier={40} />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <StatBox label="STL" avg={persistedMatchup.opponent.stats.steals} multiplier={40} />
              <StatBox label="BLK" avg={persistedMatchup.opponent.stats.blocks} multiplier={40} />
              <StatBox label="TO" avg={persistedMatchup.opponent.stats.turnovers} multiplier={40} />
              <StatBox label="PTS" avg={persistedMatchup.opponent.stats.points} multiplier={40} />
            </div>
          </Card>
        </div>
      )}

      {/* Category Breakdown */}
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
