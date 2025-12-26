/**
 * Development-only logging utility
 * 
 * Logs are only output in development mode to avoid exposing
 * internal application details in production.
 */

const isDev = import.meta.env.DEV;

/**
 * Log a message only in development mode
 */
export function devLog(...args: unknown[]): void {
  if (isDev) {
    console.log(...args);
  }
}

/**
 * Log a warning only in development mode
 */
export function devWarn(...args: unknown[]): void {
  if (isDev) {
    console.warn(...args);
  }
}

/**
 * Log an error only in development mode
 * Note: For actual error handling, use proper error boundaries
 * and error tracking services in production
 */
export function devError(...args: unknown[]): void {
  if (isDev) {
    console.error(...args);
  }
}
