/**
 * Season String Utilities
 *
 * Centralizes all NBA fantasy season string parsing and normalization.
 * Designed to be non-fatal: malformed input always produces a usable fallback.
 */

export interface SeasonYears {
  startYear: number;
  endYear: number;
}

/**
 * Normalize a raw season string into { startYear, endYear }.
 *
 * Supported formats:
 *   "2025-26"    → { 2025, 2026 }
 *   "2025-2026"  → { 2025, 2026 }
 *   "2025"       → { 2025, 2026 }
 *   "2026"       → { 2025, 2026 } (infer: if month is Oct-Dec we're in startYear)
 *   "2025-20"    → corrupt → { 2025, 2026 } (recovery)
 *   undefined/null/"" → null (caller should use fallback)
 *
 * Rules:
 *   - endYear must be startYear or startYear+1; if not, recover as startYear+1
 *   - bare year: if current month is Oct-Dec, treat as startYear; else as endYear-1
 */
export function normalizeSeasonString(raw?: string | null): SeasonYears | null {
  if (!raw || !raw.trim()) return null;

  const trimmed = raw.trim();

  // Try YYYY-YYYY or YYYY-YY
  const dashMatch = trimmed.match(/^(\d{4})-(\d{2,4})$/);
  if (dashMatch) {
    const startYear = parseInt(dashMatch[1], 10);
    const endSuffix = dashMatch[2];
    let endYear: number;

    if (endSuffix.length === 4) {
      endYear = parseInt(endSuffix, 10);
    } else if (endSuffix.length === 2) {
      endYear = parseInt(dashMatch[1].slice(0, 2) + endSuffix, 10);
    } else {
      // weird length (e.g. 3 digits) — recover
      endYear = startYear + 1;
    }

    // Sanity: endYear must be startYear or startYear+1
    if (isNaN(endYear) || endYear < startYear || endYear > startYear + 1) {
      endYear = startYear + 1;
    }
    if (isNaN(startYear)) return null;

    return { startYear, endYear: endYear === startYear ? startYear + 1 : endYear };
  }

  // Bare YYYY
  const bareMatch = trimmed.match(/^(\d{4})$/);
  if (bareMatch) {
    const year = parseInt(bareMatch[1], 10);
    if (isNaN(year)) return null;

    // Heuristic: if current month is Oct-Dec, the bare year is likely startYear.
    // Otherwise it's likely endYear (we're in the Jan-Aug half of the season).
    const currentMonth = new Date().getMonth(); // 0-indexed
    if (currentMonth >= 9) {
      // Oct-Dec: year is startYear
      return { startYear: year, endYear: year + 1 };
    }
    // Jan-Aug: year is endYear
    return { startYear: year - 1, endYear: year };
  }

  return null;
}

/**
 * Infer season years from date-range months when no explicit season string exists.
 * Scans month names in matchup date ranges to determine the year window.
 */
export function inferSeasonFromMonths(dateRanges: string[]): SeasonYears {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // If we're in Oct-Dec, season is currentYear to currentYear+1
  // If we're in Jan-Aug, season is currentYear-1 to currentYear
  if (currentMonth >= 9) {
    return { startYear: currentYear, endYear: currentYear + 1 };
  }
  return { startYear: currentYear - 1, endYear: currentYear };
}

/**
 * Extract a season string from raw text, trying multiple regex patterns.
 * Returns the best match or null.
 */
export function extractSeasonFromText(text: string): string | null {
  // Priority: YYYY-YYYY > YYYY-YY > bare YYYY
  const m1 = text.match(/20\d{2}-20\d{2}/);
  if (m1) return m1[0];

  const m2 = text.match(/20\d{2}-\d{2}/);
  if (m2) return m2[0];

  const m3 = text.match(/20\d{2}/);
  if (m3) return m3[0];

  return null;
}

/**
 * Normalize a season string to canonical "YYYY-YY" display format.
 * e.g. "2025-2026" → "2025-26", "2025" → "2025-26"
 */
export function formatSeasonDisplay(years: SeasonYears): string {
  return `${years.startYear}-${String(years.endYear).slice(2)}`;
}

/**
 * Assign a calendar year to a parsed month index based on the NBA season boundary.
 * Oct-Dec (months 9-11) → startYear; Jan-Aug (months 0-8) → endYear.
 */
export function yearForMonth(monthIndex: number, season: SeasonYears): number {
  return monthIndex >= 9 ? season.startYear : season.endYear;
}

// ============================================================================
// VALIDATION / TESTING
// ============================================================================

export interface SeasonValidationCase {
  input: string | undefined | null;
  expected: SeasonYears | null;
}

/**
 * Built-in validation cases for season parsing.
 * Can be called at dev time or in unit tests to verify correctness.
 */
export function getSeasonValidationCases(): SeasonValidationCase[] {
  return [
    { input: "2025-26", expected: { startYear: 2025, endYear: 2026 } },
    { input: "2025-2026", expected: { startYear: 2025, endYear: 2026 } },
    { input: "2025-20", expected: { startYear: 2025, endYear: 2026 } }, // corrupt → recover
    { input: undefined, expected: null },
    { input: null, expected: null },
    { input: "", expected: null },
  ];
}

/**
 * Run built-in season validation and return failures (empty = all pass).
 */
export function validateSeasonParsing(): string[] {
  const failures: string[] = [];
  const cases = getSeasonValidationCases();

  for (const c of cases) {
    const result = normalizeSeasonString(c.input);
    const resultStr = result ? `${result.startYear}-${result.endYear}` : "null";
    const expectedStr = c.expected ? `${c.expected.startYear}-${c.expected.endYear}` : "null";

    if (resultStr !== expectedStr) {
      failures.push(`Input "${c.input}": expected ${expectedStr}, got ${resultStr}`);
    }
  }

  return failures;
}
