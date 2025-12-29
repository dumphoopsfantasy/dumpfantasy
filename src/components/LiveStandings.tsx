import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Clock, AlertCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LeagueTeam } from "@/types/league";

// Match the WeeklyPerformance types
interface MatchupStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

interface ParsedTeam {
  token: string;
  tokenUpper: string;
  name: string;
  recordStanding: string;
  currentMatchup: string; // W-L-T for this week (e.g., "5-3-1")
  stats: MatchupStats;
}

interface WeeklyMatchup {
  teamA: ParsedTeam;
  teamB: ParsedTeam;
}

interface LiveStandingsProps {
  leagueTeams: LeagueTeam[];
  weeklyMatchups: WeeklyMatchup[];
  userTeamName?: string; // e.g., "Mr. Bane" to highlight
}

interface LiveTeamRecord {
  teamName: string;
  manager: string;
  currentW: number;
  currentL: number;
  currentT: number;
  deltaW: number;
  deltaL: number;
  deltaT: number;
  liveW: number;
  liveL: number;
  liveT: number;
  thisWeekCategories: string; // e.g., "5-3-1"
  opponent: string;
  originalRank: number;
  matchIncomplete: boolean;
}

// Parse record string like "5-2-0" into numbers
function parseRecord(recordStr: string): { w: number; l: number; t: number } | null {
  // Handle formats like "5-2-0" or "5-2-0, 3rd"
  const cleaned = recordStr.split(",")[0].trim();
  const match = cleaned.match(/^(\d+)-(\d+)-(\d+)$/);
  if (!match) return null;
  return {
    w: parseInt(match[1], 10),
    l: parseInt(match[2], 10),
    t: parseInt(match[3], 10),
  };
}

// Normalize team name for matching (lowercase, remove special chars)
function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function LiveStandings({ leagueTeams, weeklyMatchups, userTeamName }: LiveStandingsProps) {
  const { liveStandings, incompleteCount } = useMemo(() => {
    if (leagueTeams.length === 0 || weeklyMatchups.length === 0) {
      return { liveStandings: [], incompleteCount: 0 };
    }

    // Build a map of team name -> current standings record
    const standingsMap = new Map<string, { team: LeagueTeam; rank: number }>();
    leagueTeams.forEach((team, idx) => {
      standingsMap.set(normalizeTeamName(team.name), { team, rank: idx + 1 });
    });

    // Build matchup results from weekly data
    const teamDeltas = new Map<string, { 
      deltaW: number; 
      deltaL: number; 
      deltaT: number; 
      thisWeekCats: string; 
      opponent: string;
      incomplete: boolean;
    }>();

    let incomplete = 0;

    for (const matchup of weeklyMatchups) {
      // Parse category records like "5-3-1"
      const catA = parseRecord(matchup.teamA.currentMatchup);
      const catB = parseRecord(matchup.teamB.currentMatchup);

      if (!catA || !catB) {
        // Mark as incomplete
        incomplete++;
        continue;
      }

      // Determine matchup outcome based on category wins
      // catA.w = team A's category wins, catA.l = team A's category losses
      // In H2H Most Categories: more category wins = matchup win
      let deltaA = { w: 0, l: 0, t: 0 };
      let deltaB = { w: 0, l: 0, t: 0 };

      if (catA.w > catA.l) {
        // Team A winning matchup
        deltaA = { w: 1, l: 0, t: 0 };
        deltaB = { w: 0, l: 1, t: 0 };
      } else if (catA.l > catA.w) {
        // Team B winning matchup
        deltaA = { w: 0, l: 1, t: 0 };
        deltaB = { w: 1, l: 0, t: 0 };
      } else {
        // Tied matchup
        deltaA = { w: 0, l: 0, t: 1 };
        deltaB = { w: 0, l: 0, t: 1 };
      }

      teamDeltas.set(normalizeTeamName(matchup.teamA.name), {
        deltaW: deltaA.w,
        deltaL: deltaA.l,
        deltaT: deltaA.t,
        thisWeekCats: matchup.teamA.currentMatchup,
        opponent: matchup.teamB.name,
        incomplete: false,
      });

      teamDeltas.set(normalizeTeamName(matchup.teamB.name), {
        deltaW: deltaB.w,
        deltaL: deltaB.l,
        deltaT: deltaB.t,
        thisWeekCats: matchup.teamB.currentMatchup,
        opponent: matchup.teamA.name,
        incomplete: false,
      });
    }

    // Build live standings for each team
    const liveTeams: LiveTeamRecord[] = [];

    for (const team of leagueTeams) {
      const normalized = normalizeTeamName(team.name);
      const standingsData = standingsMap.get(normalized);
      
      // Parse current record from standings
      const currentRecord = team.record ? parseRecord(team.record) : null;
      
      // Get delta from this week's matchup
      const delta = teamDeltas.get(normalized);

      const currentW = currentRecord?.w ?? 0;
      const currentL = currentRecord?.l ?? 0;
      const currentT = currentRecord?.t ?? 0;
      const deltaW = delta?.deltaW ?? 0;
      const deltaL = delta?.deltaL ?? 0;
      const deltaT = delta?.deltaT ?? 0;

      liveTeams.push({
        teamName: team.name,
        manager: team.manager,
        currentW,
        currentL,
        currentT,
        deltaW,
        deltaL,
        deltaT,
        liveW: currentW + deltaW,
        liveL: currentL + deltaL,
        liveT: currentT + deltaT,
        thisWeekCategories: delta?.thisWeekCats ?? "—",
        opponent: delta?.opponent ?? "—",
        originalRank: standingsData?.rank ?? 999,
        matchIncomplete: !delta,
      });
    }

    // Sort by: most Wins, fewest Losses, most Ties, then preserve original order
    liveTeams.sort((a, b) => {
      // Primary: most wins
      if (b.liveW !== a.liveW) return b.liveW - a.liveW;
      // Secondary: fewest losses
      if (a.liveL !== b.liveL) return a.liveL - b.liveL;
      // Tertiary: most ties
      if (b.liveT !== a.liveT) return b.liveT - a.liveT;
      // Stable: preserve original rank
      return a.originalRank - b.originalRank;
    });

    return { liveStandings: liveTeams, incompleteCount: incomplete };
  }, [leagueTeams, weeklyMatchups]);

  if (leagueTeams.length === 0) {
    return (
      <Card className="gradient-card border-border p-6 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">
          Import league standings from the Standings tab to see live standings.
        </p>
      </Card>
    );
  }

  if (weeklyMatchups.length === 0) {
    return (
      <Card className="gradient-card border-border p-6 text-center">
        <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">
          Import weekly scoreboard data to see live standings projections.
        </p>
      </Card>
    );
  }

  const normalizedUserTeam = userTeamName ? normalizeTeamName(userTeamName) : null;

  return (
    <div className="space-y-4">
      {/* Header with timestamp */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>As of now (not a projection)</span>
        </div>
        {incompleteCount > 0 && (
          <Badge variant="outline" className="text-amber-500 border-amber-500/50">
            <AlertCircle className="w-3 h-3 mr-1" />
            {incompleteCount} teams excluded (missing data)
          </Badge>
        )}
      </div>

      {/* Live Standings Table */}
      <Card className="gradient-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-accent/20">
                <th className="p-3 text-left font-display text-sm">Live #</th>
                <th className="p-3 text-left font-display text-sm min-w-[140px]">Team</th>
                <th className="p-3 text-center font-display text-sm">Live Record</th>
                <th className="p-3 text-center font-display text-sm">Δ Rank</th>
                <th className="p-3 text-center font-display text-sm text-muted-foreground">Current</th>
                <th className="p-3 text-center font-display text-sm">This Week</th>
                <th className="p-3 text-left font-display text-sm">Opponent</th>
              </tr>
            </thead>
            <tbody>
              {liveStandings.map((team, idx) => {
                const liveRank = idx + 1;
                const rankDelta = team.originalRank - liveRank;
                const isUserTeam = normalizedUserTeam && normalizeTeamName(team.teamName) === normalizedUserTeam;

                // Determine matchup status for this week
                const catRecord = parseRecord(team.thisWeekCategories);
                const isWinning = catRecord && catRecord.w > catRecord.l;
                const isLosing = catRecord && catRecord.l > catRecord.w;
                const isTied = catRecord && catRecord.w === catRecord.l;

                return (
                  <tr 
                    key={team.teamName}
                    className={cn(
                      "border-b border-border/50 hover:bg-muted/20 transition-colors",
                      isUserTeam && "bg-primary/10 hover:bg-primary/15"
                    )}
                  >
                    {/* Live Rank */}
                    <td className="p-3">
                      <span className="font-bold text-primary text-lg">{liveRank}</span>
                    </td>

                    {/* Team Name */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-semibold", isUserTeam && "text-primary")}>
                          {team.teamName}
                        </span>
                        {isUserTeam && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                        {team.matchIncomplete && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="text-amber-500 border-amber-500/50 text-xs">
                                  ?
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Matchup data not found for this team</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{team.manager}</div>
                    </td>

                    {/* Live Record */}
                    <td className="p-3 text-center">
                      <span className="font-bold text-lg">
                        {team.liveW}-{team.liveL}-{team.liveT}
                      </span>
                    </td>

                    {/* Rank Delta */}
                    <td className="p-3 text-center">
                      {rankDelta > 0 ? (
                        <div className="flex items-center justify-center gap-1 text-stat-positive">
                          <TrendingUp className="w-4 h-4" />
                          <span className="font-semibold">+{rankDelta}</span>
                        </div>
                      ) : rankDelta < 0 ? (
                        <div className="flex items-center justify-center gap-1 text-stat-negative">
                          <TrendingDown className="w-4 h-4" />
                          <span className="font-semibold">{rankDelta}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 text-muted-foreground">
                          <Minus className="w-4 h-4" />
                          <span>—</span>
                        </div>
                      )}
                    </td>

                    {/* Current Record (smaller) */}
                    <td className="p-3 text-center text-sm text-muted-foreground">
                      {team.currentW}-{team.currentL}-{team.currentT}
                    </td>

                    {/* This Week Categories */}
                    <td className="p-3 text-center">
                      <span className={cn(
                        "font-mono font-semibold",
                        isWinning && "text-stat-positive",
                        isLosing && "text-stat-negative",
                        isTied && "text-amber-500"
                      )}>
                        {team.thisWeekCategories}
                      </span>
                    </td>

                    {/* Opponent */}
                    <td className="p-3 text-sm">
                      <span className="text-muted-foreground">vs</span>{" "}
                      <span>{team.opponent}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Explanation tooltip */}
      <div className="text-xs text-muted-foreground text-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="underline decoration-dotted cursor-help">
              How is this calculated?
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                Live record assumes the current week ends with today's category scoreboard. 
                If you're winning more categories than your opponent (e.g., 5-3-1), you get +1 win. 
                If losing, +1 loss. If tied, +1 tie.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
