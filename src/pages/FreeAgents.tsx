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
    
    // Find stats section - look for "STATS" followed by "Research" then stat headers
    const statsHeaderIdx = lines.findIndex(l => l === 'STATS');
    if (statsHeaderIdx === -1) return result;
    
    // Find stat lines - they have many numbers like "27.4 5.7/10.6 .539 ..."
    const statLineRegex = /^[\d.]+\s+[\d.]+\/[\d.]+\s+[.\d]+\s+[\d.]+\/[\d.]+\s+[.\d]+/;
    
    // Collect all stat lines first
    const statLines: string[] = [];
    for (let i = statsHeaderIdx; i < lines.length; i++) {
      if (statLineRegex.test(lines[i])) {
        statLines.push(lines[i]);
      }
    }
    
    // Now find player entries before STATS section
    // Players appear as: PlayerNamePlayerName (doubled), then Team, then Status (optional), then Positions
    const playerEntries: { name: string; team: string; positions: string[]; status?: string }[] = [];
    
    for (let i = 0; i < statsHeaderIdx; i++) {
      const line = lines[i];
      
      // Check for doubled player name like "Ayo DosunmuAyo Dosunmu"
      const doubleNameMatch = line.match(/^([A-Z][a-zA-Z'.-]+(?: (?:Jr\.|Sr\.|III|II|IV|[A-Z][a-zA-Z'.-]+))+)\1$/);
      if (doubleNameMatch) {
        playerEntries.push({ name: doubleNameMatch[1], team: '', positions: [] });
        continue;
      }
      
      // Team abbreviation (2-4 uppercase letters)
      if (line.match(/^[A-Z]{2,4}$/) && playerEntries.length > 0) {
        const lastPlayer = playerEntries[playerEntries.length - 1];
        if (!lastPlayer.team) {
          lastPlayer.team = line;
        }
        continue;
      }
      
      // Status (O, DTD, GTD, etc)
      if (['O', 'DTD', 'GTD', 'IR', 'SUSP'].includes(line.toUpperCase()) && playerEntries.length > 0) {
        playerEntries[playerEntries.length - 1].status = line.toUpperCase();
        continue;
      }
      
      // Positions (PG, SG, SF, PF, C or combos)
      const posMatch = line.match(/^((?:PG|SG|SF|PF|C|G|F)(?:,\s*(?:PG|SG|SF|PF|C|G|F))*)$/i);
      if (posMatch && playerEntries.length > 0) {
        playerEntries[playerEntries.length - 1].positions = posMatch[1].toUpperCase().split(/,\s*/);
        continue;
      }
    }
    
    // Filter valid players (have team and positions)
    const validPlayers = playerEntries.filter(p => p.team && p.positions.length > 0);
    
    // Parse each stat line and match to player
    for (let j = 0; j < Math.min(validPlayers.length, statLines.length); j++) {
      const player = validPlayers[j];
      const statLine = statLines[j];
      
      // Parse stat line: MIN FGM/FGA FG% FTM/FTA FT% 3PM REB AST STL BLK TO PTS PR15 %ROST +/-
      const parts = statLine.split(/\s+/);
      if (parts.length < 12) continue;
      
      const minutes = parseFloat(parts[0]);
      // parts[1] is FGM/FGA, skip
      const fgPct = parseFloat(parts[2]);
      // parts[3] is FTM/FTA, skip
      const ftPct = parseFloat(parts[4]);
      const threepm = parseFloat(parts[5]);
      const rebounds = parseFloat(parts[6]);
      const assists = parseFloat(parts[7]);
      const steals = parseFloat(parts[8]);
      const blocks = parseFloat(parts[9]);
      const turnovers = parseFloat(parts[10]);
      const points = parseFloat(parts[11]);
      const rostPct = parts.length > 13 ? parseFloat(parts[13]) : 0;
      
      const cris = calculateCRIS({ fgPct, ftPct, threepm, rebounds, assists, steals, blocks, turnovers, points });
      
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
    
    return result;
  };

  // CRIS calculation - weighted category performance
  const calculateCRIS = (stats: {
    fgPct: number; ftPct: number; threepm: number; rebounds: number;
    assists: number; steals: number; blocks: number; turnovers: number; points: number;
  }): number => {
    const weights = {
      points: 1.0,
      rebounds: 1.2,
      assists: 1.5,
      steals: 2.0,
      blocks: 2.0,
      threepm: 1.3,
      fgPct: 1.0,
      ftPct: 0.8,
      turnovers: -1.5,
    };
    
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

      {selectedPlayer && (
        <PlayerDetailSheet
          player={selectedPlayer}
          open={!!selectedPlayer}
          onOpenChange={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
};