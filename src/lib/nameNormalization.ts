/**
 * Name normalization helpers for matching ESPN schedule/standings entities.
 */

export function normalizeName(input: string): string {
  if (!input) return "";

  return input
    .toLowerCase()
    .trim()
    // Normalize curly quotes
    .replace(/[’‘‛❛❜]/g, "'")
    .replace(/[“”]/g, '"')
    // Replace non-alphanumeric with spaces
    .replace(/[^a-z0-9]+/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

export function makeScheduleTeamKey(teamName: string, managerName?: string): string {
  const t = normalizeName(teamName);
  const m = normalizeName(managerName || "");
  return m ? `${t}|${m}` : t;
}

export function isProbablyRecordToken(token: string): boolean {
  const t = token.trim();
  return /^\(?\d+-\d+-\d+\)?$/.test(t);
}

export function stripRecordParens(token: string): string {
  return token.replace(/^\(/, "").replace(/\)$/, "").trim();
}

export function isProbablyPersonName(token: string): boolean {
  const t = token.trim();
  // e.g. "Demitri Voyiatzis" or "First Last Jr"
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(t);
}

export function fuzzyNameMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Require some minimum length to avoid matching "a" etc.
  if (na.length < 4 || nb.length < 4) return false;
  return na.includes(nb) || nb.includes(na);
}
