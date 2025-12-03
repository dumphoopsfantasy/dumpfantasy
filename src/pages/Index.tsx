import { useState } from "react";
import { DataUpload } from "@/components/DataUpload";
import { PlayerCard } from "@/components/PlayerCard";
import { TeamAverages } from "@/components/TeamAverages";
import { PlayerRankings } from "@/components/PlayerRankings";
import { LeagueStandings } from "@/components/LeagueStandings";
import { FreeAgents } from "@/pages/FreeAgents";
import { WeeklyPerformance } from "@/pages/WeeklyPerformance";
import { MatchupProjection } from "@/pages/MatchupProjection";
import { PlayerStats } from "@/types/player";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { Button } from "@/components/ui/button";
import { BarChart3, RefreshCw, Users, TrendingUp, Calendar, Swords, Trophy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Weekly matchup types
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

interface WeeklyMatchup {
  team1: { abbr: string; name: string; record: string; weekRecord: string; stats: MatchupStats };
  team2: { abbr: string; name: string; record: string; weekRecord: string; stats: MatchupStats };
}

interface MatchupProjectionData {
  myTeam: { name: string; record: string; standing: string; lastMatchup?: string; stats: MatchupStats };
  opponent: { name: string; record: string; standing: string; lastMatchup?: string; stats: MatchupStats };
}

const Index = () => {
  // Roster state
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  
  // Free agents state (persisted)
  const [freeAgents, setFreeAgents] = useState<Player[]>([]);
  
  // Weekly state (persisted)
  const [weeklyMatchups, setWeeklyMatchups] = useState<WeeklyMatchup[]>([]);
  const [weeklyTitle, setWeeklyTitle] = useState("");
  
  // Standings state (persisted)
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  
  // Matchup projection state (persisted)
  const [matchupData, setMatchupData] = useState<MatchupProjectionData | null>(null);

  const handleDataParsed = (data: PlayerStats[]) => {
    setPlayers(data);
  };

  // Calculate CRIS score (always positive)
  const calculateCRIS = (p: PlayerStats): number => {
    if (p.minutes === 0) return 0;
    const pts = Math.min(p.points / 30, 1) * 20;
    const reb = Math.min(p.rebounds / 12, 1) * 15;
    const ast = Math.min(p.assists / 10, 1) * 15;
    const stl = Math.min(p.steals / 2.5, 1) * 10;
    const blk = Math.min(p.blocks / 2, 1) * 10;
    const tpm = Math.min(p.threepm / 4, 1) * 10;
    const fg = Math.min(p.fgPct / 0.55, 1) * 10;
    const ft = Math.min(p.ftPct / 0.90, 1) * 5;
    const to = Math.max(0, 5 - p.turnovers);
    return pts + reb + ast + stl + blk + tpm + fg + ft + to;
  };

  const sortedByValue = [...players].sort((a, b) => calculateCRIS(b) - calculateCRIS(a));

  const handleReset = () => {
    setPlayers([]);
  };

  const starters = players.filter(p => p.slot && !p.slot.toLowerCase().includes('bench') && !p.slot.toLowerCase().includes('ir'));
  const bench = players.filter(p => p.slot?.toLowerCase().includes('bench'));
  const ir = players.filter(p => p.slot?.toLowerCase().includes('ir'));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg gradient-primary shadow-glow">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-display font-bold">
                  <span className="text-primary">Dump</span>Hoops Analytics
                </h1>
              </div>
            </div>
            {players.length > 0 && (
              <Button onClick={handleReset} variant="outline" size="sm" className="font-display font-semibold">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="roster" className="w-full">
          <TabsList className="grid w-full max-w-3xl mx-auto grid-cols-5 bg-card mb-6">
            <TabsTrigger value="roster" className="font-display font-semibold text-xs md:text-sm">
              <Users className="w-4 h-4 mr-1 hidden md:inline" />
              Roster
            </TabsTrigger>
            <TabsTrigger value="freeagents" className="font-display font-semibold text-xs md:text-sm">
              <TrendingUp className="w-4 h-4 mr-1 hidden md:inline" />
              Free Agents
            </TabsTrigger>
            <TabsTrigger value="weekly" className="font-display font-semibold text-xs md:text-sm">
              <Calendar className="w-4 h-4 mr-1 hidden md:inline" />
              Weekly
            </TabsTrigger>
            <TabsTrigger value="matchup" className="font-display font-semibold text-xs md:text-sm">
              <Swords className="w-4 h-4 mr-1 hidden md:inline" />
              Matchup
            </TabsTrigger>
            <TabsTrigger value="league" className="font-display font-semibold text-xs md:text-sm">
              <Trophy className="w-4 h-4 mr-1 hidden md:inline" />
              Standings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roster">
            {players.length === 0 ? (
              <div className="max-w-3xl mx-auto">
                <DataUpload onDataParsed={handleDataParsed} />
              </div>
            ) : (
              <div className="space-y-4">
                <TeamAverages players={players} />
                <PlayerRankings players={players} />

                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="grid w-full max-w-lg mx-auto grid-cols-4 bg-card">
                    <TabsTrigger value="all" className="font-display text-sm">
                      All ({players.length})
                    </TabsTrigger>
                    <TabsTrigger value="starters" className="font-display text-sm">
                      Starters ({starters.length})
                    </TabsTrigger>
                    <TabsTrigger value="bench" className="font-display text-sm">
                      Bench ({bench.length})
                    </TabsTrigger>
                    <TabsTrigger value="ir" className="font-display text-sm">
                      IR ({ir.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="mt-4 space-y-3">
                    {sortedByValue.map((player, index) => (
                      <PlayerCard key={index} player={player} rank={index + 1} allPlayers={players} />
                    ))}
                  </TabsContent>

                  <TabsContent value="starters" className="mt-4 space-y-3">
                    {starters.length > 0 ? (
                      starters.map((player, index) => <PlayerCard key={index} player={player} allPlayers={players} />)
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No starters found</p>
                    )}
                  </TabsContent>

                  <TabsContent value="bench" className="mt-4 space-y-3">
                    {bench.length > 0 ? (
                      bench.map((player, index) => <PlayerCard key={index} player={player} allPlayers={players} />)
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No bench players found</p>
                    )}
                  </TabsContent>

                  <TabsContent value="ir" className="mt-4 space-y-3">
                    {ir.length > 0 ? (
                      ir.map((player, index) => <PlayerCard key={index} player={player} allPlayers={players} />)
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No IR players found</p>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </TabsContent>

          <TabsContent value="freeagents">
            <FreeAgents 
              persistedPlayers={freeAgents} 
              onPlayersChange={setFreeAgents} 
            />
          </TabsContent>

          <TabsContent value="weekly">
            <WeeklyPerformance 
              persistedMatchups={weeklyMatchups}
              persistedTitle={weeklyTitle}
              onMatchupsChange={setWeeklyMatchups}
              onTitleChange={setWeeklyTitle}
            />
          </TabsContent>

          <TabsContent value="matchup">
            <MatchupProjection 
              persistedMatchup={matchupData}
              onMatchupChange={setMatchupData}
            />
          </TabsContent>

          <TabsContent value="league">
            <div className="max-w-5xl mx-auto">
              <LeagueStandings 
                persistedTeams={leagueTeams}
                onTeamsChange={setLeagueTeams}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
