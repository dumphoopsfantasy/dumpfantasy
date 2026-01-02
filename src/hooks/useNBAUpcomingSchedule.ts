import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  NBAGame, 
  fetchNBAGamesForDates, 
  formatDateForAPI, 
  getUpcomingDates, 
  getDayLabel, 
  getDateLabel,
  isTeamPlayingOnDate,
  getOpponentForTeam
} from '@/lib/nbaApi';

export interface ScheduleDate {
  date: Date;
  dateStr: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  games: NBAGame[];
  teamCount: number;
}

interface UseNBAUpcomingScheduleReturn {
  scheduleDates: ScheduleDate[];
  isLoading: boolean;
  error: string | null;
  selectedDates: Set<string>;
  toggleDate: (dateStr: string) => void;
  selectAllDates: () => void;
  clearSelectedDates: () => void;
  isTeamPlayingOnSelectedDates: (teamCode: string) => boolean;
  isTeamPlayingOnDate: (teamCode: string, dateStr: string) => boolean;
  getGamesCountForTeam: (teamCode: string) => number;
  getTeamScheduleDetails: (teamCode: string) => Array<{ date: string; opponent: string; isHome: boolean; gameTime?: string }>;
  refresh: () => void;
  lastUpdated: Date | null;
  gamesByDate: Map<string, NBAGame[]>;
}

// Cache for schedule data to avoid refetching
let cachedSchedule: Map<string, NBAGame[]> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export const useNBAUpcomingSchedule = (daysAhead: number = 7): UseNBAUpcomingScheduleReturn => {
  const [gamesByDate, setGamesByDate] = useState<Map<string, NBAGame[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const upcomingDates = useMemo(() => getUpcomingDates(daysAhead), [daysAhead]);
  const dateStrings = useMemo(() => upcomingDates.map(formatDateForAPI), [upcomingDates]);
  const todayStr = useMemo(() => formatDateForAPI(new Date()), []);

  const fetchSchedule = useCallback(async (force: boolean = false) => {
    // Use cache if available and fresh
    const now = Date.now();
    if (!force && cachedSchedule && (now - cacheTimestamp) < CACHE_DURATION_MS) {
      setGamesByDate(cachedSchedule);
      setLastUpdated(new Date(cacheTimestamp));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const results = await fetchNBAGamesForDates(dateStrings);
      cachedSchedule = results;
      cacheTimestamp = now;
      setGamesByDate(results);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch NBA schedule:', err);
      setError('Failed to load NBA schedule');
    } finally {
      setIsLoading(false);
    }
  }, [dateStrings]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // Auto-select today by default
  useEffect(() => {
    if (gamesByDate.size > 0 && selectedDates.size === 0) {
      setSelectedDates(new Set([todayStr]));
    }
  }, [gamesByDate, todayStr, selectedDates.size]);

  const scheduleDates: ScheduleDate[] = useMemo(() => {
    return upcomingDates.map((date, index) => {
      const dateStr = dateStrings[index];
      const games = gamesByDate.get(dateStr) || [];
      
      // Count unique teams playing
      const teamsPlaying = new Set<string>();
      games.forEach(game => {
        teamsPlaying.add(game.homeTeam);
        teamsPlaying.add(game.awayTeam);
      });

      return {
        date,
        dateStr,
        dayLabel: getDayLabel(date),
        dateLabel: getDateLabel(date),
        isToday: dateStr === todayStr,
        games,
        teamCount: teamsPlaying.size,
      };
    });
  }, [upcomingDates, dateStrings, gamesByDate, todayStr]);

  const toggleDate = useCallback((dateStr: string) => {
    setSelectedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateStr)) {
        newSet.delete(dateStr);
      } else {
        newSet.add(dateStr);
      }
      return newSet;
    });
  }, []);

  const selectAllDates = useCallback(() => {
    setSelectedDates(new Set(dateStrings));
  }, [dateStrings]);

  const clearSelectedDates = useCallback(() => {
    setSelectedDates(new Set());
  }, []);

  const isTeamPlayingOnSelectedDates = useCallback((teamCode: string): boolean => {
    if (selectedDates.size === 0) return true; // No filter = show all
    
    for (const dateStr of selectedDates) {
      const games = gamesByDate.get(dateStr) || [];
      if (isTeamPlayingOnDate(teamCode, games)) {
        return true;
      }
    }
    return false;
  }, [selectedDates, gamesByDate]);

  // Single-date version for streaming schedule hook
  const isTeamPlayingOnDateSingle = useCallback((teamCode: string, dateStr: string): boolean => {
    const games = gamesByDate.get(dateStr) || [];
    return isTeamPlayingOnDate(teamCode, games);
  }, [gamesByDate]);

  const getGamesCountForTeam = useCallback((teamCode: string): number => {
    if (selectedDates.size === 0) return 0;
    
    let count = 0;
    for (const dateStr of selectedDates) {
      const games = gamesByDate.get(dateStr) || [];
      if (isTeamPlayingOnDate(teamCode, games)) {
        count++;
      }
    }
    return count;
  }, [selectedDates, gamesByDate]);

  const getTeamScheduleDetails = useCallback((teamCode: string): Array<{ date: string; opponent: string; isHome: boolean; gameTime?: string }> => {
    const details: Array<{ date: string; opponent: string; isHome: boolean; gameTime?: string }> = [];
    
    for (const dateStr of selectedDates) {
      const games = gamesByDate.get(dateStr) || [];
      const match = getOpponentForTeam(teamCode, games);
      if (match) {
        details.push({
          date: dateStr,
          opponent: match.opponent,
          isHome: match.isHome,
          gameTime: match.gameTime,
        });
      }
    }
    
    return details;
  }, [selectedDates, gamesByDate]);

  const refresh = useCallback(() => {
    fetchSchedule(true);
  }, [fetchSchedule]);

  return {
    scheduleDates,
    isLoading,
    error,
    selectedDates,
    toggleDate,
    selectAllDates,
    clearSelectedDates,
    isTeamPlayingOnSelectedDates,
    isTeamPlayingOnDate: isTeamPlayingOnDateSingle,
    getGamesCountForTeam,
    getTeamScheduleDetails,
    refresh,
    lastUpdated,
    gamesByDate,
  };
};
