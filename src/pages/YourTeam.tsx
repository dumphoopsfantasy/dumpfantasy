import { useState, useMemo } from "react";
import { RosterSlot, Player } from "@/types/fantasy";
import { RosterPlayerCard } from "@/components/roster/RosterPlayerCard";
import { PlayerDetailSheet } from "@/components/roster/PlayerDetailSheet";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatStat } from "@/lib/playerUtils";
import { sampleRoster } from "@/data/sampleData";

export const YourTeam = () => {
  const [roster] = useState<RosterSlot[]>(sampleRoster);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [sortBy, setSortBy] = useState<string>("slot");

  const starters = roster.filter(r => r.slotType === "starter");
  const bench = roster.filter(r => r.slotType === "bench");
  const ir = roster.filter(r => r.slotType === "ir");

  const allPlayers = roster.map(r => r.player);
  const activePlayers = allPlayers.filter(p => p.minutes > 0);

  // Team totals
  const teamTotals = useMemo(() => {
    const count = activePlayers.length || 1;
    return {
      pts: activePlayers.reduce((sum, p) => sum + p.points, 0),
      reb: activePlayers.reduce((sum, p) => sum + p.rebounds, 0),
      ast: activePlayers.reduce((sum, p) => sum + p.assists, 0),
      threepm: activePlayers.reduce((sum, p) => sum + p.threepm, 0),
      stl: activePlayers.reduce((sum, p) => sum + p.steals, 0),
      blk: activePlayers.reduce((sum, p) => sum + p.blocks, 0),
      to: activePlayers.reduce((sum, p) => sum + p.turnovers, 0),
      fgPct: activePlayers.reduce((sum, p) => sum + p.fgPct, 0) / count,
      ftPct: activePlayers.reduce((sum, p) => sum + p.ftPct, 0) / count,
    };
  }, [activePlayers]);

  const sortedRoster = useMemo(() => {
    if (sortBy === "slot") return roster;
    
    return [...roster].sort((a, b) => {
      const playerA = a.player;
      const playerB = b.player;
      
      switch (sortBy) {
        case "points": return playerB.points - playerA.points;
        case "rebounds": return playerB.rebounds - playerA.rebounds;
        case "assists": return playerB.assists - playerA.assists;
        case "cris": return (playerB.cris || 0) - (playerA.cris || 0);
        default: return 0;
      }
    });
  }, [roster, sortBy]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Team Summary */}
      <Card className="gradient-card border-border p-6">
        <h2 className="font-display font-bold text-lg text-muted-foreground mb-4">TEAM TOTALS</h2>
        <div className="grid grid-cols-3 md:grid-cols-9 gap-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">PTS</p>
            <p className="font-display font-bold text-2xl text-primary">{teamTotals.pts.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">REB</p>
            <p className="font-display font-bold text-2xl">{teamTotals.reb.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">AST</p>
            <p className="font-display font-bold text-2xl">{teamTotals.ast.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">3PM</p>
            <p className="font-display font-bold text-2xl">{teamTotals.threepm.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">STL</p>
            <p className="font-display font-bold text-2xl">{teamTotals.stl.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">BLK</p>
            <p className="font-display font-bold text-2xl">{teamTotals.blk.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">TO</p>
            <p className="font-display font-bold text-2xl text-stat-negative">{teamTotals.to.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">FG%</p>
            <p className="font-display font-bold text-2xl">{formatStat(teamTotals.fgPct, "pct")}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">FT%</p>
            <p className="font-display font-bold text-2xl">{formatStat(teamTotals.ftPct, "pct")}</p>
          </div>
        </div>
      </Card>

      {/* Sort Control */}
      <div className="flex justify-end">
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="slot">Slot Order</SelectItem>
            <SelectItem value="points">Points</SelectItem>
            <SelectItem value="rebounds">Rebounds</SelectItem>
            <SelectItem value="assists">Assists</SelectItem>
            <SelectItem value="cris">CRIS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Roster Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-4 bg-card">
          <TabsTrigger value="all" className="font-display">
            All ({roster.length})
          </TabsTrigger>
          <TabsTrigger value="starters" className="font-display">
            Active ({starters.length})
          </TabsTrigger>
          <TabsTrigger value="bench" className="font-display">
            Bench ({bench.length})
          </TabsTrigger>
          <TabsTrigger value="ir" className="font-display">
            IR ({ir.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4 space-y-2">
          {sortedRoster.map((slot) => (
            <RosterPlayerCard
              key={slot.player.id}
              player={slot.player}
              slot={slot.slot}
              onClick={() => setSelectedPlayer(slot.player)}
            />
          ))}
        </TabsContent>

        <TabsContent value="starters" className="mt-4 space-y-2">
          {starters.map((slot) => (
            <RosterPlayerCard
              key={slot.player.id}
              player={slot.player}
              slot={slot.slot}
              onClick={() => setSelectedPlayer(slot.player)}
            />
          ))}
        </TabsContent>

        <TabsContent value="bench" className="mt-4 space-y-2">
          {bench.map((slot) => (
            <RosterPlayerCard
              key={slot.player.id}
              player={slot.player}
              slot={slot.slot}
              onClick={() => setSelectedPlayer(slot.player)}
            />
          ))}
        </TabsContent>

        <TabsContent value="ir" className="mt-4 space-y-2">
          {ir.length > 0 ? ir.map((slot) => (
            <RosterPlayerCard
              key={slot.player.id}
              player={slot.player}
              slot={slot.slot}
              onClick={() => setSelectedPlayer(slot.player)}
            />
          )) : (
            <p className="text-center text-muted-foreground py-8">No IR players</p>
          )}
        </TabsContent>
      </Tabs>

      <PlayerDetailSheet
        player={selectedPlayer}
        open={!!selectedPlayer}
        onOpenChange={(open) => !open && setSelectedPlayer(null)}
      />
    </div>
  );
};