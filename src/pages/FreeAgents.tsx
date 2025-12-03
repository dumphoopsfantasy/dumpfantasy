import { useState, useMemo } from "react";
import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { PlayerDetailSheet } from "@/components/roster/PlayerDetailSheet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, GitCompare, Upload, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export const FreeAgents = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [rawData, setRawData] = useState("");
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("cris");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [compareList, setCompareList] = useState<Player[]>([]);

  const parseESPNFreeAgents = (data: string): Player[] => {
    const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
    const result: Player[] = [];
    
    // Find the stats section by looking for the header pattern
    let statsStartIndex = lines.findIndex(l => 
      l.toLowerCase() === 'min' || l.toLowerCase().includes('stats')
    );
    
    // Collect player entries and stats separately
    const playerEntries: { name: string; team: string; positions: string[]; status?: string; opponent?: string }[] = [];
    const statLines: number[][] = [];
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      // Skip headers and navigation
      if (line.toLowerCase().includes('player') && line.toLowerCase().includes('type') ||
          line.toLowerCase() === 'fa' ||
          line.toLowerCase().includes('compare players') ||
          line.toLowerCase().includes('filter') ||
          line.toLowerCase().includes('available') ||
          line.toLowerCase() === 'stats' ||
          line.toLowerCase() === 'trending' ||
          line.toLowerCase() === 'schedule' ||
          line.toLowerCase() === 'news') {
        i++;
        continue;
      }
      
      // Look for player name pattern (name appears twice in ESPN format)
      // Like "Ayo DosunmuAyo Dosunmu" -> need to split
      const doubleNameMatch = line.match(/^([A-Z][a-z]+(?: [A-Z][a-z'.-]+)+)\1$/);
      if (doubleNameMatch) {
        const name = doubleNameMatch[1];
        playerEntries.push({ name, team: '', positions: [] });
        i++;
        continue;
      }
      
      // Single player name (already cleaned)
      // Check if next lines are team and position
      if (line.match(/^[A-Z][a-z]+(?: [A-Z][a-z'.-]+)+$/) && 
          !line.match(/^(PG|SG|SF|PF|C|G|F|UTIL)$/i) &&
          line.length > 3 &&
          !line.match(/^[A-Z]{2,4}$/)) {
        
        // Check if this is just part of navigation (has specific keywords)
        if (!line.toLowerCase().includes('basketball') && 
            !line.toLowerCase().includes('fantasy') &&
            !line.toLowerCase().includes('home')) {
          playerEntries.push({ name: line, team: '', positions: [] });
        }
        i++;
        continue;
      }
      
      // Team abbreviation (2-3 uppercase letters)
      const teamMatch = line.match(/^([A-Z]{2,4})$/);
      if (teamMatch && playerEntries.length > 0 && !playerEntries[playerEntries.length - 1].team) {
        playerEntries[playerEntries.length - 1].team = teamMatch[1];
        i++;
        continue;
      }
      
      // Status (O, DTD, etc)
      if (['O', 'DTD', 'GTD', 'IR', 'SUSP'].includes(line.toUpperCase()) && playerEntries.length > 0) {
        playerEntries[playerEntries.length - 1].status = line.toUpperCase();
        i++;
        continue;
      }
      
      // Position(s)
      const posMatch = line.match(/^((?:PG|SG|SF|PF|C|G|F)(?:,\s*(?:PG|SG|SF|PF|C|G|F))*)$/i);
      if (posMatch && playerEntries.length > 0) {
        const positions = posMatch[1].toUpperCase().split(/,\s*/);
        playerEntries[playerEntries.length - 1].positions = positions;
        i++;
        continue;
      }
      
      // Stat line (many numbers)
      const nums = line.split(/\s+/).filter(n => n.match(/^-?[\d.]+$/));
      if (nums.length >= 10) {
        statLines.push(nums.map(n => parseFloat(n)));
        i++;
        continue;
      }
      
      i++;
    }
    
    // Match players with their stats
    // Filter out navigation items
    const validPlayers = playerEntries.filter(p => 
      p.name && p.team && p.positions.length > 0
    );
    
    for (let j = 0; j < Math.min(validPlayers.length, statLines.length); j++) {
      const player = validPlayers[j];
      const stats = statLines[j];
      
      // ESPN stat order: MIN, FGM/FGA (combined), FG%, FTM/FTA (combined), FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
      // Or: MIN, FGM/FGA, FG%, FTM/FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS
      if (stats.length >= 12) {
        const minutes = stats[0];
        const fgPct = stats[2];
        const ftPct = stats[4];
        const threepm = stats[5];
        const rebounds = stats[6];
        const assists = stats[7];
        const steals = stats[8];
        const blocks = stats[9];
        const turnovers = stats[10];
        const points = stats[11];
        const rostPct = stats.length > 13 ? stats[13] : 0;
        
        // Calculate CRIS score
        const cris = calculateCRIS({
          fgPct, ftPct, threepm, rebounds, assists, steals, blocks, turnovers, points
        });
        
        result.push({
          id: `fa-${j}`,
          name: player.name,
          nbaTeam: player.team,
          positions: player.positions,
          status: player.status as "DTD" | "IR" | "O" | "SUSP" | "healthy" | undefined,
          minutes,
          fgm: 0, fga: 0, fgPct,
          ftm: 0, fta: 0, ftPct,
          threepm, rebounds, assists, steals, blocks, turnovers, points,
          cris,
          rostPct,
        });
      }
    }
    
    return result;
  };

  // CRIS calculation - weighted category performance
  const calculateCRIS = (stats: {
    fgPct: number; ftPct: number; threepm: number; rebounds: number;
    assists: number; steals: number; blocks: number; turnovers: number; points: number;
  }): number => {
    // Weights for each category (can be adjusted)
    const weights = {
      points: 1.0,
      rebounds: 1.2,
      assists: 1.5,
      steals: 2.0,
      blocks: 2.0,
      threepm: 1.3,
      fgPct: 1.0,
      ftPct: 0.8,
      turnovers: -1.5, // Negative because lower is better
    };
    
    // Baseline values for normalization
    const baselines = {
      points: 12, rebounds: 5, assists: 3, steals: 1, blocks: 0.5,
      threepm: 1.5, fgPct: 0.45, ftPct: 0.75, turnovers: 2,
    };
    
    let score = 0;
    score += ((stats.points - baselines.points) / baselines.points) * weights.points * 10;
    score += ((stats.rebounds - baselines.rebounds) / baselines.rebounds) * weights.rebounds * 10;
    score += ((stats.assists - baselines.assists) / baselines.assists) * weights.assists * 10;
    score += ((stats.steals - baselines.steals) / baselines.steals) * weights.steals * 10;
    score += ((stats.blocks - baselines.blocks) / Math.max(baselines.blocks, 0.1)) * weights.blocks * 10;
    score += ((stats.threepm - baselines.threepm) / baselines.threepm) * weights.threepm * 10;
    score += ((stats.fgPct - baselines.fgPct) / baselines.fgPct) * weights.fgPct * 10;
    score += ((stats.ftPct - baselines.ftPct) / baselines.ftPct) * weights.ftPct * 10;
    score += ((baselines.turnovers - stats.turnovers) / baselines.turnovers) * Math.abs(weights.turnovers) * 10;
    
    return score;
  };

  const handleParse = () => {
    if (!rawData.trim()) return;
    const parsed = parseESPNFreeAgents(rawData);
    if (parsed.length > 0) {
      setPlayers(parsed);
    }
  };

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
        case "threepm": return b.threepm - a.threepm;
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

  // Calculate rank for a stat among all players
  const getStatRank = (playerId: string, stat: keyof Player, lowerBetter = false): number => {
    const sorted = [...players].sort((a, b) => {
      const aVal = a[stat] as number;
      const bVal = b[stat] as number;
      return lowerBetter ? aVal - bVal : bVal - aVal;
    });
    return sorted.findIndex(p => p.id === playerId) + 1;
  };

  if (players.length === 0) {
    return (
      <Card className="gradient-card shadow-card p-6 border-border max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Search className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">Free Agents</h2>
            <p className="text-sm text-muted-foreground">
              Copy and paste the ESPN Free Agents page
            </p>
          </div>
        </div>

        <Textarea
          placeholder={`Copy the ENTIRE ESPN Free Agents page (Ctrl+A, Ctrl+C) and paste here.

Make sure to include the stats section with MIN, FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS.`}
          value={rawData}
          onChange={(e) => setRawData(e.target.value)}
          className="min-h-[200px] font-mono text-sm mb-4 bg-muted/50"
        />

        <Button onClick={handleParse} className="w-full gradient-primary font-display font-bold">
          <Upload className="w-4 h-4 mr-2" />
          Load Free Agents
        </Button>
      </Card>
    );
  }

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
              <SelectItem value="cris">CRIS Score</SelectItem>
              <SelectItem value="points">Points</SelectItem>
              <SelectItem value="rebounds">Rebounds</SelectItem>
              <SelectItem value="assists">Assists</SelectItem>
              <SelectItem value="steals">Steals</SelectItem>
              <SelectItem value="blocks">Blocks</SelectItem>
              <SelectItem value="threepm">3PM</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setPlayers([])}>
            <RefreshCw className="w-4 h-4" />
          </Button>
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
                    <p className="text-muted-foreground">CRIS</p>
                    <p className="font-bold text-primary">{player.cris?.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Player Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPlayers.map((player, idx) => (
          <Card
            key={player.id}
            className={cn(
              "gradient-card border-border p-4 hover:border-primary/50 transition-all cursor-pointer",
              compareList.find(p => p.id === player.id) && "border-primary"
            )}
            onClick={() => setSelectedPlayer(player)}
          >
            <div className="flex items-start gap-3">
              <div className="relative">
                <PlayerPhoto name={player.name} size="lg" />
                <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {idx + 1}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-lg truncate">{player.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{player.nbaTeam}</span>
                  <span>•</span>
                  <span>{player.positions.join("/")}</span>
                  {player.status && (
                    <Badge variant="destructive" className="text-xs">{player.status}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className="bg-primary/20 text-primary border-primary/50 text-xs font-bold">
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

      {filteredPlayers.length === 0 && players.length > 0 && (
        <p className="text-center text-muted-foreground py-12">No players match your filters</p>
      )}

      <PlayerDetailSheet
        player={selectedPlayer}
        open={!!selectedPlayer}
        onOpenChange={(open) => !open && setSelectedPlayer(null)}
      />
    </div>
  );
};
