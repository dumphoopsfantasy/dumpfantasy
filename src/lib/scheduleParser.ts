/**
 * Schedule Parser for ESPN Fantasy Basketball League Schedule
 * Parses the "League Schedule" page that lists all matchups for the season.
 */

import { validateParseInput, createLoopGuard, MAX_INPUT_SIZE } from './parseUtils';

export interface ScheduleMatchup {
  week: number;
  dateRangeText: string;
  awayTeam: string;
  homeTeam: string;
}

export interface LeagueSchedule {
  season: string;
  matchups: ScheduleMatchup[];
}

export interface ScheduleParseResult {
  schedule: LeagueSchedule;
  warnings: string[];
  unknownTeams: string[];
}

/**
 * Parse ESPN League Schedule paste to extract all matchups
 * 
 * Expected format:
 * Matchup 1 (Oct 21 - 26)
 * Away    Home
 * Team A  Team B
 * Team C  Team D
 * ...
 * Matchup 2 (Oct 28 - Nov 3)
 * Away    Home
 * ...
 */
export function parseScheduleData(
  data: string,
  knownTeamNames: string[] = []
): ScheduleParseResult {
  validateParseInput(data);
  
  const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
  const loopGuard = createLoopGuard();
  
  const matchups: ScheduleMatchup[] = [];
  const warnings: string[] = [];
  const unknownTeamsSet = new Set<string>();
  
  // Detect season from "2025" or "2024-25" pattern
  let season = '';
  const seasonMatch = data.match(/20\d{2}(?:-\d{2})?/);
  if (seasonMatch) {
    season = seasonMatch[0];
  } else {
    season = new Date().getFullYear().toString();
  }
  
  // Skip patterns for playoffs and irrelevant sections
  const skipPatterns = [
    /playoff/i,
    /bracket/i,
    /determined/i,
    /championship/i,
    /consolation/i,
    /winner of/i,
    /loser of/i,
  ];
  
  // Track current matchup period
  let currentWeek = 0;
  let currentDateRange = '';
  let expectingTeams = false;
  let pendingAwayTeam = '';
  
  // Known team names for matching (lowercase for comparison)
  const knownTeamsLower = knownTeamNames.map(t => t.toLowerCase());
  
  for (let i = 0; i < lines.length; i++) {
    loopGuard.check();
    const line = lines[i];
    
    // Skip playoff sections
    if (skipPatterns.some(p => p.test(line))) {
      expectingTeams = false;
      continue;
    }
    
    // Skip common ESPN navigation/footer text
    if (/^(ESPN|Fantasy|Copyright|©|Username|Password|Log\s*In|Sign\s*Up|Members|Settings|Help|Support)/i.test(line)) {
      continue;
    }
    
    // Match "Matchup N (Date Range)" pattern
    // Examples: "Matchup 1 (Oct 21 - 26)", "Matchup 12 (Dec 23 - 29)"
    const matchupHeaderMatch = line.match(/^Matchup\s+(\d+)\s*\(([^)]+)\)/i);
    if (matchupHeaderMatch) {
      currentWeek = parseInt(matchupHeaderMatch[1]);
      currentDateRange = matchupHeaderMatch[2].trim();
      expectingTeams = true;
      pendingAwayTeam = '';
      continue;
    }
    
    // Also handle matchup patterns without parentheses
    // "Matchup 1" followed by date on next line
    const matchupSimpleMatch = line.match(/^Matchup\s+(\d+)$/i);
    if (matchupSimpleMatch) {
      currentWeek = parseInt(matchupSimpleMatch[1]);
      // Check next line for date
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const dateMatch = nextLine.match(/^[A-Z][a-z]{2}\s+\d+\s*-/i);
        if (dateMatch) {
          currentDateRange = nextLine.trim();
          i++; // Skip date line
        }
      }
      expectingTeams = true;
      pendingAwayTeam = '';
      continue;
    }
    
    // Skip "Away" "Home" headers
    if (/^(Away|Home|Away\s+Home|vs)$/i.test(line)) {
      continue;
    }
    
    // Skip week-related headers
    if (/^Week\s+\d+$/i.test(line)) {
      continue;
    }
    
    // If we're expecting teams and have a current week
    if (expectingTeams && currentWeek > 0) {
      // Check if this looks like a team name (not a number, not short, not a header)
      const isTeamName = (name: string) => {
        if (name.length < 2) return false;
        if (/^\d+$/.test(name)) return false;
        if (/^(Away|Home|vs|@|RK|Team|W|L|T|FG%|FT%|3PM|REB|AST|STL|BLK|TO|PTS)$/i.test(name)) return false;
        return true;
      };
      
      if (isTeamName(line)) {
        // Check if this team is in known teams
        const isKnown = knownTeamsLower.length === 0 || 
          knownTeamsLower.some(kt => line.toLowerCase().includes(kt) || kt.includes(line.toLowerCase()));
        
        if (!isKnown && knownTeamsLower.length > 0) {
          unknownTeamsSet.add(line);
        }
        
        if (!pendingAwayTeam) {
          // This is the away team
          pendingAwayTeam = line;
        } else {
          // This is the home team - complete the matchup
          matchups.push({
            week: currentWeek,
            dateRangeText: currentDateRange,
            awayTeam: pendingAwayTeam,
            homeTeam: line,
          });
          pendingAwayTeam = '';
        }
      }
    }
  }
  
  // Generate warnings
  if (matchups.length === 0) {
    warnings.push('No matchups found. Make sure you pasted the League Schedule page.');
  }
  
  const uniqueWeeks = new Set(matchups.map(m => m.week));
  if (uniqueWeeks.size < 5) {
    warnings.push(`Only ${uniqueWeeks.size} matchup weeks found. Expected more for a full season.`);
  }
  
  return {
    schedule: { season, matchups },
    warnings,
    unknownTeams: Array.from(unknownTeamsSet),
  };
}

/**
 * Extract unique team names from a schedule
 */
export function getScheduleTeams(schedule: LeagueSchedule): string[] {
  const teams = new Set<string>();
  schedule.matchups.forEach(m => {
    teams.add(m.awayTeam);
    teams.add(m.homeTeam);
  });
  return Array.from(teams).sort();
}

/**
 * Get all matchups for a specific team
 */
export function getTeamMatchups(schedule: LeagueSchedule, teamName: string): ScheduleMatchup[] {
  const teamLower = teamName.toLowerCase();
  return schedule.matchups.filter(m => 
    m.awayTeam.toLowerCase() === teamLower || 
    m.homeTeam.toLowerCase() === teamLower
  );
}

/**
 * Get opponent for a given team in a matchup
 */
export function getOpponent(matchup: ScheduleMatchup, teamName: string): string {
  const teamLower = teamName.toLowerCase();
  if (matchup.awayTeam.toLowerCase() === teamLower) {
    return matchup.homeTeam;
  }
  return matchup.awayTeam;
}

/**
 * Determine completed weeks based on current date
 * This is a heuristic - assumes matchups are in chronological order
 */
export function getCompletedWeeks(schedule: LeagueSchedule): number[] {
  // For now, return empty - we'll use the user toggle "Include completed weeks"
  // In a real implementation, we'd parse the dateRangeText and compare to today
  return [];
}
