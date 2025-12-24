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
  getTierFromRank,
  generatePlayerId,
  PickHistoryEntry,
  PlayerStats,
} from '@/types/draft';

const STORAGE_KEY = 'dumphoops-draft';

interface UseDraftStateReturn {
  // State
  settings: DraftSettings;
  players: DraftPlayer[];
  currentPick: number;
  draftStarted: boolean;
  pickHistory: PickHistoryEntry[];
  
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
  markDrafted: (playerName: string, draftedBy: 'me' | 'other') => void;
  undoLastPick: () => void;
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
    pickHistory: [],
  });

  // Ensure pickHistory exists (for backwards compatibility with old localStorage data)
  const pickHistory = state.pickHistory ?? [];

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
    rankField: 'crisRank' | 'adpRank' | 'lastYearRank',
    statsField?: 'crisStats' | 'lastYearStats'
  ): DraftPlayer[] => {
    const playerMap = new Map<string, DraftPlayer>();
    
    // Add existing players
    existingPlayers.forEach(p => {
      playerMap.set(p.normalizedName, p);
    });
    
    // Merge new data
    newData.forEach(p => {
      const normalized = normalizePlayerName(p.playerName);
      const existing = playerMap.get(normalized);
      
      if (existing) {
        // Update existing player
        const updated: DraftPlayer = {
          ...existing,
          [rankField]: p.rank,
          // Update team/position if we have new data
          team: p.team || existing.team,
          position: p.position || existing.position,
          status: p.status || existing.status,
        };
        
        // Add stats if provided
        if (statsField && p.stats) {
          updated[statsField] = p.stats;
        }
        
        // Add ADP-specific fields
        if (rankField === 'adpRank') {
          updated.avgPick = p.avgPick ?? existing.avgPick;
          updated.rostPct = p.rostPct ?? existing.rostPct;
        }
        
        playerMap.set(normalized, updated);
      } else {
        // Create new player
        const newPlayer: DraftPlayer = {
          playerId: generatePlayerId(p.playerName),
          playerName: p.playerName,
          normalizedName: normalized,
          team: p.team,
          position: p.position,
          status: p.status,
          crisRank: null,
          adpRank: null,
          lastYearRank: null,
          crisStats: null,
          lastYearStats: null,
          avgPick: null,
          rostPct: null,
          valueDelta: null,
          deltaCRI: null,
          deltaWCRI: null,
          tier: 6,
          drafted: false,
          draftedBy: null,
          draftedAt: null,
          [rankField]: p.rank,
        };
        
        // Add stats if provided
        if (statsField && p.stats) {
          newPlayer[statsField] = p.stats;
        }
        
        // Add ADP-specific fields
        if (rankField === 'adpRank') {
          newPlayer.avgPick = p.avgPick ?? null;
          newPlayer.rostPct = p.rostPct ?? null;
        }
        
        playerMap.set(normalized, newPlayer);
      }
    });
    
    // Recalculate derived fields for all players
    const result: DraftPlayer[] = [];
    playerMap.forEach(player => {
      const valueDelta = calculateValueDelta(player.adpRank, player.crisRank);
      const deltaCRI = valueDelta; // Explicit naming
      const deltaWCRI = calculateValueDelta(player.adpRank, player.crisRank); // For now same as CRI, can add wcriRank later
      const primaryRank = player.crisRank ?? player.adpRank ?? player.lastYearRank ?? 999;
      const tier = getTierFromRank(primaryRank);
      
      result.push({
        ...player,
        valueDelta,
        deltaCRI,
        deltaWCRI,
        tier,
      });
    });
    
    // Sort by deltaCRI descending (best value first) when available, else by primary rank
    result.sort((a, b) => {
      // If both have deltaCRI, sort by that (higher = better value)
      if (a.deltaCRI !== null && b.deltaCRI !== null) {
        return b.deltaCRI - a.deltaCRI;
      }
      // Fallback to primary rank
      const aRank = a.crisRank ?? a.adpRank ?? a.lastYearRank ?? 999;
      const bRank = b.crisRank ?? b.adpRank ?? b.lastYearRank ?? 999;
      return aRank - bRank;
    });
    
    return result;
  }, []);

  const importCrisRankings = useCallback((data: ParsedRankingPlayer[]) => {
    setState(prev => ({
      ...prev,
      players: mergeRankings(prev.players, data, 'crisRank', 'crisStats'),
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
      players: mergeRankings(prev.players, data, 'lastYearRank', 'lastYearStats'),
    }));
  }, [setState, mergeRankings]);

  const clearAllData = useCallback(() => {
    setState({
      settings: DEFAULT_DRAFT_SETTINGS,
      players: [],
      currentPick: 1,
      draftStarted: false,
      pickHistory: [],
    });
  }, [setState]);

  const startDraft = useCallback(() => {
    setState(prev => ({
      ...prev,
      draftStarted: true,
      currentPick: 1,
      pickHistory: [],
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
      pickHistory: [],
      players: prev.players.map(p => ({
        ...p,
        drafted: false,
        draftedBy: null,
        draftedAt: null,
      })),
    }));
  }, [setState]);

  const markDrafted = useCallback((playerName: string, draftedBy: 'me' | 'other') => {
    setState(prev => {
      const normalized = normalizePlayerName(playerName);
      const player = prev.players.find(p => p.normalizedName === normalized);
      
      if (!player) return prev;
      
      const historyEntry: PickHistoryEntry = {
        pickNumber: prev.currentPick,
        playerId: player.playerId,
        playerName: player.playerName,
        draftedBy,
      };
      
      return {
        ...prev,
        pickHistory: [...prev.pickHistory, historyEntry],
        players: prev.players.map(p =>
          p.normalizedName === normalized
            ? {
                ...p,
                drafted: true,
                draftedBy,
                draftedAt: prev.currentPick,
              }
            : p
        ),
      };
    });
  }, [setState]);

  const undoLastPick = useCallback(() => {
    setState(prev => {
      if (prev.pickHistory.length === 0) return prev;
      
      const lastPick = prev.pickHistory[prev.pickHistory.length - 1];
      const newHistory = prev.pickHistory.slice(0, -1);
      
      return {
        ...prev,
        currentPick: Math.max(1, prev.currentPick - 1),
        pickHistory: newHistory,
        players: prev.players.map(p =>
          p.playerId === lastPick.playerId
            ? {
                ...p,
                drafted: false,
                draftedBy: null,
                draftedAt: null,
              }
            : p
        ),
      };
    });
  }, [setState]);

  const undoDraft = useCallback((playerName: string) => {
    setState(prev => {
      const normalized = normalizePlayerName(playerName);
      const player = prev.players.find(p => p.normalizedName === normalized);
      
      if (!player) return prev;
      
      return {
        ...prev,
        pickHistory: prev.pickHistory.filter(h => h.playerId !== player.playerId),
        players: prev.players.map(p =>
          p.normalizedName === normalized
            ? {
                ...p,
                drafted: false,
                draftedBy: null,
                draftedAt: null,
              }
            : p
        ),
      };
    });
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
    pickHistory,
    updateSettings,
    importCrisRankings,
    importAdpRankings,
    importLastYearRankings,
    clearAllData,
    startDraft,
    resetDraft,
    markDrafted,
    undoLastPick,
    undoDraft,
    advancePick,
    availablePlayers,
    draftedPlayers,
    myDraftedPlayers,
  };
}