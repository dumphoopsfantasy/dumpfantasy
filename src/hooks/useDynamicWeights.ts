import { useCallback } from "react";
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

export interface DynamicWeightsSettings {
  enabled: boolean;
  mode: DynamicMode;
  intensity: IntensityLevel;
  smoothingEnabled: boolean;
  allowPuntDetection: boolean;
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
  
  // Calculate effective weights for matchup mode
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
  
  // Calculate effective weights for standings mode
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
  
  return {
    settings,
    setEnabled,
    setMode,
    setIntensity,
    setSmoothingEnabled,
    setAllowPuntDetection,
    getMatchupWeights,
    getStandingsWeights,
    resetSmoothing,
    smoothingState,
  };
}

export type { DynamicMode, IntensityLevel, EffectiveWeightsResult };
