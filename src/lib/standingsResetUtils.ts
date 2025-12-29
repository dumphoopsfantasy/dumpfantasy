/**
 * Utility for safely resetting Standings + Schedule Forecast data
 */

// All localStorage keys used by Standings + Schedule Forecast
export const STANDINGS_RESET_KEYS = [
  'dumphoops-standings',
  'dumphoops-schedule.v2',
  'dumphoops-schedule-aliases.v2',
  'dumphoops-schedule-currentWeekCutoff.v2',
] as const;

/**
 * Clear all Standings + Schedule Forecast keys from localStorage
 */
export function clearStandingsLocalStorage(): void {
  STANDINGS_RESET_KEYS.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`Failed to remove localStorage key "${key}":`, e);
    }
  });
}

/**
 * Execute a hard reset with UI thread yielding and optional page reload.
 * @param onClearState - Callback to reset in-memory state
 * @param shouldReload - Whether to reload the page after clearing (default: true)
 */
export function executeHardReset(
  onClearState: () => void,
  shouldReload: boolean = true
): Promise<void> {
  return new Promise((resolve) => {
    // Yield to UI thread before heavy work
    requestAnimationFrame(() => {
      // Clear localStorage
      clearStandingsLocalStorage();
      
      // Clear in-memory state in one batch
      onClearState();
      
      if (shouldReload) {
        // Small delay to let state updates flush before reload
        setTimeout(() => {
          window.location.reload();
        }, 50);
      } else {
        resolve();
      }
    });
  });
}
