/**
 * usePickupImpact — React hook wrapping the pickup impact engine.
 * 
 * Runs the computation asynchronously in batched microtasks to avoid
 * blocking the main thread. Results are memoized and only recomputed
 * when inputs change.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Player, RosterSlot } from '@/types/fantasy';
import { NBAGame } from '@/lib/nbaApi';
import { TeamTotalsWithPct } from '@/lib/teamTotals';
import {
  computePickupImpact,
  PickupImpactResult,
} from '@/lib/pickupImpactEngine';

export interface UsePickupImpactParams {
  freeAgents: Player[];
  currentRoster: RosterSlot[];
  matchupDates: string[];
  gamesByDate: Map<string, NBAGame[]>;
  myCurrentTotals: TeamTotalsWithPct | null;
  oppTotals: TeamTotalsWithPct | null;
  /** Set false to disable computation (e.g. when data is still loading) */
  enabled?: boolean;
}

export interface UsePickupImpactResult {
  results: PickupImpactResult[];
  baselineWinProb: number;
  baselineAvgCatWins: number;
  isComputing: boolean;
  error: string | null;
}

/**
 * Stable serialization key to detect when inputs actually change.
 */
function computeInputKey(params: UsePickupImpactParams): string {
  return [
    params.freeAgents.length,
    params.currentRoster.length,
    params.matchupDates.join(','),
    params.gamesByDate.size,
    params.myCurrentTotals ? 'y' : 'n',
    params.oppTotals ? 'y' : 'n',
    // Include roster player IDs to detect roster changes
    params.currentRoster.map(s => s.player.id).sort().join(','),
    // Include FA IDs to detect FA list changes
    params.freeAgents.slice(0, 30).map(f => f.id).join(','),
  ].join('|');
}

export function usePickupImpact(params: UsePickupImpactParams): UsePickupImpactResult {
  const {
    freeAgents,
    currentRoster,
    matchupDates,
    gamesByDate,
    myCurrentTotals,
    oppTotals,
    enabled = true,
  } = params;

  const [results, setResults] = useState<PickupImpactResult[]>([]);
  const [baselineWinProb, setBaselineWinProb] = useState(0);
  const [baselineAvgCatWins, setBaselineAvgCatWins] = useState(0);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref to track the latest computation and cancel stale ones
  const computeIdRef = useRef(0);

  const inputKey = useMemo(() => computeInputKey(params), [
    freeAgents, currentRoster, matchupDates, gamesByDate, myCurrentTotals, oppTotals,
  ]);

  useEffect(() => {
    if (!enabled) return;

    // Need minimum data to compute
    if (
      freeAgents.length === 0 ||
      currentRoster.length === 0 ||
      matchupDates.length === 0 ||
      gamesByDate.size === 0 ||
      !oppTotals
    ) {
      setResults([]);
      setBaselineWinProb(0);
      setBaselineAvgCatWins(0);
      return;
    }

    const computeId = ++computeIdRef.current;
    setIsComputing(true);
    setError(null);

    // Run in a microtask to avoid blocking render
    const timer = setTimeout(() => {
      try {
        const output = computePickupImpact({
          freeAgents,
          currentRoster,
          matchupDates,
          gamesByDate,
          myCurrentTotals,
          oppTotals,
          maxCandidates: 25,
          simulations: 2000,
        });

        // Only update state if this is still the latest computation
        if (computeId === computeIdRef.current) {
          setResults(output.results);
          setBaselineWinProb(output.baselineWinProb);
          setBaselineAvgCatWins(output.baselineAvgCatWins);
          setIsComputing(false);
        }
      } catch (err) {
        if (computeId === computeIdRef.current) {
          console.error('[usePickupImpact] Computation error:', err);
          setError(err instanceof Error ? err.message : 'Computation failed');
          setIsComputing(false);
        }
      }
    }, 100); // Small delay to let the UI settle

    return () => {
      clearTimeout(timer);
    };
  }, [inputKey, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    results,
    baselineWinProb,
    baselineAvgCatWins,
    isComputing,
    error,
  };
}
