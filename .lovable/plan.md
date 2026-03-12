

# Fix: Parse Failed — Global Tab-Split Causing Stat Misalignment

## Root Cause

The recent fix on **line 595 of `MatchupProjection.tsx`** added `.replace(/\t/g, '\n')` to split tab-separated stat headers so the parser could find `MIN`. However, this **globally** converts ALL tabs to newlines across the entire ESPN page, including the lineup section.

The ESPN page has tab-separated content in the **lineup section** too:
```
Set Lineup:\tMar 5\tThu\tMar 6\tFri\t...
```

After global tab-to-newline conversion, standalone numbers like `5`, `6`, `7`, `8`, `12`, `13`, `1`, `3` (from dates and acquisition limits) become individual lines. These get collected as stat tokens BEFORE the actual stat data, poisoning the alignment.

**Evidence from console logs:** Row 0 shows `min=5` (from "Mar 5"), `steals=0.485` (a FG%), `points=0.792` (a FT%). The entire token stream is shifted. The starter mean produces `blocks > 250`, triggering the sanity check → `return null` → "Parse failed" toast.

## Fix

**File:** `src/pages/MatchupProjection.tsx` (lines 593-598)

Replace the global `\t` → `\n` with a targeted approach: only split tabs for lines at or after the stat section header (the line containing `MIN` + stat column names like `FGM`, `FG%`, `REB`).

```typescript
// Before (broken):
const lines = data
  .trim()
  .replace(/\t/g, '\n')
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l);

// After (targeted):
const rawLines = data.trim().split("\n").map(l => l.trim()).filter(l => l);
const lines: string[] = [];
let inStatsSection = false;
for (const raw of rawLines) {
  if (!inStatsSection && /\bMIN\b/.test(raw) && /\b(FGM|FG%|3PM|REB)\b/.test(raw)) {
    inStatsSection = true;
  }
  if (inStatsSection && raw.includes('\t')) {
    lines.push(...raw.split('\t').map(s => s.trim()).filter(s => s));
  } else {
    lines.push(raw);
  }
}
```

This preserves the lineup section intact (no junk numeric tokens from dates), while correctly splitting tab-separated stat headers and stat data rows. The stat alignment will match the expected 17-column layout and sanity checks will pass.

No other files need changes. No UI changes.

