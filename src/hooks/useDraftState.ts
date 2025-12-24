import { useState, useCallback, useMemo } from 'react';
import { usePersistedState } from './usePersistedState';
import {
  DraftPlayer,
  DraftSettings,
  DraftState,
  DEFAULT_DRAFT_SETTINGS,
  ParsedRankingPlayer,
  normalizePlayerName,
  calculateValueDelta,
  calculateReachDelta,
  getTierFromRank,
} from '@/types/draft';

const STORAGE_KEY = 'dumphoops-draft';

interface UseDraftStateReturn {
  // State
  settings: DraftSettings;
  players: DraftPlayer[];
  currentPick: number;
  draftStarted: boolean;
  
  // Settings actions
  updateSettings: (settings: Partial<DraftSettings>) => void;
  
  // Player data actions
  importCrisRankings: (data: ParsedRankingPlayer[]) => void;
  importAdpRankings: (data: ParsedRankingPlayer[]) => void;
  importLastYearRankings: (data: ParsedRankingPlayer[]) => void;
  clearAllData: () => void;
  
  // Draft actions
  startDraft: () => void;
  resetDraft: () => void;
  markDrafted: (playerName: string, draftedBy?: string) => void;
  undoDraft: (playerName: string) => void;
  advancePick: () => void;
  
  // Computed
  availablePlayers: DraftPlayer[];
  draftedPlayers: DraftPlayer[];
  myDraftedPlayers: DraftPlayer[];
}

export function useDraftState(): UseDraftStateReturn {
  const [state, setState] = usePersistedState<DraftState>(STORAGE_KEY, {
    settings: DEFAULT_DRAFT_SETTINGS,
    players: [],
    currentPick: 1,
    draftStarted: false,
  });

  const updateSettings = useCallback((newSettings: Partial<DraftSettings>) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...newSettings },
    }));
  }, [setState]);

  // Merge new rankings into existing players
  const mergeRankings = useCallback((
    existingPlayers: DraftPlayer[],
    newData: ParsedRankingPlayer[],
    rankField: 'crisRank' | 'adpRank' | 'lastYearRank'
  ): DraftPlayer[] => {
    const playerMap = new Map<string, DraftPlayer>();
    
    // Add existing players
    existingPlayers.forEach(p => {
      playerMap.set(normalizePlayerName(p.playerName), p);
    });
    
    // Merge new data
    newData.forEach(p => {
      const key = normalizePlayerName(p.playerName);
      const existing = playerMap.get(key);
      
      if (existing) {
        // Update existing player
        playerMap.set(key, {
          ...existing,
          [rankField]: p.rank,
          // Update team/position if we have new data
          team: p.team || existing.team,
          position: p.position || existing.position,
          status: p.status || existing.status,
        });
      } else {
        // Create new player
        const newPlayer: DraftPlayer = {
          playerName: p.playerName,
          team: p.team,
          position: p.position,
          status: p.status,
          crisRank: null,
          adpRank: null,
          lastYearRank: null,
          valueDelta: null,
          reachDelta: null,
          tier: 6,
          drafted: false,
          draftedBy: null,
          draftedAt: null,
          [rankField]: p.rank,
        };
        playerMap.set(key, newPlayer);
      }
    });
    
    // Recalculate derived fields for all players
    const result: DraftPlayer[] = [];
    playerMap.forEach(player => {
      const valueDelta = calculateValueDelta(player.adpRank, player.crisRank);
      const reachDelta = calculateReachDelta(player.crisRank, player.adpRank);
      const primaryRank = player.crisRank ?? player.adpRank ?? player.lastYearRank ?? 999;
      const tier = getTierFromRank(primaryRank);
      
      result.push({
        ...player,
        valueDelta,
        reachDelta,
        tier,
      });
    });
    
    // Sort by primary rank
    result.sort((a, b) => {
      const aRank = a.crisRank ?? a.adpRank ?? a.lastYearRank ?? 999;
      const bRank = b.crisRank ?? b.adpRank ?? b.lastYearRank ?? 999;
      return aRank - bRank;
    });
    
    return result;
  }, []);

  const importCrisRankings = useCallback((data: ParsedRankingPlayer[]) => {
    setState(prev => ({
      ...prev,
      players: mergeRankings(prev.players, data, 'crisRank'),
    }));
  }, [setState, mergeRankings]);

  const importAdpRankings = useCallback((data: ParsedRankingPlayer[]) => {
    setState(prev => ({
      ...prev,
      players: mergeRankings(prev.players, data, 'adpRank'),
    }));
  }, [setState, mergeRankings]);

  const importLastYearRankings = useCallback((data: ParsedRankingPlayer[]) => {
    setState(prev => ({
      ...prev,
      players: mergeRankings(prev.players, data, 'lastYearRank'),
    }));
  }, [setState, mergeRankings]);

  const clearAllData = useCallback(() => {
    setState({
      settings: DEFAULT_DRAFT_SETTINGS,
      players: [],
      currentPick: 1,
      draftStarted: false,
    });
  }, [setState]);

  const startDraft = useCallback(() => {
    setState(prev => ({
      ...prev,
      draftStarted: true,
      currentPick: 1,
      players: prev.players.map(p => ({
        ...p,
        drafted: false,
        draftedBy: null,
        draftedAt: null,
      })),
    }));
  }, [setState]);

  const resetDraft = useCallback(() => {
    setState(prev => ({
      ...prev,
      draftStarted: false,
      currentPick: 1,
      players: prev.players.map(p => ({
        ...p,
        drafted: false,
        draftedBy: null,
        draftedAt: null,
      })),
    }));
  }, [setState]);

  const markDrafted = useCallback((playerName: string, draftedBy?: string) => {
    setState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        normalizePlayerName(p.playerName) === normalizePlayerName(playerName)
          ? {
              ...p,
              drafted: true,
              draftedBy: draftedBy || null,
              draftedAt: prev.currentPick,
            }
          : p
      ),
    }));
  }, [setState]);

  const undoDraft = useCallback((playerName: string) => {
    setState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        normalizePlayerName(p.playerName) === normalizePlayerName(playerName)
          ? {
              ...p,
              drafted: false,
              draftedBy: null,
              draftedAt: null,
            }
          : p
      ),
    }));
  }, [setState]);

  const advancePick = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentPick: prev.currentPick + 1,
    }));
  }, [setState]);

  // Computed values
  const availablePlayers = useMemo(() => 
    state.players.filter(p => !p.drafted),
    [state.players]
  );

  const draftedPlayers = useMemo(() => 
    state.players.filter(p => p.drafted).sort((a, b) => (a.draftedAt ?? 0) - (b.draftedAt ?? 0)),
    [state.players]
  );

  const myDraftedPlayers = useMemo(() => 
    state.players.filter(p => p.drafted && p.draftedBy === 'me'),
    [state.players]
  );

  return {
    settings: state.settings,
    players: state.players,
    currentPick: state.currentPick,
    draftStarted: state.draftStarted,
    updateSettings,
    importCrisRankings,
    importAdpRankings,
    importLastYearRankings,
    clearAllData,
    startDraft,
    resetDraft,
    markDrafted,
    undoDraft,
    advancePick,
    availablePlayers,
    draftedPlayers,
    myDraftedPlayers,
  };
}
