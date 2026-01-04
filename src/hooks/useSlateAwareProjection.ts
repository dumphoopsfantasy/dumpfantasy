/**
 * Hook for Slate-Aware Projections
 * 
 * Extends schedule-aware projections with live game status tracking
 * to prevent double-counting during live slates.
 */

import { useMemo } from 'react';
import { RosterSlot } from '@/types/fantasy';
import { useNBAUpcomingSchedule } from '@/hooks/useNBAUpcomingSchedule';
import {
  WeekProjectionResult,
  ProjectionError,
  getRemainingMatchupDates,
  validateProjectionInput,
} from '@/lib/scheduleAwareProjection';
import {
  projectSlateAware,
  SlateStatus,
  buildSlateStatus,
  getProjectionExplanation,
} from '@/lib/slateAwareProjection';
import { devLog, devWarn } from '@/lib/devLog';

interface UseSlateAwareProjectionProps {
  roster: RosterSlot[];
  opponentRoster?: RosterSlot[];
}

interface SlateAwareProjectionResult {
  myProjection: WeekProjectionResult | null;
  myError: ProjectionError | null;
  oppProjection: WeekProjectionResult | null;
  oppError: ProjectionError | null;
  slateStatus: SlateStatus | null;
  todayDate: string;
  remainingDates: string[];
  excludedStartedGames: { my: number; opp: number };
  includedNotStartedGames: { my: number; opp: number };
  explanation: string;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_SLATE_STATUS: SlateStatus = {
  notStarted: 0,
  inProgress: 0,
  final: 0,
  totalGames: 0,
  asOfTime: '',
  todayHasStartedGames: false,
  allTodayGamesComplete: false,
};

export function useSlateAwareProjection({
  roster,
  opponentRoster,
}: UseSlateAwareProjectionProps): SlateAwareProjectionResult {
  const { gamesByDate, isLoading, error } = useNBAUpcomingSchedule(7);
  const remainingDates = useMemo(() => getRemainingMatchupDates(), []);
  
  // Get today's date
  const todayDate = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, []);
  
  // Build slate status from today's games
  const slateStatus = useMemo(() => {
    if (gamesByDate.size === 0) return null;
    const todayGames = gamesByDate.get(todayDate) || [];
    return buildSlateStatus(todayGames, todayDate);
  }, [gamesByDate, todayDate]);
  
  // Project my team with slate awareness
  const myResult = useMemo(() => {
    if (roster.length === 0 || gamesByDate.size === 0) {
      return { 
        projection: null, 
        error: null as ProjectionError | null,
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }
    
    try {
      const result = projectSlateAware({
        roster,
        gamesByDate,
        weekDates: remainingDates,
      });
      
      devLog('[useSlateAwareProjection] My projection:', {
        totalStartedGames: result.projection.totalStartedGames,
        excludedStarted: result.excludedStartedGames,
        includedNotStarted: result.includedNotStartedGames,
      });
      
      return {
        projection: result.projection,
        error: null,
        excludedStartedGames: result.excludedStartedGames,
        includedNotStartedGames: result.includedNotStartedGames,
      };
    } catch (err) {
      devWarn('[useSlateAwareProjection] My projection failed:', err);
      return {
        projection: null,
        error: {
          code: 'SCHEDULE_MAPPING_FAILED' as const,
          message: 'Failed to project team stats',
        },
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }
  }, [roster, remainingDates, gamesByDate]);
  
  // Project opponent team with slate awareness
  const oppResult = useMemo(() => {
    if (!opponentRoster || opponentRoster.length === 0) {
      return {
        projection: null,
        error: {
          code: 'OPP_ROSTER_MISSING' as const,
          message: 'Opponent roster not imported',
        },
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }
    
    if (gamesByDate.size === 0) {
      return {
        projection: null,
        error: null as ProjectionError | null,
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }
    
    try {
      const result = projectSlateAware({
        roster: opponentRoster,
        gamesByDate,
        weekDates: remainingDates,
      });
      
      devLog('[useSlateAwareProjection] Opponent projection:', {
        totalStartedGames: result.projection.totalStartedGames,
        excludedStarted: result.excludedStartedGames,
        includedNotStarted: result.includedNotStartedGames,
      });
      
      return {
        projection: result.projection,
        error: null,
        excludedStartedGames: result.excludedStartedGames,
        includedNotStartedGames: result.includedNotStartedGames,
      };
    } catch (err) {
      devWarn('[useSlateAwareProjection] Opponent projection failed:', err);
      return {
        projection: null,
        error: {
          code: 'SCHEDULE_MAPPING_FAILED' as const,
          message: 'Failed to project opponent stats',
        },
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }
  }, [opponentRoster, remainingDates, gamesByDate]);
  
  // Get explanation based on slate status
  const explanation = useMemo(() => {
    if (!slateStatus) return '';
    return getProjectionExplanation(slateStatus);
  }, [slateStatus]);
  
  return {
    myProjection: myResult.projection,
    myError: myResult.error,
    oppProjection: oppResult.projection,
    oppError: oppResult.error,
    slateStatus,
    todayDate,
    remainingDates,
    excludedStartedGames: {
      my: myResult.excludedStartedGames,
      opp: oppResult.excludedStartedGames,
    },
    includedNotStartedGames: {
      my: myResult.includedNotStartedGames,
      opp: oppResult.includedNotStartedGames,
    },
    explanation,
    isLoading,
    error,
  };
}
