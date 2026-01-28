
Goal
- When you paste your ESPN roster page into the Roster tab importer, IR players (like Malik Monk) should still show their “Last 15” stats if ESPN includes them.

What’s actually happening (root cause)
- The Roster tab does not use `parseEspnRosterSlotsFromTeamPage` (`src/lib/espnRosterSlots.ts`). It uses a separate parser inside `src/components/DataUpload.tsx` (`parseESPNData`).
- In `DataUpload.tsx`, the stat-token collector accepts:
  - numbers (e.g. `24.4`)
  - `--`
  - numeric fractions like `5.3/10.6`
- It does NOT accept missing fraction tokens like `--/--`.
- In your paste, Dejounte Murray’s row contains `--/--` for FGM/FGA and FTM/FTA. Those 2 tokens get dropped, so the stat token stream becomes misaligned and ends up with 238 tokens instead of the expected 240 (= 16 players * 15 columns).
- The logs you saw match this perfectly:
  - “Collected 238 stat tokens”
  - “Built 15 stat rows” (not 16)
- Result: Malik Monk’s stat row exists in the paste, but the importer never builds a complete row for him, so his minutes become 0, and the roster table hides all stats because it uses `hasStats = player.minutes > 0`.

Plan to fix (minimal, targeted fix)
1) Fix stat token collection in `src/components/DataUpload.tsx`
   - Import and use `normalizeMissingToken` / `isMissingToken` / `isMissingFractionToken` from `src/lib/espnTokenUtils.ts` (already exists).
   - While iterating `statsLines`, normalize each token first:
     - Convert unicode dashes (—, –) to canonical `--`
     - Convert `-- / --` into `--/--`
   - Update the “accept token” condition to include missing fraction tokens (`--/--`) in addition to `--`.
   - This ensures the token stream preserves column alignment even when a player has missing FGM/FGA and FTM/FTA.

2) Keep the conversion behavior the same, just more correct
   - In `numericSlice`, the current logic already treats anything containing `/` as 0, which is fine for this Roster tab (it doesn’t use FGM/FGA directly).
   - We’re only ensuring `--/--` is counted as a placeholder token so we don’t lose alignment.

3) Add a safety warning (optional but recommended)
   - If `statTokens.length % 15 !== 0`, log a warning that the stats table is misaligned and show:
     - token count
     - computed rows
     - remainder
   - This will make future ESPN format changes much easier to diagnose.

4) Add/adjust a unit test (recommended)
   - Add a test case for the Roster-tab importer logic to cover the exact scenario:
     - an IR player with `--/--` stats preceding an IR player with real stats
     - ensure Malik Monk’s `minutes=24.4`, `threepm=2.7`, `points=15.1` after parsing
   - Since `parseESPNData` is currently nested inside the React component, the clean approach is to extract it into a small utility in `src/lib/` (or export it) so it can be tested directly.

How we’ll verify it works (end-to-end)
- Paste your full ESPN roster page again into the Roster tab and click “Load Players”.
- Expected log changes:
  - “Collected 240 stat tokens” (or at least “Built 16 stat rows”)
- Expected UI:
  - Malik Monk row (IR) shows MIN ~24.4, 3PM ~2.7, PTS ~15.1 (even though IR rows are visually dimmed).

Why this is the correct fix (and why the last edit didn’t change the Roster tab)
- The last edit improved `src/lib/espnRosterSlots.ts`, which is used by the Matchup Projection parsing flow, not the Roster tab importer.
- The Roster tab importer has its own independent parsing implementation in `DataUpload.tsx`, and that’s where the `--/--` bug is.

Risks / Edge cases covered
- ESPN sometimes uses unicode dashes or spaced fractions; using `normalizeMissingToken` covers those.
- This fix is backwards compatible: it only adds support for tokens that were previously ignored.

Optional follow-up improvement (best long-term)
- Replace the Roster tab’s custom parsing with the shared canonical parser `parseEspnRosterSlotsFromTeamPage`, then map it into the existing `PlayerStats[]` shape used by `Index.tsx`.
- This avoids “two parsers drifting apart” and prevents the same class of bugs in the future.
