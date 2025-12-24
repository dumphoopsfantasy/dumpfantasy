// Draft State Hook - Manages unified player list, import, and draft

import { useCallback, useMemo } from 'react';
import { usePersistedState } from './usePersistedState';
import {
  UnifiedPlayer,
  DraftSettings,
  DraftState,
  DEFAULT_DRAFT_SETTINGS,
  ParsedPlayer,
  SourceType,
  WizardStep,
  PickEntry,
  ImportState,
  ImportSegment,
  SEGMENT_RANGES,
  getSegmentKey,
  normalizePlayerName,
  generatePlayerId,
  generateCanonicalKey,
  calculateValueDelta,
  getTeamForPick,
  TeamComposition,
} from '@/types/draft';

const STORAGE_KEY = 'dumphoops-draft-v2';
const IMPORT_STORAGE_KEY = 'dumphoops-import-v2';

interface UseDraftStateReturn {
  // State
  settings: DraftSettings;
  players: UnifiedPlayer[];
  currentPick: number;
  draftStarted: boolean;
  picks: PickEntry[];
  currentStep: WizardStep;
  importState: ImportState;
  
  // Settings actions
  updateSettings: (settings: Partial<DraftSettings>) => void;
  
  // Import actions
  setActiveSegment: (key: string | null) => void;
  updateSegmentRaw: (key: string, raw: string) => void;
  importSegment: (key: string, parsed: ParsedPlayer[], sourceType: SourceType) => ImportSegment;
  clearSegment: (key: string) => void;
  clearSource: (sourceType: SourceType) => void;
  clearAllData: () => void;
  
  // Wizard actions
  setCurrentStep: (step: WizardStep) => void;
  
  // Draft actions
  startDraft: () => void;
  resetDraft: () => void;
  draftPlayer: (playerId: string, draftedBy: 'me' | number) => void;
  undoLastPick: () => void;
  undoDraft: (playerId: string) => void;
  advancePick: () => void;
  
  // Computed
  availablePlayers: UnifiedPlayer[];
  draftedPlayers: UnifiedPlayer[];
  myDraftedPlayers: UnifiedPlayer[];
  teamCompositions: TeamComposition[];
  getPlayerById: (id: string) => UnifiedPlayer | undefined;
  getSourceCounts: () => { projections: number; adp: number; lastYear: number };
}

const initialImportState: ImportState = {
  segments: {},
  activeSegmentKey: null,
};

const initialDraftState: DraftState = {
  settings: DEFAULT_DRAFT_SETTINGS,
  players: [],
  currentPick: 1,
  draftStarted: false,
  picks: [],
  currentStep: 'import',
};

export function useDraftState(): UseDraftStateReturn {
  const [state, setState] = usePersistedState<DraftState>(STORAGE_KEY, initialDraftState);
  // Persist import state so users don't lose pasted data on refresh
  const [importState, setImportState] = usePersistedState<ImportState>(IMPORT_STORAGE_KEY, initialImportState);
  
  // Ensure backwards compatibility
  const currentStep = state.currentStep ?? 'import';
  const picks = state.picks ?? [];

  // ============ SETTINGS ============
  const updateSettings = useCallback((newSettings: Partial<DraftSettings>) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...newSettings },
    }));
  }, [setState]);

  // ============ IMPORT ============
  const setActiveSegment = useCallback((key: string | null) => {
    setImportState(prev => ({ ...prev, activeSegmentKey: key }));
  }, []);

  const updateSegmentRaw = useCallback((key: string, raw: string) => {
    setImportState(prev => ({
      ...prev,
      segments: {
        ...prev.segments,
        [key]: {
          ...prev.segments[key],
          raw,
          status: raw.trim() ? 'empty' : 'empty',
        } as ImportSegment,
      },
    }));
  }, []);

  const importSegment = useCallback((
    key: string,
    parsed: ParsedPlayer[],
    sourceType: SourceType
  ): ImportSegment => {
    let matchedCount = 0;
    let newCount = 0;
    
    setState(prevState => {
      const playerMap = new Map<string, UnifiedPlayer>();
      
      // Add existing players to map
      prevState.players.forEach(p => {
        playerMap.set(p.id, p);
      });
      
      // Merge new players
      for (const p of parsed) {
        const normalized = normalizePlayerName(p.playerName);
        const canonicalKey = generateCanonicalKey(p.playerName, p.team);
        const id = generatePlayerId(p.playerName);
        
        // Try to find existing player
        let existing = playerMap.get(id);
        if (!existing) {
          // Try by canonical key
          for (const [_, player] of playerMap) {
            if (generateCanonicalKey(player.name, player.team) === canonicalKey ||
                player.nameNormalized === normalized) {
              existing = player;
              break;
            }
          }
        }
        
        if (existing) {
          matchedCount++;
          // Update existing player with new source data
          const updated = { ...existing };
          
          if (sourceType === 'projections') {
            updated.sources = {
              ...updated.sources,
              projections: {
                rank: p.rank,
                stats: p.stats || null,
              },
            };
            updated.crisRank = p.rank;
          } else if (sourceType === 'adp') {
            updated.sources = {
              ...updated.sources,
              adp: {
                rank: p.rank,
                avgPick: p.avgPick ?? null,
                rostPct: p.rostPct ?? null,
              },
            };
            updated.adpRank = p.rank;
          } else if (sourceType === 'lastYear') {
            updated.sources = {
              ...updated.sources,
              lastYear: {
                rank: p.rank,
                stats: p.stats || null,
              },
            };
            updated.lastYearRank = p.rank;
          }
          
          // Update team/positions if we have new data
          if (p.team && !updated.team) updated.team = p.team;
          if (p.positions.length > 0) {
            updated.positions = [...new Set([...updated.positions, ...p.positions])];
          }
          if (p.status) updated.status = p.status;
          
          // Recalculate value deltas
          updated.valueVsAdp = calculateValueDelta(updated.adpRank, updated.crisRank);
          updated.valueVsLastYear = calculateValueDelta(updated.adpRank, updated.lastYearRank);
          
          playerMap.set(updated.id, updated);
        } else {
          newCount++;
          // Create new player
          const newPlayer: UnifiedPlayer = {
            id,
            name: p.playerName,
            nameNormalized: normalized,
            team: p.team,
            positions: p.positions,
            status: p.status,
            sources: {
              projections: sourceType === 'projections' ? { rank: p.rank, stats: p.stats || null } : null,
              adp: sourceType === 'adp' ? { rank: p.rank, avgPick: p.avgPick ?? null, rostPct: p.rostPct ?? null } : null,
              lastYear: sourceType === 'lastYear' ? { rank: p.rank, stats: p.stats || null } : null,
            },
            crisRank: sourceType === 'projections' ? p.rank : null,
            adpRank: sourceType === 'adp' ? p.rank : null,
            lastYearRank: sourceType === 'lastYear' ? p.rank : null,
            valueVsAdp: null,
            valueVsLastYear: null,
            drafted: false,
            draftedBy: null,
            draftedAt: null,
          };
          
          playerMap.set(id, newPlayer);
        }
      }
      
      // Convert back to array and sort by value
      const players = Array.from(playerMap.values());
      players.sort((a, b) => {
        // Sort by valueVsAdp descending (best value first)
        if (a.valueVsAdp !== null && b.valueVsAdp !== null) {
          return b.valueVsAdp - a.valueVsAdp;
        }
        // Fallback to CRIS rank
        const aRank = a.crisRank ?? a.adpRank ?? a.lastYearRank ?? 999;
        const bRank = b.crisRank ?? b.adpRank ?? b.lastYearRank ?? 999;
        return aRank - bRank;
      });
      
      return { ...prevState, players };
    });
    
    const segment: ImportSegment = {
      sourceType,
      segmentIndex: parseInt(key.split('_')[1]) || 0,
      raw: importState.segments[key]?.raw || '',
      status: 'parsed',
      parsedCount: parsed.length,
      matchedCount,
      newCount,
      dupeCount: 0,
      errors: [],
    };
    
    setImportState(prev => ({
      ...prev,
      segments: { ...prev.segments, [key]: segment },
    }));
    
    return segment;
  }, [setState, importState.segments]);

  const clearSegment = useCallback((key: string) => {
    setImportState(prev => ({
      ...prev,
      segments: {
        ...prev.segments,
        [key]: {
          ...prev.segments[key],
          raw: '',
          status: 'empty',
          parsedCount: 0,
          matchedCount: 0,
          newCount: 0,
          dupeCount: 0,
          errors: [],
        } as ImportSegment,
      },
    }));
  }, []);

  const clearSource = useCallback((sourceType: SourceType) => {
    // Clear all segments for this source
    setImportState(prev => {
      const newSegments = { ...prev.segments };
      for (let i = 0; i < 4; i++) {
        const key = getSegmentKey(sourceType, i);
        if (newSegments[key]) {
          newSegments[key] = {
            ...newSegments[key],
            raw: '',
            status: 'empty',
            parsedCount: 0,
            matchedCount: 0,
            newCount: 0,
            dupeCount: 0,
            errors: [],
          };
        }
      }
      return { ...prev, segments: newSegments };
    });
    
    // Remove source data from players
    setState(prev => ({
      ...prev,
      players: prev.players.map(p => {
        const updated = { ...p };
        if (sourceType === 'projections') {
          updated.sources = { ...updated.sources, projections: null };
          updated.crisRank = null;
        } else if (sourceType === 'adp') {
          updated.sources = { ...updated.sources, adp: null };
          updated.adpRank = null;
        } else if (sourceType === 'lastYear') {
          updated.sources = { ...updated.sources, lastYear: null };
          updated.lastYearRank = null;
        }
        updated.valueVsAdp = calculateValueDelta(updated.adpRank, updated.crisRank);
        updated.valueVsLastYear = calculateValueDelta(updated.adpRank, updated.lastYearRank);
        return updated;
      }).filter(p => 
        p.sources.projections !== null || 
        p.sources.adp !== null || 
        p.sources.lastYear !== null
      ),
    }));
  }, [setState]);

  const clearAllData = useCallback(() => {
    setState(initialDraftState);
    setImportState(initialImportState);
  }, [setState, setImportState]);

  // ============ WIZARD ============
  const setCurrentStep = useCallback((step: WizardStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, [setState]);

  // ============ DRAFT ============
  const startDraft = useCallback(() => {
    setState(prev => ({
      ...prev,
      draftStarted: true,
      currentPick: 1,
      picks: [],
      currentStep: 'draft',
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
      picks: [],
      players: prev.players.map(p => ({
        ...p,
        drafted: false,
        draftedBy: null,
        draftedAt: null,
      })),
    }));
  }, [setState]);

  const draftPlayer = useCallback((playerId: string, draftedBy: 'me' | number) => {
    setState(prev => {
      const player = prev.players.find(p => p.id === playerId);
      if (!player || player.drafted) return prev;
      
      const { teams, myPickSlot } = prev.settings;
      const round = Math.ceil(prev.currentPick / teams);
      const teamIndex = draftedBy === 'me' ? myPickSlot : draftedBy;
      
      const pickEntry: PickEntry = {
        overallPick: prev.currentPick,
        round,
        teamIndex,
        playerId,
        playerName: player.name,
        timestamp: Date.now(),
      };
      
      return {
        ...prev,
        currentPick: prev.currentPick + 1,
        picks: [...prev.picks, pickEntry],
        players: prev.players.map(p =>
          p.id === playerId
            ? { ...p, drafted: true, draftedBy, draftedAt: prev.currentPick }
            : p
        ),
      };
    });
  }, [setState]);

  const undoLastPick = useCallback(() => {
    setState(prev => {
      if (prev.picks.length === 0) return prev;
      
      const lastPick = prev.picks[prev.picks.length - 1];
      const newPicks = prev.picks.slice(0, -1);
      
      return {
        ...prev,
        currentPick: Math.max(1, prev.currentPick - 1),
        picks: newPicks,
        players: prev.players.map(p =>
          p.id === lastPick.playerId
            ? { ...p, drafted: false, draftedBy: null, draftedAt: null }
            : p
        ),
      };
    });
  }, [setState]);

  const undoDraft = useCallback((playerId: string) => {
    setState(prev => {
      const player = prev.players.find(p => p.id === playerId);
      if (!player) return prev;
      
      return {
        ...prev,
        picks: prev.picks.filter(p => p.playerId !== playerId),
        players: prev.players.map(p =>
          p.id === playerId
            ? { ...p, drafted: false, draftedBy: null, draftedAt: null }
            : p
        ),
      };
    });
  }, [setState]);

  const advancePick = useCallback(() => {
    setState(prev => ({ ...prev, currentPick: prev.currentPick + 1 }));
  }, [setState]);

  // ============ COMPUTED ============
  const availablePlayers = useMemo(() =>
    state.players.filter(p => !p.drafted),
    [state.players]
  );

  const draftedPlayers = useMemo(() =>
    state.players
      .filter(p => p.drafted)
      .sort((a, b) => (a.draftedAt ?? 0) - (b.draftedAt ?? 0)),
    [state.players]
  );

  const myDraftedPlayers = useMemo(() =>
    state.players.filter(p => p.drafted && p.draftedBy === 'me'),
    [state.players]
  );

  const teamCompositions = useMemo((): TeamComposition[] => {
    const { teams } = state.settings;
    const compositions: TeamComposition[] = [];
    
    for (let teamIndex = 1; teamIndex <= teams; teamIndex++) {
      const teamPicks = picks.filter(p => p.teamIndex === teamIndex);
      const playerIds = teamPicks.map(p => p.playerId).filter(Boolean) as string[];
      const teamPlayers = playerIds.map(id => state.players.find(p => p.id === id)).filter(Boolean) as UnifiedPlayer[];
      
      const positionCounts: Record<string, number> = {};
      let totalCRI = 0;
      
      for (const player of teamPlayers) {
        for (const pos of player.positions) {
          positionCounts[pos] = (positionCounts[pos] || 0) + 1;
        }
        if (player.crisRank) {
          totalCRI += player.crisRank;
        }
      }
      
      compositions.push({
        teamIndex,
        playerIds,
        positionCounts,
        totalCRI,
        avgCRI: teamPlayers.length > 0 ? totalCRI / teamPlayers.length : 0,
      });
    }
    
    return compositions.sort((a, b) => a.avgCRI - b.avgCRI);
  }, [state.players, state.settings, picks]);

  const getPlayerById = useCallback((id: string) => 
    state.players.find(p => p.id === id),
    [state.players]
  );

  const getSourceCounts = useCallback(() => ({
    projections: state.players.filter(p => p.sources.projections !== null).length,
    adp: state.players.filter(p => p.sources.adp !== null).length,
    lastYear: state.players.filter(p => p.sources.lastYear !== null).length,
  }), [state.players]);

  return {
    settings: state.settings,
    players: state.players,
    currentPick: state.currentPick,
    draftStarted: state.draftStarted,
    picks,
    currentStep,
    importState,
    updateSettings,
    setActiveSegment,
    updateSegmentRaw,
    importSegment,
    clearSegment,
    clearSource,
    clearAllData,
    setCurrentStep,
    startDraft,
    resetDraft,
    draftPlayer,
    undoLastPick,
    undoDraft,
    advancePick,
    availablePlayers,
    draftedPlayers,
    myDraftedPlayers,
    teamCompositions,
    getPlayerById,
    getSourceCounts,
  };
}
