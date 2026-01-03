/**
 * Unit tests for Schedule-Aware Projection Engine
 * 
 * Tests:
 * - Empty slot reduces started games
 * - Overflow days benching works
 * - O/IR => 0 games
 * - FG%/FT% computed via makes/attempts
 * - Shrinkage blending for partial stats
 */

import {
  getInjuryMultiplier,
  applyShrinkageBlend,
  fillLineupsForDay,
  projectWeek,
  STANDARD_LINEUP_SLOTS,
  getMatchupWeekDates,
  getRemainingMatchupDates,
} from './scheduleAwareProjection';
import { RosterSlot, Player } from '@/types/fantasy';
import { NBAGame } from '@/lib/nbaApi';

// Simple test runner for non-vitest environments
const describe = (name: string, fn: () => void) => { console.log(`Test suite: ${name}`); fn(); };
const it = (name: string, fn: () => void) => { try { fn(); console.log(`  ✓ ${name}`); } catch(e) { console.error(`  ✗ ${name}:`, e); } };
const expect = (val: any) => ({
  toBe: (expected: any) => { if (val !== expected) throw new Error(`Expected ${val} to be ${expected}`); },
  toBeCloseTo: (expected: number, precision: number = 2) => { if (Math.abs(val - expected) > Math.pow(10, -precision)) throw new Error(`Expected ${val} to be close to ${expected}`); },
  toBeLessThan: (expected: number) => { if (val >= expected) throw new Error(`Expected ${val} to be less than ${expected}`); },
  toBeGreaterThan: (expected: number) => { if (val <= expected) throw new Error(`Expected ${val} to be greater than ${expected}`); },
  toBeUndefined: () => { if (val !== undefined) throw new Error(`Expected ${val} to be undefined`); },
  toMatch: (pattern: RegExp) => { if (!pattern.test(val)) throw new Error(`Expected ${val} to match ${pattern}`); },
});

// Helper to create a mock player
function createMockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'Test Player',
    nbaTeam: 'LAL',
    positions: ['PG'],
    minutes: 30,
    fgm: 5,
    fga: 12,
    fgPct: 0.417,
    ftm: 3,
    fta: 4,
    ftPct: 0.75,
    threepm: 2,
    rebounds: 4,
    assists: 6,
    steals: 1.5,
    blocks: 0.3,
    turnovers: 2.5,
    points: 15,
    ...overrides,
  };
}

// Helper to create a mock roster slot
function createMockSlot(player: Player, slotType: 'starter' | 'bench' | 'ir' = 'starter'): RosterSlot {
  return {
    slot: slotType === 'ir' ? 'IR' : slotType === 'bench' ? 'Bench' : 'PG',
    slotType,
    player,
  };
}

// Helper to create mock games
function createMockGame(homeTeam: string, awayTeam: string): NBAGame {
  return {
    gameId: `${homeTeam}-${awayTeam}`,
    homeTeam,
    awayTeam,
    homeScore: 0,
    awayScore: 0,
    status: 'Scheduled',
  };
}

describe('getInjuryMultiplier', () => {
  it('returns 1.0 for healthy players', () => {
    expect(getInjuryMultiplier(undefined)).toBe(1.0);
    expect(getInjuryMultiplier('healthy')).toBe(1.0);
    expect(getInjuryMultiplier('')).toBe(1.0);
  });

  it('returns 0 for OUT/IR/SUSP players', () => {
    expect(getInjuryMultiplier('O')).toBe(0);
    expect(getInjuryMultiplier('OUT')).toBe(0);
    expect(getInjuryMultiplier('IR')).toBe(0);
    expect(getInjuryMultiplier('SUSP')).toBe(0);
    expect(getInjuryMultiplier('INJ (O)')).toBe(0);
  });

  it('returns 0.6 for DTD players', () => {
    expect(getInjuryMultiplier('DTD')).toBe(0.6);
  });

  it('returns 0.7 for Questionable players', () => {
    expect(getInjuryMultiplier('Q')).toBe(0.7);
    expect(getInjuryMultiplier('QUESTIONABLE')).toBe(0.7);
  });

  it('returns 0.85 for GTD/Probable players', () => {
    expect(getInjuryMultiplier('GTD')).toBe(0.85);
    expect(getInjuryMultiplier('P')).toBe(0.85);
    expect(getInjuryMultiplier('PROBABLE')).toBe(0.85);
  });
});

describe('applyShrinkageBlend', () => {
  const SHRINKAGE_K = 10;

  it('uses fallback when observed value is null/undefined', () => {
    const result = applyShrinkageBlend(null, 10, 5);
    expect(result.value).toBe(10);
    expect(result.usedShrinkage).toBe(true);
  });

  it('trusts observed value when games >= K', () => {
    const result = applyShrinkageBlend(15, 10, 15);
    expect(result.value).toBe(15);
    expect(result.usedShrinkage).toBe(false);
  });

  it('blends values when games < K', () => {
    // w = 5 / (5 + 10) = 0.333
    // blended = 0.333 * 15 + 0.667 * 10 = 5 + 6.67 = 11.67
    const result = applyShrinkageBlend(15, 10, 5);
    expect(result.value).toBeCloseTo(11.67, 1);
    expect(result.usedShrinkage).toBe(true);
  });
});

describe('fillLineupsForDay', () => {
  it('prioritizes more constrained players (fewer eligible slots)', () => {
    // PG-only player vs UTIL-eligible player
    const players = [
      { playerId: 'util', positions: ['PG', 'SG', 'SF'], injuryMultiplier: 1.0 },
      { playerId: 'pg-only', positions: ['PG'], injuryMultiplier: 1.0 },
    ];
    
    const result = fillLineupsForDay(players);
    
    // PG-only should get the PG slot
    expect(result.get('pg-only')).toBe(1.0);
    // UTIL player should get a different slot
    expect(result.get('util')).toBe(1.0);
  });

  it('applies injury multiplier to started games', () => {
    const players = [
      { playerId: 'dtd', positions: ['PG'], injuryMultiplier: 0.6 },
    ];
    
    const result = fillLineupsForDay(players);
    expect(result.get('dtd')).toBe(0.6);
  });

  it('excludes players with 0 injury multiplier', () => {
    const players = [
      { playerId: 'out', positions: ['PG'], injuryMultiplier: 0 },
      { playerId: 'healthy', positions: ['SG'], injuryMultiplier: 1.0 },
    ];
    
    const result = fillLineupsForDay(players);
    expect(result.has('out')).toBe(false);
    expect(result.get('healthy')).toBe(1.0);
  });

  it('limits to available lineup slots', () => {
    // More players than slots
    const players = [
      { playerId: 'pg', positions: ['PG'], injuryMultiplier: 1.0 },
      { playerId: 'sg', positions: ['SG'], injuryMultiplier: 1.0 },
      { playerId: 'sf', positions: ['SF'], injuryMultiplier: 1.0 },
      { playerId: 'pf', positions: ['PF'], injuryMultiplier: 1.0 },
      { playerId: 'c', positions: ['C'], injuryMultiplier: 1.0 },
      { playerId: 'g1', positions: ['PG', 'SG'], injuryMultiplier: 1.0 },
      { playerId: 'g2', positions: ['PG', 'SG'], injuryMultiplier: 1.0 }, // G slot
      { playerId: 'f1', positions: ['SF', 'PF'], injuryMultiplier: 1.0 }, // F slot
      { playerId: 'util', positions: ['C'], injuryMultiplier: 1.0 }, // UTIL slot
      { playerId: 'extra', positions: ['PG'], injuryMultiplier: 1.0 }, // Should be benched
    ];
    
    const result = fillLineupsForDay(players);
    
    // Should fill exactly 8 slots
    expect(result.size).toBe(8);
  });
});

describe('projectWeek', () => {
  it('projects zero games for IR players', () => {
    const roster: RosterSlot[] = [
      createMockSlot(createMockPlayer({ id: 'ir-player', nbaTeam: 'LAL' }), 'ir'),
    ];
    
    const gamesByDate = new Map<string, NBAGame[]>();
    gamesByDate.set('2026-01-06', [createMockGame('LAL', 'BOS')]);
    
    const result = projectWeek({
      roster,
      weekDates: ['2026-01-06'],
      gamesByDate,
    });
    
    // IR player should have 0 started games
    const irPlayerProj = result.playerProjections.find(p => p.playerId === 'ir-player');
    expect(irPlayerProj).toBeUndefined(); // IR players are filtered out
  });

  it('computes FG%/FT% from makes/attempts, not averaging', () => {
    // Two players with different shooting percentages
    const roster: RosterSlot[] = [
      createMockSlot(createMockPlayer({ 
        id: 'p1', 
        nbaTeam: 'LAL',
        positions: ['PG'],
        fgm: 6, fga: 10, // 60%
        ftm: 4, fta: 5,  // 80%
      })),
      createMockSlot(createMockPlayer({ 
        id: 'p2', 
        nbaTeam: 'BOS',
        positions: ['SG'],
        fgm: 4, fga: 10, // 40%
        ftm: 6, fta: 10, // 60%
      })),
    ];
    
    const gamesByDate = new Map<string, NBAGame[]>();
    gamesByDate.set('2026-01-06', [
      createMockGame('LAL', 'DEN'),
      createMockGame('BOS', 'MIA'),
    ]);
    
    const result = projectWeek({
      roster,
      weekDates: ['2026-01-06'],
      gamesByDate,
    });
    
    // FG%: (6 + 4) / (10 + 10) = 10/20 = 50%, not (60% + 40%) / 2 = 50%
    // This case happens to be same, but the method is different
    expect(result.totalStats.fgPct).toBeCloseTo(0.5, 2);
    
    // FT%: (4 + 6) / (5 + 10) = 10/15 = 66.67%, not (80% + 60%) / 2 = 70%
    expect(result.totalStats.ftPct).toBeCloseTo(10/15, 2);
  });

  it('counts bench overflow when more players than slots', () => {
    // Create 10 PG players, only 2 PG-eligible slots
    const roster: RosterSlot[] = Array.from({ length: 10 }, (_, i) => 
      createMockSlot(createMockPlayer({ 
        id: `pg-${i}`, 
        nbaTeam: 'LAL',
        positions: ['PG'],
      }))
    );
    
    const gamesByDate = new Map<string, NBAGame[]>();
    gamesByDate.set('2026-01-06', [createMockGame('LAL', 'BOS')]);
    
    const result = projectWeek({
      roster,
      weekDates: ['2026-01-06'],
      gamesByDate,
    });
    
    // Only PG and G slots can hold PGs (2 slots)
    // Plus UTIL = 3 slots total for PGs
    // So 10 - 3 = 7 players benched
    expect(result.totalBenchOverflow).toBeGreaterThan(0);
  });

  it('applies DTD multiplier to expected games', () => {
    const roster: RosterSlot[] = [
      createMockSlot(createMockPlayer({
        id: 'dtd-player',
        nbaTeam: 'LAL',
        positions: ['PG'],
        status: 'DTD',
      })),
    ];

    const gamesByDate = new Map<string, NBAGame[]>();
    gamesByDate.set('2026-01-06', [createMockGame('LAL', 'BOS')]);

    const result = projectWeek({
      roster,
      weekDates: ['2026-01-06'],
      gamesByDate,
    });

    const dtdProj = result.playerProjections.find((p) => p.playerId === 'dtd-player');
    expect(dtdProj?.injuryMultiplier).toBe(0.6);
    expect(dtdProj?.expectedStartedGames).toBe(0.6);
  });

  it('matches schedule games when roster uses ESPN-style team codes (e.g., UTAH)', () => {
    const roster: RosterSlot[] = [
      createMockSlot(createMockPlayer({
        id: 'uta-player',
        nbaTeam: 'UTAH',
        positions: ['PF'],
      })),
    ];

    const gamesByDate = new Map<string, NBAGame[]>();
    gamesByDate.set('2026-01-06', [createMockGame('UTA', 'GSW')]);

    const result = projectWeek({
      roster,
      weekDates: ['2026-01-06'],
      gamesByDate,
    });

    expect(result.totalStartedGames).toBeCloseTo(1.0, 2);
  });

  it('falls back for shooting volume when makes/attempts are missing (0) but player has production', () => {
    const roster: RosterSlot[] = [
      createMockSlot(createMockPlayer({
        id: 'missing-shooting',
        nbaTeam: 'LAL',
        positions: ['SG'],
        gamesPlayed: 60,
        minutes: 32,
        points: 22,
        fgm: 0,
        fga: 0,
        ftm: 0,
        fta: 0,
        fgPct: 0,
        ftPct: 0,
      })),
    ];

    const gamesByDate = new Map<string, NBAGame[]>();
    gamesByDate.set('2026-01-06', [createMockGame('LAL', 'BOS')]);

    const result = projectWeek({
      roster,
      weekDates: ['2026-01-06'],
      gamesByDate,
    });

    // Should not end up with 0 attempts (which would force 0.000 FG%/FT%)
    expect(result.totalStats.fga).toBeGreaterThan(0);
    expect(result.totalStats.fgm).toBeGreaterThan(0);
    expect(result.totalStats.fgPct).toBeGreaterThan(0);

    expect(result.totalStats.fta).toBeGreaterThan(0);
    expect(result.totalStats.ftm).toBeGreaterThan(0);
    expect(result.totalStats.ftPct).toBeGreaterThan(0);
  });
});

describe('getMatchupWeekDates', () => {
  it('returns 7 dates', () => {
    const dates = getMatchupWeekDates();
    expect(dates.length).toBe(7);
  });

  it('returns dates in YYYY-MM-DD format', () => {
    const dates = getMatchupWeekDates();
    dates.forEach(d => {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('getRemainingMatchupDates', () => {
  it('returns dates >= today', () => {
    const remaining = getRemainingMatchupDates();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    remaining.forEach(d => {
      expect(d >= todayStr).toBe(true);
    });
  });
});
