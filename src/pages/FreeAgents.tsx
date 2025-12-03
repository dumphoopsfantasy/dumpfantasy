import { useState, useMemo } from "react";
import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { PlayerDetailSheet } from "@/components/roster/PlayerDetailSheet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatStat, calculatePlayerScore } from "@/lib/playerUtils";
import { sampleFreeAgents } from "@/data/sampleData";
import { Search, X, GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";

export const FreeAgents = () => {
  const [players] = useState<Player[]>(sampleFreeAgents);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("cris");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [compareList, setCompareList] = useState<Player[]>([]);

  const filteredPlayers = useMemo(() => {
    let result = players;

    if (search) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.nbaTeam.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (positionFilter !== "all") {
      result = result.filter(p => p.positions.includes(positionFilter));
    }

    return result.sort((a, b) => {
      switch (sortBy) {
        case "cris": return (b.cris || 0) - (a.cris || 0);
        case "points": return b.points - a.points;
        case "rebounds": return b.rebounds - a.rebounds;
        case "assists": return b.assists - a.assists;
        case "blocks": return b.blocks - a.blocks;
        case "steals": return b.steals - a.steals;
        default: return 0;
      }
    });
  }, [players, search, positionFilter, sortBy]);

  const toggleCompare = (player: Player) => {
    if (compareList.find(p => p.id === player.id)) {
      setCompareList(compareList.filter(p => p.id !== player.id));
    } else if (compareList.length < 4) {
      setCompareList([...compareList, player]);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filters */}
      <Card className="gradient-card border-border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-background"
            />
          </div>
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger className="w-full md:w-[140px]">
              <SelectValue placeholder="Position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Positions</SelectItem>
              <SelectItem value="PG">PG</SelectItem>
              <SelectItem value="SG">SG</SelectItem>
              <SelectItem value="SF">SF</SelectItem>
              <SelectItem value="PF">PF</SelectItem>
              <SelectItem value="C">C</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full md:w-[140px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cris">CRIS</SelectItem>
              <SelectItem value="points">Points</SelectItem>
              <SelectItem value="rebounds">Rebounds</SelectItem>
              <SelectItem value="assists">Assists</SelectItem>
              <SelectItem value="steals">Steals</SelectItem>
              <SelectItem value="blocks">Blocks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Compare Panel */}
      {compareList.length > 0 && (
        <Card className="gradient-card border-primary/50 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-primary" />
              Compare ({compareList.length}/4)
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setCompareList([])}>
              Clear All
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {compareList.map(player => (
              <div key={player.id} className="relative bg-secondary/30 rounded-lg p-3">
                <button
                  onClick={() => toggleCompare(player)}
                  className="absolute -top-2 -right-2 bg-destructive rounded-full p-1"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="flex items-center gap-2 mb-2">
                  <PlayerPhoto name={player.name} size="sm" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{player.name}</p>
                    <p className="text-xs text-muted-foreground">{player.nbaTeam}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">PTS</p>
                    <p className="font-bold">{player.points.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">REB</p>
                    <p className="font-bold">{player.rebounds.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">AST</p>
                    <p className="font-bold">{player.assists.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Player Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlayers.map(player => (
          <Card
            key={player.id}
            className={cn(
              "gradient-card border-border p-4 hover:border-primary/50 transition-all cursor-pointer",
              compareList.find(p => p.id === player.id) && "border-primary"
            )}
            onClick={() => setSelectedPlayer(player)}
          >
            <div className="flex items-start gap-3">
              <PlayerPhoto name={player.name} size="lg" />
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-lg truncate">{player.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{player.nbaTeam}</span>
                  <span>•</span>
                  <span>{player.positions.join("/")}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">
                    CRIS: {player.cris?.toFixed(2) || "--"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {player.rostPct?.toFixed(0)}% Rost
                  </Badge>
                </div>
              </div>
              <Button
                variant={compareList.find(p => p.id === player.id) ? "default" : "outline"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCompare(player);
                }}
              >
                <GitCompare className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-5 gap-2 mt-4 pt-4 border-t border-border">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">PTS</p>
                <p className="font-display font-bold text-primary">{player.points.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">REB</p>
                <p className="font-display font-bold">{player.rebounds.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">AST</p>
                <p className="font-display font-bold">{player.assists.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">STL</p>
                <p className="font-display font-bold">{player.steals.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">BLK</p>
                <p className="font-display font-bold">{player.blocks.toFixed(1)}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredPlayers.length === 0 && (
        <p className="text-center text-muted-foreground py-12">No players found</p>
      )}

      <PlayerDetailSheet
        player={selectedPlayer}
        open={!!selectedPlayer}
        onOpenChange={(open) => !open && setSelectedPlayer(null)}
      />
    </div>
  );
};