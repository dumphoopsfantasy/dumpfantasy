import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  NBAGame, 
  fetchNBAGamesFromAPI,
  getSampleYesterdayScores, 
  getSampleTodayGames 
} from "@/lib/nbaApi";

interface RosterPlayer {
  name: string;
  team: string;
  position?: string;
}

interface GameWithPlayers extends NBAGame {
  matchingPlayers: RosterPlayer[];
  originalTipTime?: string;
}

interface ScheduleState {
  yesterdayGames: GameWithPlayers[];
  todayGames: GameWithPlayers[];
  yesterdayDate: string;
  todayDate: string;
  isLoading: boolean;
  lastUpdated: Date | null;
  usingLiveData: boolean;
  error: string | null;
}

// Global state to share across components
let globalState: ScheduleState = {
  yesterdayGames: [],
  todayGames: [],
  yesterdayDate: "",
  todayDate: "",
  isLoading: false,
  lastUpdated: null,
  usingLiveData: false,
  error: null,
};

let globalListeners: Set<() => void> = new Set();
let fetchPromise: Promise<void> | null = null;

const notifyListeners = () => {
  globalListeners.forEach(listener => listener());
};

export function useNBASchedule(rosterPlayers: RosterPlayer[] = []) {
  const [, forceUpdate] = useState({});
  
  // Subscribe to global state changes
  useEffect(() => {
    const listener = () => forceUpdate({});
    globalListeners.add(listener);
    return () => {
      globalListeners.delete(listener);
    };
  }, []);

  // Find matching roster players for a game
  const findMatchingPlayers = useCallback((homeTeam: string, awayTeam: string): RosterPlayer[] => {
    if (rosterPlayers.length === 0) return [];
    return rosterPlayers.filter(player => {
      const playerTeam = player.team?.toUpperCase();
      return playerTeam === homeTeam.toUpperCase() || playerTeam === awayTeam.toUpperCase();
    });
  }, [rosterPlayers]);

  // Fetch schedule data (shared across all consumers)
  const fetchSchedule = useCallback(async (force = false) => {
    // If already fetching, wait for that promise
    if (fetchPromise && !force) {
      await fetchPromise;
      return;
    }

    // If we have fresh data (less than 2 minutes old), don't refetch unless forced
    if (!force && globalState.lastUpdated) {
      const age = Date.now() - globalState.lastUpdated.getTime();
      if (age < 2 * 60 * 1000 && globalState.todayGames.length > 0) {
        return;
      }
    }

    globalState = { ...globalState, isLoading: true, error: null };
    notifyListeners();

    fetchPromise = (async () => {
      try {
        const apiData = await fetchNBAGamesFromAPI();
        
        if (apiData) {
          const yesterdayWithPlayers: GameWithPlayers[] = apiData.yesterday.games.map(g => ({
            ...g,
            matchingPlayers: findMatchingPlayers(g.homeTeam, g.awayTeam),
            originalTipTime: g.gameTime !== 'Final' && g.gameTime !== 'Final/OT' ? g.gameTime : undefined
          }));
          
          const todayWithPlayers: GameWithPlayers[] = apiData.today.games.map(g => ({
            ...g,
            matchingPlayers: findMatchingPlayers(g.homeTeam, g.awayTeam),
            originalTipTime: g.gameTime
          }));
          
          globalState = {
            ...globalState,
            yesterdayGames: yesterdayWithPlayers,
            todayGames: todayWithPlayers,
            yesterdayDate: apiData.yesterday.date,
            todayDate: apiData.today.date,
            isLoading: false,
            lastUpdated: new Date(),
            usingLiveData: true,
            error: null,
          };
        } else {
          // Fall back to sample data
          const sampleYesterday = getSampleYesterdayScores().map(g => ({
            ...g,
            matchingPlayers: findMatchingPlayers(g.homeTeam, g.awayTeam)
          }));
          const sampleToday = getSampleTodayGames().map(g => ({
            gameId: g.gameId,
            homeTeam: g.homeTeam,
            awayTeam: g.awayTeam,
            homeScore: 0,
            awayScore: 0,
            status: 'Scheduled',
            gameTime: g.gameTime,
            matchingPlayers: findMatchingPlayers(g.homeTeam, g.awayTeam),
            originalTipTime: g.gameTime
          }));
          
          globalState = {
            ...globalState,
            yesterdayGames: sampleYesterday,
            todayGames: sampleToday,
            yesterdayDate: new Date(Date.now() - 86400000).toISOString().split('T')[0],
            todayDate: new Date().toISOString().split('T')[0],
            isLoading: false,
            lastUpdated: new Date(),
            usingLiveData: false,
            error: null,
          };
        }
      } catch (error) {
        console.error("Error fetching NBA schedule:", error);
        globalState = {
          ...globalState,
          isLoading: false,
          error: "Failed to fetch schedule",
          lastUpdated: new Date(),
        };
      }
      
      fetchPromise = null;
      notifyListeners();
    })();

    await fetchPromise;
  }, [findMatchingPlayers]);

  // Auto-fetch on mount if stale or empty
  useEffect(() => {
    const isStale = !globalState.lastUpdated || 
      (Date.now() - globalState.lastUpdated.getTime() > 5 * 60 * 1000);
    
    if (globalState.todayGames.length === 0 || isStale) {
      fetchSchedule();
    }
  }, [fetchSchedule]);

  // Memoize derived data - teams playing today
  const teamsPlayingToday = useMemo(() => {
    const teams = new Set<string>();
    globalState.todayGames.forEach(game => {
      teams.add(game.homeTeam.toUpperCase());
      teams.add(game.awayTeam.toUpperCase());
    });
    return teams;
  }, [globalState.todayGames]);

  // Check if a team has a game today
  const teamHasGameToday = useCallback((teamCode: string): boolean => {
    return teamsPlayingToday.has(teamCode.toUpperCase());
  }, [teamsPlayingToday]);

  // Get game info for a team
  const getGameForTeam = useCallback((teamCode: string): GameWithPlayers | null => {
    const upperTeam = teamCode.toUpperCase();
    return globalState.todayGames.find(
      g => g.homeTeam.toUpperCase() === upperTeam || g.awayTeam.toUpperCase() === upperTeam
    ) || null;
  }, []);

  return {
    ...globalState,
    fetchSchedule,
    teamHasGameToday,
    getGameForTeam,
    teamsPlayingToday,
    hasScheduleData: globalState.todayGames.length > 0 || globalState.usingLiveData,
  };
}
