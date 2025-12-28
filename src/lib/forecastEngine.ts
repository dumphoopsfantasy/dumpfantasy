/**
 * Forecast Engine for predicting matchup outcomes
 * Uses CRI/wCRI logic and team composite × 40 baseline projections
 */

import { LeagueTeam } from '@/types/league';
import { CATEGORIES } from './crisUtils';

export interface TeamStats {
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

export interface WeeklyProjection extends TeamStats {
  // For percentages, we also track estimated makes/attempts
  estimatedFGM?: number;
  estimatedFGA?: number;
  estimatedFTM?: number;
  estimatedFTA?: number;
}

export interface CategoryResult {
  category: string;
  myValue: number;
  oppValue: number;
  winner: 'my' | 'opp' | 'tie';
  margin: number;
  marginPct: number;
}

export interface MatchupPrediction {
  week: number;
  dateRange: string;
  opponent: string;
  myProjected: WeeklyProjection;
  oppProjected: WeeklyProjection;
  categoryResults: CategoryResult[];
  wins: number;
  losses: number;
  ties: number;
  outcome: string;
  swingCategories: string[];
  edge: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface TeamRecord {
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  categoryWins: number;
  categoryLosses: number;
  categoryTies: number;
}

export interface ProjectedStanding {
  teamName: string;
  currentWins: number;
  currentLosses: number;
  currentTies: number;
  projectedWins: number;
  projectedLosses: number;
  projectedTies: number;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  projectedRank: number;
  totalCategoryWins: number;
  totalCategoryLosses: number;
  categoryWinPct: number;
}

export interface ForecastSettings {
  useCri: boolean;
  useWeightedCri: boolean;
  /** Optional per-category weights used when useWeightedCri=true */
  dynamicWeights?: Record<string, number>;
  simulationScale: number;
  includeCompletedWeeks: boolean;
  startFromCurrentRecords: boolean;
  completedWeeks: number[];
  /** Only simulate weeks strictly greater than this cutoff (unless includeCompletedWeeks=true) */
  currentWeekCutoff?: number;
}

export interface ForecastMatchup {
  week: number;
  dateRangeText: string;
  awayTeam: string;
  homeTeam: string;
}

export interface ForecastSchedule {
  season: string;
  matchups: ForecastMatchup[];
}

const STAT_CATEGORIES = ['fgPct', 'ftPct', 'threepm', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'points'] as const;

/**
 * Project weekly stats from per-game averages
 * Counting stats are multiplied by scale (default 40)
 * Percentage stats are kept as-is (but we estimate makes/attempts for calculation)
 */
export function projectWeeklyStats(
  teamStats: TeamStats,
  scale: number = 40
): WeeklyProjection {
  // Estimate FGA/FTA per game based on typical volume
  // These are rough estimates - in a real implementation we'd get actual attempt data
  const estimatedFGAPerGame = 85; // Team attempts about 85 FG per game
  const estimatedFTAPerGame = 22; // Team attempts about 22 FT per game
  
  // Calculate estimated makes from percentages
  const estimatedFGM = teamStats.fgPct * estimatedFGAPerGame * (scale / 40);
  const estimatedFGA = estimatedFGAPerGame * (scale / 40);
  const estimatedFTM = teamStats.ftPct * estimatedFTAPerGame * (scale / 40);
  const estimatedFTA = estimatedFTAPerGame * (scale / 40);
  
  return {
    fgPct: teamStats.fgPct,
    ftPct: teamStats.ftPct,
    threepm: teamStats.threepm * scale,
    rebounds: teamStats.rebounds * scale,
    assists: teamStats.assists * scale,
    steals: teamStats.steals * scale,
    blocks: teamStats.blocks * scale,
    turnovers: teamStats.turnovers * scale,
    points: teamStats.points * scale,
    estimatedFGM,
    estimatedFGA,
    estimatedFTM,
    estimatedFTA,
  };
}

/**
 * Compare two teams' projected stats and determine category winners
 */
export function compareCategoryResults(
  myProjected: WeeklyProjection,
  oppProjected: WeeklyProjection
): CategoryResult[] {
  const results: CategoryResult[] = [];
  
  STAT_CATEGORIES.forEach(cat => {
    const myVal = myProjected[cat];
    const oppVal = oppProjected[cat];
    const isLowerBetter = cat === 'turnovers';
    
    let winner: 'my' | 'opp' | 'tie';
    if (Math.abs(myVal - oppVal) < 0.001) {
      winner = 'tie';
    } else if (isLowerBetter) {
      winner = myVal < oppVal ? 'my' : 'opp';
    } else {
      winner = myVal > oppVal ? 'my' : 'opp';
    }
    
    const margin = Math.abs(myVal - oppVal);
    const avgVal = (myVal + oppVal) / 2;
    const marginPct = avgVal > 0 ? margin / avgVal : 0;
    
    results.push({
      category: cat,
      myValue: myVal,
      oppValue: oppVal,
      winner,
      margin,
      marginPct,
    });
  });
  
  return results;
}

/**
 * Predict the outcome of a single matchup
 */
export function predictMatchup(
  week: number,
  dateRange: string,
  opponentName: string,
  myStats: TeamStats,
  oppStats: TeamStats,
  settings: ForecastSettings
): MatchupPrediction {
  const myProjected = projectWeeklyStats(myStats, settings.simulationScale);
  const oppProjected = projectWeeklyStats(oppStats, settings.simulationScale);
  
  const categoryResults = compareCategoryResults(myProjected, oppProjected);
  
  // Count wins/losses/ties
  let wins = 0, losses = 0, ties = 0;
  categoryResults.forEach(r => {
    if (r.winner === 'my') wins++;
    else if (r.winner === 'opp') losses++;
    else ties++;
  });
  
  // Identify swing categories (smallest margins, excluding ties)
  const nonTieResults = categoryResults.filter(r => r.winner !== 'tie');
  const sortedByMargin = [...nonTieResults].sort((a, b) => a.marginPct - b.marginPct);
  const swingCategories = sortedByMargin.slice(0, 3).map(r => {
    const catInfo = CATEGORIES.find(c => c.key === r.category);
    return catInfo?.label || r.category;
  });
  
  // Calculate edge score (sum of normalized category advantages)
  let edge = 0;
  categoryResults.forEach(r => {
    if (r.winner === 'my') edge += r.marginPct;
    else if (r.winner === 'opp') edge -= r.marginPct;
  });
  edge = edge * 100; // Convert to percentage points
  
  // Determine confidence based on margin and category distribution
  let confidence: 'high' | 'medium' | 'low';
  const winMargin = Math.abs(wins - losses);
  if (winMargin >= 3) {
    confidence = 'high';
  } else if (winMargin >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    week,
    dateRange,
    opponent: opponentName,
    myProjected,
    oppProjected,
    categoryResults,
    wins,
    losses,
    ties,
    outcome: `${wins}–${losses}–${ties}`,
    swingCategories,
    edge,
    confidence,
  };
}

/**
 * Forecast all future matchups for a specific team
 */
export function forecastTeamMatchups(
  schedule: ForecastSchedule,
  focusTeamName: string,
  allTeams: LeagueTeam[],
  settings: ForecastSettings
): MatchupPrediction[] {
  const predictions: MatchupPrediction[] = [];
  const focusTeamLower = focusTeamName.toLowerCase();

  const focusTeam = allTeams.find((t) => t.name.toLowerCase() === focusTeamLower);
  if (!focusTeam) return predictions;

  const cutoff = settings.currentWeekCutoff ?? 0;

  const focusTeamMatchups = schedule.matchups.filter((m) =>
    m.awayTeam.toLowerCase() === focusTeamLower || m.homeTeam.toLowerCase() === focusTeamLower
  );

  const relevantMatchups = settings.includeCompletedWeeks
    ? focusTeamMatchups
    : focusTeamMatchups.filter((m) => m.week > cutoff && !settings.completedWeeks.includes(m.week));

  const teamStatsMap = new Map<string, TeamStats>();
  allTeams.forEach((t) => {
    teamStatsMap.set(t.name.toLowerCase(), {
      fgPct: t.fgPct,
      ftPct: t.ftPct,
      threepm: t.threepm,
      rebounds: t.rebounds,
      assists: t.assists,
      steals: t.steals,
      blocks: t.blocks,
      turnovers: t.turnovers,
      points: t.points,
    });
  });

  relevantMatchups.forEach((matchup) => {
    const opponentName = matchup.awayTeam.toLowerCase() === focusTeamLower ? matchup.homeTeam : matchup.awayTeam;
    const oppStats = teamStatsMap.get(opponentName.toLowerCase());

    if (!oppStats) {
      const fuzzyMatch = allTeams.find(
        (t) => t.name.toLowerCase().includes(opponentName.toLowerCase()) || opponentName.toLowerCase().includes(t.name.toLowerCase())
      );
      if (!fuzzyMatch) return;

      const oppStatsFromFuzzy: TeamStats = {
        fgPct: fuzzyMatch.fgPct,
        ftPct: fuzzyMatch.ftPct,
        threepm: fuzzyMatch.threepm,
        rebounds: fuzzyMatch.rebounds,
        assists: fuzzyMatch.assists,
        steals: fuzzyMatch.steals,
        blocks: fuzzyMatch.blocks,
        turnovers: fuzzyMatch.turnovers,
        points: fuzzyMatch.points,
      };

      predictions.push(
        predictMatchup(
          matchup.week,
          matchup.dateRangeText,
          opponentName,
          {
            fgPct: focusTeam.fgPct,
            ftPct: focusTeam.ftPct,
            threepm: focusTeam.threepm,
            rebounds: focusTeam.rebounds,
            assists: focusTeam.assists,
            steals: focusTeam.steals,
            blocks: focusTeam.blocks,
            turnovers: focusTeam.turnovers,
            points: focusTeam.points,
          },
          oppStatsFromFuzzy,
          settings
        )
      );
      return;
    }

    predictions.push(
      predictMatchup(
        matchup.week,
        matchup.dateRangeText,
        opponentName,
        {
          fgPct: focusTeam.fgPct,
          ftPct: focusTeam.ftPct,
          threepm: focusTeam.threepm,
          rebounds: focusTeam.rebounds,
          assists: focusTeam.assists,
          steals: focusTeam.steals,
          blocks: focusTeam.blocks,
          turnovers: focusTeam.turnovers,
          points: focusTeam.points,
        },
        oppStats,
        settings
      )
    );
  });

  return predictions.sort((a, b) => a.week - b.week);
}

/**
 * Project final standings for the entire league
 */
export function projectFinalStandings(
  schedule: ForecastSchedule,
  allTeams: LeagueTeam[],
  settings: ForecastSettings
): ProjectedStanding[] {
  // Initialize records from current standings
  const records = new Map<string, TeamRecord>();
  
  allTeams.forEach(team => {
    // Parse current record if available
    let currentWins = 0, currentLosses = 0, currentTies = 0;
    if (team.record && settings.startFromCurrentRecords) {
      const parts = team.record.split('-');
      if (parts.length >= 2) {
        currentWins = parseInt(parts[0]) || 0;
        currentLosses = parseInt(parts[1]) || 0;
        currentTies = parts.length > 2 ? (parseInt(parts[2]) || 0) : 0;
      }
    }
    
    records.set(team.name.toLowerCase(), {
      teamName: team.name,
      wins: currentWins,
      losses: currentLosses,
      ties: currentTies,
      categoryWins: 0,
      categoryLosses: 0,
      categoryTies: 0,
    });
  });
  
  // Create team stats map
  const teamStatsMap = new Map<string, TeamStats>();
  allTeams.forEach(t => {
    teamStatsMap.set(t.name.toLowerCase(), {
      fgPct: t.fgPct,
      ftPct: t.ftPct,
      threepm: t.threepm,
      rebounds: t.rebounds,
      assists: t.assists,
      steals: t.steals,
      blocks: t.blocks,
      turnovers: t.turnovers,
      points: t.points,
    });
  });
  
  const cutoff = settings.currentWeekCutoff ?? 0;
  
  // Get unique weeks from schedule
  const weekSet = new Set(schedule.matchups.map(m => m.week));
  const relevantWeeks = settings.includeCompletedWeeks
    ? Array.from(weekSet)
    : Array.from(weekSet).filter(w => w > cutoff && !settings.completedWeeks.includes(w));
  
  // Simulate each remaining matchup
  relevantWeeks.forEach(week => {
    const weekMatchups = schedule.matchups.filter(m => m.week === week);
    
    weekMatchups.forEach(matchup => {
      const awayStats = teamStatsMap.get(matchup.awayTeam.toLowerCase());
      const homeStats = teamStatsMap.get(matchup.homeTeam.toLowerCase());
      
      if (!awayStats || !homeStats) return;
      
      const awayProjected = projectWeeklyStats(awayStats, settings.simulationScale);
      const homeProjected = projectWeeklyStats(homeStats, settings.simulationScale);
      
      const results = compareCategoryResults(awayProjected, homeProjected);
      
      let awayWins = 0, homeWins = 0, ties = 0;
      results.forEach(r => {
        if (r.winner === 'my') awayWins++;
        else if (r.winner === 'opp') homeWins++;
        else ties++;
      });
      
      const awayRecord = records.get(matchup.awayTeam.toLowerCase());
      const homeRecord = records.get(matchup.homeTeam.toLowerCase());
      
      if (awayRecord && homeRecord) {
        // Determine match winner
        if (awayWins > homeWins) {
          awayRecord.wins++;
          homeRecord.losses++;
        } else if (homeWins > awayWins) {
          homeRecord.wins++;
          awayRecord.losses++;
        } else {
          awayRecord.ties++;
          homeRecord.ties++;
        }
        
        // Track category results
        awayRecord.categoryWins += awayWins;
        awayRecord.categoryLosses += homeWins;
        awayRecord.categoryTies += ties;
        
        homeRecord.categoryWins += homeWins;
        homeRecord.categoryLosses += awayWins;
        homeRecord.categoryTies += ties;
      }
    });
  });
  
  // Calculate projected standings
  const standings: ProjectedStanding[] = [];
  
  allTeams.forEach(team => {
    const record = records.get(team.name.toLowerCase());
    if (!record) return;
    
    // Parse current record
    let currentWins = 0, currentLosses = 0, currentTies = 0;
    if (team.record && settings.startFromCurrentRecords) {
      const parts = team.record.split('-');
      if (parts.length >= 2) {
        currentWins = parseInt(parts[0]) || 0;
        currentLosses = parseInt(parts[1]) || 0;
        currentTies = parts.length > 2 ? (parseInt(parts[2]) || 0) : 0;
      }
    }
    
    const projectedWins = record.wins - currentWins;
    const projectedLosses = record.losses - currentLosses;
    const projectedTies = record.ties - currentTies;
    
    const totalCatWins = record.categoryWins;
    const totalCatLosses = record.categoryLosses;
    const totalCatGames = totalCatWins + totalCatLosses + record.categoryTies;
    
    standings.push({
      teamName: record.teamName,
      currentWins,
      currentLosses,
      currentTies,
      projectedWins,
      projectedLosses,
      projectedTies,
      totalWins: record.wins,
      totalLosses: record.losses,
      totalTies: record.ties,
      projectedRank: 0, // Will be set after sorting
      totalCategoryWins: totalCatWins,
      totalCategoryLosses: totalCatLosses,
      categoryWinPct: totalCatGames > 0 ? totalCatWins / totalCatGames : 0,
    });
  });
  
  // Sort by total wins (desc), then category win % (desc)
  standings.sort((a, b) => {
    const winDiff = b.totalWins - a.totalWins;
    if (winDiff !== 0) return winDiff;
    
    const lossDiff = a.totalLosses - b.totalLosses;
    if (lossDiff !== 0) return lossDiff;
    
    return b.categoryWinPct - a.categoryWinPct;
  });
  
  // Assign projected ranks
  standings.forEach((s, i) => {
    s.projectedRank = i + 1;
  });
  
  return standings;
}
