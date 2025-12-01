import { useState } from "react";
import { DataUpload } from "@/components/DataUpload";
import { PlayerCard } from "@/components/PlayerCard";
import { TeamOverview } from "@/components/TeamOverview";
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

  const starters = players.filter(p => p.slot?.toLowerCase().includes('pg') || p.slot?.toLowerCase().includes('sg') || p.slot?.toLowerCase().includes('sf') || p.slot?.toLowerCase().includes('pf') || p.slot?.toLowerCase().includes('c') || p.slot?.toLowerCase().includes('g') || p.slot?.toLowerCase().includes('f') || p.slot?.toLowerCase().includes('util'));
  const bench = players.filter(p => p.slot?.toLowerCase().includes('bench'));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg gradient-primary shadow-glow">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-display font-bold">
                  Fantasy <span className="text-primary">Hoops</span> Analytics
                </h1>
                <p className="text-sm text-muted-foreground hidden md:block">
                  Analyze your ESPN fantasy basketball team
                </p>
              </div>
            </div>
            {players.length > 0 && (
              <Button 
                onClick={handleReset}
                variant="outline"
                className="font-display font-semibold"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                New Import
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {players.length === 0 ? (
          <div className="max-w-3xl mx-auto">
            <DataUpload onDataParsed={handleDataParsed} />
          </div>
        ) : (
          <div className="space-y-8">
            <TeamOverview players={players} />

            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 bg-card">
                <TabsTrigger value="all" className="font-display font-semibold">
                  All Players
                </TabsTrigger>
                <TabsTrigger value="starters" className="font-display font-semibold">
                  Starters
                </TabsTrigger>
                <TabsTrigger value="bench" className="font-display font-semibold">
                  Bench
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-6 space-y-4">
                {players.map((player, index) => (
                  <PlayerCard key={index} player={player} rank={index + 1} />
                ))}
              </TabsContent>

              <TabsContent value="starters" className="mt-6 space-y-4">
                {starters.length > 0 ? (
                  starters.map((player, index) => (
                    <PlayerCard key={index} player={player} />
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No starters found
                  </p>
                )}
              </TabsContent>

              <TabsContent value="bench" className="mt-6 space-y-4">
                {bench.length > 0 ? (
                  bench.map((player, index) => (
                    <PlayerCard key={index} player={player} />
                  ))
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No bench players found
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
