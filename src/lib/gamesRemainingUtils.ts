/**
 * Games-Remaining Badge Utilities
 * Calculates remaining games for a player within the current matchup week.
 */

import { NBAGame, isTeamPlayingOnDate, formatDateForAPI, getDayLabel } from './nbaApi';

export interface GamesRemainingInfo {
  count: number;
  dayLabels: string[];  // e.g., ["Fri", "Sun"]
  isToday: boolean;
  text: string;         // e.g., "Today", "2g left", "Fri/Sun"
}

/**
 * Get remaining games badge info for a player
 */
export function getPlayerRemainingGamesBadge(
  teamCode: string | undefined,
  weekDates: string[],          // Array of YYYY-MM-DD strings for the matchup week
  gamesByDate: Map<string, NBAGame[]>,
  todayStr?: string             // Optional: override for today's date (for testing)
): GamesRemainingInfo {
  if (!teamCode || !weekDates.length) {
    return { count: 0, dayLabels: [], isToday: false, text: "—" };
  }

  const today = todayStr || formatDateForAPI(new Date());
  
  // Filter to remaining dates (today and future within week)
  const remainingDates = weekDates.filter(d => d >= today);
  
  if (remainingDates.length === 0) {
    return { count: 0, dayLabels: [], isToday: false, text: "No games left" };
  }

  // Find which dates the team plays
  const gameDates: { dateStr: string; dayLabel: string }[] = [];
  
  for (const dateStr of remainingDates) {
    const games = gamesByDate.get(dateStr) || [];
    if (isTeamPlayingOnDate(teamCode, games)) {
      // Parse date for day label
      const date = new Date(dateStr + 'T12:00:00');
      gameDates.push({
        dateStr,
        dayLabel: getDayLabel(date),
      });
    }
  }

  const count = gameDates.length;
  const dayLabels = gameDates.slice(0, 3).map(g => g.dayLabel);
  const isToday = gameDates.length > 0 && gameDates[0].dateStr === today;

  // Build display text
  let text = "—";
  if (count === 0) {
    text = "No games left";
  } else if (isToday && count === 1) {
    text = "Today";
  } else if (isToday) {
    text = `Today +${count - 1}`;
  } else if (count === 1) {
    text = dayLabels[0];
  } else if (count <= 3) {
    text = dayLabels.join("/");
  } else {
    text = `${count}g left`;
  }

  return { count, dayLabels, isToday, text };
}
