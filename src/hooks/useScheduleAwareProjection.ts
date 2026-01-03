/**
 * Hook for Schedule-Aware Projections
 * 
 * Combines roster data with NBA schedule to project weekly totals
 * Returns proper error states when roster/schedule data is missing
 */

import { useMemo } from 'react';
import { RosterSlot } from '@/types/fantasy';
import { useNBAUpcomingSchedule } from '@/hooks/useNBAUpcomingSchedule';
import {
  projectWeekSafe,
  WeekProjectionResult,
  ProjectionError,
  getMatchupWeekDates,
  getRemainingMatchupDates,
  validateProjectionInput,
} from '@/lib/scheduleAwareProjection';
import { devLog, devWarn } from '@/lib/devLog';

interface UseScheduleAwareProjectionProps {
  roster: RosterSlot[];
  opponentRoster?: RosterSlot[];
}

interface ProjectionComparison {
  myProjection: WeekProjectionResult | null;
  myError: ProjectionError | null;
  oppProjection: WeekProjectionResult | null;
  oppError: ProjectionError | null;
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
  
  // Debug log inputs
  useMemo(() => {
    devLog('[useScheduleAwareProjection] Input state:', {
      myRosterCount: roster.length,
      oppRosterCount: opponentRoster?.length ?? 0,
      weekDates: weekDates.length,
      remainingDates: remainingDates.length,
      scheduleLoaded: gamesByDate.size > 0,
      scheduleDates: Array.from(gamesByDate.keys()),
    });
  }, [roster.length, opponentRoster?.length, weekDates, remainingDates, gamesByDate]);
  
  // Project my team
  const { myProjection, myError } = useMemo((): { myProjection: WeekProjectionResult | null; myError: ProjectionError | null } => {
    if (roster.length === 0) {
      devLog('[useScheduleAwareProjection] My roster empty, skipping projection');
      return { myProjection: null, myError: null };
    }
    
    if (gamesByDate.size === 0) {
      devLog('[useScheduleAwareProjection] No schedule data yet');
      return { myProjection: null, myError: null };
    }
    
    const result = projectWeekSafe({
      roster,
      weekDates: remainingDates,
      gamesByDate,
    });
    
    if (result.success === true) {
      return { myProjection: result.result, myError: null };
    }
    // TypeScript now knows result.success === false, so error exists
    devWarn('[useScheduleAwareProjection] My projection failed:', result.error);
    return { myProjection: null, myError: result.error };
  }, [roster, remainingDates, gamesByDate]);
  
  // Project opponent team with explicit error states
  const { oppProjection, oppError } = useMemo((): { oppProjection: WeekProjectionResult | null; oppError: ProjectionError | null } => {
    // Hard guard: check if opponent roster is truly missing
    if (!opponentRoster || opponentRoster.length === 0) {
      devLog('[useScheduleAwareProjection] Opponent roster missing');
      return {
        oppProjection: null,
        oppError: {
          code: 'OPP_ROSTER_MISSING',
          message: 'Opponent roster not imported',
          validation: undefined,
        },
      };
    }
    
    if (gamesByDate.size === 0) {
      devLog('[useScheduleAwareProjection] No schedule data for opponent');
      return { oppProjection: null, oppError: null };
    }
    
    // Validate opponent data before projection
    const oppValidation = validateProjectionInput(opponentRoster, remainingDates, gamesByDate);
    
    devLog('[useScheduleAwareProjection] Opponent validation:', oppValidation);
    
    // Check for schedule mapping failure BEFORE running projection
    if (oppValidation.playersReceived > 0 && oppValidation.gamesFoundTotal === 0) {
      devWarn('[useScheduleAwareProjection] Opponent schedule mapping failed', oppValidation);
      return {
        oppProjection: null,
        oppError: {
          code: 'SCHEDULE_MAPPING_FAILED',
          message: `${oppValidation.unmappedPlayers.length} players missing team mapping`,
          validation: oppValidation,
        },
      };
    }
    
    const result = projectWeekSafe({
      roster: opponentRoster,
      weekDates: remainingDates,
      gamesByDate,
    });
    
    if (result.success === true) {
      return { oppProjection: result.result, oppError: null };
    }
    // TypeScript now knows result.success === false, so error exists
    devWarn('[useScheduleAwareProjection] Opponent projection failed:', result.error);
    return { oppProjection: null, oppError: result.error };
  }, [opponentRoster, remainingDates, gamesByDate]);
  
  return {
    myProjection,
    myError,
    oppProjection,
    oppError,
    weekDates,
    remainingDates,
    isLoading,
    error,
  };
}

// Standalone projection function for one-off use
export function useProjectRoster(roster: RosterSlot[]): {
  projection: WeekProjectionResult | null;
  projectionError: ProjectionError | null;
  isLoading: boolean;
  error: string | null;
} {
  const { gamesByDate, isLoading, error } = useNBAUpcomingSchedule(7);
  const remainingDates = useMemo(() => getRemainingMatchupDates(), []);
  
  const { projection, projectionError } = useMemo((): { projection: WeekProjectionResult | null; projectionError: ProjectionError | null } => {
    if (roster.length === 0 || gamesByDate.size === 0) {
      return { projection: null, projectionError: null };
    }
    
    const result = projectWeekSafe({
      roster,
      weekDates: remainingDates,
      gamesByDate,
    });
    
    if (result.success === true) {
      return { projection: result.result, projectionError: null };
    }
    return { projection: null, projectionError: result.error };
  }, [roster, remainingDates, gamesByDate]);
  
  return { projection, projectionError, isLoading, error };
}
