/**
 * Tests for Slate-Aware Projection Engine
 * 
 * Tests cover:
 * - Game status parsing (NOT_STARTED, IN_PROGRESS, FINAL)
 * - Slate status building
 * - Pre-tip scenarios (all games NOT_STARTED)
 * - Mid-slate scenarios (some IN_PROGRESS)
 * - Post-slate scenarios (all FINAL)
 * - Percent math correctness
 */

import { describe, it, expect } from 'vitest';
import {
  parseGameStatus,
  buildSlateStatus,
  buildPlayerGameMap,
  filterNotStartedGames,
  projectSlateAware,
  getProjectionExplanation,
  GameStatus,
} from './slateAwareProjection';
import { NBAGame } from './nbaApi';
import { RosterSlot, Player } from '@/types/fantasy';

// Helper to create mock NBA games
function createMockGame(overrides: Partial<NBAGame> = {}): NBAGame {
  return {
    gameId: 'game-1',
    homeTeam: 'LAL',
    awayTeam: 'BOS',
    homeScore: 0,
    awayScore: 0,
    status: 'Scheduled',
    gameTime: '7:00 PM ET',
    isLive: false,
    ...overrides,
  };
}

// Helper to create mock player
function createMockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'Test Player',
    nbaTeam: 'LAL',
    positions: ['PG'],
    minutes: 30,
    fgm: 5,
    fga: 10,
    fgPct: 0.5,
    ftm: 3,
    fta: 4,
    ftPct: 0.75,
    threepm: 2,
    rebounds: 5,
    assists: 6,
    steals: 1.5,
    blocks: 0.5,
    turnovers: 2,
    points: 15,
    ...overrides,
  };
}

// Helper to create mock roster slot
function createMockSlot(player: Player, slotType: 'starter' | 'bench' | 'ir' = 'starter'): RosterSlot {
  return { player, slotType, slot: 'PG' };
}

describe('parseGameStatus', () => {
  it('returns NOT_STARTED for Scheduled games', () => {
    expect(parseGameStatus('Scheduled')).toBe('NOT_STARTED');
    expect(parseGameStatus('')).toBe('NOT_STARTED');
    expect(parseGameStatus('7:00 PM ET')).toBe('NOT_STARTED');
  });

  it('returns IN_PROGRESS for live games', () => {
    expect(parseGameStatus('In Progress')).toBe('IN_PROGRESS');
    expect(parseGameStatus('1st Qtr')).toBe('IN_PROGRESS');
    expect(parseGameStatus('2nd Qtr')).toBe('IN_PROGRESS');
    expect(parseGameStatus('Halftime')).toBe('IN_PROGRESS');
    expect(parseGameStatus('3rd Qtr')).toBe('IN_PROGRESS');
    expect(parseGameStatus('4th Qtr')).toBe('IN_PROGRESS');
    expect(parseGameStatus('OT')).toBe('IN_PROGRESS');
  });

  it('returns FINAL for completed games', () => {
    expect(parseGameStatus('Final')).toBe('FINAL');
    expect(parseGameStatus('Final/OT')).toBe('FINAL');
  });
});

describe('buildSlateStatus', () => {
  it('returns correct counts for pre-tip slate', () => {
    const games: NBAGame[] = [
      createMockGame({ gameId: '1', status: 'Scheduled' }),
      createMockGame({ gameId: '2', status: 'Scheduled' }),
      createMockGame({ gameId: '3', status: 'Scheduled' }),
    ];

    const status = buildSlateStatus(games, '2026-01-04');
    
    expect(status.notStarted).toBe(3);
    expect(status.inProgress).toBe(0);
    expect(status.final).toBe(0);
    expect(status.totalGames).toBe(3);
    expect(status.todayHasStartedGames).toBe(false);
    expect(status.allTodayGamesComplete).toBe(false);
  });

  it('returns correct counts for mid-slate', () => {
    const games: NBAGame[] = [
      createMockGame({ gameId: '1', status: 'Final' }),
      createMockGame({ gameId: '2', status: 'In Progress' }),
      createMockGame({ gameId: '3', status: 'Scheduled' }),
    ];

    const status = buildSlateStatus(games, '2026-01-04');
    
    expect(status.notStarted).toBe(1);
    expect(status.inProgress).toBe(1);
    expect(status.final).toBe(1);
    expect(status.totalGames).toBe(3);
    expect(status.todayHasStartedGames).toBe(true);
    expect(status.allTodayGamesComplete).toBe(false);
  });

  it('returns correct counts for post-slate', () => {
    const games: NBAGame[] = [
      createMockGame({ gameId: '1', status: 'Final' }),
      createMockGame({ gameId: '2', status: 'Final' }),
      createMockGame({ gameId: '3', status: 'Final' }),
    ];

    const status = buildSlateStatus(games, '2026-01-04');
    
    expect(status.notStarted).toBe(0);
    expect(status.inProgress).toBe(0);
    expect(status.final).toBe(3);
    expect(status.totalGames).toBe(3);
    expect(status.todayHasStartedGames).toBe(true);
    expect(status.allTodayGamesComplete).toBe(true);
  });

  it('handles empty game slate', () => {
    const status = buildSlateStatus([], '2026-01-04');
    
    expect(status.totalGames).toBe(0);
    expect(status.todayHasStartedGames).toBe(false);
    expect(status.allTodayGamesComplete).toBe(false);
  });
});

describe('buildPlayerGameMap', () => {
  it('maps players to their scheduled games', () => {
    const player = createMockPlayer({ id: 'p1', nbaTeam: 'LAL' });
    const roster: RosterSlot[] = [createMockSlot(player)];
    
    const gamesByDate = new Map<string, NBAGame[]>([
      ['2026-01-04', [createMockGame({ homeTeam: 'LAL', awayTeam: 'BOS', status: 'Scheduled' })]],
      ['2026-01-05', [createMockGame({ homeTeam: 'GSW', awayTeam: 'LAL', status: 'Scheduled' })]],
    ]);
    
    const map = buildPlayerGameMap(roster, gamesByDate);
    
    expect(map.has('p1')).toBe(true);
    expect(map.get('p1')?.length).toBe(2);
  });

  it('excludes IR players', () => {
    const player = createMockPlayer({ id: 'p1', nbaTeam: 'LAL' });
    const roster: RosterSlot[] = [createMockSlot(player, 'ir')];
    
    const gamesByDate = new Map<string, NBAGame[]>([
      ['2026-01-04', [createMockGame({ homeTeam: 'LAL', awayTeam: 'BOS' })]],
    ]);
    
    const map = buildPlayerGameMap(roster, gamesByDate);
    
    expect(map.has('p1')).toBe(false);
  });
});

describe('filterNotStartedGames', () => {
  it('only includes NOT_STARTED games', () => {
    const player = createMockPlayer({ id: 'p1', nbaTeam: 'LAL' });
    const roster: RosterSlot[] = [createMockSlot(player)];
    
    const gamesByDate = new Map<string, NBAGame[]>([
      ['2026-01-04', [createMockGame({ homeTeam: 'LAL', awayTeam: 'BOS', status: 'Final' })]],
      ['2026-01-05', [createMockGame({ homeTeam: 'GSW', awayTeam: 'LAL', status: 'In Progress' })]],
      ['2026-01-06', [createMockGame({ homeTeam: 'LAL', awayTeam: 'PHX', status: 'Scheduled' })]],
    ]);
    
    const fullMap = buildPlayerGameMap(roster, gamesByDate);
    const filteredMap = filterNotStartedGames(fullMap);
    
    expect(filteredMap.get('p1')?.length).toBe(1);
    expect(filteredMap.get('p1')?.[0].date).toBe('2026-01-06');
  });
});

describe('projectSlateAware', () => {
  it('excludes started games from remaining projection', () => {
    const player = createMockPlayer({ id: 'p1', nbaTeam: 'LAL', points: 20 });
    const roster: RosterSlot[] = [createMockSlot(player)];
    
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Today's game is IN_PROGRESS (should be excluded)
    // Tomorrow's game is Scheduled (should be included)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    
    const gamesByDate = new Map<string, NBAGame[]>([
      [todayStr, [createMockGame({ homeTeam: 'LAL', awayTeam: 'BOS', status: 'In Progress' })]],
      [tomorrowStr, [createMockGame({ homeTeam: 'LAL', awayTeam: 'PHX', status: 'Scheduled' })]],
    ]);
    
    const result = projectSlateAware({
      roster,
      gamesByDate,
      weekDates: [todayStr, tomorrowStr],
    });
    
    expect(result.excludedStartedGames).toBe(1);
    expect(result.includedNotStartedGames).toBe(1);
  });

  it('computes FG% from makes/attempts correctly', () => {
    const player = createMockPlayer({ 
      id: 'p1', 
      nbaTeam: 'LAL',
      fgm: 5,
      fga: 10, // 50% FG
      ftm: 4,
      fta: 5, // 80% FT
    });
    const roster: RosterSlot[] = [createMockSlot(player)];
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    
    const gamesByDate = new Map<string, NBAGame[]>([
      [tomorrowStr, [createMockGame({ homeTeam: 'LAL', awayTeam: 'BOS', status: 'Scheduled' })]],
    ]);
    
    const result = projectSlateAware({
      roster,
      gamesByDate,
      weekDates: [tomorrowStr],
    });
    
    // FG% should be computed from makes/attempts, not averaged
    expect(result.projection.totalStats.fga).toBeGreaterThan(0);
    expect(result.projection.totalStats.fgPct).toBeCloseTo(
      result.projection.totalStats.fgm / result.projection.totalStats.fga,
      3
    );
  });

  it('returns zero projections for post-slate scenario', () => {
    const player = createMockPlayer({ id: 'p1', nbaTeam: 'LAL', points: 20 });
    const roster: RosterSlot[] = [createMockSlot(player)];
    
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // All games are FINAL
    const gamesByDate = new Map<string, NBAGame[]>([
      [todayStr, [createMockGame({ homeTeam: 'LAL', awayTeam: 'BOS', status: 'Final' })]],
    ]);
    
    const result = projectSlateAware({
      roster,
      gamesByDate,
      weekDates: [todayStr],
    });
    
    // All games excluded, so no remaining projection
    expect(result.excludedStartedGames).toBe(1);
    expect(result.includedNotStartedGames).toBe(0);
    expect(result.projection.totalStartedGames).toBe(0);
  });
});

describe('getProjectionExplanation', () => {
  it('returns pre-tip explanation', () => {
    const status = buildSlateStatus([
      createMockGame({ status: 'Scheduled' }),
    ], '2026-01-04');
    
    const explanation = getProjectionExplanation(status);
    expect(explanation).toContain('yesterday');
    expect(explanation).toContain('today');
  });

  it('returns mid-slate explanation', () => {
    const status = buildSlateStatus([
      createMockGame({ status: 'In Progress' }),
      createMockGame({ status: 'Scheduled' }),
    ], '2026-01-04');
    
    const explanation = getProjectionExplanation(status);
    expect(explanation).toContain('already started');
    expect(explanation).toContain('not started');
  });

  it('returns post-slate explanation', () => {
    const status = buildSlateStatus([
      createMockGame({ status: 'Final' }),
    ], '2026-01-04');
    
    const explanation = getProjectionExplanation(status);
    expect(explanation).toContain('complete');
    expect(explanation).toContain('future');
  });
});
