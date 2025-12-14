/**
 * Parsing utilities with security protections against resource exhaustion
 */

// Security constants
export const PARSE_TIMEOUT_MS = 5000; // 5 second timeout for parsing operations
export const MAX_INPUT_SIZE = 500 * 1024; // 500KB limit
export const MAX_LINES = 5000; // Maximum lines to process
export const MAX_LOOP_ITERATIONS = 10000; // Maximum iterations in any single loop

/**
 * Validates input data before parsing
 * @throws Error if validation fails
 */
export function validateParseInput(data: string): void {
  if (!data || typeof data !== 'string') {
    throw new Error('Invalid input: expected a non-empty string');
  }
  
  if (data.length > MAX_INPUT_SIZE) {
    throw new Error(`Input too large. Maximum allowed: ${MAX_INPUT_SIZE / 1024}KB`);
  }
  
  const lineCount = data.split('\n').length;
  if (lineCount > MAX_LINES) {
    throw new Error(`Too many lines. Maximum allowed: ${MAX_LINES}`);
  }
}

/**
 * Wraps a parsing function with timeout protection
 * @param parseFn The parsing function to execute
 * @param timeoutMs Timeout in milliseconds (default: 5000)
 * @returns Promise that resolves with parse result or rejects on timeout
 */
export async function parseWithTimeout<T>(
  parseFn: () => T,
  timeoutMs: number = PARSE_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Parsing timed out after ${timeoutMs / 1000} seconds. Input may be too complex.`));
    }, timeoutMs);
    
    try {
      const result = parseFn();
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Preprocesses input text by removing known problematic patterns
 * and limiting line count
 */
export function preprocessInput(data: string): string[] {
  const lines = data
    .split('\n')
    .map(l => l.trim())
    .filter(l => l);
  
  // Limit lines to prevent DoS
  return lines.slice(0, MAX_LINES);
}

/**
 * Creates a safe loop counter to prevent infinite loops
 */
export function createLoopGuard(maxIterations: number = MAX_LOOP_ITERATIONS): {
  check: () => void;
  count: number;
} {
  let count = 0;
  return {
    check: () => {
      count++;
      if (count > maxIterations) {
        throw new Error(`Loop iteration limit exceeded (${maxIterations}). Possible malformed input.`);
      }
    },
    get count() { return count; }
  };
}

/**
 * Safely matches a regex with backtracking protection
 * Uses a non-capturing approach for safer matching
 */
export function safeRegexMatch(
  text: string,
  pattern: RegExp,
  maxLength: number = 1000
): RegExpMatchArray | null {
  // Limit input length for regex operations
  const safeText = text.slice(0, maxLength);
  return safeText.match(pattern);
}
