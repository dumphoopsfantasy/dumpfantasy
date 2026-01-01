import { useState, useMemo, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Trophy, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Target, Calendar, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LeagueTeam } from "@/types/league";
import { cn } from "@/lib/utils";
import { CrisToggle } from "@/components/CrisToggle";
import { CrisExplanation } from "@/components/CrisExplanation";
import { DynamicWeightsIndicator } from "@/components/DynamicWeightsPanel";
import { calculateCRISForAll, formatPct, CATEGORIES } from "@/lib/crisUtils";
import { ScheduleForecast } from "@/components/ScheduleForecast";
import { STANDINGS_RESET_KEYS } from "@/lib/standingsResetUtils";
// Playoff Contenders Profile Component
const PlayoffContendersProfile = ({ teams }: { teams: TeamWithCris[] }) => {
  if (teams.length < 6) return null;

  // Get top 6 teams by original rank (standings order)
  const playoffTeams = [...teams].sort((a, b) => a.originalRank - b.originalRank).slice(0, 6);

  // For each team, find their top 3 categories (by rank)
  const getTeamStrengths = (team: TeamWithCris) => {
    const categoryRanks = CATEGORIES.map(c => {
      const isLowerBetter = c.key === 'turnovers';
      const sorted = [...teams].sort((a, b) => {
        const aVal = a[c.key as keyof TeamWithCris] as number;
        const bVal = b[c.key as keyof TeamWithCris] as number;
        return isLowerBetter ? aVal - bVal : bVal - aVal;
      });
      const rank = sorted.findIndex(t => t.name === team.name) + 1;
      return { ...c, rank, value: team[c.key as keyof TeamWithCris] as number };
    });

    // Sort by rank (best first) and take top 3
    const strengths = categoryRanks.sort((a, b) => a.rank - b.rank).slice(0, 3);
    // Also get weaknesses (worst 2)
    const weaknesses = categoryRanks.sort((a, b) => b.rank - a.rank).slice(0, 2);

    return { strengths, weaknesses };
  };

  const isUserTeam = (name: string) => name.toLowerCase().includes('bane');

  return (
    <Card className="gradient-card shadow-card p-4 border-border">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg">Playoff Contenders Category Profile</h3>
        <span className="text-xs text-muted-foreground">(Top 6)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {playoffTeams.map((team, idx) => {
          const { strengths, weaknesses } = getTeamStrengths(team);
          const isUser = isUserTeam(team.name);

          return (
            <div 
              key={team.name} 
              className={cn(
                "p-3 rounded-lg border",
                isUser 
                  ? "bg-primary/10 border-primary/30" 
                  : "bg-muted/30 border-border/50"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-muted-foreground">#{team.originalRank}</span>
                <span className={cn("font-semibold text-sm truncate", isUser && "text-primary")}>
                  {team.name}
                </span>
                {isUser && <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">You</span>}
              </div>

              {/* Strengths */}
              <div className="mb-2">
                <div className="text-xs text-muted-foreground mb-1">Strong in:</div>
                <div className="flex flex-wrap gap-1">
                  {strengths.map(s => (
                    <span 
                      key={s.key} 
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded font-medium",
                        s.rank <= 2 ? "bg-stat-positive/20 text-stat-positive" : "bg-stat-positive/10 text-stat-positive/80"
                      )}
                    >
                      {s.label} <span className="opacity-70">#{s.rank}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Weaknesses */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Weak in:</div>
                <div className="flex flex-wrap gap-1">
                  {weaknesses.map(w => (
                    <span 
                      key={w.key} 
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded font-medium",
                        w.rank >= teams.length - 1 ? "bg-stat-negative/20 text-stat-negative" : "bg-stat-negative/10 text-stat-negative/80"
                      )}
                    >
                      {w.label} <span className="opacity-70">#{w.rank}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top-6 Category CRI Cumulation */}
      {(() => {
        const N = teams.length;
        
        // ESPN category order: FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS
        const espnOrderCategories = CATEGORIES;
        
        // Compute cumulation data for each category
        const cumulationData = espnOrderCategories.map(c => {
          const top6Ranks = playoffTeams.map(team => {
            const isLowerBetter = c.key === 'turnovers';
            const sorted = [...teams].sort((a, b) => {
              const aVal = a[c.key as keyof TeamWithCris] as number;
              const bVal = b[c.key as keyof TeamWithCris] as number;
              return isLowerBetter ? aVal - bVal : bVal - aVal;
            });
            return sorted.findIndex(t => t.name === team.name) + 1;
          });
          
          // Convert ranks to CRI points: rank #1 = N points, rank #N = 1 point
          // For all categories (including TO), higher rank = better = more points
          const cumulationPoints = top6Ranks.reduce((sum, rank) => sum + (N + 1 - rank), 0);
          const avgRank = top6Ranks.reduce((a, b) => a + b, 0) / 6;
          
          // Pressure label: Max = 6*N, Min = 6*1
          // High: cumulation >= 70% of max, Med: 50-70%, Low: <50%
          const maxCumulation = 6 * N;
          const pressureThresholdHigh = maxCumulation * 0.7; // 42 for N=10
          const pressureThresholdMed = maxCumulation * 0.5;  // 30 for N=10
          
          let pressure: 'High' | 'Med' | 'Low';
          if (cumulationPoints >= pressureThresholdHigh) pressure = 'High';
          else if (cumulationPoints >= pressureThresholdMed) pressure = 'Med';
          else pressure = 'Low';
          
          return {
            key: c.key,
            label: c.label,
            cumulation: cumulationPoints,
            avgRank: avgRank,
            pressure
          };
        });
        
        // Sort by cumulation descending for display
        const sortedCumulation = [...cumulationData].sort((a, b) => b.cumulation - a.cumulation);
        
        // Meta summary
        const mostContested = sortedCumulation.slice(0, 3).map(c => c.label);
        const leastContested = sortedCumulation.slice(-3).reverse().map(c => c.label);
        
        const getPressureColor = (pressure: 'High' | 'Med' | 'Low') => {
          if (pressure === 'High') return 'bg-stat-negative/20 text-stat-negative';
          if (pressure === 'Med') return 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400';
          return 'bg-stat-positive/20 text-stat-positive';
        };
        
        return (
          <div className="mt-4 space-y-3">
            {/* Meta Summary */}
            <div className="p-3 bg-muted/20 rounded-lg text-sm">
              <span className="font-semibold">League Meta:</span>{" "}
              <span className="text-muted-foreground">
                Most contested among playoff teams: <span className="text-foreground font-medium">{mostContested.join(", ")}</span>.
                {" "}Least contested: <span className="text-foreground font-medium">{leastContested.join(", ")}</span>.
              </span>
            </div>
            
            {/* Top-6 Category CRI Cumulation Table */}
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <div className="bg-muted/30 px-3 py-2 border-b border-border/50">
                <h4 className="font-display font-semibold text-sm">Top-6 Category CRI Cumulation</h4>
                <p className="text-xs text-muted-foreground">How strong are playoff teams in each category? (Higher = more stacked)</p>
              </div>
              
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-accent/10">
                    <th className="text-left p-2 font-display">Category</th>
                    <th className="text-center p-2 font-display">Top-6 CRI</th>
                    <th className="text-center p-2 font-display">Avg Rank</th>
                    <th className="text-center p-2 font-display">Pressure</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCumulation.map((cat, idx) => (
                    <tr key={cat.key} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="p-2 font-medium">
                        <span className="text-muted-foreground mr-2">#{idx + 1}</span>
                        {cat.label}
                      </td>
                      <td className="text-center p-2 font-bold text-primary">{cat.cumulation}</td>
                      <td className="text-center p-2 text-muted-foreground">{cat.avgRank.toFixed(1)}</td>
                      <td className="text-center p-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-semibold",
                          getPressureColor(cat.pressure)
                        )}>
                          {cat.pressure}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Category Stack Ranking (compact) */}
            <div className="p-3 bg-muted/10 rounded-lg">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Category Stack Ranking</div>
              <div className="flex flex-wrap gap-2">
                {sortedCumulation.map((cat, idx) => (
                  <span 
                    key={cat.key}
                    className={cn(
                      "text-xs px-2 py-1 rounded-full border",
                      idx < 3 
                        ? "bg-stat-negative/10 border-stat-negative/30 text-stat-negative" 
                        : idx >= sortedCumulation.length - 3
                          ? "bg-stat-positive/10 border-stat-positive/30 text-stat-positive"
                          : "bg-muted/30 border-border text-muted-foreground"
                    )}
                  >
                    #{idx + 1} {cat.label} ({cat.cumulation})
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </Card>
  );
};

interface TeamWithCris extends LeagueTeam {
  cri: number;
  wCri: number;
  originalRank: number;
}

type SortKey = 'originalRank' | 'cri' | 'wCri' | 'fgPct' | 'ftPct' | 'threepm' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'points' | 'record';

interface LeagueStandingsProps {
  persistedTeams?: LeagueTeam[];
  onTeamsChange?: (teams: LeagueTeam[]) => void;
  onUpdateStandingsContext?: (
    userCategoryAvgs: Record<string, number>,
    leagueCategoryAvgs: Record<string, number>,
    categoryRanks: Record<string, { rank: number; total: number; gap: number }>
  ) => void;
  dynamicWeights?: Record<string, number>;
  isDynamicWeightsActive?: boolean;
  dynamicWeightsMode?: "matchup" | "standings";
}

export const LeagueStandings = ({ persistedTeams = [], onTeamsChange, onUpdateStandingsContext, dynamicWeights, isDynamicWeightsActive = false, dynamicWeightsMode = "matchup" }: LeagueStandingsProps) => {
  const [rawData, setRawData] = useState("");
  const [rawTeams, setRawTeams] = useState<LeagueTeam[]>(persistedTeams);
  const [useCris, setUseCris] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('originalRank');
  const [sortAsc, setSortAsc] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [hasResetTriggered, setHasResetTriggered] = useState(false); // Prevents re-sync after reset
  const [activeTab, setActiveTab] = useState("standings"); // MUST be before any early returns
  const { toast } = useToast();

  // Sync with persisted data (but not after a reset action)
  useEffect(() => {
    if (hasResetTriggered) return; // Skip sync if user just reset
    if (persistedTeams.length > 0 && rawTeams.length === 0) {
      setRawTeams(persistedTeams);
    }
  }, [persistedTeams, hasResetTriggered]);

  // Notify parent of changes
  useEffect(() => {
    if (onTeamsChange && rawTeams.length > 0) {
      onTeamsChange(rawTeams);
    }
  }, [rawTeams, onTeamsChange]);

  const parseLeagueData = (data: string): LeagueTeam[] => {
    const lines = data.trim().split("\n").map((l) => l.trim()).filter((l) => l);
    const result: LeagueTeam[] = [];

    // Core parsed pieces
    const statValues: number[] = [];
    const teamEntries: { name: string; manager: string }[] = [];

    let inTeamSection = false;
    let inStatsSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip footers
      if (
        line.toLowerCase().includes("fantasy basketball support") ||
        line.toLowerCase().includes("copyright")
      )
        break;

      // Detect sections for Season Stats block
      if (line.toLowerCase() === "season stats") {
        inTeamSection = true;
        continue;
      }
      if (line.toLowerCase() === "all") {
        inTeamSection = false;
        inStatsSection = true;
        continue;
      }

      // Parse team entries (between "Season Stats" and "All")
      if (inTeamSection) {
        // Skip rank numbers
        if (line.match(/^\d+$/) && parseInt(line) <= 20) continue;

        // Manager in parentheses
        if (line.startsWith("(") && line.endsWith(")")) {
          if (teamEntries.length > 0 && !teamEntries[teamEntries.length - 1].manager) {
            teamEntries[teamEntries.length - 1].manager = line.slice(1, -1).trim();
          }
          continue;
        }

        // Team name - not a number, not a header
        if (
          !line.match(/^[\d.]+$/) &&
          !["rk", "team", "fg%", "ft%"].includes(line.toLowerCase()) &&
          line.length > 2
        ) {
          teamEntries.push({ name: line, manager: "" });
        }
      }

      // Parse stats from Season Stats numeric block
      if (inStatsSection) {
        if (
          line.match(/^[.\d]+$/) &&
          !["fg%", "ft%", "3pm", "reb", "ast", "stl", "blk", "to", "pts"].includes(
            line.toLowerCase()
          )
        ) {
          statValues.push(parseFloat(line));
        }
      }
    }

    // Second pass: parse true W-L-T records from Standings table ONLY
    // The Standings table has format: RK | Team Name | W | L | T | ...
    // We need to find the table header with "W" "L" "T" columns and extract records from there
    const recordsByTeam: Record<string, string> = {};
    const teamNames = teamEntries.map((t) => t.name);

    // Find the Standings table by looking for the pattern: "Season" followed by year, then W L T headers
    // The table starts with "Standings" and contains team rows with W L T values
    let inStandingsTable = false;
    let foundWLTHeaders = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect start of Standings section (before Season Stats)
      if (line === "Standings") {
        inStandingsTable = true;
        continue;
      }
      
      // Detect the W L T header pattern in Standings table
      if (inStandingsTable && line === "W" && i + 2 < lines.length) {
        if (lines[i + 1] === "L" && lines[i + 2] === "T") {
          foundWLTHeaders = true;
          continue;
        }
      }
      
      // Stop parsing records when we hit "Season Stats" section (that's category totals, not records)
      if (line === "Season Stats" || line.toLowerCase() === "season stats") {
        inStandingsTable = false;
        foundWLTHeaders = false;
        break;
      }
      
      // Stop if we hit other sections that shouldn't have standings records
      if (line === "LAST MOVES" || line === "Last Moves" || line.includes("LAST MOVES")) {
        break;
      }
      
      // Extract W-L-T for teams in the Standings table section only
      if (inStandingsTable && foundWLTHeaders && teamNames.includes(line)) {
        const name = line;
        const nums: string[] = [];
        
        // Look for exactly 3 consecutive integers (W, L, T) immediately after team name
        for (let j = i + 1; j < Math.min(i + 8, lines.length) && nums.length < 3; j++) {
          const candidate = lines[j];
          // Skip manager names in parentheses
          if (candidate.startsWith("(") && candidate.endsWith(")")) continue;
          // Skip other team names
          if (teamNames.includes(candidate)) break;
          // Collect integer values
          if (/^\d+$/.test(candidate)) {
            nums.push(candidate);
          }
        }
        
        if (nums.length === 3) {
          recordsByTeam[name] = `${nums[0]}-${nums[1]}-${nums[2]}`;
        }
      }
    }
    
    // Fallback: If we didn't find records via structured approach, try alternative parsing
    // Look for pattern: Team Name followed by three single-digit/low integers before any stat-like numbers
    if (Object.keys(recordsByTeam).length === 0) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip if past "Season Stats" section
        if (line === "Season Stats" || line.toLowerCase() === "season stats") break;
        if (line === "LAST MOVES" || line.includes("LAST MOVES")) break;
        
        if (teamNames.includes(line)) {
          const name = line;
          const nums: string[] = [];
          
          // Collect next integers that look like W-L-T (typically single digits or low two-digit)
          for (let j = i + 1; j < Math.min(i + 10, lines.length) && nums.length < 3; j++) {
            const candidate = lines[j];
            if (candidate.startsWith("(") && candidate.endsWith(")")) continue;
            if (teamNames.includes(candidate)) break;
            // Only accept integers that are reasonable for W-L-T (0-30 range)
            if (/^\d+$/.test(candidate) && parseInt(candidate) <= 30) {
              nums.push(candidate);
            }
            // Stop if we hit a decimal (likely a stat like FG%)
            if (/^\d*\.\d+$/.test(candidate)) break;
          }
          
          if (nums.length === 3) {
            recordsByTeam[name] = `${nums[0]}-${nums[1]}-${nums[2]}`;
          }
        }
      }
    }

    // Match stats to teams (9 stats per team) using Season Stats order
    const numTeams = teamEntries.length;
    if (numTeams > 0 && statValues.length >= numTeams * 9) {
      for (let t = 0; t < numTeams; t++) {
        const s = t * 9;
        const team = teamEntries[t];
        result.push({
          name: team.name,
          manager: team.manager,
          fgPct: statValues[s] || 0,
          ftPct: statValues[s + 1] || 0,
          threepm: statValues[s + 2] || 0,
          rebounds: statValues[s + 3] || 0,
          assists: statValues[s + 4] || 0,
          steals: statValues[s + 5] || 0,
          blocks: statValues[s + 6] || 0,
          turnovers: statValues[s + 7] || 0,
          points: statValues[s + 8] || 0,
          record: recordsByTeam[team.name] || "",
        });
      }
    }

    return result;
  };

  const handleParse = () => {
    if (!rawData.trim()) {
      toast({ title: "No data", description: "Please paste your league standings data", variant: "destructive" });
      return;
    }

    const parsed = parseLeagueData(rawData);
    if (parsed.length === 0) {
      toast({ title: "No teams found", description: "Could not parse league data. Try copying the entire page.", variant: "destructive" });
      return;
    }

    setRawTeams(parsed);
    toast({ title: "Success!", description: `Loaded ${parsed.length} teams` });
  };

  const handleReset = useCallback(() => {
    setIsResetting(true);
    setHasResetTriggered(true); // Prevent useEffect from re-syncing persisted data
    
    // Use requestAnimationFrame to yield to UI thread and prevent freeze
    requestAnimationFrame(() => {
      // Clear localStorage keys
      STANDINGS_RESET_KEYS.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`Failed to remove key "${key}":`, e);
        }
      });
      
      // Clear state in next frame to allow UI to update
      requestAnimationFrame(() => {
        setRawTeams([]);
        setRawData("");
        if (onTeamsChange) onTeamsChange([]);
        setIsResetting(false);
        // Reset flag so future persistence works after new data is added
        setHasResetTriggered(false);
        toast({ title: "Reset complete", description: "Standings data cleared successfully" });
      });
    });
  }, [onTeamsChange, toast]);
  // Calculate CRIS for all teams (use dynamic weights if available)
  const teams = useMemo((): TeamWithCris[] => {
    if (rawTeams.length === 0) return [];
    const withCris = calculateCRISForAll(rawTeams.map(t => ({
      ...t,
      fgPct: t.fgPct,
      ftPct: t.ftPct,
      threepm: t.threepm,
      rebounds: t.rebounds,
      assists: t.assists,
      steals: t.steals,
      blocks: t.blocks,
      turnovers: t.turnovers,
      points: t.points,
    })), false, dynamicWeights);
    // Add original rank based on order they appeared (which is standings order from ESPN)
    return withCris.map((t, idx) => ({ ...t, originalRank: idx + 1 }));
  }, [rawTeams, dynamicWeights]);

  // Update dynamic weights standings context when teams data changes
  useEffect(() => {
    if (!onUpdateStandingsContext || teams.length === 0) return;
    
    // Find user's team (assuming it's named something like "bane" - or use first team as fallback)
    const userTeam = teams.find(t => t.name.toLowerCase().includes('bane')) || teams[0];
    if (!userTeam) return;
    
    // Calculate league averages
    const leagueCategoryAvgs: Record<string, number> = {
      fgPct: teams.reduce((sum, t) => sum + t.fgPct, 0) / teams.length,
      ftPct: teams.reduce((sum, t) => sum + t.ftPct, 0) / teams.length,
      threepm: teams.reduce((sum, t) => sum + t.threepm, 0) / teams.length,
      rebounds: teams.reduce((sum, t) => sum + t.rebounds, 0) / teams.length,
      assists: teams.reduce((sum, t) => sum + t.assists, 0) / teams.length,
      steals: teams.reduce((sum, t) => sum + t.steals, 0) / teams.length,
      blocks: teams.reduce((sum, t) => sum + t.blocks, 0) / teams.length,
      turnovers: teams.reduce((sum, t) => sum + t.turnovers, 0) / teams.length,
      points: teams.reduce((sum, t) => sum + t.points, 0) / teams.length,
    };
    
    const userCategoryAvgs: Record<string, number> = {
      fgPct: userTeam.fgPct,
      ftPct: userTeam.ftPct,
      threepm: userTeam.threepm,
      rebounds: userTeam.rebounds,
      assists: userTeam.assists,
      steals: userTeam.steals,
      blocks: userTeam.blocks,
      turnovers: userTeam.turnovers,
      points: userTeam.points,
    };
    
    // Calculate category ranks with gaps
    const categoryRanks: Record<string, { rank: number; total: number; gap: number }> = {};
    const categories = ['fgPct', 'ftPct', 'threepm', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'points'];
    
    categories.forEach(cat => {
      const isLowerBetter = cat === 'turnovers';
      const sorted = [...teams].sort((a, b) => {
        const aVal = a[cat as keyof TeamWithCris] as number;
        const bVal = b[cat as keyof TeamWithCris] as number;
        return isLowerBetter ? aVal - bVal : bVal - aVal;
      });
      
      const rank = sorted.findIndex(t => t.name === userTeam.name) + 1;
      const userVal = userTeam[cat as keyof TeamWithCris] as number;
      const leaderVal = sorted[0][cat as keyof TeamWithCris] as number;
      const gap = isLowerBetter ? userVal - leaderVal : leaderVal - userVal;
      
      categoryRanks[cat] = { rank, total: teams.length, gap };
    });
    
    onUpdateStandingsContext(userCategoryAvgs, leagueCategoryAvgs, categoryRanks);
  }, [teams, onUpdateStandingsContext]);
  const sortedTeams = useMemo(() => {
    if (teams.length === 0) return [];
    
    return [...teams].sort((a, b) => {
      let aVal: number, bVal: number;
      
      if (sortKey === 'record') {
        // Parse record for sorting (wins)
        const aWins = parseInt(a.record?.split('-')[0] || '0');
        const bWins = parseInt(b.record?.split('-')[0] || '0');
        aVal = aWins;
        bVal = bWins;
      } else if (sortKey === 'turnovers') {
        // Lower is better for turnovers - invert sort direction
        aVal = a[sortKey] as number;
        bVal = b[sortKey] as number;
        // For turnovers: sortAsc=true means show lowest first (best)
        return sortAsc ? aVal - bVal : bVal - aVal;
      } else {
        // All other numeric columns (including fgPct, ftPct which are already decimals)
        aVal = a[sortKey] as number ?? 0;
        bVal = b[sortKey] as number ?? 0;
      }
      
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
  }, [teams, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      // Default to descending for most stats (higher is better), ascending for rank
      setSortAsc(key === 'originalRank' || key === 'turnovers');
    }
  };

  const categoryRanksByTeam = useMemo(() => {
    const byCat: Record<string, Record<string, number>> = {};

    if (teams.length === 0) return byCat;

    CATEGORIES.forEach((cat) => {
      const isLowerBetter = cat.key === "turnovers";
      const sorted = [...teams].sort((a, b) => {
        const aVal = a[cat.key as keyof TeamWithCris] as number;
        const bVal = b[cat.key as keyof TeamWithCris] as number;
        return isLowerBetter ? aVal - bVal : bVal - aVal;
      });

      const map: Record<string, number> = {};
      sorted.forEach((t, idx) => {
        map[t.name] = idx + 1;
      });
      byCat[cat.key] = map;
    });

    return byCat;
  }, [teams]);

  const getRankColor = (rank: number | undefined, total: number) => {
    if (!rank || rank < 1) return '';
    if (rank <= 3) return 'bg-stat-positive/20 text-stat-positive';
    if (rank >= total - 2) return 'bg-stat-negative/20 text-stat-negative';
    return '';
  };

  const SortHeader = ({ label, sortKeyProp, className }: { label: string; sortKeyProp: SortKey; className?: string }) => {
    const isActive = sortKey === sortKeyProp;
    return (
      <th 
        className={cn(
          "p-2 font-display cursor-pointer select-none transition-colors",
          isActive ? "bg-primary/20" : "hover:bg-muted/50",
          className
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSort(sortKeyProp);
        }}
      >
        <div className="flex items-center justify-center gap-1">
          <span>{label}</span>
          {isActive ? (
            sortAsc ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />
          ) : (
            <ArrowUpDown className="w-3 h-3 opacity-30" />
          )}
        </div>
      </th>
    );
  };

  const scoreKey = useCris ? 'cri' : 'wCri';
  const scoreLabel = useCris ? 'CRI' : 'wCRI';

  if (teams.length === 0) {
    return (
      <Card className="gradient-card shadow-card p-6 border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">League Standings</h2>
            <p className="text-sm text-muted-foreground">
              Copy and paste the entire ESPN standings page
            </p>
          </div>
        </div>

        <Textarea
          placeholder={`Copy the ENTIRE ESPN standings page (Ctrl+A, Ctrl+C) and paste here.

The page should include the "Season Stats" section with team names, managers, and category totals.`}
          value={rawData}
          onChange={(e) => setRawData(e.target.value)}
          className="min-h-[200px] font-mono text-sm mb-4 bg-muted/50"
        />

        <Button onClick={handleParse} className="w-full gradient-primary font-display font-bold">
          <Upload className="w-4 h-4 mr-2" />
          Load League Data
        </Button>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="standings" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold">League Category Rankings ({teams.length} teams)</h2>
          <CrisExplanation />
        </div>
        <div className="flex items-center gap-3">
          <TabsList>
            <TabsTrigger value="standings" className="gap-2">
              <Trophy className="w-4 h-4" />
              Standings
            </TabsTrigger>
            <TabsTrigger value="forecast" className="gap-2">
              <Calendar className="w-4 h-4" />
              Schedule Forecast
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <CrisToggle useCris={useCris} onChange={setUseCris} />
            {!useCris && <DynamicWeightsIndicator isActive={isDynamicWeightsActive} mode={dynamicWeightsMode} />}
          </div>
          {activeTab === "standings" && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {isResetting ? "Resetting..." : "New Import"}
            </Button>
          )}
        </div>
      </div>

      <TabsContent value="standings" className="space-y-6">
        {/* Main standings table - full width, no horizontal scroll */}
        <div className="overflow-x-auto bg-card/30 rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-accent/20 sticky top-0 z-10">
              <tr className="border-b border-border">
                <SortHeader label="RK" sortKeyProp="originalRank" className="text-left w-[50px]" />
                <th className="text-left p-2 font-display min-w-[140px]">Team</th>
                {CATEGORIES.map(c => (
                  <SortHeader key={c.key} label={c.label} sortKeyProp={c.key as SortKey} className="w-[75px]" />
                ))}
                <SortHeader label="Record" sortKeyProp="record" className="w-[80px]" />
                <SortHeader 
                  label={scoreLabel} 
                  sortKeyProp={useCris ? 'cri' : 'wCri'} 
                  className="border-l-2 border-primary/50 w-[70px]" 
                />
              </tr>
            </thead>
            <tbody>
            {sortedTeams.map((team, i) => {
              const isUserTeam = team.name.toLowerCase().includes('bane');
              return (
                <tr key={i} className={cn(
                  "border-b border-border/50 hover:bg-muted/30",
                  isUserTeam && "bg-primary/10 border-primary/30"
                )}>
                  <td className="p-2 font-bold text-primary">{team.originalRank}</td>
                  <td className="p-2">
                    <div className={cn("font-semibold text-sm truncate max-w-[140px]", isUserTeam && "text-primary")}>
                      {team.name}
                      {isUserTeam && <span className="ml-1 text-xs bg-primary/20 text-primary px-1 py-0.5 rounded">You</span>}
                    </div>
                    {team.manager && (
                      <div className="text-xs text-muted-foreground truncate max-w-[140px]">{team.manager}</div>
                    )}
                  </td>
                  {CATEGORIES.map((c) => {
                    const rank = categoryRanksByTeam[c.key]?.[team.name];
                    const value = team[c.key as keyof TeamWithCris] as number;
                    return (
                      <td key={c.key} className="text-center p-1.5">
                        <div
                          className={cn(
                            "rounded px-1 py-0.5 inline-block text-xs",
                            getRankColor(rank, teams.length)
                          )}
                        >
                          <span className="font-semibold">
                            {c.format === "pct" ? formatPct(value) : value.toFixed(0)}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-0.5">#{rank ?? "-"}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-center p-2 font-semibold text-sm">
                    {team.record || '-'}
                  </td>
                  <td className="text-center p-2 font-bold text-primary border-l-2 border-primary/50">
                    {team[scoreKey].toFixed(1)}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>

        {/* Playoff Contenders Category Profile - below table */}
        <PlayoffContendersProfile teams={teams} />
      </TabsContent>

      <TabsContent value="forecast">
        <ScheduleForecast 
          leagueTeams={rawTeams} 
          userTeamName={rawTeams.find(t => t.name.toLowerCase().includes('bane'))?.name}
        />
      </TabsContent>
    </Tabs>
  );
};
