

# Fix: Playoff Matchup Period Detection — Season Year Parsing Bug

## Root Cause

The core bug is in `parseDateRangeText()` in `src/lib/matchupWeekDates.ts`. It derives `seasonYear` from `sched.season.slice(0, 4)`, which for a "2025-26" NBA season gives `2025`. It then assigns months Jan-Aug to year 2025 and months Oct-Dec to year 2024.

**But today is March 12, 2026.** Playoff dates like "Mar 9 - 15" parse as March 9-15 **2025**, not 2026. So `getCurrentMatchupWeekFromSchedule()` compares today (2026-03-12) against a week ending 2025-03-15 and never finds a match. This causes `getRemainingMatchupDatesFromSchedule()` to return an empty array (or fall back to a Mon-Sun week that doesn't match the actual playoff period), which cascades to:

- `remainingDates = []` → 0 days left
- `remainingStarts = 0` → possible starts = 0
- No remaining projection → Schedule-Aware Final = Current only
- No today games matched → Today Impact empty

## Changes

### 1. Fix `parseDateRangeText()` season year logic (`src/lib/matchupWeekDates.ts`)

Parse the season string properly to extract the **end year**. For "2025-26", the end year is 2026. Months Jan-Aug should use the end year, months Oct-Dec should use the start year.

```
Before: seasonYear = parseInt(sched.season.slice(0, 4))  // 2025
        Jan-Aug → 2025, Oct-Dec → 2024

After:  Parse "2025-26" → startYear=2025, endYear=2026
        Jan-Aug → endYear (2026), Oct-Dec → startYear (2025)
```

Add a helper `parseSeasonYears(seasonStr)` that handles formats: "2025-26", "2025", "2026".

### 2. Add debug panel to MatchupProjection (`src/pages/MatchupProjection.tsx`)

Add a collapsible debug section (dev-mode or always-visible) showing:
- matchup week number, isPlayoff flag
- matchupStart / matchupEnd dates
- today string
- remainingDates array
- remaining starts (my/opp)
- season string from schedule
- parsed seasonYear
- any fallback triggered

This surfaces the exact state so the user can confirm the fix works.

### 3. Propagate `isPlayoff` context to UI badges

The `getCurrentMatchupWeekFromSchedule` return value already has `week` which can be cross-referenced with `lastRegularSeasonWeek`. Surface a "Playoff Round X" badge on the Schedule-Aware card header when the active matchup is a playoff week.

## Files to edit

| File | Change |
|------|--------|
| `src/lib/matchupWeekDates.ts` | Fix `parseDateRangeText` to use end-year for Jan-Aug months; add `parseSeasonYears` helper |
| `src/pages/MatchupProjection.tsx` | Add collapsible debug panel showing matchup period state |

## Why this fixes all symptoms

Once `parseDateRangeText` returns correct 2026 dates for playoff weeks, `getCurrentMatchupWeekFromSchedule()` will find the active playoff week → `getRemainingMatchupDatesFromSchedule()` returns the correct remaining dates → all downstream consumers (Rest of Week, Possible Starts, Schedule-Aware projection, Today Impact) get non-empty date arrays and compute correctly. No other files need changes because they all flow through this single date source.

