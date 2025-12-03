import { Player, RosterSlot, FantasyTeam, WeeklyStats, MatchupProjection } from "@/types/fantasy";

// Sample roster data based on user's team
export const sampleRoster: RosterSlot[] = [
  {
    slot: "PG",
    slotType: "starter",
    player: {
      id: "1",
      name: "Jamal Murray",
      nbaTeam: "DEN",
      positions: ["PG"],
      minutes: 34.8,
      fgm: 8.4, fga: 17.3, fgPct: 0.483,
      ftm: 3.6, fta: 4.0, ftPct: 0.895,
      threepm: 2.9, rebounds: 4.5, assists: 6.7,
      steals: 1.1, blocks: 0.3, turnovers: 2.5, points: 23.3,
      cris: 10.03, rostPct: 99.4,
    }
  },
  {
    slot: "SG",
    slotType: "starter",
    player: {
      id: "2",
      name: "Reed Sheppard",
      nbaTeam: "HOU",
      positions: ["SG"],
      minutes: 25.2,
      fgm: 5.1, fga: 10.4, fgPct: 0.484,
      ftm: 0.8, fta: 1.2, ftPct: 0.714,
      threepm: 2.7, rebounds: 2.9, assists: 3.3,
      steals: 1.7, blocks: 0.5, turnovers: 1.2, points: 13.7,
      cris: 6.88, rostPct: 65.6,
    }
  },
  {
    slot: "SF",
    slotType: "starter",
    player: {
      id: "3",
      name: "Saddiq Bey",
      nbaTeam: "NOP",
      positions: ["SF", "PF"],
      opponent: "Min",
      gameTime: "8:00 PM",
      minutes: 28.4,
      fgm: 4.8, fga: 10.8, fgPct: 0.440,
      ftm: 1.8, fta: 2.7, ftPct: 0.660,
      threepm: 2.1, rebounds: 6.0, assists: 2.3,
      steals: 1.0, blocks: 0.1, turnovers: 0.7, points: 13.3,
      cris: 3.81, rostPct: 32.4,
    }
  },
  {
    slot: "PF",
    slotType: "starter",
    player: {
      id: "4",
      name: "Harrison Barnes",
      nbaTeam: "SAS",
      positions: ["PF"],
      opponent: "Mem",
      gameTime: "8:00 PM",
      minutes: 30.6,
      fgm: 4.3, fga: 8.7, fgPct: 0.497,
      ftm: 1.5, fta: 1.7, ftPct: 0.879,
      threepm: 2.2, rebounds: 3.3, assists: 2.1,
      steals: 1.1, blocks: 0.2, turnovers: 1.3, points: 12.4,
      cris: 2.63, rostPct: 12.2,
    }
  },
  {
    slot: "C",
    slotType: "starter",
    player: {
      id: "5",
      name: "Naz Reid",
      nbaTeam: "MIN",
      positions: ["C", "PF"],
      opponent: "@NO",
      gameTime: "8:00 PM",
      minutes: 24.9,
      fgm: 5.1, fga: 11.1, fgPct: 0.457,
      ftm: 0.9, fta: 1.3, ftPct: 0.720,
      threepm: 2.1, rebounds: 5.7, assists: 2.0,
      steals: 1.0, blocks: 1.0, turnovers: 1.5, points: 13.1,
      cris: 5.96, rostPct: 73.2,
    }
  },
  {
    slot: "G",
    slotType: "starter",
    player: {
      id: "6",
      name: "Cade Cunningham",
      nbaTeam: "DET",
      positions: ["PG", "SG"],
      minutes: 36.8,
      fgm: 10.0, fga: 21.9, fgPct: 0.457,
      ftm: 6.3, fta: 7.7, ftPct: 0.820,
      threepm: 1.9, rebounds: 6.5, assists: 9.3,
      steals: 1.5, blocks: 0.8, turnovers: 4.2, points: 28.2,
      cris: 9.65, rostPct: 99.9,
    }
  },
  {
    slot: "F/C",
    slotType: "starter",
    player: {
      id: "7",
      name: "Desmond Bane",
      nbaTeam: "MEM",
      positions: ["SG", "SF"],
      minutes: 32.8,
      fgm: 6.8, fga: 14.9, fgPct: 0.455,
      ftm: 4.0, fta: 4.3, ftPct: 0.934,
      threepm: 1.6, rebounds: 4.6, assists: 4.5,
      steals: 0.8, blocks: 0.3, turnovers: 2.2, points: 19.2,
      cris: 11.42, rostPct: 94.4,
    }
  },
  {
    slot: "UTIL",
    slotType: "starter",
    player: {
      id: "8",
      name: "Kevin Durant",
      nbaTeam: "PHX",
      positions: ["PF"],
      minutes: 36.0,
      fgm: 8.5, fga: 17.4, fgPct: 0.489,
      ftm: 6.3, fta: 7.1, ftPct: 0.877,
      threepm: 1.8, rebounds: 5.2, assists: 3.4,
      steals: 1.1, blocks: 0.6, turnovers: 3.0, points: 25.1,
      cris: 2.80, rostPct: 99.9,
    }
  },
  {
    slot: "Bench",
    slotType: "bench",
    player: {
      id: "9",
      name: "Kawhi Leonard",
      nbaTeam: "LAC",
      positions: ["SF", "PF"],
      minutes: 31.2,
      fgm: 9.3, fga: 17.9, fgPct: 0.518,
      ftm: 5.4, fta: 5.5, ftPct: 0.967,
      threepm: 2.5, rebounds: 5.5, assists: 2.8,
      steals: 2.1, blocks: 0.4, turnovers: 2.0, points: 26.4,
      cris: 6.62, rostPct: 94.9,
    }
  },
  {
    slot: "Bench",
    slotType: "bench",
    player: {
      id: "10",
      name: "Lauri Markkanen",
      nbaTeam: "UTA",
      positions: ["PF", "SF"],
      minutes: 35.6,
      fgm: 9.4, fga: 20.0, fgPct: 0.469,
      ftm: 6.2, fta: 6.9, ftPct: 0.899,
      threepm: 3.1, rebounds: 6.4, assists: 2.1,
      steals: 0.9, blocks: 0.4, turnovers: 1.3, points: 28.0,
      cris: 9.71, rostPct: 96.6,
    }
  },
  {
    slot: "Bench",
    slotType: "bench",
    player: {
      id: "11",
      name: "Malik Monk",
      nbaTeam: "SAC",
      positions: ["SG", "PG", "SF"],
      status: "DTD",
      minutes: 24.3,
      fgm: 4.9, fga: 10.8, fgPct: 0.451,
      ftm: 1.6, fta: 1.8, ftPct: 0.875,
      threepm: 1.8, rebounds: 1.9, assists: 2.2,
      steals: 0.9, blocks: 0.6, turnovers: 1.1, points: 13.2,
      cris: 2.96, rostPct: 55.2,
    }
  },
  {
    slot: "Bench",
    slotType: "bench",
    player: {
      id: "12",
      name: "John Collins",
      nbaTeam: "UTA",
      positions: ["PF", "C"],
      minutes: 26.8,
      fgm: 4.6, fga: 9.3, fgPct: 0.497,
      ftm: 1.8, fta: 2.3, ftPct: 0.792,
      threepm: 0.9, rebounds: 4.9, assists: 0.6,
      steals: 0.7, blocks: 0.7, turnovers: 1.5, points: 11.9,
      cris: 3.95, rostPct: 56.3,
    }
  },
  {
    slot: "Bench",
    slotType: "bench",
    player: {
      id: "13",
      name: "Jaime Jaquez Jr.",
      nbaTeam: "MIA",
      positions: ["SF", "SG"],
      minutes: 29.3,
      fgm: 6.3, fga: 12.1, fgPct: 0.517,
      ftm: 2.7, fta: 3.5, ftPct: 0.771,
      threepm: 0.4, rebounds: 6.2, assists: 5.3,
      steals: 0.6, blocks: 0.3, turnovers: 2.1, points: 15.6,
      cris: -0.69, rostPct: 64.2,
    }
  },
  {
    slot: "Bench",
    slotType: "bench",
    player: {
      id: "14",
      name: "Tre Jones",
      nbaTeam: "SAS",
      positions: ["PG"],
      minutes: 28.6,
      fgm: 4.4, fga: 8.2, fgPct: 0.529,
      ftm: 4.1, fta: 4.8, ftPct: 0.852,
      threepm: 0.5, rebounds: 3.2, assists: 4.9,
      steals: 1.7, blocks: 0.2, turnovers: 1.6, points: 13.2,
      cris: 2.61, rostPct: 29.6,
    }
  },
  {
    slot: "IR",
    slotType: "ir",
    player: {
      id: "15",
      name: "Dejounte Murray",
      nbaTeam: "NOP",
      positions: ["SG", "PG"],
      status: "O",
      opponent: "Min",
      gameTime: "8:00 PM",
      minutes: 0,
      fgm: 0, fga: 0, fgPct: 0,
      ftm: 0, fta: 0, ftPct: 0,
      threepm: 0, rebounds: 0, assists: 0,
      steals: 0, blocks: 0, turnovers: 0, points: 0,
      rostPct: 18.2,
    }
  },
  {
    slot: "IR",
    slotType: "ir",
    player: {
      id: "16",
      name: "RJ Barrett",
      nbaTeam: "TOR",
      positions: ["SF", "SG", "PF"],
      status: "O",
      opponent: "Por",
      gameTime: "7:30 PM",
      minutes: 30.9,
      fgm: 7.1, fga: 13.9, fgPct: 0.506,
      ftm: 3.4, fta: 4.7, ftPct: 0.725,
      threepm: 1.8, rebounds: 4.8, assists: 3.8,
      steals: 0.8, blocks: 0.2, turnovers: 1.5, points: 19.4,
      cris: -0.85, rostPct: 86.7,
    }
  },
];

// Sample free agents
export const sampleFreeAgents: Player[] = [
  {
    id: "fa1",
    name: "Coby White",
    nbaTeam: "CHI",
    positions: ["PG", "SG"],
    minutes: 32.5,
    fgm: 7.2, fga: 16.1, fgPct: 0.447,
    ftm: 2.1, fta: 2.5, ftPct: 0.840,
    threepm: 2.8, rebounds: 4.1, assists: 5.2,
    steals: 0.8, blocks: 0.3, turnovers: 2.1, points: 19.3,
    cris: 5.42, rostPct: 78.5,
  },
  {
    id: "fa2",
    name: "Walker Kessler",
    nbaTeam: "UTA",
    positions: ["C"],
    minutes: 24.8,
    fgm: 3.8, fga: 6.2, fgPct: 0.613,
    ftm: 1.2, fta: 2.1, ftPct: 0.571,
    threepm: 0.0, rebounds: 9.8, assists: 0.8,
    steals: 0.5, blocks: 2.8, turnovers: 1.0, points: 8.8,
    cris: 7.15, rostPct: 82.3,
  },
  {
    id: "fa3",
    name: "Marcus Smart",
    nbaTeam: "MEM",
    positions: ["PG", "SG"],
    minutes: 28.2,
    fgm: 4.1, fga: 10.2, fgPct: 0.402,
    ftm: 1.8, fta: 2.2, ftPct: 0.818,
    threepm: 1.9, rebounds: 3.8, assists: 4.5,
    steals: 1.5, blocks: 0.4, turnovers: 1.8, points: 12.0,
    cris: 4.88, rostPct: 45.2,
  },
  {
    id: "fa4",
    name: "Bobby Portis",
    nbaTeam: "MIL",
    positions: ["PF", "C"],
    minutes: 22.5,
    fgm: 4.5, fga: 9.8, fgPct: 0.459,
    ftm: 1.0, fta: 1.2, ftPct: 0.833,
    threepm: 1.5, rebounds: 7.2, assists: 1.2,
    steals: 0.6, blocks: 0.5, turnovers: 1.0, points: 11.5,
    cris: 3.92, rostPct: 52.8,
  },
  {
    id: "fa5",
    name: "Kyle Kuzma",
    nbaTeam: "WAS",
    positions: ["PF", "SF"],
    minutes: 31.8,
    fgm: 6.2, fga: 14.5, fgPct: 0.428,
    ftm: 1.8, fta: 2.4, ftPct: 0.750,
    threepm: 2.1, rebounds: 5.8, assists: 2.5,
    steals: 0.5, blocks: 0.4, turnovers: 2.0, points: 16.3,
    cris: 2.15, rostPct: 61.5,
  },
];

// Sample weekly stats
export const sampleWeeklyStats: WeeklyStats[] = [
  {
    week: 1,
    teams: [
      {
        team: { id: "t1", name: "Your Team", manager: "You" },
        stats: {
          fgPct: 0.478, ftPct: 0.825, threepm: 52,
          rebounds: 198, assists: 112, steals: 42, blocks: 24, turnovers: 58, points: 542,
        },
        wins: 6, losses: 2, ties: 1,
      },
      {
        team: { id: "t2", name: "John's Squad", manager: "John Rouillard" },
        stats: {
          fgPct: 0.465, ftPct: 0.792, threepm: 48,
          rebounds: 185, assists: 125, steals: 38, blocks: 28, turnovers: 52, points: 528,
        },
        wins: 5, losses: 3, ties: 1,
      },
      {
        team: { id: "t3", name: "Paul's Ballers", manager: "Paul Vasiliadis" },
        stats: {
          fgPct: 0.492, ftPct: 0.810, threepm: 45,
          rebounds: 210, assists: 98, steals: 35, blocks: 32, turnovers: 48, points: 510,
        },
        wins: 5, losses: 4, ties: 0,
      },
    ],
  },
];

// Sample matchup projection
export const sampleMatchupProjection: MatchupProjection = {
  myTeam: {
    name: "Your Team",
    stats: {
      fgPct: 0.478, ftPct: 0.825, threepm: 52,
      rebounds: 198, assists: 112, steals: 42, blocks: 24, turnovers: 58, points: 542,
    },
  },
  opponent: {
    name: "John's Squad",
    stats: {
      fgPct: 0.465, ftPct: 0.792, threepm: 48,
      rebounds: 185, assists: 125, steals: 38, blocks: 28, turnovers: 52, points: 528,
    },
  },
};