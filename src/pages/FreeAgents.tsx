import { useState, useMemo, useEffect } from "react";
import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { PlayerDetailSheet } from "@/components/roster/PlayerDetailSheet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, GitCompare, Upload, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, BarChart3, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CrisToggle } from "@/components/CrisToggle";
import { CrisExplanation } from "@/components/CrisExplanation";
import { calculateCRISForAll, formatPct, CATEGORIES } from "@/lib/crisUtils";

interface FreeAgentPlayer extends Player {
  cris: number;
  wCris: number;
}

interface FreeAgentsProps {
  persistedPlayers?: Player[];
  onPlayersChange?: (players: Player[]) => void;
}

// Known NBA team codes
const NBA_TEAMS = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'];

type SortKey = 'cris' | 'wCris' | 'minutes' | 'fgPct' | 'ftPct' | 'threepm' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'points';

const DISPLAY_LIMIT = 50;

export const FreeAgents = ({ persistedPlayers = [], onPlayersChange }: FreeAgentsProps) => {
  const [rawPlayers, setRawPlayers] = useState<Player[]>(persistedPlayers);
  const [rawData, setRawData] = useState("");
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("cris");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<FreeAgentPlayer | null>(null);
  const [compareList, setCompareList] = useState<FreeAgentPlayer[]>([]);
  const [useCris, setUseCris] = useState(true);
  const [showStatsView, setShowStatsView] = useState(false);
  const { toast } = useToast();

  // Sync with persisted data
  useEffect(() => {
    if (persistedPlayers.length > 0 && rawPlayers.length === 0) {
      setRawPlayers(persistedPlayers);
    }
  }, [persistedPlayers]);

  // Notify parent of changes
  useEffect(() => {
    if (onPlayersChange && rawPlayers.length > 0) {
      onPlayersChange(rawPlayers);
    }
  }, [rawPlayers, onPlayersChange]);

  const parseESPNFreeAgents = (data: string): Player[] => {
    console.log('Parsing Free Agents data...');
    const lines = data.split('\n').map(l => l.trim()).filter(l => l);
    const result: Player[] = [];
    
    // Skip ESPN navigation
    const skipPatterns = /^(ESPN|NFL|NBA|MLB|NCAAF|NHL|Soccer|WNBA|More Sports|Watch|Fantasy|Where to Watch|hsb\.|Copyright|Fantasy Basketball Home|My Team|League|Settings|Members|Rosters|Schedule|Message Board|Transaction Counter|History|Draft Recap|Email League|Recent Activity|Players$|Add Players|Watch List|Daily Leaders|Live Draft Trends|Added \/ Dropped|Player Rater|Player News|Projections|Waiver Order|Waiver Report|Undroppables|FantasyCast|Scoreboard|Standings|Opposing Teams|Free Agents.*|All Hail|Player Name|Position:|Filter|Available|Pro Team|Health|Watch List|Playing|Stat Qualifier|Reset All|Stats|Trending|Schedule|News|Compare Players|2026 season|TotalsAverages|Fantasy Basketball Support|Username|Password|Change Email|Issues Joining|Login|Reset Draft|Find Your|Search the full)$/i;
    
    interface PlayerEntry {
      name: string;
      team: string;
      positions: string[];
      status?: string;
    }
    
    const playerEntries: PlayerEntry[] = [];
    
    // Look for doubled player names (ESPN pattern: "Ayo DosunmuAyo Dosunmu")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (skipPatterns.test(line)) continue;
      if (line.length < 6 || line.length > 60) continue;
      
      // Check for doubled name pattern - more flexible
      const doubleMatch = line.match(/^([A-Z][a-zA-Z'.\-]+(?: [A-Z][a-zA-Z'.\-]+)+)\1$/);
      if (doubleMatch) {
        const name = doubleMatch[1].trim();
        
        let team = '';
        let positions: string[] = [];
        let status = '';
        
        for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
          const nextLine = lines[j];
          
          // Team code (including lowercase variations)
          if (!team && NBA_TEAMS.includes(nextLine.toUpperCase())) {
            team = nextLine.toUpperCase();
            continue;
          }
          
          // Positions - more flexible pattern
          if (positions.length === 0) {
            const posMatch = nextLine.match(/^(PG|SG|SF|PF|C)(,?\s*(PG|SG|SF|PF|C))*$/i);
            if (posMatch) {
              positions = nextLine.toUpperCase().replace(/\s/g, '').split(',');
              continue;
            }
          }
          
          // Status
          if (!status && ['DTD', 'O', 'GTD', 'IR', 'SUSP'].includes(nextLine.toUpperCase())) {
            status = nextLine.toUpperCase();
            continue;
          }
          
          // Stop at FA, WA, or next doubled player name
          if (nextLine === 'FA' || nextLine.match(/^WA/) || nextLine.match(/^[A-Z][a-z].*[A-Z][a-z].*\1$/)) break;
        }
        
        if (team && positions.length > 0) {
          playerEntries.push({ name, team, positions, status: status || undefined });
        }
      }
    }
    
    console.log(`Found ${playerEntries.length} player entries`);
    
    // Parse stats - look for individual stat lines or complete rows
    const statRows: number[][] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Stats line pattern - handle both .XXX and 1.000 formats for percentages
      // Example: "27.4 5.7/10.6 .539 2.3/2.8 .840 2.0 2.7 3.2 0.4 0.2 1.4 15.8"
      // Or: "27.7 5.0/12.0 .417 3.0/3.0 1.000 1.0 6.7 1.7 1.0 0.0 2.0 14.0"
      const statMatch = line.match(/^(\d+\.?\d*)\s+[\d.]+\/[\d.]+\s+(\.?\d+\.?\d*)\s+[\d.]+\/[\d.]+\s+(\.?\d+\.?\d*)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      
      if (statMatch) {
        // Parse FG% - handle both .539 and 0.539 formats
        let fgPct = parseFloat(statMatch[2]);
        if (fgPct > 1) fgPct = fgPct / 1000; // Handle cases like "539" -> 0.539
        else if (!statMatch[2].startsWith('.') && fgPct < 1) fgPct = fgPct; // Already decimal
        else if (statMatch[2].startsWith('.')) fgPct = parseFloat(statMatch[2]); // .539 format
        
        // Parse FT% - handle both .840 and 1.000 formats
        let ftPct = parseFloat(statMatch[3]);
        if (statMatch[3] === '1.000') ftPct = 1.0;
        else if (ftPct > 1) ftPct = ftPct / 1000;
        else if (statMatch[3].startsWith('.')) ftPct = parseFloat(statMatch[3]);
        
        statRows.push([
          parseFloat(statMatch[1]),  // MIN
          fgPct,                     // FG%
          ftPct,                     // FT%
          parseFloat(statMatch[4]),  // 3PM
          parseFloat(statMatch[5]),  // REB
          parseFloat(statMatch[6]),  // AST
          parseFloat(statMatch[7]),  // STL
          parseFloat(statMatch[8]),  // BLK
          parseFloat(statMatch[9]),  // TO
          parseFloat(statMatch[10]), // PTS
        ]);
      }
    }
    
    console.log(`Found ${statRows.length} stat rows`);
    
    // Match players with stats
    const maxLen = Math.min(playerEntries.length, statRows.length);
    
    for (let i = 0; i < maxLen; i++) {
      const p = playerEntries[i];
      const stats = statRows[i];
      
      result.push({
        id: `fa-${i}`,
        name: p.name,
        nbaTeam: p.team,
        positions: p.positions,
        status: p.status as any,
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
      });
    }
    
    // If no inline stats found, try line-by-line number extraction
    if (result.length === 0 && playerEntries.length > 0) {
      console.log('Trying line-by-line stat extraction...');
      
      // Collect all numeric values after MIN header
      const minIdx = lines.findIndex(l => l === 'MIN');
      if (minIdx > -1) {
        const numericValues: number[] = [];
        
        for (let i = minIdx + 1; i < lines.length; i++) {
          const line = lines[i];
          // Skip headers
          if (/^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|STATS)$/i.test(line)) continue;
          // Collect numbers
          if (/^[-+]?\d*\.?\d+$/.test(line) || line === '--') {
            numericValues.push(line === '--' ? 0 : parseFloat(line));
          }
        }
        
        // 15 columns per player
        const COLS = 15;
        const numPlayers = Math.floor(numericValues.length / COLS);
        
        for (let i = 0; i < Math.min(numPlayers, playerEntries.length); i++) {
          const base = i * COLS;
          const p = playerEntries[i];
          
          result.push({
            id: `fa-${i}`,
            name: p.name,
            nbaTeam: p.team,
            positions: p.positions,
            status: p.status as any,
            minutes: numericValues[base] || 0,
            fgm: 0, fga: 0, fgPct: numericValues[base + 2] || 0,
            ftm: 0, fta: 0, ftPct: numericValues[base + 4] || 0,
            threepm: numericValues[base + 5] || 0,
            rebounds: numericValues[base + 6] || 0,
            assists: numericValues[base + 7] || 0,
            steals: numericValues[base + 8] || 0,
            blocks: numericValues[base + 9] || 0,
            turnovers: numericValues[base + 10] || 0,
            points: numericValues[base + 11] || 0,
          });
        }
      }
    }
    
    console.log(`Returning ${result.length} free agents`);
    return result;
  };

  const handleParse = () => {
    if (!rawData.trim()) {
      toast({
        title: "No data",
        description: "Please paste your ESPN Free Agents data first",
        variant: "destructive",
      });
      return;
    }
    
    const parsed = parseESPNFreeAgents(rawData);
    if (parsed.length > 0) {
      setRawPlayers(parsed);
      toast({
        title: "Success!",
        description: `Loaded ${parsed.length} free agents`,
      });
    } else {
      toast({
        title: "No players found",
        description: "Could not parse free agent data. Make sure to copy the entire ESPN Free Agents page.",
        variant: "destructive",
      });
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

    const activeSortKey = sortKey === 'cris' || sortKey === 'wCris' 
      ? (useCris ? 'cris' : 'wCris') 
      : sortKey;
    
    const sorted = [...result].sort((a, b) => {
      let aVal = a[activeSortKey as keyof typeof a] as number;
      let bVal = b[activeSortKey as keyof typeof b] as number;
      
      // For turnovers, lower is better (invert sort)
      if (sortKey === 'turnovers') {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    
    // Limit to 50 players
    return sorted.slice(0, DISPLAY_LIMIT);
  }, [players, search, positionFilter, sortKey, sortAsc, useCris]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      // Default to descending for stats (higher is better), except turnovers
      setSortAsc(key === 'turnovers');
    }
  };

  const SortHeader = ({ label, sortKeyProp, className }: { label: string; sortKeyProp: SortKey; className?: string }) => (
    <th 
      className={cn("p-2 font-display cursor-pointer hover:bg-muted/50 select-none", className)}
      onClick={() => handleSort(sortKeyProp)}
    >
      <div className="flex items-center justify-center gap-1">
        {label}
        {sortKey === sortKeyProp ? (
          sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </div>
    </th>
  );

  const toggleCompare = (player: FreeAgentPlayer) => {
    if (compareList.find(p => p.id === player.id)) {
      setCompareList(compareList.filter(p => p.id !== player.id));
    } else if (compareList.length < 4) {
      setCompareList([...compareList, player]);
    }
  };

  const handleReset = () => {
    setRawPlayers([]);
    setRawData("");
    if (onPlayersChange) onPlayersChange([]);
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
          <h2 className="text-xl font-display font-bold">Free Agents (Top {DISPLAY_LIMIT})</h2>
          <CrisExplanation />
        </div>
        <div className="flex items-center gap-3">
          {/* Stats vs Score Toggle */}
          <div className="flex items-center gap-2 bg-secondary/30 rounded-lg p-1">
            <Button
              variant={showStatsView ? "ghost" : "secondary"}
              size="sm"
              onClick={() => setShowStatsView(false)}
              className="h-8 px-3"
            >
              <Hash className="w-4 h-4 mr-1" />
              Score
            </Button>
            <Button
              variant={showStatsView ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowStatsView(true)}
              className="h-8 px-3"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Stats
            </Button>
          </div>
          <CrisToggle useCris={useCris} onChange={setUseCris} />
        </div>
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
          <Button variant="outline" size="icon" onClick={handleReset}>
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
                {showStatsView ? (
                  <>
                    <SortHeader label="MIN" sortKeyProp="minutes" />
                    <SortHeader label="FG%" sortKeyProp="fgPct" />
                    <SortHeader label="FT%" sortKeyProp="ftPct" />
                    <SortHeader label="3PM" sortKeyProp="threepm" />
                    <SortHeader label="REB" sortKeyProp="rebounds" />
                    <SortHeader label="AST" sortKeyProp="assists" />
                    <SortHeader label="STL" sortKeyProp="steals" />
                    <SortHeader label="BLK" sortKeyProp="blocks" />
                    <SortHeader label="TO" sortKeyProp="turnovers" />
                    <SortHeader label="PTS" sortKeyProp="points" />
                  </>
                ) : (
                  <>
                    <SortHeader label="PTS" sortKeyProp="points" />
                    <SortHeader label="REB" sortKeyProp="rebounds" />
                    <SortHeader label="AST" sortKeyProp="assists" />
                  </>
                )}
                <SortHeader label={scoreLabel} sortKeyProp="cris" className="border-l-2 border-primary/50" />
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
                      <NBATeamLogo teamCode={player.nbaTeam} size="sm" />
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
                  {showStatsView ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <td className="text-center p-2">{player.points.toFixed(1)}</td>
                      <td className="text-center p-2">{player.rebounds.toFixed(1)}</td>
                      <td className="text-center p-2">{player.assists.toFixed(1)}</td>
                    </>
                  )}
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
