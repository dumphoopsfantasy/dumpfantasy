

# Fix: "Today" showing as October 21st — Season String Parsing Bug

## Root Cause

Two chained bugs in season string detection:

1. **`scheduleParser.ts` line 161**: The regex `/20\d{2}(?:-\d{2})?/` incorrectly matches "2025-2026" as `"2025-20"` (captures only 2 digits after the dash). If the pasted ESPN schedule text contains a 4-digit end year like "2025-2026", the stored season string becomes `"2025-20"`.

2. **`matchupWeekDates.ts` `parseSeasonYears()`**: When given `"2025-20"`, it computes `endYear = parseInt("20" + "20") = 2020`. This makes Oct dates → year 2019, Jan-Aug dates → year 2020. Today (March 12, 2026) matches nothing, so `getCurrentMatchupWeekFromSchedule` falls back to the first week — **Matchup 1 (Oct 21)**.

   Alternatively, if the pasted text has a bare "2026" before any "2025-26" string, the regex captures just `"2026"`. Then `parseSeasonYears("2026")` returns `{startYear: 2026, endYear: 2027}`, making March dates → 2027. Same result: today doesn't match, falls back to Oct 21.

## Changes

### 1. Fix season regex in `src/lib/scheduleParser.ts` (line 161)

Replace the regex with one that handles all ESPN formats: "2025-26", "2025-2026", bare "2025" or "2026".

```
// Before:
const seasonMatch = data.match(/20\d{2}(?:-\d{2})?/);

// After — prefer YYYY-YYYY, then YYYY-YY, then bare YYYY:
const seasonMatch = data.match(/20\d{2}-20\d{2}/) 
  || data.match(/20\d{2}-\d{2}/) 
  || data.match(/20\d{2}/);
```

Also normalize "2025-2026" → "2025-26" before storing.

### 2. Harden `parseSeasonYears()` in `src/lib/matchupWeekDates.ts`

Handle the `"2025-2026"` 4-digit end year properly and add a sanity check that `endYear` is reasonable (within 1 of `startYear`).

### Files to edit

| File | Change |
|------|--------|
| `src/lib/scheduleParser.ts` | Fix season detection regex to handle "2025-2026" format |
| `src/lib/matchupWeekDates.ts` | Harden `parseSeasonYears` for edge cases |

