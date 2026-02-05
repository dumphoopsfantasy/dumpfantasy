/**
 * Tooltip Content Definitions
 * Centralized definitions for metric/label explainers across the app.
 */

export interface TooltipDefinition {
  title: string;
  description: string;
  whyCare: string;
  formula?: string;
}

export const TOOLTIP_DEFINITIONS: Record<string, TooltipDefinition> = {
  "schedule-aware": {
    title: "Schedule-Aware Projection",
    description: "Uses your current matchup totals + projected remaining starts (based on schedule + lineup slot limits) to estimate final category totals.",
    whyCare: "Shows realistic weekly projections that account for off-days and roster overflow.",
    formula: "Final = Current + (Remaining Starts × Avg Stats)",
  },
  
  "today-impact": {
    title: "Today Impact",
    description: "Adds ONLY the expected stats from players who can be started today. Shows how today moves the projected final.",
    whyCare: "Helps you see how much ground you can gain/lose today specifically.",
    formula: "After Today = Current + Today's Projected Stats",
  },
  
  "baseline-x40": {
    title: "Baseline Strength (×40)",
    description: "Per-game roster averages multiplied by 40 games (a typical fantasy week's total starts).",
    whyCare: "Schedule-independent comparison of raw roster strength—useful before the week starts.",
    formula: "Baseline = (Per-Game Avg) × 40",
  },
  
  "pace-vs-baseline": {
    title: "Pace vs Baseline",
    description: "Compares your current weekly totals against the expected baseline pace.",
    whyCare: "Shows if you're ahead or behind where your roster 'should' be at this point.",
    formula: "Expected = Baseline × (Days Elapsed / 7)",
  },
  
  "x40": {
    title: "×40 Multiplier",
    description: "Per-game averages × 40 games. Represents a full fantasy week's worth of team starts.",
    whyCare: "Standardizes comparison between teams with different games remaining.",
  },
  
  "remaining-starts": {
    title: "Remaining Starts",
    description: "Number of usable lineup slots remaining for the week, accounting for roster overflow and daily limits.",
    whyCare: "More starts = more stat accumulation potential. Key for close matchups.",
  },
  
  "overflow": {
    title: "Overflow / Benched Games",
    description: "Players with games who can't start due to limited lineup slots (e.g., 10 players with games but only 8 slots).",
    whyCare: "High overflow means wasted opportunity—consider streaming or benching low-value players.",
  },
  
  "unfilled-slots": {
    title: "Unfilled Slots",
    description: "Lineup slots that won't be used because not enough players have games that day.",
    whyCare: "Indicates days where you could stream additional players.",
  },
  
  "cri": {
    title: "CRI (Category Ranking Index)",
    description: "Sum of category ranks across all 9 categories. Higher = better overall.",
    whyCare: "Quick way to rank players by all-around fantasy value on your roster.",
  },
  
  "wcri": {
    title: "wCRI (Weighted CRI)",
    description: "CRI weighted by your custom category priorities (set in Settings).",
    whyCare: "Tailored rankings based on what categories matter most to your team/matchup.",
  },
  
  "start-edge": {
    title: "Start Edge",
    description: "Difference in remaining starts between you and opponent.",
    whyCare: "Positive edge means more stat accumulation opportunities this week.",
  },
};

/**
 * Get tooltip content for a metric key
 */
export function getTooltipContent(key: string): TooltipDefinition | null {
  return TOOLTIP_DEFINITIONS[key] || null;
}
