

# Fix: Playoff Intel Should Be Aware of Current Playoff Round

## Problem

The Playoff Intel dashboard always shows theoretical "likely opponents" based on static bracket seeding, ignoring which playoff round we're actually in. You're in Round 2 (semis) now — the semifinal matchups are already set from Round 1 results. The only "likely opponents" that should be speculative are Finals opponents.

## Solution

Make the Playoff Intel **round-aware** by reading the parsed playoff schedule data. The schedule parser already imports playoff matchups with `isPlayoff: true` and week numbers. We use these to:

1. **Detect the current playoff round** from the schedule (Round 1 = week 19, Round 2 = week 20, Round 3 = week 21)
2. **Show actual matchups for completed and current rounds** — not theoretical ones
3. **Only show "likely opponents" for future rounds** (e.g., Finals)

### Changes

**1. `src/lib/playoffProjectionEngine.ts` — New function: `getPlayoffAwareOpponents`**

Replace the static `getLikelyOpponents` with a round-aware version:
- Accept the resolved schedule matchups, current week, and `lastRegularSeasonWeek`
- For the **current round**: find the user's actual matchup from the schedule — show as a single confirmed opponent (likelihood = 1.0)
- For **future rounds**: derive likely opponents from the bracket (winner of the other semifinal), showing 2-3 scenarios with likelihoods
- For **completed rounds**: skip (or show as "Result" if we want history)

**2. `src/pages/PlayoffIntel.tsx` — Use round-aware opponents**

- Add a **round selector** (current round auto-selected): "Semifinal (This Week)" / "Finals (Next Week)"
- When viewing current round: show the confirmed opponent with full category breakdown
- When viewing Finals: show likely opponents (winners of other semifinal matchups)
- Update the hero bar to show "Round 2 — Semifinal" instead of generic "Playoff Intel"
- Remove the bye-week banner logic when user has an active playoff matchup

**3. Round detection logic**

```text
playoffWeeks = schedule matchups where isPlayoff = true
currentWeek = auto-detected from dates (already exists)
currentPlayoffRound = currentWeek - lastRegularSeasonWeek
  (Round 1 = week 19, Round 2 = week 20, Round 3 = week 21)

For current round:
  → Find user's matchup in schedule for this week
  → That's the confirmed opponent (no guessing)

For future rounds:
  → Look at bracket paths — who could win the other side
  → Show as "likely" with probabilities
```

**4. UI states by round context**

| State | What shows |
|---|---|
| Current round has a matchup | "Your Semifinal Opponent: FREAK" — confirmed, full analysis |
| Future round (Finals) | "Likely Finals Opponents" — 2-3 cards with probabilities |
| No schedule imported | Falls back to current static seed-based logic |

**5. No separate bracket upload needed**

The schedule parser already imports playoff rounds. As long as the user has imported the league schedule (which includes "Playoff Round 1/2/3" sections), the system has the actual matchups. The user just needs to re-import standings if they want updated records.

### What changes for the user

- Current view will show: **"Semifinal — vs FREAK (confirmed)"** with full category breakdown
- A round picker lets them look ahead to Finals and see likely opponents from the other bracket side
- No need to upload anything new — existing schedule data has the playoff matchups

