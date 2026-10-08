import { describe, it, expect } from 'vitest';
import { parseAdpTextWithHeaders } from './draftParsers';

const header = ['Players\tStatus\tOctober 20\tTrends', 'Player', 'type', 'action', 'opp', 'STATUS', 'PR7', 'PR15', 'PR30', '2027', 'PRK', 'ADP', '%ROST', '+/-'];
const row = (n: string, t: string, adp: string, rost: string) =>
  [`${n}${n}`, n, t, 'C', 'FA', '--', '--', '--', '--', '--', adp, rost, '0'];

describe('ADP multi-line header paste', () => {
  it('finds ADP as the number before %ROST', () => {
    const text = [...header, ...row('Nikola Jokic', 'DEN', '1.5', '99.9'), ...row('Luka Doncic', 'LAL', '3.2', '99.8')].join('\n');
    const r = parseAdpTextWithHeaders(text);
    expect(r.players.map(p => [p.playerName, p.avgPick])).toEqual([['Nikola Jokic', 1.5], ['Luka Doncic', 3.2]]);
  });
  it('reports detected headers when no ADP header exists', () => {
    const r = parseAdpTextWithHeaders('PR7\nPR15\nfoo bar');
    expect(r.errors[0]).toContain('PR7');
  });
});

import realPaste from './__fixtures__/espnFaAdpPaste.txt?raw';
describe('real ESPN free-agent paste', () => {
  it('imports all 17 players with ADP before %ROST, including DTD players', () => {
    const r = parseAdpTextWithHeaders(realPaste);
    expect(r.players.length).toBe(17);
    const by = Object.fromEntries(r.players.map(p => [p.playerName, p]));
    expect(by['James Harden'].avgPick).toBe(28.3);
    expect(by['Stephen Curry'].avgPick).toBe(28.7);
    expect(by['Stephen Curry'].team).toBe('GS');
    expect(by['Kyrie Irving'].avgPick).toBe(59.5);
  });
});
