import { useState, useMemo, useEffect } from "react";
import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { FreeAgentImpactSheet } from "@/components/FreeAgentImpactSheet";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, GitCompare, Upload, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, BarChart3, Hash, Sliders, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CrisToggle } from "@/components/CrisToggle";
import { CrisExplanation } from "@/components/CrisExplanation";
import { calculateCRISForAll, calculateCustomCRI, formatPct, CATEGORIES, CATEGORY_PRESETS } from "@/lib/crisUtils";
import { Checkbox } from "@/components/ui/checkbox";

// Extended Free Agent interface with bonus stats and ranks
interface FreeAgent extends Player {
  cri: number;
  wCri: number;
  criRank: number;
  wCriRank: number;
  customCri?: number;
  customCriRank?: number;
  // Bonus insight stats (not used for CRI/wCRI)
  pr15: number;
  rosterPct: number;
  plusMinus: number;
}

interface FreeAgentsProps {
  persistedPlayers?: Player[];
  onPlayersChange?: (players: Player[]) => void;
  currentRoster?: Player[];
}

// Known NBA team codes
const NBA_TEAMS = ['ATL', 'BOS', 'BKN', 'BRK', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'];

type SortKey = 'cri' | 'wCri' | 'customCri' | 'fgPct' | 'ftPct' | 'threepm' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'points' | 'minutes' | 'pr15' | 'rosterPct' | 'plusMinus';
type ViewMode = 'stats' | 'rankings' | 'advanced';

export const FreeAgents = ({ persistedPlayers = [], onPlayersChange, currentRoster = [] }: FreeAgentsProps) => {
  const [rawPlayers, setRawPlayers] = useState<Player[]>(persistedPlayers);
  const [bonusStats, setBonusStats] = useState<Map<string, { pr15: number; rosterPct: number; plusMinus: number }>>(new Map());
  const [rawData, setRawData] = useState("");
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [scheduleFilter, setScheduleFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("cri");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<FreeAgent | null>(null);
  const [compareList, setCompareList] = useState<FreeAgent[]>([]);
  const [useCris, setUseCris] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('stats');
  const [customCategories, setCustomCategories] = useState<string[]>(CATEGORY_PRESETS.all.categories);
  const [activePreset, setActivePreset] = useState<string>('all');
  const [detectedStatWindow, setDetectedStatWindow] = useState<string | null>(null);
  const { toast } = useToast();

  // Detect stat window from pasted data - look for the specific ESPN stat selector pattern
  const detectStatWindow = (data: string): string | null => {
    // Look for the pattern: "Stats\n[Window]\nTotalsAverages" or nearby
    // The stat window appears right after "Stats" and before "TotalsAverages" in ESPN data
    const lines = data.split('\n').map(l => l.trim());
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'Stats' && i + 2 < lines.length) {
        const nextLine = lines[i + 1];
        // Check if next line is a valid stat window option
        if (nextLine === 'Last 7') return 'Last 7';
        if (nextLine === 'Last 15') return 'Last 15';
        if (nextLine === 'Last 30') return 'Last 30';
        if (nextLine === '2025') return '2025 Season';
        if (nextLine === '2026') return '2026 Season';
        if (nextLine === '2026 Projections' || nextLine === 'Projections') return '2026 Projections';
      }
    }
    
    return null;
  };

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
   * ESPN Free Agents Parser - Robust Two-Phase Index-Based Approach
   * Phase 1: Parse PLAYER LIST (names, teams, positions, opponent, time, status)
   * Phase 2: Parse STATS TABLE (17 numeric values per player)
   * Phase 3: ZIP by index - player[i] gets stats[i]
   */
  const parseESPNFreeAgents = (data: string): { players: Player[]; bonus: Map<string, { pr15: number; rosterPct: number; plusMinus: number }> } => {
    console.log('=== Starting ESPN Free Agents Parser ===');
    const lines = data.split('\n').map(l => l.trim()).filter(l => l);
    
    // ========== PHASE 1: Parse Player List (Bios) ==========
    interface PlayerInfo {
      name: string;
      team: string;
      positions: string[];
      status?: string;
      opponent?: string;
      gameTime?: string;
    }
    
    const playerList: PlayerInfo[] = [];
    
    // Method 1: Find doubled player names (ESPN pattern: "Noah ClowneyNoah Clowney")
    // Method 2: Look for FA/WA markers and work backwards
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip very short or very long lines
      if (line.length < 6 || line.length > 80) continue;
      
      let name = '';
      
      // Method 1: Check for doubled name pattern on same line ("Noah ClowneyNoah Clowney")
      const halfLen = line.length / 2;
      if (halfLen === Math.floor(halfLen) && line.substring(0, halfLen) === line.substring(halfLen)) {
        name = line.substring(0, halfLen).trim();
      }
      // Method 2: Check for consecutive identical lines (no photo pattern: "Caleb Love\nCaleb Love")
      else if (i + 1 < lines.length && line === lines[i + 1] && line.includes(' ') && /^[A-Z]/.test(line)) {
        name = line.trim();
        i++; // Skip the duplicate line
      }
      
      if (!name) continue;
      
      // Validate it looks like a name - allow:
      // - Standard names: "Noah Clowney" (starts with capital, has space)
      // - Names with initials: "AJ Green" (two capitals)
      // - Names with apostrophes: "D'Angelo Russell"
      const isValidName = name.includes(' ') && /^[A-Z]/.test(name) && name.length >= 4;
      if (!isValidName) continue;
        
        // Skip navigation/header text
        if (/^(Fantasy|ESPN|Add|Drop|Trade|Watch|Support|Research|Basketball|Football|Hockey|Baseball)/i.test(name)) continue;
        
        let team = '';
        let positions: string[] = [];
        let status = '';
        let opponent = '';
        let gameTime = '';
        let foundFAWA = false;
        
        // Look ahead for player metadata (up to 25 lines)
        for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
          const nextLine = lines[j];
          
          // Check if next line is a doubled name (next player) - stop here
          const testHalf = nextLine.length / 2;
          if (testHalf === Math.floor(testHalf) && testHalf >= 3 && 
              nextLine.substring(0, testHalf) === nextLine.substring(testHalf) &&
              /^[A-Z]/.test(nextLine.substring(0, testHalf)) &&
              nextLine.substring(0, testHalf).includes(' ')) {
            break;
          }
          
          // Team code (2-4 letter uppercase)
          if (!team) {
            const upperLine = nextLine.toUpperCase();
            if (NBA_TEAMS.includes(upperLine)) {
              team = upperLine;
              continue;
            }
          }
          
          // Positions (PG, SG, SF, PF, C combinations)
          if (positions.length === 0) {
            const posMatch = nextLine.match(/^(PG|SG|SF|PF|C)(,\s*(PG|SG|SF|PF|C))*$/i);
            if (posMatch) {
              positions = nextLine.toUpperCase().replace(/\s/g, '').split(',').filter(p => p);
              continue;
            }
          }
          
          // Injury/status (DTD, O, GTD, IR, SUSP)
          if (!status && ['DTD', 'O', 'GTD', 'IR', 'SUSP'].includes(nextLine.toUpperCase())) {
            status = nextLine.toUpperCase();
            continue;
          }
          
          // FA/WA status - mark it but DON'T break, continue to find opponent
          if (nextLine === 'FA' || nextLine.match(/^WA(\s|\(|$)/)) {
            foundFAWA = true;
            continue;
          }
          
          // Opponent with time: "Utah 7:30 PM" or "@LAL 7:00 PM" or "vs BOS 7:00 PM"
          if (!opponent) {
            const oppTimeMatch = nextLine.match(/^(@|vs\.?\s*)?([A-Za-z]{2,4})\s+(\d{1,2}:\d{2}\s*(AM|PM)?(\s*ET)?)/i);
            if (oppTimeMatch) {
              const prefix = oppTimeMatch[1] ? (oppTimeMatch[1].toLowerCase().includes('v') ? 'vs ' : '@') : '';
              opponent = prefix + oppTimeMatch[2].toUpperCase();
              gameTime = oppTimeMatch[3].trim();
              continue;
            }
            
            // Just opponent: "@LAL" or "vs BOS" or team code like "Utah", "Bos", "Min"
            const oppMatch = nextLine.match(/^(@|vs\.?\s*)?([A-Za-z]{2,4})$/i);
            if (oppMatch && foundFAWA) {
              const upperTeam = oppMatch[2].toUpperCase();
              // Check if it's a valid opponent team (not the player's own team)
              if ((NBA_TEAMS.includes(upperTeam) || ['UTAH'].includes(upperTeam)) && upperTeam !== team) {
                const prefix = oppMatch[1] ? (oppMatch[1].toLowerCase().includes('v') ? 'vs ' : '@') : '';
                opponent = prefix + upperTeam;
                continue;
              }
            }
          }
          
          // Standalone game time: "7:30 PM"
          if (!gameTime && opponent) {
            const timeMatch = nextLine.match(/^(\d{1,2}:\d{2}\s*(AM|PM)(\s*ET)?)/i);
            if (timeMatch) {
              gameTime = timeMatch[1].trim();
              break; // Got everything, stop
            }
          }
          
          // If we found FA/WA and then opponent+time, we're done
          if (foundFAWA && opponent && gameTime) break;
          
          // Stop if we hit "--" (no game) after FA/WA
          if (foundFAWA && nextLine === '--') break;
        }
        
        // Accept player if we found some metadata
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
    
    console.log(`Phase 1: Found ${playerList.length} players from bio section`);
    if (playerList.length > 0) {
      console.log('First 3 players:', playerList.slice(0, 3).map(p => `${p.name} (${p.team})`));
    }
    
    // ========== PHASE 2: Parse Stats Table ==========
    // Columns when fractions split: MIN, FGM, FGA, FG%, FTM, FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
    // That's 17 values per player
    
    const statTokens: string[] = [];
    
    // Find the stats section - look for "MIN" followed by stat headers
    let statsStartIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'MIN' && i + 1 < lines.length) {
        // Verify this is the stats header by checking next few lines
        const nextFew = lines.slice(i, i + 5).join(' ');
        if (nextFew.includes('FG') || nextFew.includes('3PM') || nextFew.includes('REB')) {
          statsStartIdx = i;
          break;
        }
      }
    }
    
    if (statsStartIdx === -1) {
      // Alternative: look for "STATS" or "Research" marker
      for (let i = 0; i < lines.length; i++) {
        if (/^STATS$/i.test(lines[i]) || /^Research$/i.test(lines[i])) {
          // Find MIN after this
          for (let j = i; j < Math.min(i + 20, lines.length); j++) {
            if (lines[j] === 'MIN') {
              statsStartIdx = j;
              break;
            }
          }
          if (statsStartIdx > -1) break;
        }
      }
    }
    
    console.log(`Stats section starts at line ${statsStartIdx}`);
    
    if (statsStartIdx > -1) {
      // Skip past column headers
      let dataStartIdx = statsStartIdx + 1;
      while (dataStartIdx < lines.length && 
             /^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|MIN)$/i.test(lines[dataStartIdx])) {
        dataStartIdx++;
      }
      
      // Calculate how many tokens we need (17 per player)
      const tokensNeeded = playerList.length * 17;
      
      // Collect tokens until we have enough OR hit footer
      for (let i = dataStartIdx; i < lines.length && statTokens.length < tokensNeeded; i++) {
        const line = lines[i];
        
        // Stop at footer content
        if (/^(Username|Password|ESPN\.com|Copyright|©|Sign\s*(Up|In)|Log\s*In|Terms\s*of|Privacy|Fantasy Basketball Support)/i.test(line)) {
          console.log(`Stopping at footer line ${i}: "${line.substring(0, 30)}"`);
          break;
        }
        
        // Skip non-data lines (but NOT small numbers - those are valid stats!)
        if (/^(Fantasy|Support|About|Help|Contact|Page|Showing|Results|\d+\s+of\s+\d+)$/i.test(line)) continue;
        
        // Skip pagination pattern "1 2 3 4 5 ... 19" on a single line
        if (/^(\d+\s+)+\.{3}\s*\d+$/.test(line)) continue;
        
        // Handle fractions like "5.9/12.3" - split into two values
        if (/^\d+\.?\d*\/\d+\.?\d*$/.test(line)) {
          const parts = line.split('/');
          statTokens.push(parts[0], parts[1]);
          continue;
        }
        
        // Collect numeric values: integers, decimals, percentages (.XXX), negatives, and '--' placeholders
        // Small integers (0, 1, 2...) ARE valid stat values (blocks, steals, etc.)
        if (/^[-+]?\d+\.?\d*$/.test(line) || /^\.\d+$/.test(line) || line === '--') {
          statTokens.push(line);
        }
      }
    }
    
    console.log(`Phase 2: Collected ${statTokens.length} stat tokens (expected ~${playerList.length * 17})`);
    
    // Parse tokens into stat rows (17 values per player when fractions are split)
    // Columns: MIN, FGM, FGA, FG%, FTM, FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
    const COLS = 17;
    const numStatRows = Math.floor(statTokens.length / COLS);
    
    interface StatRow {
      min: number;
      fgPct: number;
      ftPct: number;
      threepm: number;
      reb: number;
      ast: number;
      stl: number;
      blk: number;
      to: number;
      pts: number;
      pr15: number;
      rosterPct: number;
      plusMinus: number;
    }
    
    const statsList: StatRow[] = [];
    
    for (let i = 0; i < numStatRows; i++) {
      const base = i * COLS;
      const parseVal = (idx: number): number => {
        const val = statTokens[base + idx];
        if (!val || val === '--') return 0;
        return parseFloat(val);
      };
      
      // Column mapping (when FGM/FGA and FTM/FTA split into separate values):
      // 0: MIN, 1: FGM, 2: FGA, 3: FG%, 4: FTM, 5: FTA, 6: FT%
      // 7: 3PM, 8: REB, 9: AST, 10: STL, 11: BLK, 12: TO, 13: PTS
      // 14: PR15, 15: %ROST, 16: +/-
      
      // FG% is at index 3 - should be in .XXX format like .477
      let fgPct = parseVal(3);
      // If it's already < 1, it's correct; if > 1, normalize it
      if (fgPct > 1) fgPct = fgPct / (fgPct >= 100 ? 1000 : 100);
      
      // FT% is at index 6
      let ftPct = parseVal(6);
      if (ftPct > 1) ftPct = ftPct / (ftPct >= 100 ? 1000 : 100);
      
      statsList.push({
        min: parseVal(0),
        fgPct,
        ftPct,
        threepm: parseVal(7),
        reb: parseVal(8),
        ast: parseVal(9),
        stl: parseVal(10),
        blk: parseVal(11),
        to: parseVal(12),
        pts: parseVal(13),
        pr15: parseVal(14),
        rosterPct: parseVal(15),
        plusMinus: parseVal(16),
      });
    }
    
    console.log(`Phase 2: Built ${statsList.length} stat rows`);
    if (statsList.length > 0) {
      console.log('First player stats:', statsList[0]);
    }
    
    // ========== PHASE 3: Combine by Index ==========
    const targetCount = Math.min(playerList.length, statsList.length);
    
    if (playerList.length !== statsList.length) {
      console.warn(`⚠️ Mismatch: ${playerList.length} players vs ${statsList.length} stat rows. Using ${targetCount}.`);
    }
    
    const players: Player[] = [];
    const bonusMap = new Map<string, { pr15: number; rosterPct: number; plusMinus: number }>();
    
    for (let i = 0; i < targetCount; i++) {
      const p = playerList[i];
      const s = statsList[i];
      const id = `fa-${i}`;
      
      players.push({
        id,
        name: p.name,
        nbaTeam: p.team,
        positions: p.positions,
        status: p.status as any,
        opponent: p.opponent,
        gameTime: p.gameTime,
        minutes: s.min,
        fgm: 0,
        fga: 0,
        fgPct: s.fgPct,
        ftm: 0,
        fta: 0,
        ftPct: s.ftPct,
        threepm: s.threepm,
        rebounds: s.reb,
        assists: s.ast,
        steals: s.stl,
        blocks: s.blk,
        turnovers: s.to,
        points: s.pts,
      });
      
      // Store bonus stats separately
      bonusMap.set(id, {
        pr15: s.pr15,
        rosterPct: s.rosterPct,
        plusMinus: s.plusMinus,
      });
    }
    
    console.log(`=== Parser Complete: ${players.length} players with stats ===`);
    
    return { players, bonus: bonusMap };
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
    
    // Detect stat window from pasted data
    const window = detectStatWindow(rawData);
    setDetectedStatWindow(window);
    
    const { players, bonus } = parseESPNFreeAgents(rawData);
    if (players.length > 0) {
      setRawPlayers(players);
      setBonusStats(bonus);
      toast({
        title: "Success!",
        description: `Loaded ${players.length} free agents${window ? ` (${window})` : ''}`,
      });
    } else {
      toast({
        title: "No players found",
        description: "Could not parse free agent data. Make sure to copy the entire ESPN Free Agents page.",
        variant: "destructive",
      });
    }
  };

  // Calculate CRI/wCRI for all players using only 9-cat stats
  const playersWithCRI = useMemo(() => {
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

  // Compute CRI and wCRI ranks (1 = best)
  const playersWithRanks = useMemo((): FreeAgent[] => {
    if (playersWithCRI.length === 0) return [];
    
    // Sort by CRI descending to assign ranks
    const criSorted = [...playersWithCRI].sort((a, b) => b.cri - a.cri);
    const wCriSorted = [...playersWithCRI].sort((a, b) => b.wCri - a.wCri);
    
    const criRanks = new Map<string, number>();
    const wCriRanks = new Map<string, number>();
    
    criSorted.forEach((p, idx) => criRanks.set(p.id, idx + 1));
    wCriSorted.forEach((p, idx) => wCriRanks.set(p.id, idx + 1));
    
    return playersWithCRI.map(p => {
      const bonus = bonusStats.get(p.id) || { pr15: 0, rosterPct: 0, plusMinus: 0 };
      return {
        ...p,
        criRank: criRanks.get(p.id) || 0,
        wCriRank: wCriRanks.get(p.id) || 0,
        pr15: bonus.pr15,
        rosterPct: bonus.rosterPct,
        plusMinus: bonus.plusMinus,
      };
    });
  }, [playersWithCRI, bonusStats]);

  const filteredPlayers = useMemo(() => {
    let result = playersWithRanks;

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
    
    // Health filter
    if (healthFilter === "healthy") {
      result = result.filter(p => !p.status || p.status === "healthy");
    } else if (healthFilter === "injured") {
      result = result.filter(p => p.status && p.status !== "healthy");
    }

    // Calculate custom CRI for Advanced view
    if (customCategories.length > 0) {
      const customScores = calculateCustomCRI(result, customCategories, !useCris);
      result = result.map((p, idx) => ({
        ...p,
        customCri: customScores[idx],
      }));
      
      // Assign custom CRI ranks
      const customSorted = [...result].sort((a, b) => (b.customCri || 0) - (a.customCri || 0));
      const customRanks = new Map<string, number>();
      customSorted.forEach((p, idx) => customRanks.set(p.id, idx + 1));
      result = result.map(p => ({
        ...p,
        customCriRank: customRanks.get(p.id) || 0,
      }));
    }

    // Determine actual sort key
    // When clicking CRI# or wCRI# columns directly, use exactly what was clicked
    // The toggle only affects which column is the "default" when using rankings view
    let activeSortKey = sortKey;
    
    const sorted = [...result].sort((a, b) => {
      let aVal = (a[activeSortKey as keyof FreeAgent] as number) || 0;
      let bVal = (b[activeSortKey as keyof FreeAgent] as number) || 0;
      
      // For turnovers, lower is better
      if (sortKey === 'turnovers') {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    
    return sorted;
  }, [playersWithRanks, search, positionFilter, scheduleFilter, healthFilter, sortKey, sortAsc, useCris, customCategories]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      // Default to descending (higher is better), except turnovers
      setSortAsc(key === 'turnovers');
    }
  };

  const SortHeader = ({ label, sortKeyProp, className }: { label: string; sortKeyProp: SortKey; className?: string }) => (
    <th 
      className={cn("p-2 font-display cursor-pointer hover:bg-muted/50 select-none whitespace-nowrap", className)}
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

  const toggleCompare = (player: FreeAgent) => {
    if (compareList.find(p => p.id === player.id)) {
      setCompareList(compareList.filter(p => p.id !== player.id));
    } else if (compareList.length < 4) {
      setCompareList([...compareList, player]);
    }
  };

  const handleReset = () => {
    setRawPlayers([]);
    setBonusStats(new Map());
    setRawData("");
    setDetectedStatWindow(null);
    if (onPlayersChange) onPlayersChange([]);
  };

  // Empty state - show paste input
  if (playersWithRanks.length === 0) {
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
  const rankKey = useCris ? 'criRank' : 'wCriRank';
  const scoreLabel = useCris ? 'CRI' : 'wCRI';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with View Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold">
            Free Agents ({filteredPlayers.length} players)
            {detectedStatWindow && (
              <Badge variant="outline" className="ml-2 text-xs font-normal">
                {detectedStatWindow}
              </Badge>
            )}
          </h2>
          <CrisExplanation />
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-secondary/30 rounded-lg p-1">
            <Button
              variant={viewMode === 'stats' ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode('stats')}
              className="h-8 px-3"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Stats
            </Button>
            <Button
              variant={viewMode === 'rankings' ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode('rankings')}
              className="h-8 px-3"
            >
              <Hash className="w-4 h-4 mr-1" />
              Rankings
            </Button>
            <Button
              variant={viewMode === 'advanced' ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode('advanced')}
              className="h-8 px-3"
            >
              <Sliders className="w-4 h-4 mr-1" />
              Advanced
            </Button>
          </div>
          {viewMode === 'rankings' && <CrisToggle useCris={useCris} onChange={setUseCris} />}
        </div>
      </div>

      {/* Advanced Stats Configuration Panel */}
      {viewMode === 'advanced' && (
        <Card className="gradient-card border-primary/30 p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm">Custom CRI Builder</h3>
              <div className="flex items-center gap-2">
                <CrisToggle useCris={useCris} onChange={setUseCris} />
              </div>
            </div>
            
            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY_PRESETS).map(([key, preset]) => (
                <Button
                  key={key}
                  variant={activePreset === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setActivePreset(key);
                    setCustomCategories(preset.categories);
                  }}
                  className={cn(
                    "h-7 text-xs",
                    key === 'stocks' && "border-orange-500/50 hover:bg-orange-500/10",
                    key === 'noPctTo' && "border-emerald-500/50 hover:bg-emerald-500/10"
                  )}
                >
                  {key === 'stocks' && <Shield className="w-3 h-3 mr-1" />}
                  {preset.name}
                </Button>
              ))}
            </div>
            
            {/* Category Toggles */}
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-3">
              {CATEGORIES.map(cat => {
                const isSelected = customCategories.includes(cat.key);
                return (
                  <label
                    key={cat.key}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                      isSelected 
                        ? "border-primary bg-primary/10" 
                        : "border-border bg-secondary/20 hover:bg-secondary/40"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        setActivePreset('custom');
                        if (checked) {
                          setCustomCategories([...customCategories, cat.key]);
                        } else {
                          setCustomCategories(customCategories.filter(c => c !== cat.key));
                        }
                      }}
                    />
                    <span className="text-xs font-medium">{cat.label}</span>
                  </label>
                );
              })}
            </div>
            
            <p className="text-xs text-muted-foreground">
              Selected: {customCategories.length} categories • 
              {activePreset !== 'custom' ? ` Using "${CATEGORY_PRESETS[activePreset as keyof typeof CATEGORY_PRESETS]?.name}" preset` : ' Custom selection'}
            </p>
          </div>
        </Card>
      )}

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
          <Select value={healthFilter} onValueChange={setHealthFilter}>
            <SelectTrigger className="w-full md:w-[140px]">
              <SelectValue placeholder="Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Players</SelectItem>
              <SelectItem value="healthy">Healthy Only</SelectItem>
              <SelectItem value="injured">Injured Only</SelectItem>
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
                    <p className="text-muted-foreground">{scoreLabel}#</p>
                    <p className="font-bold text-primary">#{player[rankKey]}</p>
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
                {viewMode === 'stats' && (
                  <>
                    {/* MIN first (bonus but useful) */}
                    <SortHeader label="MIN" sortKeyProp="minutes" />
                    {/* Core 9-cat stats */}
                    <SortHeader label="FG%" sortKeyProp="fgPct" className="border-l border-border" />
                    <SortHeader label="FT%" sortKeyProp="ftPct" />
                    <SortHeader label="3PM" sortKeyProp="threepm" />
                    <SortHeader label="REB" sortKeyProp="rebounds" />
                    <SortHeader label="AST" sortKeyProp="assists" />
                    <SortHeader label="STL" sortKeyProp="steals" />
                    <SortHeader label="BLK" sortKeyProp="blocks" />
                    <SortHeader label="TO" sortKeyProp="turnovers" />
                    <SortHeader label="PTS" sortKeyProp="points" />
                    {/* CRI/wCRI Rank columns */}
                    <SortHeader label="CRI#" sortKeyProp="cri" className="border-l-2 border-primary/50" />
                    <SortHeader label="wCRI#" sortKeyProp="wCri" />
                    {/* Bonus insight stats on right */}
                    <SortHeader label="PR15" sortKeyProp="pr15" className="border-l border-muted-foreground/30" />
                    <SortHeader label="%ROST" sortKeyProp="rosterPct" />
                    <SortHeader label="+/-" sortKeyProp="plusMinus" />
                  </>
                )}
                {viewMode === 'rankings' && (
                  <>
                    {/* Rankings view - show rank for each category, sortable */}
                    <SortHeader label="FG%" sortKeyProp="fgPct" />
                    <SortHeader label="FT%" sortKeyProp="ftPct" />
                    <SortHeader label="3PM" sortKeyProp="threepm" />
                    <SortHeader label="REB" sortKeyProp="rebounds" />
                    <SortHeader label="AST" sortKeyProp="assists" />
                    <SortHeader label="STL" sortKeyProp="steals" />
                    <SortHeader label="BLK" sortKeyProp="blocks" />
                    <SortHeader label="TO" sortKeyProp="turnovers" />
                    <SortHeader label="PTS" sortKeyProp="points" />
                    <SortHeader label={`${scoreLabel}#`} sortKeyProp={useCris ? "cri" : "wCri"} className="border-l-2 border-primary/50" />
                  </>
                )}
                {viewMode === 'advanced' && (
                  <>
                    {/* Advanced view - show only selected categories */}
                    {CATEGORIES.filter(cat => customCategories.includes(cat.key)).map(cat => (
                      <SortHeader key={cat.key} label={cat.label} sortKeyProp={cat.key as SortKey} />
                    ))}
                    <SortHeader label={`Custom ${scoreLabel}#`} sortKeyProp="customCri" className="border-l-2 border-primary/50" />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((player, idx) => (
                <tr 
                  key={player.id} 
                  className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelectedPlayer(player)}
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
                  {viewMode === 'stats' && (
                    <>
                      {/* MIN first */}
                      <td className="text-center p-2">{player.minutes.toFixed(1)}</td>
                      {/* Core 9-cat stats - raw values */}
                      <td className="text-center p-2 border-l border-border">{formatPct(player.fgPct)}</td>
                      <td className="text-center p-2">{formatPct(player.ftPct)}</td>
                      <td className="text-center p-2">{player.threepm.toFixed(1)}</td>
                      <td className="text-center p-2">{player.rebounds.toFixed(1)}</td>
                      <td className="text-center p-2">{player.assists.toFixed(1)}</td>
                      <td className="text-center p-2">{player.steals.toFixed(1)}</td>
                      <td className="text-center p-2">{player.blocks.toFixed(1)}</td>
                      <td className="text-center p-2">{player.turnovers.toFixed(1)}</td>
                      <td className="text-center p-2">{player.points.toFixed(1)}</td>
                      {/* CRI and wCRI - display RANKS not raw scores */}
                      <td className="text-center p-2 font-bold text-primary border-l-2 border-primary/50">
                        #{player.criRank}
                      </td>
                      <td className="text-center p-2 font-bold text-orange-400">
                        #{player.wCriRank}
                      </td>
                      {/* Bonus insight stats on right */}
                      <td className="text-center p-2 text-muted-foreground border-l border-muted-foreground/30">
                        {player.pr15 ? player.pr15.toFixed(2) : '—'}
                      </td>
                      <td className="text-center p-2 text-muted-foreground">
                        {player.rosterPct ? `${player.rosterPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="text-center p-2 text-muted-foreground">
                        {player.plusMinus !== 0 ? (player.plusMinus >= 0 ? '+' : '') + player.plusMinus.toFixed(1) : '—'}
                      </td>
                    </>
                  )}
                  {viewMode === 'rankings' && (
                    <>
                      {/* Rankings view - show category ranks with color coding */}
                      {CATEGORIES.map(cat => {
                        const isLowerBetter = cat.key === 'turnovers';
                        const sorted = [...filteredPlayers].sort((a, b) => {
                          const aVal = a[cat.key as keyof FreeAgent] as number;
                          const bVal = b[cat.key as keyof FreeAgent] as number;
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
                      {/* CRI/wCRI rank */}
                      <td className="text-center p-2 font-bold text-primary border-l-2 border-primary/50">
                        #{player[rankKey]}
                      </td>
                    </>
                  )}
                  {viewMode === 'advanced' && (
                    <>
                      {/* Advanced view - show only selected categories with ranks */}
                      {CATEGORIES.filter(cat => customCategories.includes(cat.key)).map(cat => {
                        const isLowerBetter = cat.key === 'turnovers';
                        const sorted = [...filteredPlayers].sort((a, b) => {
                          const aVal = a[cat.key as keyof FreeAgent] as number;
                          const bVal = b[cat.key as keyof FreeAgent] as number;
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
                      {/* Custom CRI rank */}
                      <td className="text-center p-2 font-bold text-primary border-l-2 border-primary/50">
                        #{player.customCriRank || '—'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedPlayer && (
        <FreeAgentImpactSheet
          player={selectedPlayer}
          open={!!selectedPlayer}
          onOpenChange={() => setSelectedPlayer(null)}
          currentRoster={currentRoster}
          allFreeAgents={rawPlayers}
        />
      )}
    </div>
  );
};
