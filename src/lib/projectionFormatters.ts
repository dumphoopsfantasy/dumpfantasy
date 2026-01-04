/**
 * Safe formatting helpers for projection values.
 * Ensures NaN/Infinity/undefined never render in the UI.
 */

import { devWarn } from './devLog';

/**
 * Returns the number if it's finite, otherwise null.
 * Use this before any formatting to guard against NaN/Infinity.
 */
export function safeNum(x: unknown): number | null {
  if (typeof x !== 'number') return null;
  if (!Number.isFinite(x)) {
    devWarn(`[safeNum] Non-finite value detected: ${x}`);
    return null;
  }
  return x;
}

/**
 * Formats a number as an integer string, or "—" if invalid.
 */
export function fmtInt(x: unknown): string {
  const n = safeNum(x);
  if (n === null) return '—';
  return Math.round(n).toString();
}

/**
 * Formats a number as a decimal with 1 decimal place, or "—" if invalid.
 */
export function fmtDec(x: unknown, decimals: number = 1): string {
  const n = safeNum(x);
  if (n === null) return '—';
  return n.toFixed(decimals);
}

/**
 * Formats a number as a percentage string (e.g., ".456"), or "—" if invalid.
 * If the value is > 1, treats it as already a percentage (e.g., 45.6 -> 45.6%).
 */
export function fmtPct(x: unknown): string {
  const n = safeNum(x);
  if (n === null) return '—';
  // If value is > 1, assume it's already in percentage form
  const normalized = n > 1 ? n / 100 : n;
  return normalized.toFixed(3).replace(/^0/, '');
}

/**
 * Safe division that returns null if divisor is 0 or inputs are invalid.
 */
export function safeDivide(numerator: unknown, denominator: unknown): number | null {
  const num = safeNum(numerator);
  const denom = safeNum(denominator);
  if (num === null || denom === null || denom === 0) return null;
  return num / denom;
}

/**
 * Computes FG% or FT% from makes/attempts, returning null if invalid.
 * NEVER averages percentages directly - always uses makes/attempts.
 */
export function computePct(makes: unknown, attempts: unknown): number | null {
  return safeDivide(makes, attempts);
}

/**
 * Safely add two numbers, treating null/NaN as 0.
 */
export function safeAdd(a: unknown, b: unknown): number {
  const numA = safeNum(a) ?? 0;
  const numB = safeNum(b) ?? 0;
  return numA + numB;
}

/**
 * Projection mode state machine types
 */
export type ProjectionDataMode = 'FINAL' | 'REMAINING_ONLY' | 'BASELINE_ONLY';

export interface ProjectionModeResult {
  mode: ProjectionDataMode;
  label: string;
  description: string;
}

/**
 * Determines the projection mode based on available data.
 * Returns mode, label, and description for UI display.
 */
export function determineProjectionMode(opts: {
  hasCurrentTotals: boolean;
  hasRemainingTotals: boolean;
  hasBaselineTotals: boolean;
}): ProjectionModeResult {
  const { hasCurrentTotals, hasRemainingTotals, hasBaselineTotals } = opts;

  if (hasCurrentTotals && hasRemainingTotals) {
    return {
      mode: 'FINAL',
      label: 'Projected Final',
      description: 'Current + Remaining totals',
    };
  }

  if (hasRemainingTotals) {
    return {
      mode: 'REMAINING_ONLY',
      label: 'Remaining-Only Projection',
      description: 'Current totals missing — showing Remaining-only projection.',
    };
  }

  return {
    mode: 'BASELINE_ONLY',
    label: 'Baseline Strength Only',
    description: 'Current + schedule data missing — showing Baseline strength only.',
  };
}

/**
 * Formats a stat value based on whether it's a percentage or counting stat.
 */
export function formatStatValue(value: unknown, isPct: boolean): string {
  if (isPct) {
    return fmtPct(value);
  }
  return fmtInt(value);
}

/**
 * Compares two values for a category and determines the winner.
 * Returns 'missing' if either value is invalid.
 */
export function determineWinner(
  myVal: unknown,
  oppVal: unknown,
  lowerIsBetter: boolean
): 'my' | 'opp' | 'tie' | 'missing' {
  const my = safeNum(myVal);
  const opp = safeNum(oppVal);

  if (my === null || opp === null) return 'missing';

  const epsilon = 0.001;
  const diff = Math.abs(my - opp);

  if (diff < epsilon) return 'tie';

  if (lowerIsBetter) {
    return my < opp ? 'my' : 'opp';
  } else {
    return my > opp ? 'my' : 'opp';
  }
}

/**
 * Formats a timestamp for "As of" display
 */
export function formatAsOfTime(date?: Date): string {
  const d = date || new Date();
  return d.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone: 'America/New_York'
  }) + ' ET';
}
