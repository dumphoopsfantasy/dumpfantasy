/**
 * Hook for Schedule-Aware Projections
 * 
 * Combines roster data with NBA schedule to project weekly totals
 */

import { useMemo, useCallback } from 'react';
import { RosterSlot } from '@/types/fantasy';
import { useNBAUpcomingSchedule } from '@/hooks/useNBAUpcomingSchedule';
import {
  projectWeek,
  WeekProjectionResult,
  getMatchupWeekDates,
  getRemainingMatchupDates,
} from '@/lib/scheduleAwareProjection';

interface UseScheduleAwareProjectionProps {
  roster: RosterSlot[];
  opponentRoster?: RosterSlot[];
}

interface ProjectionComparison {
  myProjection: WeekProjectionResult | null;
  oppProjection: WeekProjectionResult | null;
  weekDates: string[];
  remainingDates: string[];
  isLoading: boolean;
  error: string | null;
}

export function useScheduleAwareProjection({
  roster,
  opponentRoster,
}: UseScheduleAwareProjectionProps): ProjectionComparison {
  // Get schedule for the full week (7 days from today to cover remaining week)
  const { gamesByDate, isLoading, error } = useNBAUpcomingSchedule(7);
  
  const weekDates = useMemo(() => getMatchupWeekDates(), []);
  const remainingDates = useMemo(() => getRemainingMatchupDates(), []);
  
  // Project my team
  const myProjection = useMemo(() => {
    if (roster.length === 0 || gamesByDate.size === 0) return null;
    
    return projectWeek({
      roster,
      weekDates: remainingDates, // Only project remaining days
      gamesByDate,
    });
  }, [roster, remainingDates, gamesByDate]);
  
  // Project opponent team
  const oppProjection = useMemo(() => {
    if (!opponentRoster || opponentRoster.length === 0 || gamesByDate.size === 0) return null;
    
    return projectWeek({
      roster: opponentRoster,
      weekDates: remainingDates,
      gamesByDate,
    });
  }, [opponentRoster, remainingDates, gamesByDate]);
  
  return {
    myProjection,
    oppProjection,
    weekDates,
    remainingDates,
    isLoading,
    error,
  };
}

// Standalone projection function for one-off use
export function useProjectRoster(roster: RosterSlot[]): {
  projection: WeekProjectionResult | null;
  isLoading: boolean;
  error: string | null;
} {
  const { gamesByDate, isLoading, error } = useNBAUpcomingSchedule(7);
  const remainingDates = useMemo(() => getRemainingMatchupDates(), []);
  
  const projection = useMemo(() => {
    if (roster.length === 0 || gamesByDate.size === 0) return null;
    
    return projectWeek({
      roster,
      weekDates: remainingDates,
      gamesByDate,
    });
  }, [roster, remainingDates, gamesByDate]);
  
  return { projection, isLoading, error };
}
