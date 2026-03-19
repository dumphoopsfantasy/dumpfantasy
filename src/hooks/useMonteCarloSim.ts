/**
 * React hook that runs the Monte Carlo matchup simulation.
 * 
 * Uses useMemo so it only re-runs when projected totals change.
 * Returns null when either team's totals are missing.
 */

import { useMemo } from 'react';
import { TeamTotalsWithPct } from '@/lib/teamTotals';
import { runMonteCarloSimulation, MonteCarloResult } from '@/lib/monteCarloEngine';

interface UseMonteCarloSimParams {
  myTotals: TeamTotalsWithPct | null;
  oppTotals: TeamTotalsWithPct | null;
  /** Number of simulations. Default 10,000 */
  numSims?: number;
}

export function useMonteCarloSim({
  myTotals,
  oppTotals,
  numSims = 10_000,
}: UseMonteCarloSimParams): MonteCarloResult | null {
  return useMemo(() => {
    if (!myTotals || !oppTotals) return null;

    // Validate that we have meaningful data (at least some non-zero values)
    const myHasData = Object.values(myTotals).some(v => typeof v === 'number' && v > 0);
    const oppHasData = Object.values(oppTotals).some(v => typeof v === 'number' && v > 0);
    if (!myHasData || !oppHasData) return null;

    return runMonteCarloSimulation(myTotals, oppTotals, numSims);
  }, [myTotals, oppTotals, numSims]);
}
