
# Fix: Forecast Engine Doesn't Recognize Playoffs

## Problem

The schedule parser (`scheduleParser.ts` line 209) explicitly **stops parsing at "Playoff Round"** lines. This means:

1. Playoff weeks (19, 20, 21) are never imported into the schedule data
2. The forecast engine only knows about regular season weeks 1-18
3. The `PlayoffBracket` component guesses playoff weeks by taking the **last N weeks of the parsed schedule** -- which are actually the last regular season weeks, not real playoff weeks
4. The current week cutoff (auto-detected as week 18) doesn't know the season is over and playoffs have started

From your ESPN paste, the structure is:
- Matchups 1-18: Regular season
- Playoff Round 1 (Mar 2-8): Week 19
- Playoff Round 2 (Mar 9-15): Week 20
- Playoff Round 3 (Mar 16-22): Week 21

## Solution

Add a **"Last Regular Season Week"** setting that tells the system where the regular season ends, and update the parser to also import playoff round matchups.

### Changes

**1. Update Schedule Parser (`src/lib/scheduleParser.ts`)**
- Instead of breaking at "Playoff Round" lines, continue parsing them as additional weeks
- Tag parsed matchups with an `isPlayoff` flag so the rest of the system can distinguish them
- Auto-detect "Playoff Round N" headers as week numbers (e.g., week = lastRegularWeek + roundNumber)

**2. Add `lastRegularSeasonWeek` to persisted settings**
- New persisted state key: `dumphoops-schedule-lastRegularWeek.v2`
- Auto-detect from schedule data: the highest "Matchup N" week before the first "Playoff Round" header
- Allow manual override in the Schedule Forecast settings panel

**3. Update Forecast Engine (`src/lib/forecastEngine.ts`)**
- Add `lastRegularSeasonWeek` to `ForecastSettings`
- In `projectFinalStandings`, only simulate weeks up to `lastRegularSeasonWeek` for standings projection (playoff results don't affect regular season standings)
- Keep `forecastTeamMatchups` able to show playoff week predictions too

**4. Update PlayoffBracket (`src/components/PlayoffBracket.tsx`)**
- Use `lastRegularSeasonWeek` to correctly identify which weeks are playoff weeks (any week > lastRegularSeasonWeek)
- Use actual playoff matchups from the parsed schedule (seeds 1/2 get byes in round 1, 3v6 and 4v5 play) instead of simulating from scratch
- When actual playoff matchups exist in the schedule, use them for the bracket; only simulate outcomes

**5. Update ScheduleForecast (`src/components/ScheduleForecast.tsx`)**
- Read and persist the new `lastRegularSeasonWeek` value
- Add a small dropdown or input in the settings panel: "Last regular season week" (auto-detected, editable)
- Pass it through to both the forecast engine and the PlayoffBracket

**6. Update LeagueStandings (`src/components/LeagueStandings.tsx`)**
- Pass `lastRegularSeasonWeek` to the PlayoffBracket component

### Technical Details

**Schedule Parser change (key logic):**
```text
Current: if isPlayoffSection(line) → break
New:     if isPlayoffSection(line) → set isPlayoffRound = true, 
         parse "Playoff Round N" as week = lastMatchupWeek + N,
         tag matchups with isPlayoff = true
```

**New type additions:**
- `ScheduleMatchup.isPlayoff?: boolean` -- flag on parsed matchups
- `ForecastSettings.lastRegularSeasonWeek?: number` -- cutoff for standings sim

**Auto-detection logic:**
- When parsing, track the highest "Matchup N" week number
- When a "Playoff Round" header appears, record that the previous matchup week was the last regular season week
- Store this alongside the schedule data

### What the user sees after this change

- The forecast will correctly show that we're now in **Playoff Round 1** (not matchup 18)
- Projected standings will be based only on regular season weeks (1-18)
- The playoff bracket will show the **actual playoff matchups** from ESPN (not simulated seedings)
- A small "Last regular season week: 18" indicator in settings confirms the boundary
