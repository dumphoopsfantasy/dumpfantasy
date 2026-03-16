/**
 * Hook for Slate-Aware Projections
 *
 * Extends schedule-aware projections with live game status tracking
 * to prevent double-counting during live slates.
 */

import { useEffect, useMemo } from 'react';
import { RosterSlot } from '@/types/fantasy';
import { useNBAUpcomingSchedule } from '@/hooks/useNBAUpcomingSchedule';
import {
  WeekProjectionResult,
  ProjectionError,
  ProjectedStats,
  fillLineupsForDay,
  normalizeNbaTeamCode,
  STANDARD_LINEUP_SLOTS,
} from '@/lib/scheduleAwareProjection';
import {
  getRemainingMatchupDatesFromSchedule,
  getPersistedScheduleDiagnostics,
  resolveActiveMatchupPeriod,
} from '@/lib/matchupWeekDates';
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
  myTodayStats: ProjectedStats | null;
  oppTodayStats: ProjectedStats | null;
  excludedStartedGames: { my: number; opp: number };
  includedNotStartedGames: { my: number; opp: number };
  explanation: string;
  isLoading: boolean;
  error: string | null;
}

function countTodayStartersWithGames(
  roster: RosterSlot[],
  dateKey: string,
  gamesByDate: Map<string, any[]>
): number {
  const games = gamesByDate.get(dateKey) || [];
  if (!games.length || !roster.length) return 0;

  const playersWithGames = roster
    .filter((slot) => slot.slotType !== 'ir')
    .filter((slot) => {
      const teamCode = normalizeNbaTeamCode(slot.player.nbaTeam);
      if (!teamCode) return false;
      return games.some((g) => g.homeTeam === teamCode || g.awayTeam === teamCode);
    })
    .map((slot) => ({
      playerId: slot.player.id,
      positions: slot.player.positions || [],
      injuryMultiplier: 1,
    }));

  return fillLineupsForDay(playersWithGames, STANDARD_LINEUP_SLOTS).size;
}

function countScheduledPlayerGames(
  roster: RosterSlot[],
  dateKeys: string[],
  gamesByDate: Map<string, any[]>
): number {
  if (!roster.length || !dateKeys.length) return 0;

  let total = 0;
  for (const slot of roster) {
    if (slot.slotType === 'ir') continue;
    const teamCode = normalizeNbaTeamCode(slot.player.nbaTeam);
    if (!teamCode) continue;

    for (const dateKey of dateKeys) {
      const games = gamesByDate.get(dateKey) || [];
      if (games.some((g) => g.homeTeam === teamCode || g.awayTeam === teamCode)) {
        total += 1;
      }
    }
  }

  return total;
}

export function useSlateAwareProjection({
  roster,
  opponentRoster,
}: UseSlateAwareProjectionProps): SlateAwareProjectionResult {
  const { gamesByDate, isLoading, error } = useNBAUpcomingSchedule(21); // 21 days to cover extended weeks (All-Star break)

  const remainingDates = getRemainingMatchupDatesFromSchedule();
  const activeMatchupPeriod = resolveActiveMatchupPeriod();
  const scheduleDiagnostics = getPersistedScheduleDiagnostics();

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

  // Projection guard: if schedule exists but active window cannot be resolved, fail closed.
  const hasUnresolvedImportedSchedule =
    scheduleDiagnostics.hasSchedule && !activeMatchupPeriod && remainingDates.length === 0;

  // Project my team with slate awareness
  const myResult = useMemo(() => {
    if (hasUnresolvedImportedSchedule) {
      return {
        projection: null,
        error: {
          code: 'NO_SCHEDULE_DATA' as const,
          message: 'Unable to resolve active matchup period from imported schedule',
        },
        todayStats: null as ProjectedStats | null,
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }

    if (roster.length === 0 || gamesByDate.size === 0 || remainingDates.length === 0) {
      return {
        projection: null,
        error: null as ProjectionError | null,
        todayStats: null as ProjectedStats | null,
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

      const todayStats = result.statsByDate.get(result.todayDate) || null;

      return {
        projection: result.projection,
        error: null,
        todayStats,
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
        todayStats: null,
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }
  }, [roster, remainingDates, gamesByDate, hasUnresolvedImportedSchedule]);

  // Project opponent team with slate awareness
  const oppResult = useMemo(() => {
    if (hasUnresolvedImportedSchedule) {
      return {
        projection: null,
        error: {
          code: 'NO_SCHEDULE_DATA' as const,
          message: 'Unable to resolve active matchup period from imported schedule',
        },
        todayStats: null as ProjectedStats | null,
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }

    if (!opponentRoster || opponentRoster.length === 0) {
      return {
        projection: null,
        error: {
          code: 'OPP_ROSTER_MISSING' as const,
          message: 'Opponent roster not imported',
        },
        todayStats: null as ProjectedStats | null,
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }

    if (gamesByDate.size === 0 || remainingDates.length === 0) {
      return {
        projection: null,
        error: null as ProjectionError | null,
        todayStats: null as ProjectedStats | null,
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

      const todayStats = result.statsByDate.get(result.todayDate) || null;

      return {
        projection: result.projection,
        error: null,
        todayStats,
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
        todayStats: null,
        excludedStartedGames: 0,
        includedNotStartedGames: 0,
      };
    }
  }, [opponentRoster, remainingDates, gamesByDate, hasUnresolvedImportedSchedule]);

  // Get explanation based on slate status
  const explanation = useMemo(() => {
    if (!slateStatus) return '';
    return getProjectionExplanation(slateStatus);
  }, [slateStatus]);

  useEffect(() => {
    const myTodayStarters = countTodayStartersWithGames(roster, todayDate, gamesByDate);
    const oppTodayStarters = countTodayStartersWithGames(opponentRoster ?? [], todayDate, gamesByDate);

    const myFutureScheduledPlayerGames = countScheduledPlayerGames(roster, remainingDates, gamesByDate);
    const oppFutureScheduledPlayerGames = countScheduledPlayerGames(opponentRoster ?? [], remainingDates, gamesByDate);

    devLog('[useSlateAwareProjection] Matchup diagnostics', {
      activeMatchupWindow: activeMatchupPeriod
        ? {
            label: activeMatchupPeriod.label,
            startDate: activeMatchupPeriod.startDate,
            endDate: activeMatchupPeriod.endDate,
            isPlayoff: activeMatchupPeriod.isPlayoff,
            playoffRound: activeMatchupPeriod.playoffRound,
            daysRemainingInclusive: activeMatchupPeriod.daysRemainingInclusive,
          }
        : null,
      parsedSchedule: scheduleDiagnostics,
      todayStartersWithGames: {
        myTeam: myTodayStarters,
        opponent: oppTodayStarters,
      },
      futureScheduledPlayerGames: {
        myTeam: myFutureScheduledPlayerGames,
        opponent: oppFutureScheduledPlayerGames,
      },
      projectionFallbackReason: hasUnresolvedImportedSchedule
        ? 'Unable to resolve active matchup period from imported schedule'
        : null,
    });
  }, [
    activeMatchupPeriod,
    scheduleDiagnostics,
    hasUnresolvedImportedSchedule,
    roster,
    opponentRoster,
    todayDate,
    gamesByDate,
    remainingDates,
  ]);

  return {
    myProjection: myResult.projection,
    myError: myResult.error,
    oppProjection: oppResult.projection,
    oppError: oppResult.error,
    slateStatus,
    todayDate,
    remainingDates,
    myTodayStats: myResult.todayStats,
    oppTodayStats: oppResult.todayStats,
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
