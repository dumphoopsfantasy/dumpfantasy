/**
 * Simple import timestamp tracking via localStorage.
 * Records when each data source was last imported.
 */

const TIMESTAMP_KEY = 'dumphoops-import-timestamps';

export interface ImportTimestamps {
  roster?: number;
  freeAgents?: number;
  matchup?: number;
  standings?: number;
  weekly?: number;
}

export function getImportTimestamps(): ImportTimestamps {
  try {
    const raw = localStorage.getItem(TIMESTAMP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setImportTimestamp(key: keyof ImportTimestamps): void {
  const current = getImportTimestamps();
  current[key] = Date.now();
  localStorage.setItem(TIMESTAMP_KEY, JSON.stringify(current));
}

export function formatTimestampAge(ts?: number): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
