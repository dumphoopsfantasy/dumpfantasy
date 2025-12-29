import { useState, useEffect } from 'react';

/**
 * Custom hook for persisting state to localStorage
 * @param key - The localStorage key
 * @param defaultValue - Default value if nothing is stored
 * @returns [value, setValue] - Same interface as useState
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  // Initialize state from localStorage or default
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      // Check for valid stored value (not null, not empty, not literal "undefined")
      if (stored && stored !== "undefined" && stored !== "null") {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      // Remove corrupted localStorage entry
      try {
        localStorage.removeItem(key);
      } catch {}
    }
    return defaultValue;
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.warn(`Error writing to localStorage key "${key}":`, error);
    }
  }, [key, state]);

  return [state, setState];
}

/**
 * Clear all persisted DumpHoops data from localStorage
 */
export function clearPersistedData() {
  const keys = [
    'dumphoops-roster',
    'dumphoops-freeagents',
    'dumphoops-weekly',
    'dumphoops-weekly-title',
    'dumphoops-standings',
    'dumphoops-matchup',
    'dumphoops-weights',
  ];
  keys.forEach(key => localStorage.removeItem(key));
}
