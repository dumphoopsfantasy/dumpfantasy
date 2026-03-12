
Root cause from current codebase (why you’re seeing this):
1) `ScheduleAwareCard` is being rendered without `myRemainingStarts` / `oppRemainingStarts`, so it defaults to `0 vs 0` starts even when starts exist.
2) Rest-of-week date logic still has edge-case drift:
   - `getCurrentMatchupWeekFromSchedule` can still select the wrong week when season text is single-year formatted (e.g. `2026`) or ambiguous.
   - Mixed date handling (`toISOString().slice(0,10)` in some paths vs local date strings in others) can shift day boundaries.
   - `hasTodayStarted()` falls back to parsing `gameTime` with `new Date(...)`, which is unreliable for strings like `7:00 PM ET` and can prematurely mark today as elapsed.
3) Start/Sit + Rest-of-Week and the top matchup cards are still not fully wired to one canonical “remaining starts” output.

Implementation plan (logic-only, no UI redesign):
1) Harden active matchup week detection (`src/lib/matchupWeekDates.ts`)
   - Fix season-year inference for both `YYYY-YY` and single-year season strings.
   - Add fallback parsing strategy that selects the week containing today when possible (playoff-safe).
   - Standardize “today” string generation to local `YYYY-MM-DD` utility (remove UTC `toISOString` comparisons in matchup flow).

2) Fix “today elapsed” classification (`src/lib/restOfWeekUtils.ts`)
   - Remove fragile `new Date(gameTime)` fallback.
   - Use shared status parser only, and classify today using status-aware rules.
   - Ensure Thursday pre-tip keeps today in remaining bucket so max possible = `8 * 4 = 32`.

3) Unify remaining-date and starts derivation across widgets
   - Drive Start/Sit + Rest-of-Week from the same matchup-date source used by matchup projections.
   - Ensure recomputation when matchup window/schedule context changes (not frozen memo output).

4) Wire actual starts into Schedule-Aware card (`src/pages/MatchupProjection.tsx`, `src/components/matchup/ScheduleAwareCard.tsx`)
   - Compute `myRemainingStarts` / `oppRemainingStarts` from the shared starts engine.
   - Pass them into `ScheduleAwareCard` instead of relying on default `0`.
   - Keep existing visual layout/text style; only fix values.

5) Align stale date usage in related summary surface (`src/components/ThisWeekSummary.tsx`)
   - Remove `useMemo([])` date/week freezes so “starts left” and remaining days track current week/day correctly.
   - Keep component structure unchanged.

Validation checklist after patch:
- On Thursday before games start: remaining days = 4, max possible starts = 32.
- “You” and “Opp” possible starts are non-zero when rosters/schedule support it.
- Schedule-Aware card no longer shows `0 vs 0` by default.
- Rest-of-Week, Start/Sit, and Schedule-Aware card all agree on same date window and starts counts.
- Playoff active week still works even when regular season is over.
