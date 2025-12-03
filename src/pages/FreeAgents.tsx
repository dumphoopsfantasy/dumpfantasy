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
import { CrisToggle } from "@/components/CrisToggle";
import { CrisExplanation } from "@/components/CrisExplanation";
import { calculateCRISForAll, formatPct, CATEGORIES } from "@/lib/crisUtils";

interface FreeAgentPlayer extends Player {
  cris: number;
  wCris: number;
}

export const FreeAgents = () => {
  const [rawPlayers, setRawPlayers] = useState<Player[]>([]);
  const [rawData, setRawData] = useState("");
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("cris");
  const [selectedPlayer, setSelectedPlayer] = useState<FreeAgentPlayer | null>(null);
  const [compareList, setCompareList] = useState<FreeAgentPlayer[]>([]);
  const [useCris, setUseCris] = useState(true);

  const parseESPNFreeAgents = (data: string): Player[] => {
    const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
    const result: Player[] = [];
    
    // Find the stats header line (MIN FGM/FGA FG%...)
    const statsIdx = lines.findIndex(l => l === 'MIN');
    if (statsIdx === -1) return result;
    
    // Find all stat rows - they start with a number (minutes) and have many values
    const statLines: number[][] = [];
    for (let i = statsIdx; i < lines.length; i++) {
      const line = lines[i];
      // Match stat line: starts with minutes (number), contains / for FGM/FGA
      if (line.match(/^[\d.]+\s/) && line.includes('/')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 12) {
          const nums = [
            parseFloat(parts[0]),  // MIN
            parseFloat(parts[2]),  // FG%
            parseFloat(parts[4]),  // FT%
            parseFloat(parts[5]),  // 3PM
            parseFloat(parts[6]),  // REB
            parseFloat(parts[7]),  // AST
            parseFloat(parts[8]),  // STL
            parseFloat(parts[9]),  // BLK
            parseFloat(parts[10]), // TO
            parseFloat(parts[11]), // PTS
            parts.length > 13 ? parseFloat(parts[13]) : 0, // %ROST
          ];
          if (!nums.some(isNaN)) {
            statLines.push(nums);
          }
        }
      }
    }
    
    // Parse player entries before stats section
    // Look for pattern: Name, Team (2-4 letters), optional Status, Position(s)
    const playerEntries: { name: string; team: string; positions: string[]; status?: string }[] = [];
    
    let i = 0;
    while (i < statsIdx) {
      const line = lines[i];
      
      // Skip known headers and navigation
      if (['STATS', 'Research', 'MIN', 'FGM/FGA', 'Watch List', 'Filter', 'Available'].includes(line)) {
        i++;
        continue;
      }
      
      // Player name - look for doubled name pattern OR reasonable name length
      // ESPN format often has: "Ayo DosunmuAyo Dosunmu" (name repeated)
      const doubleMatch = line.match(/^([A-Z][a-zA-Z'.-]+(?: [A-Z][a-zA-Z'.-]+)+)\1$/);
      if (doubleMatch) {
        playerEntries.push({ name: doubleMatch[1], team: '', positions: [] });
        i++;
        continue;
      }
      
      // Single name (for simpler parsing) - skip if it looks like a header
      if (line.match(/^[A-Z][a-z]+(?: [A-Z][a-z'.]+)+$/) && 
          !['Player Name', 'Pro Team', 'Health', 'Compare Players'].includes(line) &&
          line.length > 4 && line.length < 30) {
        // Check if this isn't already the last player's name
        const exists = playerEntries.find(p => p.name === line);
        if (!exists) {
          playerEntries.push({ name: line, team: '', positions: [] });
        }
      }
      
      // Team code (2-4 uppercase)
      if (line.match(/^[A-Z]{2,4}$/) && playerEntries.length > 0) {
        const last = playerEntries[playerEntries.length - 1];
        if (!last.team) {
          last.team = line;
        }
      }
      
      // Status
      if (['O', 'DTD', 'GTD', 'IR', 'SUSP'].includes(line.toUpperCase()) && playerEntries.length > 0) {
        playerEntries[playerEntries.length - 1].status = line.toUpperCase();
      }
      
      // Positions
      const posMatch = line.match(/^((?:PG|SG|SF|PF|C|G|F)(?:,\s*(?:PG|SG|SF|PF|C|G|F))*)$/i);
      if (posMatch && playerEntries.length > 0) {
        playerEntries[playerEntries.length - 1].positions = posMatch[1].toUpperCase().split(/,\s*/);
      }
      
      // FA marker - skip
      if (line === 'FA' || line.match(/^WA \(/)) {
        i++;
        continue;
      }
      
      i++;
    }
    
    // Filter valid players and match with stats
    const validPlayers = playerEntries.filter(p => p.team && p.positions.length > 0);
    
    for (let j = 0; j < Math.min(validPlayers.length, statLines.length); j++) {
      const player = validPlayers[j];
      const stats = statLines[j];
      
      result.push({
        id: `fa-${j}`,
        name: player.name,
        nbaTeam: player.team,
        positions: player.positions,
        status: player.status as "DTD" | "IR" | "O" | "SUSP" | "healthy" | undefined,
        minutes: stats[0],
        fgm: 0, fga: 0, fgPct: stats[1],
        ftm: 0, fta: 0, ftPct: stats[2],
        threepm: stats[3],
        rebounds: stats[4],
        assists: stats[5],
        steals: stats[6],
        blocks: stats[7],
        turnovers: stats[8],
        points: stats[9],
        rostPct: stats[10],
      });
    }
    
    return result;
  };

  const handleParse = () => {
    if (!rawData.trim()) return;
    const parsed = parseESPNFreeAgents(rawData);
    if (parsed.length > 0) {
      setRawPlayers(parsed);
    }
  };

  // Calculate CRIS for all players
  const players = useMemo(() => {
    if (rawPlayers.length === 0) return [];
    return calculateCRISForAll(rawPlayers.map(p => ({
      ...p,
      fgPct: p.fgPct,
      ftPct: p.ftPct,
      threepm: p.threepm,
      rebounds: p.rebounds,
      assists: p.assists,
      steals: p.steals,
      blocks: p.blocks,
      turnovers: p.turnovers,
      points: p.points,
    })));
  }, [rawPlayers]);

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

    const scoreKey = useCris ? 'cris' : 'wCris';
    return result.sort((a, b) => {
      switch (sortBy) {
        case "cris": return (b[scoreKey] || 0) - (a[scoreKey] || 0);
        case "points": return b.points - a.points;
        case "rebounds": return b.rebounds - a.rebounds;
        case "assists": return b.assists - a.assists;
        case "blocks": return b.blocks - a.blocks;
        case "steals": return b.steals - a.steals;
        case "threepm": return b.threepm - a.threepm;
        default: return 0;
      }
    });
  }, [players, search, positionFilter, sortBy, useCris]);

  const toggleCompare = (player: FreeAgentPlayer) => {
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

  const scoreKey = useCris ? 'cris' : 'wCris';
  const scoreLabel = useCris ? 'CRIS' : 'wCRIS';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with CRIS Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold">Free Agents</h2>
          <CrisExplanation />
        </div>
        <CrisToggle useCris={useCris} onChange={setUseCris} />
      </div>

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
              <SelectItem value="cris">{scoreLabel}</SelectItem>
              <SelectItem value="points">Points</SelectItem>
              <SelectItem value="rebounds">Rebounds</SelectItem>
              <SelectItem value="assists">Assists</SelectItem>
              <SelectItem value="steals">Steals</SelectItem>
              <SelectItem value="blocks">Blocks</SelectItem>
              <SelectItem value="threepm">3PM</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setRawPlayers([])}>
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
                    <p className="text-muted-foreground">{scoreLabel}</p>
                    <p className="font-bold text-primary">{player[scoreKey]?.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stats Table */}
      <Card className="gradient-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/20">
                <th className="text-left p-3 font-display">#</th>
                <th className="text-left p-3 font-display min-w-[180px]">Player</th>
                <th className="text-center p-2 font-display">MIN</th>
                <th className="text-center p-2 font-display">FG%</th>
                <th className="text-center p-2 font-display">FT%</th>
                <th className="text-center p-2 font-display">3PM</th>
                <th className="text-center p-2 font-display">REB</th>
                <th className="text-center p-2 font-display">AST</th>
                <th className="text-center p-2 font-display">STL</th>
                <th className="text-center p-2 font-display">BLK</th>
                <th className="text-center p-2 font-display">TO</th>
                <th className="text-center p-2 font-display">PTS</th>
                <th className="text-center p-2 font-display border-l-2 border-primary/50">{scoreLabel}</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((player, idx) => (
                <tr 
                  key={player.id} 
                  className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelectedPlayer(player as FreeAgentPlayer)}
                >
                  <td className="p-2 font-bold text-primary">{idx + 1}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <PlayerPhoto name={player.name} size="sm" />
                      <div>
                        <div className="font-semibold">{player.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {player.nbaTeam} • {player.positions.join("/")}
                          {player.status && player.status !== 'healthy' && (
                            <Badge variant="destructive" className="text-xs ml-1">{player.status}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="text-center p-2">{player.minutes.toFixed(1)}</td>
                  <td className="text-center p-2">{formatPct(player.fgPct)}</td>
                  <td className="text-center p-2">{formatPct(player.ftPct)}</td>
                  <td className="text-center p-2">{player.threepm.toFixed(1)}</td>
                  <td className="text-center p-2">{player.rebounds.toFixed(1)}</td>
                  <td className="text-center p-2">{player.assists.toFixed(1)}</td>
                  <td className="text-center p-2">{player.steals.toFixed(1)}</td>
                  <td className="text-center p-2">{player.blocks.toFixed(1)}</td>
                  <td className="text-center p-2">{player.turnovers.toFixed(1)}</td>
                  <td className="text-center p-2">{player.points.toFixed(1)}</td>
                  <td className="text-center p-2 font-bold text-primary border-l-2 border-primary/50">
                    {player[scoreKey]?.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
