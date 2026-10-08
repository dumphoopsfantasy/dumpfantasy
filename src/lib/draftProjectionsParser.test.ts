// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseHtmlTable } from './draftParsers';
import { applyDraftCris } from '@/hooks/useDraftState';
import type { UnifiedPlayer } from '@/types/draft';

const names = [['Jalen Brunson', 'NY', 'PG', 'PHI'], ['Luka Doncic', 'LAL', 'PG', 'DAL']];
const bios = `<table><thead><tr><th>Players</th></tr><tr><th>Player</th><th>opp</th></tr></thead><tbody>${names
  .map(([n, t, p, o]) => `<tr><td><a>${n}</a><span>${t}</span><span>${p}</span></td><td>${o}</td></tr>`).join('')}</tbody></table>`;
const stats = `<table><thead><tr><th>Stats</th></tr><tr><th>FG%</th><th>FT%</th><th>3PM</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PTS</th></tr></thead><tbody>
<tr><td>.480</td><td>.840</td><td>2.8</td><td>3.5</td><td>7.0</td><td>0.9</td><td>0.2</td><td>2.6</td><td>26.0</td></tr>
<tr><td>.470</td><td>.780</td><td>3.5</td><td>8.5</td><td>8.0</td><td>1.5</td><td>0.5</td><td>3.5</td><td>30.0</td></tr></tbody></table>`;

describe('ESPN projections HTML (split tables)', () => {
  const r = parseHtmlTable(bios + stats, 'projections');
  it('keeps stat columns from the side-by-side stats table', () => {
    expect(r.players[0].stats?.pts).toBe(26);
    expect(r.players[1].stats?.reb).toBe(8.5);
  });
  it('takes team from the player cell, not the opponent column', () => {
    expect(r.players.map(p => p.team)).toEqual(['NY', 'LAL']);
  });
});

describe('applyDraftCris', () => {
  it('ranks within pool and sets value = adpRank - crisRank', () => {
    const mk = (id: string, pts: number, adpRank: number): UnifiedPlayer => ({
      id, name: id, nameNormalized: id, team: null, positions: [], status: null,
      sources: { projections: { rank: 1, stats: { fgPct: .4 + pts / 300, ftPct: .7 + pts / 300, threes: pts / 10, reb: pts / 5, ast: pts / 5, stl: pts / 20, blk: pts / 20, to: 1, pts } }, adp: null, lastYear: null },
      crisRank: null, adpRank, lastYearRank: null, valueVsAdp: null, valueVsLastYear: null,
      drafted: false, draftedBy: null, draftedAt: null,
    } as UnifiedPlayer);
    const out = applyDraftCris([mk('a', 10, 1), mk('b', 30, 5)]);
    const b = out.find(p => p.id === 'b')!;
    expect(b.crisRank).toBe(1);
    expect(b.valueVsAdp).toBe(4);
  });
});
