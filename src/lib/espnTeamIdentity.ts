import { isPlaceholderTeamName, normalizeTeamName, teamNamesMatch } from "./nameNormalization";

const recordPattern = /^\(?\d+-\d+(?:-\d+)?\)?$/;
const standingPattern = /\(?\b(\d+)(st|nd|rd|th)\s+(?:of|out of)\s+(\d+)\)?/i;
const sectionPattern = /^(Current Matchup|Last Matchup|Matchup History|STARTERS|STATS|Players)(?:\s|$)/i;
const controlPattern = /^(Get Another Team|Change|Team Settings|My Team|ESPN|Fantasy Basketball Home|Roster|Overview|Stats|Schedule|Settings|League|LM Tools|Manage Team|Edit Team Settings)$/i;

function pasteLines(data: string): string[] {
  return data.split(/[\n\t]+/).map(line => line.trim()).filter(Boolean);
}

function validName(line: string): boolean {
  return !isPlaceholderTeamName(line) && !controlPattern.test(line) &&
    !sectionPattern.test(line) && !recordPattern.test(line) && !standingPattern.test(line) &&
    !/^hsb\.|^(?:https?:|Waiver Order|Full Schedule|Add 2nd Manager)/i.test(line) &&
    /[a-z]/i.test(line) && line.length <= 100;
}

/** Owner controls take priority; matchup banners are never identity evidence. */
export function extractESPNTeamIdentity(data: string): { name: string; record: string; standing: string } {
  const lines = pasteLines(data);
  const empty = { name: "", record: "", standing: "" };
  const fromCandidate = (index: number) => {
    const name = lines[index];
    if (!name || !validName(name)) return null;
    const following = lines.slice(index + 1, index + 5);
    const record = following.find(line => recordPattern.test(line))?.replace(/[()]/g, "") ?? "";
    const standing = following.map(line => line.match(standingPattern)).find(Boolean);
    return { name, record, standing: standing ? `${standing[1]}${standing[2]} of ${standing[3]}` : "" };
  };

  // ESPN's team selector points to the page owner, even without a season record.
  for (let i = 0; i < lines.length; i++) {
    if (!/^Get Another Team$/i.test(lines[i])) continue;
    let index = i + 1;
    while (/^(Change|Team Settings)$/i.test(lines[index] ?? "")) index++;
    const candidate = fromCandidate(index);
    if (candidate) return candidate;
  }

  // Team Settings is an owner-only control; the banner may precede this block.
  for (let i = 0; i < lines.length; i++) {
    if (!/^(Team Settings|Edit Team Settings)$/i.test(lines[i])) continue;
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      if (sectionPattern.test(lines[j])) break;
      if (recordPattern.test(lines[j]) || standingPattern.test(lines[j])) continue;
      const candidate = fromCandidate(j);
      if (candidate) return candidate;
      break;
    }
  }

  // Legacy headers and changed standings punctuation, before any matchup section.
  const sectionIndex = lines.findIndex(line => sectionPattern.test(line));
  const end = sectionIndex < 0 ? lines.length : sectionIndex;
  for (let i = 1; i < end; i++) {
    const combined = lines[i].match(/^(\d+-\d+(?:-\d+)?)\s*[,·]?\s*\(?\d+(?:st|nd|rd|th)\s+(?:of|out of)\s+\d+\)?$/i);
    if (combined) {
      const candidate = fromCandidate(i - 1);
      if (candidate) return { ...candidate, record: combined[1] };
    }
    if (!standingPattern.test(lines[i])) continue;
    const nameIndex = recordPattern.test(lines[i - 1]) ? i - 2 : i - 1;
    const candidate = fromCandidate(nameIndex);
    if (candidate) return candidate;
  }
  return empty;
}

export function extractOpponentFromCurrentMatchup(data: string, myTeamName: string): string | null {
  if (isPlaceholderTeamName(myTeamName)) return null;
  const lines = pasteLines(data);
  const start = lines.findIndex(line => /^Current Matchup$/i.test(line));
  if (start < 0) return null;
  const teams: string[] = [];
  for (let i = start + 1; i < Math.min(start + 20, lines.length); i++) {
    if (/^(FG%|FT%|3PM|REB|AST|STL|BLK|TO|PTS|Last Matchup|Matchup History|Season|Stats|MIN)$/i.test(lines[i])) break;
    if (validName(lines[i]) && recordPattern.test(lines[i + 1] ?? "")) teams.push(lines[i]);
  }
  // Require the user's full identity in the banner; don't pick an arbitrary side.
  if (!teams.some(team => teamNamesMatch(team, myTeamName))) return null;
  return teams.find(team => !teamNamesMatch(team, myTeamName)) ?? null;
}

export function resolveESPNOpponentName(myPaste: string, myName: string, parsedOpponentName: string): string {
  const expected = extractOpponentFromCurrentMatchup(myPaste, myName);
  if (expected && (isPlaceholderTeamName(parsedOpponentName) ||
    normalizeTeamName(parsedOpponentName) === normalizeTeamName(myName) ||
    teamNamesMatch(parsedOpponentName, expected))) return expected;
  return parsedOpponentName;
}