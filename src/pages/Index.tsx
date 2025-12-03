import { useState } from "react";
import { DataUpload } from "@/components/DataUpload";
import { PlayerCard } from "@/components/PlayerCard";
import { TeamAverages } from "@/components/TeamAverages";
import { PlayerRankings } from "@/components/PlayerRankings";
import { LeagueStandings } from "@/components/LeagueStandings";
import { PlayerStats } from "@/types/player";
import { Button } from "@/components/ui/button";
import { BarChart3, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
const Index = () => {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const handleDataParsed = (data: PlayerStats[]) => {
    const sortedData = [...data].sort((a, b) => b.points - a.points);
    setPlayers(sortedData);
  };
  const handleReset = () => {
    setPlayers([]);
  };
  const starters = players.filter(p => p.slot && !p.slot.toLowerCase().includes('bench') && !p.slot.toLowerCase().includes('ir'));
  const bench = players.filter(p => p.slot?.toLowerCase().includes('bench'));
  const ir = players.filter(p => p.slot?.toLowerCase().includes('ir'));
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg gradient-primary shadow-glow">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-display font-bold">DUMPHoops Analytics<span className="text-primary">Hoops</span> Analytics
                </h1>
              </div>
            </div>
            {players.length > 0 && <Button onClick={handleReset} variant="outline" size="sm" className="font-display font-semibold">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="roster" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 bg-card mb-6">
            <TabsTrigger value="roster" className="font-display font-semibold">
              My Roster
            </TabsTrigger>
            <TabsTrigger value="league" className="font-display font-semibold">
              League Standings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roster">
            {players.length === 0 ? <div className="max-w-3xl mx-auto">
                <DataUpload onDataParsed={handleDataParsed} />
              </div> : <div className="space-y-4">
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
                    {players.map((player, index) => <PlayerCard key={index} player={player} rank={index + 1} />)}
                  </TabsContent>

                  <TabsContent value="starters" className="mt-4 space-y-3">
                    {starters.length > 0 ? starters.map((player, index) => <PlayerCard key={index} player={player} />) : <p className="text-center text-muted-foreground py-8">No starters found</p>}
                  </TabsContent>

                  <TabsContent value="bench" className="mt-4 space-y-3">
                    {bench.length > 0 ? bench.map((player, index) => <PlayerCard key={index} player={player} />) : <p className="text-center text-muted-foreground py-8">No bench players found</p>}
                  </TabsContent>

                  <TabsContent value="ir" className="mt-4 space-y-3">
                    {ir.length > 0 ? ir.map((player, index) => <PlayerCard key={index} player={player} />) : <p className="text-center text-muted-foreground py-8">No IR players found</p>}
                  </TabsContent>
                </Tabs>
              </div>}
          </TabsContent>

          <TabsContent value="league">
            <div className="max-w-5xl mx-auto">
              <LeagueStandings />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>;
};
export default Index;