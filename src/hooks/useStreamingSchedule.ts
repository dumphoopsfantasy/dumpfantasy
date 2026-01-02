import { useState, useCallback, useMemo } from 'react';
import { Player } from '@/types/fantasy';
import { ScheduleDate } from '@/hooks/useNBAUpcomingSchedule';

export type DateSelectionMode = 'include' | 'exclude';

export interface DateSelection {
  dateStr: string;
  mode: DateSelectionMode;
}

export interface CoverageGap {
  dateStr: string;
  dayLabel: string;
  unusedSlots: number;
  totalSlots: number;
  playersPlaying: number;
}

export interface RecommendedCombo {
  id: string;
  label: string;
  description: string;
  dates: string[];
  icon?: string;
}

// Lineup slots for standard ESPN 9-cat leagues
const LINEUP_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F/C', 'UTIL'];
const TOTAL_STARTER_SLOTS = 8;

interface UseStreamingScheduleProps {
  scheduleDates: ScheduleDate[];
  roster: Player[];
  isTeamPlayingOnDate: (teamCode: string, dateStr: string) => boolean;
}

interface UseStreamingScheduleReturn {
  dateSelections: Map<string, DateSelectionMode>;
  toggleDateSelection: (dateStr: string) => void;
  setDateMode: (dateStr: string, mode: DateSelectionMode) => void;
  clearSelections: () => void;
  selectMultipleDates: (dateStrs: string[], mode: DateSelectionMode) => void;
  
  // Include/exclude helpers
  includedDates: Set<string>;
  excludedDates: Set<string>;
  hasAnySelection: boolean;
  
  // Coverage gaps
  coverageGaps: CoverageGap[];
  fillCoverageGaps: () => void;
  
  // Recommended combos
  recommendedCombos: RecommendedCombo[];
  applyCombo: (combo: RecommendedCombo) => void;
  
  // Filtering
  matchesDateFilter: (teamCode: string) => boolean;
  getPlayingDatesForTeam: (teamCode: string) => string[];
  getGamesCountForTeam: (teamCode: string) => number;
}

export const useStreamingSchedule = ({
  scheduleDates,
  roster,
  isTeamPlayingOnDate,
}: UseStreamingScheduleProps): UseStreamingScheduleReturn => {
  const [dateSelections, setDateSelections] = useState<Map<string, DateSelectionMode>>(new Map());

  // Toggle between include -> exclude -> unselected
  const toggleDateSelection = useCallback((dateStr: string) => {
    setDateSelections(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(dateStr);
      
      if (current === undefined) {
        newMap.set(dateStr, 'include');
      } else if (current === 'include') {
        newMap.set(dateStr, 'exclude');
      } else {
        newMap.delete(dateStr);
      }
      
      return newMap;
    });
  }, []);

  const setDateMode = useCallback((dateStr: string, mode: DateSelectionMode) => {
    setDateSelections(prev => {
      const newMap = new Map(prev);
      newMap.set(dateStr, mode);
      return newMap;
    });
  }, []);

  const clearSelections = useCallback(() => {
    setDateSelections(new Map());
  }, []);

  const selectMultipleDates = useCallback((dateStrs: string[], mode: DateSelectionMode) => {
    setDateSelections(prev => {
      const newMap = new Map(prev);
      dateStrs.forEach(dateStr => newMap.set(dateStr, mode));
      return newMap;
    });
  }, []);

  // Derived sets for easy access
  const includedDates = useMemo(() => {
    const dates = new Set<string>();
    dateSelections.forEach((mode, dateStr) => {
      if (mode === 'include') dates.add(dateStr);
    });
    return dates;
  }, [dateSelections]);

  const excludedDates = useMemo(() => {
    const dates = new Set<string>();
    dateSelections.forEach((mode, dateStr) => {
      if (mode === 'exclude') dates.add(dateStr);
    });
    return dates;
  }, [dateSelections]);

  const hasAnySelection = useMemo(() => dateSelections.size > 0, [dateSelections]);

  // Calculate coverage gaps for each date
  const coverageGaps = useMemo<CoverageGap[]>(() => {
    if (!roster.length) return [];
    
    return scheduleDates.map(sd => {
      // Count how many roster players are playing on this date
      const playersPlaying = roster.filter(p => 
        isTeamPlayingOnDate(p.nbaTeam, sd.dateStr)
      ).length;
      
      const unusedSlots = Math.max(0, TOTAL_STARTER_SLOTS - playersPlaying);
      
      return {
        dateStr: sd.dateStr,
        dayLabel: sd.dayLabel,
        unusedSlots,
        totalSlots: TOTAL_STARTER_SLOTS,
        playersPlaying,
      };
    }).filter(gap => gap.unusedSlots > 0);
  }, [scheduleDates, roster, isTeamPlayingOnDate]);

  const fillCoverageGaps = useCallback(() => {
    const gapDates = coverageGaps.map(g => g.dateStr);
    if (gapDates.length > 0) {
      selectMultipleDates(gapDates, 'include');
    }
  }, [coverageGaps, selectMultipleDates]);

  // Generate recommended date combos
  const recommendedCombos = useMemo<RecommendedCombo[]>(() => {
    const combos: RecommendedCombo[] = [];
    
    // Get dates with games only
    const datesWithGames = scheduleDates.filter(sd => sd.games.length > 0);
    if (datesWithGames.length < 2) return combos;

    // Classify dates by slate size
    const lightDates = datesWithGames.filter(d => d.games.length <= 5);
    const heavyDates = datesWithGames.filter(d => d.games.length >= 10);
    
    // Identify day patterns
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sun, 1 = Mon, etc.
    
    // Find specific day patterns in the upcoming week
    const tueThu = datesWithGames.filter(d => {
      const date = new Date(d.dateStr + 'T12:00:00');
      const dow = date.getDay();
      return dow === 2 || dow === 4; // Tue or Thu
    });
    
    const monWedFri = datesWithGames.filter(d => {
      const date = new Date(d.dateStr + 'T12:00:00');
      const dow = date.getDay();
      return dow === 1 || dow === 3 || dow === 5; // Mon, Wed, Fri
    });
    
    const weekendDates = datesWithGames.filter(d => {
      const date = new Date(d.dateStr + 'T12:00:00');
      const dow = date.getDay();
      return dow === 0 || dow === 6; // Sat or Sun
    });

    // Add combos
    if (tueThu.length >= 2) {
      combos.push({
        id: 'tue-thu',
        label: 'Tue/Thu Stream',
        description: `Best for 2-game streaming on light slate days`,
        dates: tueThu.slice(0, 2).map(d => d.dateStr),
        icon: '📅',
      });
    }

    if (monWedFri.length >= 2) {
      combos.push({
        id: 'mon-wed-fri',
        label: 'Mon/Wed/Fri',
        description: `3-game stretch across the week`,
        dates: monWedFri.slice(0, 3).map(d => d.dateStr),
        icon: '🏀',
      });
    }

    if (weekendDates.length >= 2) {
      combos.push({
        id: 'weekend',
        label: 'Weekend B2B',
        description: `Back-to-back weekend games`,
        dates: weekendDates.slice(0, 2).map(d => d.dateStr),
        icon: '🔥',
      });
    }

    if (lightDates.length >= 2) {
      combos.push({
        id: 'light-slate',
        label: 'Light Slate Days',
        description: `Fewer games = easier to stream`,
        dates: lightDates.slice(0, 3).map(d => d.dateStr),
        icon: '💡',
      });
    }

    if (heavyDates.length >= 1) {
      combos.push({
        id: 'avoid-heavy',
        label: 'Avoid Heavy Days',
        description: `Skip crowded slates with ${heavyDates.length} heavy day${heavyDates.length > 1 ? 's' : ''}`,
        dates: heavyDates.map(d => d.dateStr),
        icon: '⚠️',
      });
    }

    // Coverage gaps combo
    if (coverageGaps.length > 0) {
      combos.unshift({
        id: 'fill-gaps',
        label: 'Fill Coverage Gaps',
        description: `${coverageGaps.length} day${coverageGaps.length > 1 ? 's' : ''} with unused lineup slots`,
        dates: coverageGaps.map(g => g.dateStr),
        icon: '🎯',
      });
    }

    return combos;
  }, [scheduleDates, coverageGaps]);

  const applyCombo = useCallback((combo: RecommendedCombo) => {
    // "Avoid Heavy Days" should be excluded, others included
    const mode: DateSelectionMode = combo.id === 'avoid-heavy' ? 'exclude' : 'include';
    selectMultipleDates(combo.dates, mode);
  }, [selectMultipleDates]);

  // Filter logic: player matches if they play on included dates and NOT on excluded dates
  const matchesDateFilter = useCallback((teamCode: string): boolean => {
    // No selection = show all
    if (!hasAnySelection) return true;
    
    // If we have excluded dates, check team doesn't play on them
    if (excludedDates.size > 0) {
      for (const dateStr of excludedDates) {
        if (isTeamPlayingOnDate(teamCode, dateStr)) {
          return false; // Team plays on excluded date, filter out
        }
      }
    }
    
    // If we have included dates, team must play on at least one
    if (includedDates.size > 0) {
      let playsOnIncluded = false;
      for (const dateStr of includedDates) {
        if (isTeamPlayingOnDate(teamCode, dateStr)) {
          playsOnIncluded = true;
          break;
        }
      }
      if (!playsOnIncluded) return false;
    }
    
    return true;
  }, [hasAnySelection, includedDates, excludedDates, isTeamPlayingOnDate]);

  const getPlayingDatesForTeam = useCallback((teamCode: string): string[] => {
    return scheduleDates
      .filter(sd => isTeamPlayingOnDate(teamCode, sd.dateStr))
      .map(sd => sd.dateStr);
  }, [scheduleDates, isTeamPlayingOnDate]);

  const getGamesCountForTeam = useCallback((teamCode: string): number => {
    if (!hasAnySelection) return 0;
    
    let count = 0;
    for (const dateStr of includedDates) {
      if (isTeamPlayingOnDate(teamCode, dateStr)) {
        count++;
      }
    }
    return count;
  }, [hasAnySelection, includedDates, isTeamPlayingOnDate]);

  return {
    dateSelections,
    toggleDateSelection,
    setDateMode,
    clearSelections,
    selectMultipleDates,
    includedDates,
    excludedDates,
    hasAnySelection,
    coverageGaps,
    fillCoverageGaps,
    recommendedCombos,
    applyCombo,
    matchesDateFilter,
    getPlayingDatesForTeam,
    getGamesCountForTeam,
  };
};
