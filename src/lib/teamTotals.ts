export interface TeamTotals {
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

export interface TeamTotalsWithPct extends TeamTotals {
  fgPct: number;
  ftPct: number;
}

export const emptyTotals = (): TeamTotals => ({
  fgm: 0,
  fga: 0,
  ftm: 0,
  fta: 0,
  threepm: 0,
  rebounds: 0,
  assists: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  points: 0,
});

export function addTotals(a: TeamTotals, b: TeamTotals): TeamTotals {
  return {
    fgm: a.fgm + b.fgm,
    fga: a.fga + b.fga,
    ftm: a.ftm + b.ftm,
    fta: a.fta + b.fta,
    threepm: a.threepm + b.threepm,
    rebounds: a.rebounds + b.rebounds,
    assists: a.assists + b.assists,
    steals: a.steals + b.steals,
    blocks: a.blocks + b.blocks,
    turnovers: a.turnovers + b.turnovers,
    points: a.points + b.points,
  };
}

export function withDerivedPct(t: TeamTotals): TeamTotalsWithPct {
  return {
    ...t,
    fgPct: t.fga > 0 ? t.fgm / t.fga : 0,
    ftPct: t.fta > 0 ? t.ftm / t.fta : 0,
  };
}

export function totalsFromProjectedStats(stats: {
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}): TeamTotals {
  return {
    fgm: stats.fgm,
    fga: stats.fga,
    ftm: stats.ftm,
    fta: stats.fta,
    threepm: stats.threepm,
    rebounds: stats.rebounds,
    assists: stats.assists,
    steals: stats.steals,
    blocks: stats.blocks,
    turnovers: stats.turnovers,
    points: stats.points,
  };
}
