import { useState, useMemo, useEffect, useCallback } from "react";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { FreeAgentImpactSheet } from "@/components/FreeAgentImpactSheet";
import { MatchupNeedsPanel } from "@/components/MatchupNeedsPanel";
import { MiniTradeAnalyzer } from "@/components/MiniTradeAnalyzer";
import { EnhancedSchedulePicker } from "@/components/EnhancedSchedulePicker";
import { StreamingPlanner } from "@/components/StreamingPlanner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, X, GitCompare, Upload, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, BarChart3, Hash, Sliders, Shield, Settings2, Trophy, Lightbulb, ChevronDown, ChevronRight, TableIcon, Scale, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { CrisToggle } from "@/components/CrisToggle";
import { CrisExplanation } from "@/components/CrisExplanation";
import { DynamicWeightsIndicator } from "@/components/DynamicWeightsPanel";
import { calculateCRISForAll, calculateCustomCRI, formatPct, CATEGORIES, CATEGORY_PRESETS } from "@/lib/crisUtils";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { validateParseInput, parseWithTimeout, createLoopGuard, MAX_INPUT_SIZE } from "@/lib/parseUtils";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { useNBAUpcomingSchedule } from "@/hooks/useNBAUpcomingSchedule";
import { useStreamingSchedule } from "@/hooks/useStreamingSchedule";
import { GamesRemainingBadge } from "@/components/GamesRemainingBadge";
import { CategorySpecialistTags } from "@/components/CategorySpecialistTags";
import { getMatchupWeekDates } from "@/lib/scheduleAwareProjection";

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

interface MatchupStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

interface MatchupData {
  myTeam: { name: string; stats: MatchupStats };
  opponent: { name: string; stats: MatchupStats };
}

interface FreeAgentsProps {
  persistedPlayers?: Player[];
  onPlayersChange?: (players: Player[]) => void;
  currentRoster?: Player[];
  leagueTeams?: LeagueTeam[];
  matchupData?: MatchupData | null;
  multiPageImportEnabled?: boolean;
  dynamicWeights?: Record<string, number>;
  isDynamicWeightsActive?: boolean;
  dynamicWeightsMode?: "matchup" | "standings";
}

// Known NBA team codes
const NBA_TEAMS = ['ATL', 'BOS', 'BKN', 'BRK', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'];

type SortKey = 'cri' | 'wCri' | 'customCri' | 'fgPct' | 'ftPct' | 'threepm' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'points' | 'minutes' | 'pr15' | 'rosterPct' | 'plusMinus';
type ViewMode = 'stats' | 'rankings' | 'advanced';

// Multi-paste import state
interface ImportProgress {
  totalPages: number | null; // null = unknown
  totalResults: number | null; // from "Showing X-Y of Z" when available
  importedPages: number;
  playerCount: number; // unique players
  availableCount: number; // FA + WA
  unknownCount: number; // missing availability marker
  paginationDetected: boolean;
}

export const FreeAgents = ({ persistedPlayers = [], onPlayersChange, currentRoster = [], leagueTeams = [], matchupData, multiPageImportEnabled = false, dynamicWeights, isDynamicWeightsActive = false, dynamicWeightsMode = "matchup" }: FreeAgentsProps) => {
  const [rawPlayers, setRawPlayers] = useState<ImportedFreeAgent[]>(persistedPlayers as ImportedFreeAgent[]);
  const [bonusStats, setBonusStats] = useState<Map<string, { pr15: number; rosterPct: number; plusMinus: number }>>(new Map());
  const [rawData, setRawData] = useState("");
  const [search, setSearch] = useState("");
  const [onlyAvailableFilter, setOnlyAvailableFilter] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [scheduleFilter, setScheduleFilter] = useState<string>("all");
  const [healthFilter, setHealthFilter] = useState<string>("all");
  const [statsFilter, setStatsFilter] = useState<"all" | "with-stats" | "missing-stats">("all");
  const [sortKey, setSortKey] = useState<SortKey>("cri");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<FreeAgent | null>(null);
  const [compareList, setCompareList] = useState<FreeAgent[]>([]);
  const [useCris, setUseCris] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('stats');
  const [customCategories, setCustomCategories] = useState<string[]>(CATEGORY_PRESETS.all.categories);
  const [activePreset, setActivePreset] = useState<string>('all');
  const [detectedStatWindow, setDetectedStatWindow] = useState<string | null>(null);
  const [customSuggestionCategories, setCustomSuggestionCategories] = useState<string[]>([]);
  const [showCustomSuggestions, setShowCustomSuggestions] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [bestPickupsOpen, setBestPickupsOpen] = useState(true);
  const [tableOnlyMode, setTableOnlyMode] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  
  // NBA Schedule hook for date-based filtering
  const {
    scheduleDates,
    isLoading: isScheduleLoading,
    isTeamPlayingOnDate,
    refresh: refreshSchedule,
    lastUpdated: scheduleLastUpdated,
    gamesByDate,
  } = useNBAUpcomingSchedule(7);
  
  // Get matchup week dates for badges
  const matchupWeekDates = useMemo(() => getMatchupWeekDates(), []);
  
  // Enhanced streaming schedule hook
  const {
    dateSelections,
    toggleDateSelection,
    clearSelections: clearScheduleSelections,
    includedDates,
    excludedDates,
    hasAnySelection: hasScheduleSelection,
    coverageGaps,
    fillCoverageGaps,
    recommendedCombos,
    applyCombo,
    matchesDateFilter,
  } = useStreamingSchedule({
    scheduleDates,
    roster: currentRoster,
    isTeamPlayingOnDate,
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  
  // Trade Analyzer state
  const [tradeAnalyzerMode, setTradeAnalyzerMode] = useState(false);
  const [tradeSelectedPlayers, setTradeSelectedPlayers] = useState<FreeAgent[]>([]);
  
  // Multi-paste import tracking
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [isMultiPasteMode, setIsMultiPasteMode] = useState(false);
  const multiPageEnabled = !!multiPageImportEnabled;
  
  // Trade Analyzer handlers
  const toggleTradeSelect = useCallback((player: FreeAgent) => {
    setTradeSelectedPlayers(prev => {
      const exists = prev.some(p => p.id === player.id);
      if (exists) {
        return prev.filter(p => p.id !== player.id);
      }
      return [...prev, player];
    });
  }, []);
  
  const removeFromTradeSelection = useCallback((playerId: string) => {
    setTradeSelectedPlayers(prev => prev.filter(p => p.id !== playerId));
  }, []);
  
  const clearTradeSelection = useCallback(() => {
    setTradeSelectedPlayers([]);
  }, []);

  useEffect(() => {
    if (!multiPageEnabled && isMultiPasteMode) {
      setIsMultiPasteMode(false);
      setImportProgress(null);
    }
  }, [multiPageEnabled, isMultiPasteMode]);

  const { toast } = useToast();

  const dismissTip = (tipId: string) => {
    setDismissedTips(prev => new Set([...prev, tipId]));
  };

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

  type Availability = "FA" | "WA" | "rostered" | "unknown";
  type OwnerStatus = "FA" | "ROSTERED";
  type ImportedFreeAgent = Player & { availability?: Availability; ownedBy?: string; ownerKey?: string; ownerStatus?: OwnerStatus };

  const normalizeKey = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  // Normalize owner type to ownerKey - maps FA/WA/empty/--/AVAILABLE to 'FA'
  const normalizeOwnerType = (type: string | undefined): { ownerKey: string; ownerStatus: OwnerStatus } => {
    if (!type) return { ownerKey: 'FA', ownerStatus: 'FA' };
    const normalized = type.trim().toUpperCase();
    if (['', '--', 'FA', 'WA', 'WAIVERS', 'AVAILABLE', 'FREE AGENT'].includes(normalized)) {
      return { ownerKey: 'FA', ownerStatus: 'FA' };
    }
    // It's a team key (rostered player)
    return { ownerKey: normalized, ownerStatus: 'ROSTERED' };
  };

  // Build team key lookup from league standings
  const leagueTeamKeys = useMemo(() => {
    const keys = new Map<string, { name: string; manager?: string }>();
    leagueTeams.forEach(team => {
      // Extract abbreviation from team name if available, or create one
      const name = team.name;
      const manager = team.manager;
      
      // Try to find abbreviation patterns in data (e.g., "(SAS)" or manager-based keys)
      // For now, use normalized team name as key and manager name as secondary
      const teamKey = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 6);
      keys.set(teamKey, { name, manager });
      
      // Also add manager-based key
      if (manager) {
        const managerKey = manager.split(' ')[0].toUpperCase().substring(0, 6);
        if (!keys.has(managerKey)) {
          keys.set(managerKey, { name, manager });
        }
      }
    });
    return keys;
  }, [leagueTeams]);

  // Get team name from owner key
  const getTeamNameFromOwnerKey = (ownerKey: string): string | null => {
    if (ownerKey === 'FA') return null;
    const team = leagueTeamKeys.get(ownerKey);
    return team?.name || null;
  };

  const makeFallbackId = (name: string, team: string, positions: string[]) =>
    `fa:${normalizeKey(name).replace(/\s/g, "_")}:${team.toLowerCase()}:${positions.join("-").toLowerCase()}`;

  const extractEspnIdsFromBlob = (blob: string): Map<string, string> => {
    const map = new Map<string, string>();
    // Use matchAll for safer iteration without unbounded while loop
    const matches = blob.matchAll(/player\/_\/id\/(\d+)\/([a-z0-9-]+)/gi);
    for (const m of matches) {
      const id = m[1];
      const slug = m[2].replace(/-/g, " ");
      const key = normalizeKey(slug);
      if (key && !map.has(key)) map.set(key, id);
    }
    return map;
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
   * Phase 1: Parse PLAYER LIST (names with duplicate pattern like "Bobby PortisBobby Portis")
   * Phase 2: Parse STATS TABLE (15 columns: MIN, FGM/FGA, FG%, FTM/FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-)
   * Phase 3: ZIP by index - player[i] gets stats[i]
   */
  const parseESPNFreeAgents = (data: string): { players: ImportedFreeAgent[]; bonus: Map<string, { pr15: number; rosterPct: number; plusMinus: number }>; debug: { playerCount: number; statsCount: number; matchedCount: number; playersMissingStats: string[]; isComplete: boolean } } => {
    // Validate input before processing
    validateParseInput(data);
    
    devLog('=== Starting ESPN Free Agents Parser ===');
    const lines = data.split('\n').map(l => l.trim()).filter(l => l);
    const loopGuard = createLoopGuard();
    const espnIdsByName = extractEspnIdsFromBlob(data);
    
    // ========== PHASE 1: Parse Player List (Bios) ==========
    interface PlayerInfo {
      name: string;
      team: string;
      positions: string[];
      availability?: Availability;
      ownedBy?: string;
      status?: string;
      opponent?: string;
      gameTime?: string;
    }
    
    const playerList: PlayerInfo[] = [];
    const seenNames = new Set<string>();
    
    // Helper to collapse duplicate name pattern: "Bobby PortisBobby Portis" -> "Bobby Portis"
    const collapseDuplicateName = (text: string): string | null => {
      const trimmed = text.trim();
      const len = trimmed.length;
      if (len < 6) return null; // Minimum realistic name length
      
      // Try splitting at different points near the middle (handles odd lengths, spacing variations)
      for (let offset = 0; offset <= 3; offset++) {
        for (const delta of [0, offset, -offset]) {
          const mid = Math.floor(len / 2) + delta;
          if (mid < 3 || mid > len - 3) continue;
          
          const first = trimmed.substring(0, mid).trim();
          const second = trimmed.substring(mid).trim();
          
          if (first === second && first.includes(' ') && /^[A-Z]/.test(first)) {
            return first;
          }
        }
      }
      return null;
    };
    
    for (let i = 0; i < lines.length; i++) {
      loopGuard.check();
      const line = lines[i];
      
      // Skip very short or very long lines
      if (line.length < 6 || line.length > 80) continue;
      
      let name = '';
      
      // Method 1: Check for doubled name pattern on same line ("Bobby PortisBobby Portis")
      const collapsedName = collapseDuplicateName(line);
      if (collapsedName) {
        name = collapsedName;
      }
      // Method 2: Check for consecutive identical lines (no photo pattern: "Caleb Love\nCaleb Love")
      else if (i + 1 < lines.length && line === lines[i + 1] && line.includes(' ') && /^[A-Z]/.test(line)) {
        name = line.trim();
        i++; // Skip the duplicate line
      }
      
      if (!name) continue;
      
      // Validate it looks like a name
      const isValidName = name.includes(' ') && /^[A-Z]/.test(name) && name.length >= 4;
      if (!isValidName) continue;
      
      // Skip navigation/header text
      if (/^(Fantasy|ESPN|Add|Drop|Trade|Watch|Support|Research|Basketball|Football|Hockey|Baseball|Player Name|Free Agents)/i.test(name)) continue;
      
      // Skip if we've already seen this player
      const nameLower = name.toLowerCase();
      if (seenNames.has(nameLower)) continue;
      seenNames.add(nameLower);
      
      let team = '';
      let positions: string[] = [];
      let status = '';
      let opponent = '';
      let gameTime = '';
      let availability: Availability | undefined;
      let ownedBy: string | undefined;
      
      // Look ahead for player metadata (up to 25 lines)
      for (let j = i + 1; j < Math.min(i + 25, lines.length); j++) {
        const nextLine = lines[j];
        
        // Check if next line is a doubled name (next player) - stop here
        if (collapseDuplicateName(nextLine)) break;
        
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
        
        // Availability marker (FA / WA / Rostered team abbreviation)
        if (!availability) {
          if (nextLine === 'FA') {
            availability = 'FA';
            continue;
          }
          if (nextLine.match(/^WA(\s|\(|$)/)) {
            availability = 'WA';
            continue;
          }
          // Check for rostered player: short team abbreviation (2-6 chars, uppercase or mixed)
          // This catches fantasy team abbreviations like "DEM", "Bilb", "DUMP", "SS", "SAS"
          // IMPORTANT: If we already have team+positions identified, an NBA team code here is a fantasy owner
          // (e.g., a fantasy team named "SAS" that happens to match an NBA code)
          if (/^[A-Za-z]{2,6}$/.test(nextLine)) {
            const isNbaTeamCode = NBA_TEAMS.includes(nextLine.toUpperCase());
            // Accept as fantasy owner if: (a) not NBA code, OR (b) we already have NBA team identified
            if (!isNbaTeamCode || (team && positions.length > 0)) {
              availability = 'rostered';
              ownedBy = nextLine;
              continue;
            }
          }
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
          if (oppMatch && availability) {
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
        
        // If we found availability and then opponent+time, we're done
        if (availability && opponent && gameTime) break;
        
        // Stop if we hit "--" (no game) after availability
        if (availability && nextLine === '--') break;
      }
      
      // Accept player even without metadata - use defaults
      if (!team) team = 'FA';
      if (positions.length === 0) positions = ['UTIL'];
      
      playerList.push({
        name,
        team,
        positions,
        availability: availability ?? 'unknown',
        ownedBy: ownedBy || undefined,
        status: status || undefined,
        opponent: opponent || undefined,
        gameTime: gameTime || undefined
      });
    }
    
    devLog(`Phase 1: Found ${playerList.length} players from bio section`);
    if (playerList.length > 0) {
      devLog('First 3 players:', playerList.slice(0, 3).map(p => `${p.name} (${p.team})`));
    }
    
    // ========== PHASE 2: Parse Stats Table ==========
    // Find the LAST occurrence of stats header (PR15 %ROST +/-)
    // Stats rows follow immediately after and have 15 fields each:
    // MIN, FGM/FGA, FG%, FTM/FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
    
    let statsHeaderIdx = -1;
    
    // Find the stats header row - look for "PR15" which is distinctive
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i] === 'PR15' || lines[i] === '+/-') {
        // Backtrack to find the start of header (MIN)
        for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
          if (lines[j] === 'MIN') {
            statsHeaderIdx = j;
            break;
          }
        }
        if (statsHeaderIdx > -1) break;
      }
    }
    
    // Alternative: look for "STATS" or "Research" marker
    if (statsHeaderIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/^STATS$/i.test(lines[i]) || /^Research$/i.test(lines[i])) {
          // Find MIN after this
          for (let j = i; j < Math.min(i + 20, lines.length); j++) {
            if (lines[j] === 'MIN') {
              statsHeaderIdx = j;
              break;
            }
          }
          if (statsHeaderIdx > -1) break;
        }
      }
    }
    
    devLog(`Stats header found at line ${statsHeaderIdx}`);
    
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
      pr15: number;
      rosterPct: number;
      plusMinus: number;
    }
    
    const statsList: StatRow[] = [];
    
    if (statsHeaderIdx > -1) {
      // Skip past column headers to find first data row
      let dataStartIdx = statsHeaderIdx + 1;
      while (dataStartIdx < lines.length && 
             /^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|MIN)$/i.test(lines[dataStartIdx])) {
        dataStartIdx++;
      }
      
      devLog(`Stats data starts at line ${dataStartIdx}`);
      
      // Collect all stat tokens
      const statTokens: string[] = [];
      
      for (let i = dataStartIdx; i < lines.length; i++) {
        const line = lines[i];
        
        // Stop at footer content
        if (/^(Username|Password|ESPN\.com|Copyright|©|Sign\s*(Up|In)|Log\s*In|Terms\s*of|Privacy|Fantasy Basketball Support)/i.test(line)) {
          devLog(`Stopping at footer line ${i}: "${line.substring(0, 30)}"`);
          break;
        }

        // Stop at pagination footer marker (we do NOT break on lone numeric tokens because those are valid stat cells)
        if (/^showing\s+\d+\s*-\s*\d+\s+of\s+\d+/i.test(line) && statTokens.length > 0) {
          devLog(`Stopping at pagination footer line ${i}: "${line}"`);
          break;
        }

        // Skip pagination pattern "1 2 3 4 5 ... 19" or just "1" (when it appears as a single line sequence)
        if (/^(\d+\s+)*\.{3}\s*\d+$/.test(line)) continue;
        
        // Skip non-data lines
        if (/^(Fantasy|Support|About|Help|Contact|Page|Showing|Results)$/i.test(line)) continue;
        
        // Handle fractions like "5.9/12.3" - keep as single token (we'll parse later)
        // Also handle standalone numbers, percentages, negatives, and missing-value placeholders
        const normalizedLine = (line === "—" || line === "–" || line === "-") ? "--" : line;

        if (/^\d+\.?\d*\/\d+\.?\d*$/.test(normalizedLine)) {
          statTokens.push(normalizedLine);
        } else if (/^\d+\.?\d*%$/.test(normalizedLine)) {
          statTokens.push(normalizedLine.replace(/%$/, ""));
        } else if (
          /^[-+]?\d+\.?\d*$/.test(normalizedLine) ||
          /^\.\d+$/.test(normalizedLine) ||
          normalizedLine === "--"
        ) {
          statTokens.push(normalizedLine);
        }
      }
      
      devLog(`Collected ${statTokens.length} stat tokens`);
      
      // Parse tokens into stat rows
      // Each row has 15 fields: MIN, FGM/FGA, FG%, FTM/FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
      const COLS = 15;
      const numStatRows = Math.floor(statTokens.length / COLS);
      
      for (let i = 0; i < numStatRows; i++) {
        const base = i * COLS;
        
        const parseVal = (idx: number): number => {
          const val = statTokens[base + idx];
          if (!val || val === '--') return 0;
          // Handle potential +/- at the end
          const cleaned = val.replace(/^\+/, '');
          return parseFloat(cleaned) || 0;
        };
        
        // Parse FGM/FGA fraction (e.g., "5.9/12.3")
        const parseFraction = (idx: number): { made: number; attempts: number } => {
          const val = statTokens[base + idx];
          if (!val || val === '--') return { made: 0, attempts: 0 };
          const parts = val.split('/');
          if (parts.length === 2) {
            return { made: parseFloat(parts[0]) || 0, attempts: parseFloat(parts[1]) || 0 };
          }
          return { made: 0, attempts: 0 };
        };
        
        // Column mapping:
        // 0: MIN, 1: FGM/FGA, 2: FG%, 3: FTM/FTA, 4: FT%
        // 5: 3PM, 6: REB, 7: AST, 8: STL, 9: BLK, 10: TO, 11: PTS
        // 12: PR15, 13: %ROST, 14: +/-
        
        // Parse FGM/FGA and FTM/FTA fractions
        const fg = parseFraction(1);
        const ft = parseFraction(3);
        
        // FG% is at index 2 - should be in .XXX format like .477
        let fgPct = parseVal(2);
        if (fgPct > 1) fgPct = fgPct / (fgPct >= 100 ? 1000 : 100);
        
        // FT% is at index 4
        let ftPct = parseVal(4);
        if (ftPct > 1) ftPct = ftPct / (ftPct >= 100 ? 1000 : 100);
        
        // Handle +/- which can be +0.8 or -0.5 or 0
        let plusMinus = 0;
        const pmToken = statTokens[base + 14];
        if (pmToken && pmToken !== '--') {
          plusMinus = parseFloat(pmToken) || 0;
        }
        
        statsList.push({
          min: parseVal(0),
          fgm: fg.made,
          fga: fg.attempts,
          fgPct,
          ftm: ft.made,
          fta: ft.attempts,
          ftPct,
          threepm: parseVal(5),
          reb: parseVal(6),
          ast: parseVal(7),
          stl: parseVal(8),
          blk: parseVal(9),
          to: parseVal(10),
          pts: parseVal(11),
          pr15: parseVal(12),
          rosterPct: parseVal(13),
          plusMinus,
        });
      }
    }
    
    devLog(`Phase 2: Built ${statsList.length} stat rows`);
    if (statsList.length > 0) {
      devLog('First player stats:', statsList[0]);
      devLog('Bobby Portis expected PR15=6.65, got:', statsList[0]?.pr15);
    }
    
    // ========== PHASE 3: Combine by Index ==========
    // Track players with/without stats for validation
    const hasAnyStats = statsList.length > 0;
    const missingStatRows = hasAnyStats ? Math.max(0, playerList.length - statsList.length) : playerList.length;

    if (hasAnyStats && missingStatRows > 0) {
      devWarn(`⚠️ Mismatch: ${playerList.length} players vs ${statsList.length} stat rows. Last ${missingStatRows} players will have no stats.`);
    }

    const emptyStats: StatRow = {
      min: 0,
      fgm: 0,
      fga: 0,
      fgPct: 0,
      ftm: 0,
      fta: 0,
      ftPct: 0,
      threepm: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      to: 0,
      pts: 0,
      pr15: 0,
      rosterPct: 0,
      plusMinus: 0,
    };

    const players: ImportedFreeAgent[] = [];
    const bonusMap = new Map<string, { pr15: number; rosterPct: number; plusMinus: number }>();
    const playersWithStats: string[] = [];
    const playersMissingStats: string[] = [];

    for (let i = 0; i < playerList.length; i++) {
      const p = playerList[i];
      const hasStats = i < statsList.length;
      const s = hasStats ? statsList[i] : emptyStats;

      const nameKey = normalizeKey(p.name);
      const espnId = espnIdsByName.get(nameKey);
      const id = espnId ? `espn:${espnId}` : makeFallbackId(p.name, p.team, p.positions);

      // Track stats presence
      if (hasStats && (s.min > 0 || s.pts > 0 || s.reb > 0 || s.ast > 0)) {
        playersWithStats.push(p.name);
      } else {
        playersMissingStats.push(p.name);
      }

      // Compute ownerKey and ownerStatus
      const { ownerKey, ownerStatus } = normalizeOwnerType(p.ownedBy || (p.availability === 'rostered' ? p.ownedBy : undefined));
      const finalOwnerKey = p.availability === 'FA' || p.availability === 'WA' ? 'FA' : ownerKey;
      const finalOwnerStatus = p.availability === 'FA' || p.availability === 'WA' ? 'FA' as OwnerStatus : ownerStatus;

      players.push({
        id,
        name: p.name,
        nbaTeam: p.team,
        positions: p.positions,
        availability: p.availability ?? "UNK",
        ownedBy: p.ownedBy,
        ownerKey: finalOwnerKey,
        ownerStatus: finalOwnerStatus,
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
        // Mark if stats are missing for UI badge
        _hasStats: hasStats && (s.min > 0 || s.pts > 0 || s.reb > 0 || s.ast > 0),
      } as ImportedFreeAgent & { _hasStats?: boolean });

      // Store bonus stats separately
      bonusMap.set(id, {
        pr15: s.pr15,
        rosterPct: s.rosterPct,
        plusMinus: s.plusMinus,
      });
    }

    devLog(`=== Parser Complete ===`);
    devLog(`Players parsed: ${playerList.length}, Stats rows: ${statsList.length}`);
    devLog(`With stats: ${playersWithStats.length}, Missing stats: ${playersMissingStats.length}`);
    if (playersMissingStats.length > 0) {
      devLog(`Players missing stats: ${playersMissingStats.join(', ')}`);
    }
    devLog(`Last 5 players: ${playerList.slice(-5).map(p => p.name).join(', ')}`);
    if (statsList.length > 0) {
      devLog(`Last 5 stat rows (pts): ${statsList.slice(-5).map(s => s.pts).join(', ')}`);
    }

    return {
      players,
      bonus: bonusMap,
      debug: {
        playerCount: playerList.length,
        statsCount: statsList.length,
        matchedCount: playersWithStats.length,
        playersMissingStats,
        isComplete: playersMissingStats.length === 0,
      },
    };
  };

  /**
   * Detect pagination in ESPN data
   * Returns: { detected: boolean, currentPage: number | null, totalPages: number | null }
   */
  const detectPagination = (data: string): { detected: boolean; currentPage: number | null; totalPages: number | null; totalResults: number | null } => {
    const lines = data.split('\n').map(l => l.trim());
    
    // Pattern 1: Look for page number sequence like "1 2 3 4 5 ... 19" or "« 1 2 3 ... 19 »"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match patterns like "1 2 3 4 5" or "1 2 3 ... 19"
      const pageSequence = line.match(/^(\d+)(\s+\d+)+(\s+\.{2,3}\s+\d+)?$/);
      if (pageSequence) {
        // Extract numbers
        const numbers = line.replace(/\.{2,3}/g, '').trim().split(/\s+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        if (numbers.length >= 2) {
          const currentPage = numbers[0]; // First number is usually current page
          const totalPages = Math.max(...numbers);
          return { detected: true, currentPage, totalPages, totalResults: null };
        }
      }
      
      // Pattern 2: Look for ellipsis pattern like "..." between numbers
      if (line === '...' || line === '…') {
        // Check surrounding lines for page numbers
        const prevNum = i > 0 ? parseInt(lines[i - 1], 10) : NaN;
        const nextNum = i < lines.length - 1 ? parseInt(lines[i + 1], 10) : NaN;
        if (!isNaN(prevNum) && !isNaN(nextNum) && nextNum > prevNum) {
          return { detected: true, currentPage: 1, totalPages: nextNum, totalResults: null };
        }
      }
      
      // Pattern 3: Look for "Page X of Y" or "Showing X-Y of Z"
      const showingMatch = line.match(/showing\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i);
      if (showingMatch) {
        const total = parseInt(showingMatch[3], 10);
        const perPage = parseInt(showingMatch[2], 10) - parseInt(showingMatch[1], 10) + 1;
        const totalPages = Math.ceil(total / perPage);
        const currentPage = Math.ceil(parseInt(showingMatch[1], 10) / perPage);
        return { detected: true, currentPage, totalPages, totalResults: total };
      }
    }
    
    // Pattern 4: Look for isolated small numbers that could be page navigation (1, 2, 3 on separate lines)
    let consecutiveNumbers: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const num = parseInt(lines[i], 10);
      if (!isNaN(num) && num >= 1 && num <= 50 && lines[i] === String(num)) {
        if (consecutiveNumbers.length === 0 || num === consecutiveNumbers[consecutiveNumbers.length - 1] + 1) {
          consecutiveNumbers.push(num);
        } else {
          consecutiveNumbers = [num];
        }
        if (consecutiveNumbers.length >= 3) {
          return { detected: true, currentPage: consecutiveNumbers[0], totalPages: null, totalResults: null };
        }
      } else {
        consecutiveNumbers = [];
      }
    }
    
    return { detected: false, currentPage: null, totalPages: null, totalResults: null };
  };

  /**
   * Merge new players with existing, deduping by player.id (stable)
   * IMPORTANT: Never overwrite good stats with null/empty stats
   */
  const mergePlayers = (
    existing: ImportedFreeAgent[],
    newPlayers: ImportedFreeAgent[]
  ): { merged: ImportedFreeAgent[]; newCount: number; dupCount: number } => {
    const byId = new Map<string, ImportedFreeAgent>();

    let newCount = 0;
    let dupCount = 0;

    // Helper to check if player has valid stats
    const hasValidStats = (p: ImportedFreeAgent): boolean => {
      return (p as any)._hasStats === true || p.minutes > 0 || p.points > 0 || p.rebounds > 0 || p.assists > 0;
    };

    // Add existing players first
    for (const p of existing) {
      const key = p.id || makeFallbackId(p.name, p.nbaTeam, p.positions);
      byId.set(key, p);
    }

    // Merge new players
    for (const p of newPlayers) {
      const key = p.id || makeFallbackId(p.name, p.nbaTeam, p.positions);
      const existingPlayer = byId.get(key);
      
      if (existingPlayer) {
        dupCount++;
        // Only update if new player has valid stats and existing doesn't
        // OR if new player has valid stats (prefer newer data when both have stats)
        const existingHasStats = hasValidStats(existingPlayer);
        const newHasStats = hasValidStats(p);
        
        if (newHasStats && !existingHasStats) {
          devLog(`[merge] Updating ${p.name} with new stats (existing had none)`);
          byId.set(key, p);
        } else if (!newHasStats && existingHasStats) {
          devWarn(`[merge] Keeping existing stats for ${p.name} (new import missing stats)`);
          // Keep existing - don't overwrite
        }
        // If both have stats or neither has stats, keep existing (first wins)
      } else {
        byId.set(key, p);
        newCount++;
      }
    }

    return { merged: Array.from(byId.values()), newCount, dupCount };
  };

  /**
   * Merge bonus stats maps (latest paste wins)
   */
  const mergeBonusStats = (
    existing: Map<string, { pr15: number; rosterPct: number; plusMinus: number }>,
    newBonus: Map<string, { pr15: number; rosterPct: number; plusMinus: number }>
  ): Map<string, { pr15: number; rosterPct: number; plusMinus: number }> => {
    const merged = new Map(existing);
    for (const [key, value] of newBonus) {
      merged.set(key, value);
    }
    return merged;
  };

  const [parseDebug, setParseDebug] = useState<{ playerCount: number; statsCount: number; matchedCount: number; playersMissingStats?: string[]; isComplete?: boolean } | null>(null);

  const handleParse = async () => {
    if (!rawData.trim()) {
      toast({
        title: "No data",
        description: "Please paste your ESPN Free Agents data first",
        variant: "destructive",
      });
      return;
    }
    
    // Validate input size
    if (rawData.length > MAX_INPUT_SIZE) {
      toast({
        title: "Input too large",
        description: `Data exceeds maximum size of ${MAX_INPUT_SIZE / 1024}KB. Please copy only the Free Agents section.`,
        variant: "destructive",
      });
      return;
    }
    
    setIsParsing(true);
    setParseDebug(null);
    
    try {
      // Detect stat window from pasted data
      const window = detectStatWindow(rawData);
      setDetectedStatWindow(window);
      
      // Check for pagination
      const pagination = detectPagination(rawData);
      
      // Parse with timeout protection
      const { players, bonus, debug } = await parseWithTimeout(() => parseESPNFreeAgents(rawData));
      
      setParseDebug(debug);

      const countAvail = (list: ImportedFreeAgent[]) => {
        const availableCount = list.filter(p => p.availability === 'FA' || p.availability === 'WA').length;
        const rosteredCount = list.filter(p => p.availability === 'rostered').length;
        const unknownCount = list.filter(p => p.availability === 'unknown' || !p.availability).length;
        return { availableCount, rosteredCount, unknownCount };
      };

      // Sanity: if ESPN says paginated but we didn't get ~50 rows, likely copy/virtualization issue
      if (pagination.detected && players.length > 0 && players.length < 40) {
        devWarn('[FA Import] Paste incomplete:', { parsedRows: players.length, pagination });
        toast({
          title: "Paste incomplete",
          description: `Parsed ${players.length} rows, but ESPN pages are usually 50. Scroll the list, then Ctrl+A and copy again.`,
          variant: "destructive",
        });
        return;
      }

      // Validate stats completeness
      const missingStatsCount = debug.playersMissingStats.length;
      if (!debug.isComplete) {
        devWarn('[FA Import] Stats incomplete:', {
          playersParsed: debug.playerCount,
          statsRowsParsed: debug.statsCount,
          playersWithStats: debug.matchedCount,
          playersMissingStats: debug.playersMissingStats,
        });
        
        toast({
          title: "Import incomplete",
          description: `${debug.playerCount} players found, but only ${debug.statsCount} stat rows. ${missingStatsCount} players have no stats. Scroll the ESPN stats table fully and copy again.`,
          variant: "destructive",
        });
        // Continue anyway but flag the issue - user can see which players are missing
      }

      const { availableCount: parsedAvailable, unknownCount: parsedUnknown } = countAvail(players);
      devLog('[FA Import] parsed', {
        parsedRows: players.length,
        parsedAvailable,
        parsedUnknown,
        withStats: debug.matchedCount,
        missingStats: missingStatsCount,
        first: players[0]?.name,
        last: players[players.length - 1]?.name,
        pagination,
      });
      
      if (players.length > 0) {
        if (isMultiPasteMode && rawPlayers.length > 0) {
          // Multi-paste mode: merge with existing
          const { merged, newCount, dupCount } = mergePlayers(rawPlayers, players);
          const mergedBonus = mergeBonusStats(bonusStats, bonus);

          const { availableCount: mergedAvailable, rosteredCount: mergedRostered, unknownCount: mergedUnknown } = countAvail(merged);

          setRawPlayers(merged);
          setBonusStats(mergedBonus);
          
          const pageNum = (importProgress?.importedPages || 0) + 1;
          setImportProgress(prev => ({
            totalPages: pagination.totalPages || prev?.totalPages || null,
            totalResults: pagination.totalResults || prev?.totalResults || null,
            importedPages: pageNum,
            playerCount: merged.length,
            availableCount: mergedAvailable,
            unknownCount: mergedUnknown,
            paginationDetected: pagination.detected || (prev?.paginationDetected ?? false)
          }));

          devLog('[FA Import] merge', {
            pageNum,
            parsedRows: players.length,
            addedUnique: newCount,
            duplicatesSkipped: dupCount,
            totalUnique: merged.length,
            availableCount: mergedAvailable,
            unknownCount: mergedUnknown,
            missingStats: missingStatsCount,
          });
          
          const statsSuffix = missingStatsCount > 0 ? ` (${missingStatsCount} missing stats)` : '';
          const availDesc = mergedAvailable > 0 
            ? `${mergedAvailable} available` 
            : mergedRostered > 0 
              ? `${mergedRostered} rostered` 
              : `${merged.length} players`;
          toast({
            title: `Page ${pageNum} imported`,
            description: `Added ${newCount} new (${dupCount} dupes). Total: ${merged.length} unique (${availDesc}).${statsSuffix}`,
          });
          
          // Clear textarea for next paste
          setRawData("");
        } else {
          // First paste or fresh import
          const { availableCount: firstAvailable, rosteredCount: firstRostered, unknownCount: firstUnknown } = countAvail(players);

          // Import regardless of availability - just proceed with analysis
          setRawPlayers(players);
          setBonusStats(bonus);
          
          // Check if pagination detected - optionally enter multi-paste mode (user-controlled via Settings)
          if (pagination.detected && multiPageEnabled) {
            setIsMultiPasteMode(true);
            setImportProgress({
              totalPages: pagination.totalPages,
              totalResults: pagination.totalResults,
              importedPages: 1,
              playerCount: players.length,
              availableCount: firstAvailable,
              unknownCount: firstUnknown,
              paginationDetected: true,
            });

            const statsSuffix = missingStatsCount > 0 ? ` (${missingStatsCount} missing stats)` : '';
            const availDesc = firstAvailable > 0 
              ? `${firstAvailable} available` 
              : firstRostered > 0 
                ? `${firstRostered} rostered — All Players list detected` 
                : `${players.length} players`;
            toast({
              title: "Page 1 imported",
              description: `Loaded ${players.length} players (${availDesc}). Paste page 2 to continue.${statsSuffix}`,
            });

            // Clear textarea for next paste
            setRawData("");
          } else {
            // No pagination OR multi-page disabled
            setIsMultiPasteMode(false);
            setImportProgress(null);

            const suffix = pagination.detected && !multiPageEnabled
              ? " (Pagination detected — enable Multi-page Free Agents Import in Settings to merge pages.)"
              : "";
            const statsSuffix = missingStatsCount > 0 ? ` ⚠️ ${missingStatsCount} players missing stats.` : '';
            
            // Build availability description
            let availDesc = '';
            if (firstAvailable > 0) {
              availDesc = `${firstAvailable} available`;
            } else if (firstRostered > 0) {
              availDesc = `0 available, ${firstRostered} rostered — this looks like an All Players list. We'll still analyze them.`;
            } else {
              availDesc = `${players.length} players`;
            }

            toast({
              title: debug.isComplete ? "Success!" : "Partial import",
              description: `Imported ${players.length} players. ${availDesc}${window ? ` (${window})` : ''}${suffix}${statsSuffix}`,
              variant: debug.isComplete ? "default" : "destructive",
            });
          }
        }
      } else {
        toast({
          title: "No players found",
          description: `Could not parse free agent data. Found ${debug.playerCount} players, ${debug.statsCount} stats rows. Make sure to copy the entire ESPN Free Agents page.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      devError('Parse error:', error);
      const errorMessage = error instanceof Error ? error.message : "Could not parse the data. Please check the format.";
      toast({
        title: "Parse error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Calculate CRI/wCRI for all players using only 9-cat stats
  // Use dynamic weights if available
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
    })), false, dynamicWeights);
  }, [rawPlayers, dynamicWeights]);

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

    // Only Available filter - show only FA/WA players
    if (onlyAvailableFilter) {
      result = result.filter(p => (p as any).availability === 'FA' || (p as any).availability === 'WA');
    }
    
    // Owner filter
    if (ownerFilter !== "all") {
      if (ownerFilter === "FA") {
        result = result.filter(p => (p as any).ownerKey === 'FA' || !(p as any).ownerKey);
      } else {
        result = result.filter(p => (p as any).ownerKey === ownerFilter);
      }
    }

    if (search) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.nbaTeam.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (positionFilter !== "all") {
      // Handle combo position filters
      if (positionFilter === "G") {
        result = result.filter(p => p.positions.includes("PG") || p.positions.includes("SG"));
      } else if (positionFilter === "F") {
        result = result.filter(p => p.positions.includes("SF") || p.positions.includes("PF"));
      } else if (positionFilter === "C/F") {
        result = result.filter(p => p.positions.includes("SF") || p.positions.includes("PF") || p.positions.includes("C"));
      } else {
        result = result.filter(p => p.positions.includes(positionFilter));
      }
    }

    // Schedule filter - use enhanced streaming schedule filter
    if (hasScheduleSelection) {
      result = result.filter(p => matchesDateFilter(p.nbaTeam));
    } else if (scheduleFilter === "playing") {
      // Fallback to ESPN-parsed opponent data
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

    // Stats filter (for debugging missing stats from import)
    if (statsFilter === "with-stats") {
      result = result.filter(p => (p as any)._hasStats === true || p.minutes > 0 || p.points > 0 || p.rebounds > 0);
    } else if (statsFilter === "missing-stats") {
      result = result.filter(p => (p as any)._hasStats === false || (p.minutes === 0 && p.points === 0 && p.rebounds === 0 && p.assists === 0));
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

    const activeSortKey = sortKey;
    
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
  }, [playersWithRanks, onlyAvailableFilter, ownerFilter, search, positionFilter, scheduleFilter, healthFilter, sortKey, sortAsc, useCris, customCategories, statsFilter, hasScheduleSelection, matchesDateFilter]);

  // Pagination computed values - show all players on one page when multi-page import is enabled
  const totalCount = filteredPlayers.length;
  const effectivePageSize = multiPageEnabled ? totalCount : pageSize;
  const totalPages = multiPageEnabled ? 1 : Math.ceil(totalCount / pageSize);
  const pagedPlayers = useMemo(() => {
    if (multiPageEnabled) {
      // Show all players on one page when multi-page import is enabled
      return filteredPlayers;
    }
    const start = (currentPage - 1) * pageSize;
    return filteredPlayers.slice(start, start + pageSize);
  }, [filteredPlayers, currentPage, pageSize, multiPageEnabled]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, onlyAvailableFilter, ownerFilter, positionFilter, scheduleFilter, healthFilter, statsFilter, sortKey, sortAsc, hasScheduleSelection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      // Default to descending (higher is better), except turnovers
      setSortAsc(key === 'turnovers');
    }
  };

  // Try to identify user's team from standings by matching roster player names or team name patterns
  const userTeamFromStandings = useMemo(() => {
    if (!leagueTeams.length) return null;
    
    // Look for "Mr. Bane" or similar known team names from roster context
    // For now, use the team with owner "Demitri Voyiatzis" as Mr. Bane
    // Or find teams that might match based on roster composition
    const mrBane = leagueTeams.find(t => 
      t.name.toLowerCase().includes('mr. bane') || 
      t.name.toLowerCase().includes('mr bane') ||
      t.manager?.toLowerCase().includes('demitri')
    );
    
    if (mrBane) return mrBane;
    
    // Default to finding the first team that seems to match (could be expanded)
    return leagueTeams[0] || null;
  }, [leagueTeams]);

  const bestPickupRecommendations = useMemo(() => {
    if (!filteredPlayers.length) {
      return {
        weakestCategories: [] as { key: string; label: string; rank: number }[],
        strongestCategories: [] as { key: string; label: string; rank: number }[],
        bestForWeak: [] as FreeAgent[],
        bestForStrong: [] as FreeAgent[],
        userTeamName: null as string | null,
        hasStandingsData: false,
      };
    }

    const cats = [
      { key: "fgPct", label: "FG%", isPct: true, lowerBetter: false },
      { key: "ftPct", label: "FT%", isPct: true, lowerBetter: false },
      { key: "threepm", label: "3PM", isPct: false, lowerBetter: false },
      { key: "rebounds", label: "REB", isPct: false, lowerBetter: false },
      { key: "assists", label: "AST", isPct: false, lowerBetter: false },
      { key: "steals", label: "STL", isPct: false, lowerBetter: false },
      { key: "blocks", label: "BLK", isPct: false, lowerBetter: false },
      { key: "turnovers", label: "TO", isPct: false, lowerBetter: true },
      { key: "points", label: "PTS", isPct: false, lowerBetter: false },
    ] as const;

    let weakest: { key: string; label: string; rank: number }[] = [];
    let strongest: { key: string; label: string; rank: number }[] = [];
    let userTeamName: string | null = null;
    let hasStandingsData = false;

    // If we have standings data, use category rankings from there
    if (userTeamFromStandings && leagueTeams.length > 1) {
      hasStandingsData = true;
      userTeamName = userTeamFromStandings.name;
      
      // Calculate rankings for each category based on all teams
      const categoryRankings: { key: string; label: string; rank: number; value: number }[] = cats.map(cat => {
        const teamStatKey = cat.key as keyof LeagueTeam;
        const userValue = userTeamFromStandings[teamStatKey] as number;
        
        // Rank teams for this category
        const sortedTeams = [...leagueTeams].sort((a, b) => {
          const aVal = a[teamStatKey] as number;
          const bVal = b[teamStatKey] as number;
          // TO is lower-better, all others higher-better
          return cat.lowerBetter ? aVal - bVal : bVal - aVal;
        });
        
        const rank = sortedTeams.findIndex(t => t.name === userTeamFromStandings.name) + 1;
        
        return { key: cat.key, label: cat.label, rank, value: userValue };
      });

      // Weakest = highest rank numbers (worst), strongest = lowest rank numbers (best)
      const sorted = [...categoryRankings].sort((a, b) => b.rank - a.rank);
      weakest = sorted.slice(0, 3).map(c => ({ key: c.key, label: c.label, rank: c.rank }));
      strongest = sorted.slice(-5).reverse().map(c => ({ key: c.key, label: c.label, rank: c.rank }));
    } else if (currentRoster.length) {
      // Fallback to roster-based calculation if no standings
      const activeRoster = currentRoster.filter(
        (p) => p.minutes > 0 && p.status !== "IR" && p.status !== "O"
      );
      const rosterCount = activeRoster.length || 1;

      const teamAvg: Record<string, number> = {};
      cats.forEach((cat) => {
        teamAvg[cat.key] =
          activeRoster.reduce((sum, p) => sum + ((p as any)[cat.key] as number || 0), 0) /
          rosterCount;
      });

      const faCount = filteredPlayers.length || 1;
      const faAvg: Record<string, number> = {};
      cats.forEach((cat) => {
        faAvg[cat.key] =
          filteredPlayers.reduce((sum, p) => sum + ((p as any)[cat.key] as number || 0), 0) /
          faCount;
      });

      const catScores = cats.map((cat) => {
        const teamVal = teamAvg[cat.key];
        const poolVal = faAvg[cat.key];
        const delta = cat.lowerBetter ? poolVal - teamVal : teamVal - poolVal;
        return { key: cat.key, label: cat.label, delta, rank: 0 };
      });

      weakest = [...catScores].sort((a, b) => a.delta - b.delta).slice(0, 3);
      strongest = [...catScores].sort((a, b) => b.delta - a.delta).slice(0, 5);
    }

    // Now score free agents based on how much they help in weak/strong categories
    const activeRoster = currentRoster.filter(
      (p) => p.minutes > 0 && p.status !== "IR" && p.status !== "O"
    );
    const rosterCount = activeRoster.length || 1;
    
    const teamAvg: Record<string, number> = {};
    cats.forEach((cat) => {
      teamAvg[cat.key] = rosterCount > 0 
        ? activeRoster.reduce((sum, p) => sum + ((p as any)[cat.key] as number || 0), 0) / rosterCount
        : 0;
    });

    type Scored = { player: FreeAgent; weakScore: number; strongScore: number };
    const scored: Scored[] = filteredPlayers
      .filter((p) => p.minutes > 0)
      .map((player) => {
        const newCount = rosterCount + 1;

        let weakScore = 0;
        let strongScore = 0;

        cats.forEach((cat) => {
          const current = teamAvg[cat.key];
          const playerVal = (player as any)[cat.key] as number;
          const projected = rosterCount > 0 ? (current * rosterCount + playerVal) / newCount : playerVal;

          const currentWeekly = cat.isPct ? current : current * 40;
          const projectedWeekly = cat.isPct ? projected : projected * 40;
          const weeklyDiff = projectedWeekly - currentWeekly;

          const improvement = cat.lowerBetter ? -weeklyDiff : weeklyDiff;

          if (weakest.some((w) => w.key === cat.key)) {
            weakScore += improvement;
          }

          if (strongest.some((s) => s.key === cat.key)) {
            strongScore += improvement;
          }
        });

        return { player, weakScore, strongScore };
      });

    const bestForWeak = scored
      .filter((s) => s.weakScore > 0)
      .sort((a, b) => b.weakScore - a.weakScore)
      .slice(0, 5)
      .map((s) => s.player);

    const bestForStrong = scored
      .sort((a, b) => b.strongScore - a.strongScore)
      .slice(0, 5)
      .map((s) => s.player);

    return {
      weakestCategories: weakest,
      strongestCategories: strongest,
      bestForWeak,
      bestForStrong,
      userTeamName,
      hasStandingsData,
    };
  }, [currentRoster, filteredPlayers, userTeamFromStandings, leagueTeams]);

  // Custom suggestions based on user-selected categories
  const customSuggestions = useMemo(() => {
    if (!customSuggestionCategories.length || !filteredPlayers.length) {
      return [] as FreeAgent[];
    }

    const cats = [
      { key: "fgPct", label: "FG%", isPct: true, lowerBetter: false },
      { key: "ftPct", label: "FT%", isPct: true, lowerBetter: false },
      { key: "threepm", label: "3PM", isPct: false, lowerBetter: false },
      { key: "rebounds", label: "REB", isPct: false, lowerBetter: false },
      { key: "assists", label: "AST", isPct: false, lowerBetter: false },
      { key: "steals", label: "STL", isPct: false, lowerBetter: false },
      { key: "blocks", label: "BLK", isPct: false, lowerBetter: false },
      { key: "turnovers", label: "TO", isPct: false, lowerBetter: true },
      { key: "points", label: "PTS", isPct: false, lowerBetter: false },
    ] as const;

    const activeRoster = currentRoster.filter(
      (p) => p.minutes > 0 && p.status !== "IR" && p.status !== "O"
    );
    const rosterCount = activeRoster.length || 1;
    
    const teamAvg: Record<string, number> = {};
    cats.forEach((cat) => {
      teamAvg[cat.key] = rosterCount > 0 
        ? activeRoster.reduce((sum, p) => sum + ((p as any)[cat.key] as number || 0), 0) / rosterCount
        : 0;
    });

    const scored = filteredPlayers
      .filter((p) => p.minutes > 0)
      .map((player) => {
        const newCount = rosterCount + 1;
        let score = 0;

        cats.forEach((cat) => {
          if (!customSuggestionCategories.includes(cat.key)) return;
          
          const current = teamAvg[cat.key];
          const playerVal = (player as any)[cat.key] as number;
          const projected = rosterCount > 0 ? (current * rosterCount + playerVal) / newCount : playerVal;

          const currentWeekly = cat.isPct ? current : current * 40;
          const projectedWeekly = cat.isPct ? projected : projected * 40;
          const weeklyDiff = projectedWeekly - currentWeekly;

          const improvement = cat.lowerBetter ? -weeklyDiff : weeklyDiff;
          score += improvement;
        });

        return { player, score };
      });

    // Sort by score descending and take top 5, even if scores are negative
    // (this handles cases where team average is high and any player would lower it)
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => s.player);
  }, [customSuggestionCategories, filteredPlayers, currentRoster]);

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
    setIsMultiPasteMode(false);
    setImportProgress(null);
    setStatsFilter("all");
    setParseDebug(null);
    if (onPlayersChange) onPlayersChange([]);
  };

  const handleFinishImport = () => {
    setIsMultiPasteMode(false);
    setImportProgress(null);
    setRawData("");
    toast({
      title: "Import complete",
      description: `Finished importing ${rawPlayers.length} free agents.`,
    });
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

        {/* Tips before data entry */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
            <Lightbulb className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> Import your roster in the <span className="text-primary font-medium">Roster</span> tab first to get personalized CRI/wCRI rankings that compare free agents against your team.
            </p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
            <Lightbulb className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> Import standings in the <span className="text-primary font-medium">Standings</span> tab to see category-based pickup recommendations for your weakest stats.
            </p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
            <Lightbulb className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> Import your matchup in the <span className="text-primary font-medium">Matchup</span> tab to unlock "Best Adds for This Matchup" recommendations.
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

        <Button onClick={handleParse} disabled={isParsing} className="w-full gradient-primary font-display font-bold">
          <Upload className="w-4 h-4 mr-2" />
          {isParsing ? "Parsing..." : "Load Free Agents"}
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
            Free Agents
            <span className="text-sm font-normal text-muted-foreground"> (showing {Math.min(currentPage * pageSize, totalCount) - (currentPage - 1) * pageSize} of {totalCount})</span>
            {detectedStatWindow && (
              <Badge variant="outline" className="ml-2 text-xs font-normal">
                {detectedStatWindow}
              </Badge>
            )}
          </h2>
          <CrisExplanation />
          {/* Multi-paste progress indicator */}
          {isMultiPasteMode && importProgress && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="default" className="bg-primary/20 text-primary border-primary/50">
                Multi-page import active
              </Badge>
              <span className="text-xs text-muted-foreground">
                Page {importProgress.importedPages}{importProgress.totalPages ? ` of ${importProgress.totalPages}` : ''} • {importProgress.playerCount}{importProgress.totalResults ? ` / ${importProgress.totalResults}` : ''} players • {importProgress.availableCount} available
              </span>
            </div>
          )}
          {/* Debug info - shows parsing results */}
          {parseDebug && !isMultiPasteMode && (
            <p className="text-xs text-muted-foreground mt-1">
              Parsed {parseDebug.playerCount} players, {parseDebug.statsCount} stats rows, matched {parseDebug.matchedCount}
            </p>
          )}
        </div>

      {/* Multi-paste mode - show paste input for next page */}
      {isMultiPasteMode && (
        <Card className="p-4 border-primary/50 bg-primary/5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              <span className="font-medium">Continue importing pages</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleFinishImport}>
                Finish Import
              </Button>
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-destructive">
                Start Over
              </Button>
            </div>
          </div>
          <Textarea
            placeholder={`Paste page ${(importProgress?.importedPages || 0) + 1} of ESPN Free Agents here...`}
            value={rawData}
            onChange={(e) => setRawData(e.target.value)}
            className="min-h-[120px] font-mono text-sm mb-3 bg-muted/50"
          />
          <Button onClick={handleParse} disabled={isParsing || !rawData.trim()} className="w-full gradient-primary font-display font-bold">
            <Upload className="w-4 h-4 mr-2" />
            {isParsing ? "Parsing..." : `Add Page ${(importProgress?.importedPages || 0) + 1}`}
          </Button>
        </Card>
      )}

      {/* Guidance Tips */}
      <div className="space-y-2">
        {/* Tip: Import Roster */}
        {currentRoster.length === 0 && !dismissedTips.has('roster') && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
            <Lightbulb className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> Import your roster in the <span className="text-primary font-medium">Roster</span> tab so we can compare free agents against your active players and generate better CRI/wCRI rankings.
            </p>
            <button onClick={() => dismissTip('roster')} className="p-1 hover:bg-muted rounded-md transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}
        
        {/* Tip: Import Standings */}
        {leagueTeams.length === 0 && !dismissedTips.has('standings') && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
            <Lightbulb className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> Import standings in the <span className="text-primary font-medium">Standings</span> tab so we can show your team's category rankings and highlight which categories to target on waivers.
            </p>
            <button onClick={() => dismissTip('standings')} className="p-1 hover:bg-muted rounded-md transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}
        
        {/* Tip: Import Matchup */}
        {!matchupData && !dismissedTips.has('matchup') && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30 text-sm">
            <Lightbulb className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> Import your matchup in the <span className="text-primary font-medium">Matchup</span> tab to unlock "Recommended Adds for This Matchup"—we'll highlight free agents that help swing toss-up categories.
            </p>
            <button onClick={() => dismissTip('matchup')} className="p-1 hover:bg-muted rounded-md transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
        <div className="flex items-center gap-3">
          {/* Trade Analyzer Toggle */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/30 border border-border">
            <Scale className="w-4 h-4 text-primary" />
            <Label htmlFor="trade-analyzer" className="text-xs font-medium cursor-pointer">Trade Analyzer</Label>
            <Switch
              id="trade-analyzer"
              checked={tradeAnalyzerMode}
              onCheckedChange={(checked) => {
                setTradeAnalyzerMode(checked);
                if (!checked) {
                  setTradeSelectedPlayers([]);
                }
              }}
            />
          </div>
          
          {/* View Mode Toggle - hidden in trade analyzer mode */}
          {!tradeAnalyzerMode && (
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
          )}
          {!tradeAnalyzerMode && viewMode === 'rankings' && (
            <div className="flex items-center gap-2">
              <CrisToggle useCris={useCris} onChange={setUseCris} />
              {!useCris && <DynamicWeightsIndicator isActive={isDynamicWeightsActive} mode={dynamicWeightsMode} />}
            </div>
          )}
        </div>
      </div>

      {/* Advanced Stats Configuration Panel - hidden in trade mode */}
      {viewMode === 'advanced' && !tradeAnalyzerMode && (
        <Card className="gradient-card border-primary/30 p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm">Custom CRI Builder</h3>
              <div className="flex items-center gap-2">
                <CrisToggle useCris={useCris} onChange={setUseCris} />
                {!useCris && <DynamicWeightsIndicator isActive={isDynamicWeightsActive} mode={dynamicWeightsMode} />}
              </div>
            </div>
            
            {/* Quick Actions + Presets */}
            <div className="flex flex-wrap gap-2">
              {/* Quick action buttons */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActivePreset('custom');
                  setCustomCategories([]);
                }}
                className="h-7 text-xs border-destructive/50 hover:bg-destructive/10 text-destructive"
              >
                <X className="w-3 h-3 mr-1" />
                Unselect All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActivePreset('all');
                  setCustomCategories(CATEGORY_PRESETS.all.categories);
                }}
                className="h-7 text-xs border-primary/50 hover:bg-primary/10"
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActivePreset('custom');
                  setCustomCategories(['points', 'rebounds', 'assists', 'steals', 'blocks']);
                }}
                className="h-7 text-xs border-amber-500/50 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                <Trophy className="w-3 h-3 mr-1" />
                Classic 5
              </Button>
              
              {/* Existing presets */}
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

      {/* Filters - simplified in trade analyzer mode */}
      <Card className="gradient-card border-border p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Only Available checkbox + Owner dropdown - hidden in trade mode */}
          {!tradeAnalyzerMode && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/30 border border-border h-10">
                <Checkbox
                  id="only-available"
                  checked={onlyAvailableFilter}
                  onCheckedChange={(checked) => setOnlyAvailableFilter(!!checked)}
                />
                <Label htmlFor="only-available" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                  Only Available
                </Label>
              </div>
              
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-full md:w-[150px]">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  <SelectItem value="FA">FA Only</SelectItem>
                  {/* Dynamic owner options from parsed data */}
                  {Array.from(new Set(rawPlayers.map(p => (p as any).ownerKey).filter((k: string) => k && k !== 'FA'))).map((ownerKey: string) => {
                    const teamName = getTeamNameFromOwnerKey(ownerKey);
                    return (
                      <SelectItem key={ownerKey} value={ownerKey}>
                        {teamName ? `${ownerKey} (${teamName})` : ownerKey}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </>
          )}

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
              <SelectItem value="G">G</SelectItem>
              <SelectItem value="F">F</SelectItem>
              <SelectItem value="C/F">C/F</SelectItem>
            </SelectContent>
          </Select>
          {/* Advanced filters - collapsed in trade mode */}
          {!tradeAnalyzerMode && (
            <>
              {/* Schedule Date Picker Toggle */}
              <Button
                variant={showSchedulePicker || hasScheduleSelection ? "default" : "outline"}
                size="sm"
                onClick={() => setShowSchedulePicker(!showSchedulePicker)}
                className="gap-1"
              >
                <Calendar className="w-4 h-4" />
                <span className="hidden md:inline">
                  {hasScheduleSelection 
                    ? `${includedDates.size + excludedDates.size} ${(includedDates.size + excludedDates.size) === 1 ? 'day' : 'days'}`
                    : 'Schedule'
                  }
                </span>
                {hasScheduleSelection && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs md:hidden">
                    {includedDates.size + excludedDates.size}
                  </Badge>
                )}
              </Button>
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
              <Select value={statsFilter} onValueChange={(v) => setStatsFilter(v as "all" | "with-stats" | "missing-stats")}>
                <SelectTrigger className="w-full md:w-[160px]">
                  <SelectValue placeholder="Stats" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stats</SelectItem>
                  <SelectItem value="with-stats">With Stats</SelectItem>
                  <SelectItem value="missing-stats">Missing Stats</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <Button variant="outline" size="icon" onClick={handleReset}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          {!tradeAnalyzerMode && (
            <Button 
              variant={tableOnlyMode ? "default" : "outline"} 
              size="sm"
              onClick={() => setTableOnlyMode(!tableOnlyMode)}
              className="gap-1"
            >
              <TableIcon className="w-4 h-4" />
              <span className="hidden md:inline">Table Only</span>
            </Button>
          )}
        </div>
      </Card>

      {/* Enhanced Schedule Picker with Streaming Planner */}
      {!tradeAnalyzerMode && showSchedulePicker && (
        <div className="space-y-3">
          <EnhancedSchedulePicker
            scheduleDates={scheduleDates}
            dateSelections={dateSelections}
            onToggleDate={toggleDateSelection}
            onClearAll={clearScheduleSelections}
            onRefresh={refreshSchedule}
            isLoading={isScheduleLoading}
            lastUpdated={scheduleLastUpdated}
            coverageGaps={coverageGaps}
            onFillGaps={fillCoverageGaps}
            recommendedCombos={recommendedCombos}
            onApplyCombo={applyCombo}
            includedCount={includedDates.size}
            excludedCount={excludedDates.size}
          />
          <StreamingPlanner
            freeAgents={filteredPlayers}
            scheduleDates={scheduleDates}
            includedDates={includedDates}
            excludedDates={excludedDates}
            isTeamPlayingOnDate={isTeamPlayingOnDate}
            onPlayerClick={(player) => {
              const fullPlayer = filteredPlayers.find(p => p.id === player.id);
              if (fullPlayer) setSelectedPlayer(fullPlayer);
            }}
            useCris={useCris}
          />
        </div>
      )}

      {/* Compare Panel - hidden in table only mode and trade mode */}
      {!tableOnlyMode && !tradeAnalyzerMode && compareList.length > 0 && (
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

      {/* Matchup-Based Research Panel - hidden in table only mode and trade mode */}
      {!tableOnlyMode && !tradeAnalyzerMode && matchupData && filteredPlayers.length > 0 && (
        <MatchupNeedsPanel
          matchupData={matchupData}
          freeAgents={filteredPlayers}
          useCris={useCris}
          onPlayerClick={(player) => setSelectedPlayer(player as FreeAgent)}
        />
      )}

      {/* Best Pickups Recommendations - hidden in table only mode and trade mode */}
      {!tableOnlyMode && !tradeAnalyzerMode && !bestPickupRecommendations.hasStandingsData && leagueTeams.length === 0 && (
        <Card className="gradient-card border-border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm">Best Pickup Recommendations</h3>
              <p className="text-xs text-muted-foreground">
                Upload your league standings in the <span className="text-primary font-medium">Standings</span> tab to get personalized pickup suggestions based on your team's category rankings.
              </p>
            </div>
          </div>
        </Card>
      )}

      {!tableOnlyMode && !tradeAnalyzerMode && (bestPickupRecommendations.bestForWeak.length > 0 || bestPickupRecommendations.hasStandingsData) && (
        <Collapsible open={bestPickupsOpen} onOpenChange={setBestPickupsOpen}>
          <Card className="gradient-card border-border p-4">
            <CollapsibleTrigger className="w-full">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                <div>
                  <div className="flex items-center gap-2">
                    {bestPickupsOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <h3 className="font-display font-bold text-sm">Best Pickups</h3>
                    {bestPickupRecommendations.userTeamName && (
                      <Badge variant="secondary" className="text-[10px]">
                        {bestPickupRecommendations.userTeamName}
                      </Badge>
                    )}
                    {bestPickupRecommendations.hasStandingsData && (
                      <Badge variant="outline" className="text-[10px] text-primary">
                        Based on League Standings
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-left">
                    {bestPickupRecommendations.hasStandingsData 
                      ? `Weakest: ${bestPickupRecommendations.weakestCategories.map(c => `${c.label} (#${c.rank})`).join(", ")}. Strongest: ${bestPickupRecommendations.strongestCategories.slice(0, 3).map(c => `${c.label} (#${c.rank})`).join(", ")}.`
                      : `Based on roster averages. Weakest: ${bestPickupRecommendations.weakestCategories.map(c => c.label).join(", ")}.`
                    }
                  </p>
                </div>
              </div>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <div className="flex justify-end mt-3 mb-3">
                <Button
                  variant={showCustomSuggestions ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCustomSuggestions(!showCustomSuggestions);
                  }}
                  className="text-xs"
                >
                  <Settings2 className="w-3 h-3 mr-1" />
                  Custom
                </Button>
              </div>
          {showCustomSuggestions && (
            <div className="mb-4 p-3 bg-secondary/20 rounded-lg border border-border">
              <p className="text-xs font-semibold mb-2">Select categories for custom suggestions:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "fgPct", label: "FG%" },
                  { key: "ftPct", label: "FT%" },
                  { key: "threepm", label: "3PM" },
                  { key: "rebounds", label: "REB" },
                  { key: "assists", label: "AST" },
                  { key: "steals", label: "STL" },
                  { key: "blocks", label: "BLK" },
                  { key: "turnovers", label: "TO" },
                  { key: "points", label: "PTS" },
                ].map(cat => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (customSuggestionCategories.includes(cat.key)) {
                        setCustomSuggestionCategories(customSuggestionCategories.filter(c => c !== cat.key));
                      } else {
                        setCustomSuggestionCategories([...customSuggestionCategories, cat.key]);
                      }
                    }}
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium transition-colors",
                      customSuggestionCategories.includes(cat.key)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {customSuggestions.length > 0 && (
                <div className="mt-3">
                  <h4 className="font-display font-semibold text-xs text-accent mb-2">
                    Best for: {customSuggestionCategories.map(k => {
                      const cat = [
                        { key: "fgPct", label: "FG%" },
                        { key: "ftPct", label: "FT%" },
                        { key: "threepm", label: "3PM" },
                        { key: "rebounds", label: "REB" },
                        { key: "assists", label: "AST" },
                        { key: "steals", label: "STL" },
                        { key: "blocks", label: "BLK" },
                        { key: "turnovers", label: "TO" },
                        { key: "points", label: "PTS" },
                      ].find(c => c.key === k);
                      return cat?.label || k;
                    }).join(", ")}
                  </h4>
                  <div className="space-y-1">
                    {customSuggestions.map((p, index) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full flex items-center justify-between text-left text-xs px-2 py-1.5 rounded-md hover:bg-accent/10 border border-transparent hover:border-accent/30 transition-colors"
                        onClick={() => setSelectedPlayer(p)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-accent font-bold">#{index + 1}</span>
                          <span className="font-semibold">{p.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{p.positions.join("/")}</Badge>
                          <span className="text-muted-foreground text-[10px]">{p.nbaTeam}</span>
                        </div>
                        <span className="text-muted-foreground text-[10px]">
                          CRI# {p.criRank}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-display font-semibold text-xs text-stat-negative mb-2">
                Help Your Weakest Categories
                <span className="ml-2 font-normal text-muted-foreground">
                  ({bestPickupRecommendations.weakestCategories.map(c => 
                    bestPickupRecommendations.hasStandingsData ? `${c.label} #${c.rank}` : c.label
                  ).join(", ")})
                </span>
              </h4>
              <div className="space-y-1">
                {bestPickupRecommendations.bestForWeak.length > 0 ? (
                  bestPickupRecommendations.bestForWeak.map((p, index) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full flex items-center justify-between text-left text-xs px-2 py-1.5 rounded-md hover:bg-stat-positive/10 border border-transparent hover:border-stat-positive/30 transition-colors"
                      onClick={() => setSelectedPlayer(p)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-stat-positive font-bold">#{index + 1}</span>
                        <span className="font-semibold">{p.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{p.positions.join("/")}</Badge>
                        <span className="text-muted-foreground text-[10px]">{p.nbaTeam}</span>
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        CRI# {p.criRank}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground italic">No recommendations available. Import roster data first.</p>
                )}
              </div>
            </div>
            <div>
              <h4 className="font-display font-semibold text-xs text-stat-positive mb-2">
                Supercharge Your Strengths
                <span className="ml-2 font-normal text-muted-foreground">
                  ({bestPickupRecommendations.strongestCategories.slice(0, 3).map(c => 
                    bestPickupRecommendations.hasStandingsData ? `${c.label} #${c.rank}` : c.label
                  ).join(", ")})
                </span>
              </h4>
              <div className="space-y-1">
                {bestPickupRecommendations.bestForStrong.length > 0 ? (
                  bestPickupRecommendations.bestForStrong.map((p, index) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full flex items-center justify-between text-left text-xs px-2 py-1.5 rounded-md hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-colors"
                      onClick={() => setSelectedPlayer(p)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-primary font-bold">#{index + 1}</span>
                        <span className="font-semibold">{p.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{p.positions.join("/")}</Badge>
                        <span className="text-muted-foreground text-[10px]">{p.nbaTeam}</span>
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        CRI# {p.criRank}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground italic">No recommendations available. Import roster data first.</p>
                )}
              </div>
            </div>
          </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Mini Trade Analyzer */}
      {tradeAnalyzerMode && (
        <MiniTradeAnalyzer
          selectedPlayers={tradeSelectedPlayers}
          onRemoveFromSelection={removeFromTradeSelection}
          onClearSelection={clearTradeSelection}
          leagueTeams={leagueTeams}
          currentRoster={currentRoster}
        />
      )}

       {/* Stats Table */}
      <Card className="gradient-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/20">
                {tradeAnalyzerMode && (
                  <th className="text-center p-2 w-10">
                    <Checkbox
                      checked={tradeSelectedPlayers.length > 0 && tradeSelectedPlayers.length === pagedPlayers.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTradeSelectedPlayers(pagedPlayers);
                        } else {
                          setTradeSelectedPlayers([]);
                        }
                      }}
                    />
                  </th>
                )}
                <th className="text-left p-3 font-display">#</th>
                <th className="text-left p-3 font-display min-w-[180px]">Player</th>
                <th className="text-center p-2 font-display">Owner</th>
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
              {pagedPlayers.map((player, idx) => {
                const isSelected = tradeSelectedPlayers.some(p => p.id === player.id);
                const displayIndex = (currentPage - 1) * pageSize + idx + 1;
                return (
                <tr 
                  key={player.id} 
                  className={cn(
                    "border-b border-border/50 hover:bg-muted/30 cursor-pointer",
                    tradeAnalyzerMode && isSelected && "bg-primary/10"
                  )}
                  onClick={() => {
                    if (tradeAnalyzerMode) {
                      toggleTradeSelect(player);
                    } else {
                      setSelectedPlayer(player);
                    }
                  }}
                >
                  {tradeAnalyzerMode && (
                    <td className="text-center p-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleTradeSelect(player)}
                      />
                    </td>
                  )}
                  <td className="p-2 font-bold text-primary">{displayIndex}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <PlayerPhoto name={player.name} size="sm" />
                      <NBATeamLogo teamCode={player.nbaTeam} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">
                          {player.name}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                          <span>{player.nbaTeam} • {player.positions.join("/")}</span>
                          {player.status && player.status !== 'healthy' && (
                            <Badge variant="destructive" className="text-xs">{player.status}</Badge>
                          )}
                          {((player as any)._hasStats === false || (player.minutes === 0 && player.points === 0 && player.rebounds === 0 && player.assists === 0)) && (
                            <Badge variant="outline" className="text-xs border-warning text-warning">No stats</Badge>
                          )}
                          <GamesRemainingBadge 
                            teamCode={player.nbaTeam} 
                            weekDates={matchupWeekDates} 
                            gamesByDate={gamesByDate}
                            compact
                          />
                        </div>
                        {player.minutes > 0 && (
                          <CategorySpecialistTags 
                            stats={{
                              points: player.points,
                              threepm: player.threepm,
                              rebounds: player.rebounds,
                              assists: player.assists,
                              steals: player.steals,
                              blocks: player.blocks,
                              turnovers: player.turnovers,
                              fgPct: player.fgPct,
                              ftPct: player.ftPct,
                              positions: player.positions,
                            }}
                            className="mt-0.5"
                          />
                        )}
                      </div>
                    </div>
                  </td>
                  {/* Owner column */}
                  <td className="text-center p-2">
                    {(player as any).ownerKey === 'FA' ? (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 border-green-500/30">FA</Badge>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 text-amber-400 border-amber-500/30">
                          {(player as any).ownerKey}
                        </Badge>
                        {getTeamNameFromOwnerKey((player as any).ownerKey) && (
                          <span className="text-[8px] text-muted-foreground mt-0.5 max-w-[80px] truncate">
                            {getTeamNameFromOwnerKey((player as any).ownerKey)}
                          </span>
                        )}
                      </div>
                    )}
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
                        {player.pr15 !== undefined && player.pr15 !== null ? player.pr15.toFixed(2) : '—'}
                      </td>
                      <td className="text-center p-2 text-muted-foreground">
                        {player.rosterPct !== undefined && player.rosterPct !== null ? `${player.rosterPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="text-center p-2 text-muted-foreground">
                        {player.plusMinus !== undefined && player.plusMinus !== null ? (player.plusMinus >= 0 ? '+' : '') + player.plusMinus.toFixed(1) : '—'}
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
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
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
