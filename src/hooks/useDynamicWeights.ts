import { useCallback, useMemo } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
  DynamicMode,
  IntensityLevel,
  SmoothingState,
  EffectiveWeightsResult,
  getEffectiveWeights,
  buildMatchupContext,
  buildStandingsContext,
  updateSmoothingState,
} from "@/lib/dynamicWeights";
import { CRIS_WEIGHTS } from "@/lib/crisUtils";
import { CustomWeights } from "@/components/WeightSettings";

// Convert CustomWeights to Record<string, number>
function weightsToRecord(weights: CustomWeights): Record<string, number> {
  return {
    fgPct: weights.fgPct,
    ftPct: weights.ftPct,
    threepm: weights.threepm,
    rebounds: weights.rebounds,
    assists: weights.assists,
    steals: weights.steals,
    blocks: weights.blocks,
    turnovers: weights.turnovers,
    points: weights.points,
  };
}

// Convert Record<string, number> to CustomWeights
function recordToWeights(record: Record<string, number>): CustomWeights {
  return {
    fgPct: record.fgPct ?? 0.65,
    ftPct: record.ftPct ?? 0.60,
    threepm: record.threepm ?? 0.85,
    rebounds: record.rebounds ?? 0.80,
    assists: record.assists ?? 0.75,
    steals: record.steals ?? 0.45,
    blocks: record.blocks ?? 0.55,
    turnovers: record.turnovers ?? 0.35,
    points: record.points ?? 1.00,
  };
}

export interface DynamicWeightsSettings {
  enabled: boolean;
  mode: DynamicMode;
  intensity: IntensityLevel;
  smoothingEnabled: boolean;
  allowPuntDetection: boolean;
}

export interface DynamicWeightsContext {
  // Matchup context (optional)
  matchupProjectedMy?: Record<string, number>;
  matchupProjectedOpp?: Record<string, number>;
  matchupCurrentMy?: Record<string, number>;
  matchupCurrentOpp?: Record<string, number>;
  matchupDaysRemaining?: number;
  
  // Standings context (optional)
  userCategoryAvgs?: Record<string, number>;
  leagueCategoryAvgs?: Record<string, number>;
  categoryRanks?: Record<string, { rank: number; total: number; gap: number }>;
}

const DEFAULT_SETTINGS: DynamicWeightsSettings = {
  enabled: false,
  mode: "matchup",
  intensity: "medium",
  smoothingEnabled: true,
  allowPuntDetection: true,
};

export function useDynamicWeights(baseWeights: CustomWeights = CRIS_WEIGHTS as CustomWeights) {
  // Persisted settings
  const [settings, setSettings] = usePersistedState<DynamicWeightsSettings>(
    "dumphoops-dynamic-weights-settings",
    DEFAULT_SETTINGS
  );
  
  // Persisted smoothing state
  const [smoothingState, setSmoothingState] = usePersistedState<SmoothingState | undefined>(
    "dumphoops-dynamic-weights-smoothing",
    undefined
  );
  
  // Current dynamic weights context - stored to compute effective weights
  const [dynamicContext, setDynamicContext] = usePersistedState<DynamicWeightsContext>(
    "dumphoops-dynamic-weights-context",
    {}
  );
  
  // Settings updaters
  const setEnabled = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, enabled }));
  }, [setSettings]);
  
  const setMode = useCallback((mode: DynamicMode) => {
    setSettings(prev => ({ ...prev, mode }));
  }, [setSettings]);
  
  const setIntensity = useCallback((intensity: IntensityLevel) => {
    setSettings(prev => ({ ...prev, intensity }));
  }, [setSettings]);
  
  const setSmoothingEnabled = useCallback((smoothingEnabled: boolean) => {
    setSettings(prev => ({ ...prev, smoothingEnabled }));
  }, [setSettings]);
  
  const setAllowPuntDetection = useCallback((allowPuntDetection: boolean) => {
    setSettings(prev => ({ ...prev, allowPuntDetection }));
  }, [setSettings]);
  
  // Update matchup context (call from matchup page when data changes)
  const updateMatchupContext = useCallback((
    projectedMy: Record<string, number>,
    projectedOpp: Record<string, number>,
    currentMy?: Record<string, number>,
    currentOpp?: Record<string, number>,
    daysRemaining?: number
  ) => {
    setDynamicContext(prev => ({
      ...prev,
      matchupProjectedMy: projectedMy,
      matchupProjectedOpp: projectedOpp,
      matchupCurrentMy: currentMy,
      matchupCurrentOpp: currentOpp,
      matchupDaysRemaining: daysRemaining,
    }));
  }, [setDynamicContext]);
  
  // Update standings context (call from standings page when data changes)
  const updateStandingsContext = useCallback((
    userCategoryAvgs: Record<string, number>,
    leagueCategoryAvgs: Record<string, number>,
    categoryRanks: Record<string, { rank: number; total: number; gap: number }>
  ) => {
    setDynamicContext(prev => ({
      ...prev,
      userCategoryAvgs,
      leagueCategoryAvgs,
      categoryRanks,
    }));
  }, [setDynamicContext]);
  
  // Compute effective weights based on current mode and context
  const effectiveWeightsResult = useMemo((): EffectiveWeightsResult => {
    const baseWeightsRecord = weightsToRecord(baseWeights);
    
    if (!settings.enabled) {
      return {
        weights: baseWeightsRecord,
        details: {},
        mode: settings.mode,
        isActive: false,
        unavailableReason: "Dynamic wCRI is disabled",
      };
    }
    
    if (settings.mode === "matchup") {
      // Check if we have matchup context
      if (!dynamicContext.matchupProjectedMy || !dynamicContext.matchupProjectedOpp) {
        return {
          weights: baseWeightsRecord,
          details: {},
          mode: "matchup",
          isActive: false,
          unavailableReason: "Import matchup data in the Matchup tab to enable dynamic weights",
        };
      }
      
      const context = buildMatchupContext(
        dynamicContext.matchupProjectedMy,
        dynamicContext.matchupProjectedOpp,
        dynamicContext.matchupCurrentMy,
        dynamicContext.matchupCurrentOpp,
        dynamicContext.matchupDaysRemaining
      );
      
      return getEffectiveWeights(
        baseWeightsRecord,
        "matchup",
        context,
        settings.intensity,
        settings.smoothingEnabled,
        smoothingState
      );
    } else {
      // Standings mode
      if (!dynamicContext.userCategoryAvgs || !dynamicContext.categoryRanks) {
        return {
          weights: baseWeightsRecord,
          details: {},
          mode: "standings",
          isActive: false,
          unavailableReason: "Import standings data in the Standings tab to enable dynamic weights",
        };
      }
      
      const context = buildStandingsContext(
        dynamicContext.userCategoryAvgs,
        dynamicContext.leagueCategoryAvgs || {},
        dynamicContext.categoryRanks,
        settings.allowPuntDetection
      );
      
      return getEffectiveWeights(
        baseWeightsRecord,
        "standings",
        context,
        settings.intensity,
        settings.smoothingEnabled,
        smoothingState
      );
    }
  }, [settings, baseWeights, dynamicContext, smoothingState]);
  
  // Effective weights as CustomWeights format (use this for wCRI calculations app-wide)
  const effectiveWeights = useMemo((): CustomWeights => {
    return recordToWeights(effectiveWeightsResult.weights);
  }, [effectiveWeightsResult]);
  
  // Calculate effective weights for matchup mode (manual call for specific projections)
  const getMatchupWeights = useCallback((
    projectedMy: Record<string, number>,
    projectedOpp: Record<string, number>,
    currentMy?: Record<string, number>,
    currentOpp?: Record<string, number>,
    daysRemaining?: number
  ): EffectiveWeightsResult => {
    const baseWeightsRecord = weightsToRecord(baseWeights);
    if (!settings.enabled || settings.mode !== "matchup") {
      return {
        weights: baseWeightsRecord,
        details: {},
        mode: "matchup",
        isActive: false,
        unavailableReason: "Dynamic wCRI disabled or wrong mode",
      };
    }
    
    const context = buildMatchupContext(
      projectedMy,
      projectedOpp,
      currentMy,
      currentOpp,
      daysRemaining
    );
    
    const result = getEffectiveWeights(
      baseWeightsRecord,
      "matchup",
      context,
      settings.intensity,
      settings.smoothingEnabled,
      smoothingState
    );
    
    // Update smoothing state if active
    if (result.isActive) {
      const newMultipliers: Record<string, number> = {};
      for (const [key, detail] of Object.entries(result.details)) {
        newMultipliers[key] = detail.needMultiplier;
      }
      setSmoothingState(updateSmoothingState(smoothingState, newMultipliers));
    }
    
    return result;
  }, [settings, baseWeights, smoothingState, setSmoothingState]);
  
  // Calculate effective weights for standings mode (manual call)
  const getStandingsWeights = useCallback((
    userCategoryAvgs: Record<string, number>,
    leagueCategoryAvgs: Record<string, number>,
    categoryRanks: Record<string, { rank: number; total: number; gap: number }>
  ): EffectiveWeightsResult => {
    const baseWeightsRecord = weightsToRecord(baseWeights);
    if (!settings.enabled || settings.mode !== "standings") {
      return {
        weights: baseWeightsRecord,
        details: {},
        mode: "standings",
        isActive: false,
        unavailableReason: "Dynamic wCRI disabled or wrong mode",
      };
    }
    
    const context = buildStandingsContext(
      userCategoryAvgs,
      leagueCategoryAvgs,
      categoryRanks,
      settings.allowPuntDetection
    );
    
    const result = getEffectiveWeights(
      baseWeightsRecord,
      "standings",
      context,
      settings.intensity,
      settings.smoothingEnabled,
      smoothingState
    );
    
    // Update smoothing state if active
    if (result.isActive) {
      const newMultipliers: Record<string, number> = {};
      for (const [key, detail] of Object.entries(result.details)) {
        newMultipliers[key] = detail.needMultiplier;
      }
      setSmoothingState(updateSmoothingState(smoothingState, newMultipliers));
    }
    
    return result;
  }, [settings, baseWeights, smoothingState, setSmoothingState]);
  
  // Reset smoothing state
  const resetSmoothing = useCallback(() => {
    setSmoothingState(undefined);
  }, [setSmoothingState]);
  
  // Clear dynamic context
  const clearContext = useCallback(() => {
    setDynamicContext({});
  }, [setDynamicContext]);
  
  return {
    settings,
    setEnabled,
    setMode,
    setIntensity,
    setSmoothingEnabled,
    setAllowPuntDetection,
    // Context updaters
    updateMatchupContext,
    updateStandingsContext,
    clearContext,
    // Computed effective weights (for global use)
    effectiveWeights,
    effectiveWeightsResult,
    // Manual calculation methods
    getMatchupWeights,
    getStandingsWeights,
    resetSmoothing,
    smoothingState,
    dynamicContext,
  };
}

export type { DynamicMode, IntensityLevel, EffectiveWeightsResult };
