// Utilities for normalizing ESPN copy/paste tokens that represent missing values.
// ESPN often uses unicode dashes (—, –) and fraction dashes (—/—) which can break
// fixed-width token parsing unless canonicalized.

export function normalizeMissingToken(token: string): string {
  const raw = (token ?? "").trim();
  if (!raw) return raw;

  // Canonicalize spaces around slash so "-- / --" becomes "--/--".
  const compactSlash = raw.replace(/\s*\/\s*/g, "/");

  // Canonicalize single-value missing tokens: —, –, -- -> "--"
  // Only treat pure dash tokens as missing (avoid touching negative numbers).
  if (/^(?:--|—|–)$/.test(compactSlash)) return "--";

  // Canonicalize missing fraction tokens: —/—, –/–, --/-- -> "--/--"
  if (/^(?:--|—|–)\/(?:--|—|–)$/.test(compactSlash)) return "--/--";

  return compactSlash;
}

export function isMissingToken(token: string): boolean {
  return normalizeMissingToken(token) === "--";
}

export function isMissingFractionToken(token: string): boolean {
  return normalizeMissingToken(token) === "--/--";
}
