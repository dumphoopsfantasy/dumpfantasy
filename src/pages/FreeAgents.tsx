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
  cri: number;
  wCri: number;
  opponent?: string;
  gameTime?: string;
}

interface FreeAgentsProps {
  persistedPlayers?: Player[];
  onPlayersChange?: (players: Player[]) => void;
}

// Known NBA team codes
const NBA_TEAMS = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'];

type SortKey = 'cri' | 'wCri' | 'minutes' | 'fgPct' | 'ftPct' | 'threepm' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'points';

const DISPLAY_LIMIT = 50;

export const FreeAgents = ({ persistedPlayers = [], onPlayersChange }: FreeAgentsProps) => {
  const [rawPlayers, setRawPlayers] = useState<Player[]>(persistedPlayers);
  const [rawData, setRawData] = useState("");
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [scheduleFilter, setScheduleFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("cri");
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

  /**
   * ESPN Free Agents Parser - Two-Step Index-Based Approach
   * Step 1: Parse PLAYER LIST (names, teams, positions, opponent, time, status)
   * Step 2: Parse STATS TABLE (17 numeric values per player when fractions split)
   * Step 3: ZIP by index - player[i] gets stats[i]
   */
  const parseESPNFreeAgents = (data: string): Player[] => {
    console.log('Starting to parse ESPN data...');
    const lines = data.split('\n').map(l => l.trim()).filter(l => l);
    
    // ========== STEP 1: Parse Player List ==========
    interface PlayerInfo {
      name: string;
      team: string;
      positions: string[];
      status?: string;
      opponent?: string;
      gameTime?: string;
    }
    
    const playerList: PlayerInfo[] = [];
    
    // Look for doubled player names (ESPN pattern: "Ayo DosunmuAyo Dosunmu")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 6 || line.length > 80) continue;
      
      // Check if line is a doubled name (exact duplicate of first half)
      const halfLen = line.length / 2;
      if (halfLen === Math.floor(halfLen) && line.substring(0, halfLen) === line.substring(halfLen)) {
        const name = line.substring(0, halfLen).trim();
        // Validate it looks like a name (starts with capital, has space)
        if (!/^[A-Z][a-z]/.test(name) || !name.includes(' ')) continue;
        // Skip if it looks like a header or navigation
        if (/^(Fantasy|ESPN|Add|Drop|Trade|Watch|Support|Research)/i.test(name)) continue;
        
        let team = '';
        let positions: string[] = [];
        let status = '';
        let opponent = '';
        let gameTime = '';
        
        // Look ahead to find player metadata
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          const nextLine = lines[j];
          
          // Team code (2-3 uppercase letters)
          if (!team && NBA_TEAMS.includes(nextLine.toUpperCase())) {
            team = nextLine.toUpperCase();
            continue;
          }
          
          // Positions (PG, SG, SF, PF, C combinations)
          if (positions.length === 0) {
            const posMatch = nextLine.match(/^(PG|SG|SF|PF|C)(,\s*(PG|SG|SF|PF|C))*$/i);
            if (posMatch) {
              positions = nextLine.toUpperCase().replace(/\s/g, '').split(',');
              continue;
            }
          }
          
          // Status (DTD, O, GTD, IR, SUSP)
          if (!status && ['DTD', 'O', 'GTD', 'IR', 'SUSP'].includes(nextLine.toUpperCase())) {
            status = nextLine.toUpperCase();
            continue;
          }
          
          // Opponent pattern: team code followed optionally by time
          // Examples: "Utah", "@LAL", "vs BOS", "Utah 7:30 PM"
          if (!opponent) {
            // Check for opponent with time: "Utah 7:30 PM" or "Bos 7:00 PM"
            const oppTimeMatch = nextLine.match(/^(@?)([A-Za-z]{2,4})\s+(\d{1,2}:\d{2}\s*(AM|PM)?(\s*ET)?)/i);
            if (oppTimeMatch) {
              opponent = (oppTimeMatch[1] || '') + oppTimeMatch[2].toUpperCase();
              gameTime = oppTimeMatch[3].trim();
              continue;
            }
            // Check for just opponent: "@LAL" or "vs BOS" or just team code
            const oppMatch = nextLine.match(/^(@|vs\.?\s*)?([A-Za-z]{2,4})$/i);
            if (oppMatch && NBA_TEAMS.includes(oppMatch[2].toUpperCase())) {
              const prefix = oppMatch[1] ? (oppMatch[1].toLowerCase().includes('v') ? 'vs ' : '@') : '';
              opponent = prefix + oppMatch[2].toUpperCase();
              continue;
            }
          }
          
          // Game time standalone: "7:30 PM" or "7:30 PM ET"
          if (!gameTime && !opponent) {
            const timeMatch = nextLine.match(/^(\d{1,2}:\d{2}\s*(AM|PM)(\s*ET)?)/i);
            if (timeMatch) {
              gameTime = timeMatch[1].trim();
              continue;
            }
          }
          
          // Stop at FA/WA status or next doubled name
          if (nextLine === 'FA' || nextLine.match(/^WA/)) break;
          if (nextLine.match(/^[A-Z][a-z].*[A-Z][a-z]/) && nextLine.length > 6) {
            const testHalf = nextLine.length / 2;
            if (testHalf === Math.floor(testHalf) && nextLine.substring(0, testHalf) === nextLine.substring(testHalf)) {
              break;
            }
          }
        }
        
        // Accept player even if we only found partial info
        if (team || positions.length > 0) {
          if (!team) team = 'FA';
          if (positions.length === 0) positions = ['UTIL'];
          
          playerList.push({ 
            name, 
            team, 
            positions, 
            status: status || undefined,
            opponent: opponent || undefined,
            gameTime: gameTime || undefined
          });
        }
      }
    }
    
    console.log(`Parsed ${playerList.length} player infos`);
    
    // ========== STEP 2: Parse Stats Table ==========
    // Find "MIN" header which marks the start of stats
    // Columns: MIN, FGM/FGA, FG%, FTM/FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
    // When pasted, fractions split: FGM/FGA becomes two values, FTM/FTA becomes two values
    // So 15 columns become 17 numeric values per player
    
    const statTokens: string[] = [];
    const minIdx = lines.findIndex(l => l === 'MIN');
    
    if (minIdx > -1) {
      // Collect ALL numeric-looking tokens after MIN header
      for (let i = minIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        
        // Hard stop at footer content
        if (/^(Username|Password|ESPN\.com|Copyright|©|\d{4}\s+ESPN)/i.test(line)) {
          console.log(`Stopping at footer: ${line.substring(0, 30)}`);
          break;
        }
        
        // Skip column headers
        if (/^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|STATS|MIN|Fantasy|Support|Basketball|Page)$/i.test(line)) {
          continue;
        }
        
        // Collect numeric values: integers, decimals, percentages (.XXX), negatives, and '--' placeholders
        if (/^[-+]?\d+\.?\d*$/.test(line) || /^\.\d+$/.test(line) || line === '--') {
          statTokens.push(line);
        }
      }
    }
    
    console.log(`Collected ${statTokens.length} stat tokens`);
    
    // Parse tokens into stat rows
    // Each player has 17 values: MIN, FGM, FGA, FG%, FTM, FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
    const COLS = 17;
    const numStatRows = Math.floor(statTokens.length / COLS);
    
    interface StatRow {
      min: number;
      fgm: number;
      fga: number;
      fgPct: number;
      ftm: number;
      fta: number;
      ftPct: number;
      threepm: number;
      reb: number;
      ast: number;
      stl: number;
      blk: number;
      to: number;
      pts: number;
    }
    
    const statsList: StatRow[] = [];
    
    for (let i = 0; i < numStatRows; i++) {
      const base = i * COLS;
      const parseVal = (idx: number) => {
        const val = statTokens[base + idx];
        if (!val || val === '--') return 0;
        return parseFloat(val);
      };
      
      // Handle FG% - can be .XXX format or X.XXX format
      let fgPct = parseVal(3);
      if (fgPct > 1 && fgPct < 10) fgPct = fgPct; // Already correct like 0.539
      else if (fgPct >= 100) fgPct = fgPct / 1000; // 539 -> 0.539
      
      // Handle FT% - can be .XXX, 1.000, or X.XXX format
      let ftPct = parseVal(6);
      if (ftPct > 1 && ftPct < 10) ftPct = ftPct; // Already correct
      else if (ftPct >= 100) ftPct = ftPct / 1000; // 840 -> 0.840
      
      statsList.push({
        min: parseVal(0),
        fgm: parseVal(1),
        fga: parseVal(2),
        fgPct,
        ftm: parseVal(4),
        fta: parseVal(5),
        ftPct,
        threepm: parseVal(7),
        reb: parseVal(8),
        ast: parseVal(9),
        stl: parseVal(10),
        blk: parseVal(11),
        to: parseVal(12),
        pts: parseVal(13),
        // Skip: PR15 (14), %ROST (15), +/- (16)
      });
    }
    
    console.log(`Built ${statsList.length} stat rows`);
    
    // ========== STEP 3: ZIP Players with Stats by Index ==========
    const result: Player[] = [];
    const targetCount = Math.min(playerList.length, statsList.length, DISPLAY_LIMIT);
    
    for (let i = 0; i < targetCount; i++) {
      const p = playerList[i];
      const s = statsList[i];
      
      result.push({
        id: `fa-${i}`,
        name: p.name,
        nbaTeam: p.team,
        positions: p.positions,
        status: p.status as any,
        opponent: p.opponent,
        gameTime: p.gameTime,
        minutes: s.min,
        fgm: s.fgm,
        fga: s.fga,
        fgPct: s.fgPct,
        ftm: s.ftm,
        fta: s.fta,
        ftPct: s.ftPct,
        threepm: s.threepm,
        rebounds: s.reb,
        assists: s.ast,
        steals: s.stl,
        blocks: s.blk,
        turnovers: s.to,
        points: s.pts,
      });
    }
    
    // Debug: log first 3 players with stats
    if (result.length > 0) {
      console.log('Sample players:', result.slice(0, 3).map(p => ({
        name: p.name,
        pts: p.points,
        reb: p.rebounds,
        fgPct: p.fgPct
      })));
    }
    
    console.log(`Returning ${result.length} complete player records`);
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

    // Schedule filter
    if (scheduleFilter === "playing") {
      result = result.filter(p => p.opponent);
    } else if (scheduleFilter === "not-playing") {
      result = result.filter(p => !p.opponent);
    }

    const activeSortKey = sortKey === 'cri' || sortKey === 'wCri' 
      ? (useCris ? 'cri' : 'wCri') 
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
  }, [players, search, positionFilter, scheduleFilter, sortKey, sortAsc, useCris]);

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

  const scoreKey = useCris ? 'cri' : 'wCri';
  const scoreLabel = useCris ? 'CRI' : 'wCRI';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with View Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold">Free Agents ({Math.min(filteredPlayers.length, DISPLAY_LIMIT)} players)</h2>
          <CrisExplanation />
        </div>
        <div className="flex items-center gap-3">
          {/* Stats vs CRIS Rankings Toggle */}
          <div className="flex items-center gap-2 bg-secondary/30 rounded-lg p-1">
            <Button
              variant={!showStatsView ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowStatsView(false)}
              className="h-8 px-3"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Stats
            </Button>
            <Button
              variant={showStatsView ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowStatsView(true)}
              className="h-8 px-3"
            >
              <Hash className="w-4 h-4 mr-1" />
              Rankings
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
          <Select value={scheduleFilter} onValueChange={setScheduleFilter}>
            <SelectTrigger className="w-full md:w-[160px]">
              <SelectValue placeholder="Schedule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Games</SelectItem>
              <SelectItem value="playing">Playing Today</SelectItem>
              <SelectItem value="not-playing">Not Playing</SelectItem>
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
                <th className="text-center p-2 font-display">OPP</th>
                {!showStatsView ? (
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
                    {CATEGORIES.map(cat => (
                      <th key={cat.key} className="p-2 font-display text-center text-xs">
                        {cat.label}
                      </th>
                    ))}
                  </>
                )}
                <SortHeader label={scoreLabel} sortKeyProp="cri" className="border-l-2 border-primary/50" />
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
                  <td className="text-center p-2 text-xs">
                    {player.opponent ? (
                      <div>
                        <div className="font-medium">{player.opponent}</div>
                        {player.gameTime && <div className="text-muted-foreground">{player.gameTime}</div>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {!showStatsView ? (
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
                      {CATEGORIES.map(cat => {
                        // Calculate rank for this category among all players
                        const isLowerBetter = cat.key === 'turnovers';
                        const sorted = [...filteredPlayers].sort((a, b) => {
                          const aVal = a[cat.key as keyof typeof a] as number;
                          const bVal = b[cat.key as keyof typeof b] as number;
                          return isLowerBetter ? aVal - bVal : bVal - aVal;
                        });
                        const rank = sorted.findIndex(p => p.id === player.id) + 1;
                        const total = filteredPlayers.length;
                        const percentile = rank / total;
                        const color = percentile <= 0.25 ? 'text-stat-positive' : 
                                      percentile <= 0.5 ? 'text-emerald-400' : 
                                      percentile <= 0.75 ? 'text-yellow-400' : 'text-stat-negative';
                        return (
                          <td key={cat.key} className={cn("text-center p-2 font-semibold", color)}>
                            #{rank}
                          </td>
                        );
                      })}
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
