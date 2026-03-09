

# Fix: Use Actual Playoff Matchups from Schedule Data

## Problem
The bracket simulates all playoff rounds from scratch using season averages. But the schedule data already contains the actual matchups for each playoff round (Round 1 results determined who plays in Round 2). The bracket should show:
- **Round 1**: Floor Generals beat You Complete Me, Bilbo beat FREAK (actual results visible from who advanced)
- **Round 2**: Floor Generals vs Mr. Bane, Bilbo vs Wooden Nickelers (actual pairings from schedule)
- **Winner's Consolation**: You Complete Me vs FREAK (actual)

## Approach
Use the parsed schedule's playoff week matchups to determine actual pairings per round, and only simulate outcomes for rounds that haven't been played yet.

### Changes

**1. `src/components/PlayoffBracket.tsx` — Use actual playoff matchups**

Replace the fully-simulated bracket logic with schedule-aware bracket building:
- For each playoff week in the schedule, extract the actual matchup pairings
- Map those pairings to the bracket structure (winner's bracket vs consolation) using seed/team lookups
- For **past rounds**: infer the winner from who appears in the next round's matchups
- For **current/future rounds**: show actual pairings but simulate the outcome
- Only fall back to seed-based simulation when no schedule data exists for a round

Key logic:
```text
playoffRound1Matchups = schedule matchups for week 19
playoffRound2Matchups = schedule matchups for week 20

For Round 1:
  - Actual pairings from week 19 schedule data
  - Winners inferred from who appears in week 20 matchups

For Round 2 (current):
  - Actual pairings from week 20 schedule data  
  - Outcomes simulated (not yet played)

For Round 3 (future):
  - If schedule has week 21 data, use those pairings
  - Otherwise simulate from Round 2 winners
```

Also handle Winner's Consolation and Consolation Ladder brackets by matching teams that appear in playoff weeks but aren't in the winner's bracket progression.

**2. `src/pages/PlayoffIntel.tsx` — Handle consolation awareness**

The user's team ("You, Complete Me") lost Round 1 and is now in the Winner's Consolation bracket playing FREAK. The Playoff Intel needs to:
- Detect whether the user is in the winner's bracket or consolation based on schedule data
- Show the correct confirmed opponent (FREAK for consolation Round 2)
- Adjust labels: "Winner's Consolation" instead of "Semifinal"

**3. `src/lib/playoffProjectionEngine.ts` — Consolation bracket awareness**

Update `getPlayoffAwareOpponents` to:
- Check if the user's team appears in consolation matchups (not just winner's bracket)
- Return the correct opponent and round label based on which bracket path the user is on

### What changes for the user
- The bracket will show actual Round 1 results (Floor Generals won, Bilbo won) and actual Round 2 pairings
- "You, Complete Me" will correctly appear in the Winner's Consolation bracket vs FREAK
- Playoff Intel will show FREAK as the confirmed opponent with "Winner's Consolation" label
- Only the Championship round (Round 3) will be simulated since those matchups aren't determined yet

