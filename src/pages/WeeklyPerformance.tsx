import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Trophy, Upload, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { validateParseInput, parseWithTimeout, createLoopGuard, MAX_INPUT_SIZE } from "@/lib/parseUtils";

// ============================================================================
// TYPES (local to Weekly tab)
// ============================================================================

interface TeamStats {
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

interface ParsedTeam {
  token: string;       // Original token from ESPN (e.g., "Bilb", "DUMP")
  tokenUpper: string;  // Uppercase for display (e.g., "BILB", "DUMP")
  name: string;        // Full team name (e.g., "Bilbo")
  recordStanding: string; // e.g., "5-2-0, 3rd"
  currentMatchup: string; // W-L-T for this week (e.g., "6-3-0")
  stats: TeamStats;
}

interface ParsedMatchup {
  teamA: ParsedTeam;
  teamB: ParsedTeam;
}

interface WeeklyPerformanceProps {
  persistedMatchups?: ParsedMatchup[];
  persistedTitle?: string;
  onMatchupsChange?: (matchups: ParsedMatchup[]) => void;
  onTitleChange?: (title: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STAT_CATEGORIES = [
  { key: 'fgPct', label: 'FG%', format: 'pct' },
  { key: 'ftPct', label: 'FT%', format: 'pct' },
  { key: 'threepm', label: '3PM', format: 'int' },
  { key: 'rebounds', label: 'REB', format: 'int' },
  { key: 'assists', label: 'AST', format: 'int' },
  { key: 'steals', label: 'STL', format: 'int' },
  { key: 'blocks', label: 'BLK', format: 'int' },
  { key: 'turnovers', label: 'TO', format: 'int' },
  { key: 'points', label: 'PTS', format: 'int' },
] as const;

// ============================================================================
// PARSING LOGIC (completely rewritten)
// ============================================================================

function parseWeeklyScoreboard(data: string): { matchups: ParsedMatchup[]; weekLabel: string; debugInfo: string[] } {
  validateParseInput(data);
  
  const debugInfo: string[] = [];
  const loopGuard = createLoopGuard();
  
  // Step 1: Extract week label
  const weekMatch = data.match(/Matchup\s+\d+\s*\([^)]+\)/i);
  const weekLabel = weekMatch ? weekMatch[0] : "";
  debugInfo.push(`Week label: ${weekLabel || "(not found)"}`);
  
  // Step 2: Split into lines and clean
  const rawLines = data.split('\n').map(l => l.trim());
  
  // Skip ESPN navigation - find "Matchups" section
  let startIdx = 0;
  for (let i = 0; i < rawLines.length; i++) {
    loopGuard.check();
    if (rawLines[i].toLowerCase() === 'matchups' || rawLines[i].toLowerCase() === 'scoreboard') {
      startIdx = i + 1;
    }
  }
  
  // Filter out ESPN nav and empty lines
  const skipPatterns = /^(ESPN|NFL|NBA|MLB|NCAAF|NHL|Soccer|WNBA|Watch|Fantasy|Copyright|hsb\.|Fantasy Basketball Home|My Team|League|Settings|Members|Rosters|Schedule|Message Board|Transaction Counter|History|Draft Recap|Email League|Recent Activity|Players|Add Players|Watch List|Daily Leaders|Live Draft Trends|Added \/ Dropped|Player Rater|Player News|Projections|Waiver Order|Waiver Report|Undroppables|FantasyCast|Standings|Opposing Teams|ESPN BET|Fantasy Games|Help|More Sports|Interest-Based Ads|Do Not Sell|Where to Watch|Member Services|Scoreboard|Matchups)$/i;
  
  const lines = rawLines.slice(startIdx).filter(l => l.length > 0 && !skipPatterns.test(l));
  
  // Step 3: Find all stat headers (FG%) - each marks a matchup's stats section
  const fgIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    loopGuard.check();
    if (lines[i] === 'FG%') {
      fgIndices.push(i);
    }
  }
  
  debugInfo.push(`Found ${fgIndices.length} FG% markers (potential matchups)`);
  
  const matchups: ParsedMatchup[] = [];
  
  // Process each matchup block
  for (let blockIdx = 0; blockIdx < fgIndices.length; blockIdx++) {
    loopGuard.check();
    
    const fgIdx = fgIndices[blockIdx];
    const prevFgIdx = blockIdx > 0 ? fgIndices[blockIdx - 1] : -20;
    
    // Search backwards from FG% to find two team headers
    // Pattern: TeamName, then (W-L-T, Nth), then W-L-T
    const recordPattern = /^\((\d+-\d+-\d+),\s*(\d+(?:st|nd|rd|th))\)$/i;
    const currentMatchupPattern = /^(\d+)-(\d+)-(\d+)$/;
    
    interface TeamHeader {
      name: string;
      recordStanding: string;
      currentMatchup: string;
      lineIdx: number;
    }
    
    const teamHeaders: TeamHeader[] = [];
    const searchStart = Math.max(0, prevFgIdx + 12);
    
    for (let i = searchStart; i < fgIdx - 2; i++) {
      loopGuard.check();
      const line = lines[i];
      const nextLine = lines[i + 1] || "";
      const lineAfter = lines[i + 2] || "";
      
      if (recordPattern.test(nextLine)) {
        const recMatch = nextLine.match(recordPattern);
        if (recMatch) {
          let currentMatchup = "0-0-0";
          if (currentMatchupPattern.test(lineAfter)) {
            currentMatchup = lineAfter;
          }
          
          teamHeaders.push({
            name: line,
            recordStanding: `${recMatch[1]}, ${recMatch[2]}`,
            currentMatchup,
            lineIdx: i
          });
        }
      }
    }
    
    // Find stats rows after FG% header
    // Skip category headers: FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS
    const catHeaders = ['FG%', 'FT%', '3PM', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PTS'];
    const nextFgIdx = fgIndices[blockIdx + 1] || lines.length;
    
    interface StatsRow {
      token: string;
      stats: number[];
    }
    
    const statsRows: StatsRow[] = [];
    
    // Stats row pattern: TOKEN followed by 9 values on same line OR TOKEN on one line, stats on next lines
    // We'll try both approaches
    const statsRowPattern = /^([A-Za-z][A-Za-z0-9]{0,6})\s+(\.?\d+)\s+(\.?\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/;
    
    for (let i = fgIdx + 1; i < nextFgIdx && statsRows.length < 2; i++) {
      loopGuard.check();
      const line = lines[i];
      
      if (catHeaders.includes(line)) continue;
      if (line.toLowerCase() === 'box score') continue;
      
      const singleLineMatch = line.match(statsRowPattern);
      if (singleLineMatch) {
        const fg = singleLineMatch[2].startsWith('.') ? parseFloat(singleLineMatch[2]) : parseFloat('0.' + singleLineMatch[2]);
        const ft = singleLineMatch[3].startsWith('.') ? parseFloat(singleLineMatch[3]) : parseFloat('0.' + singleLineMatch[3]);
        
        statsRows.push({
          token: singleLineMatch[1],
          stats: [fg, ft, parseInt(singleLineMatch[4]), parseInt(singleLineMatch[5]), parseInt(singleLineMatch[6]),
                  parseInt(singleLineMatch[7]), parseInt(singleLineMatch[8]), parseInt(singleLineMatch[9]), parseInt(singleLineMatch[10])]
        });
        continue;
      }
      
      // Try multi-line: token on one line, stats spread across following lines
      const tokenOnlyPattern = /^([A-Za-z][A-Za-z0-9]{0,6})$/;
      if (tokenOnlyPattern.test(line)) {
        // Collect next 9 values
        const values: number[] = [];
        let j = i + 1;
        while (j < nextFgIdx && values.length < 9) {
          loopGuard.check();
          const val = lines[j];
          if (catHeaders.includes(val) || val.toLowerCase() === 'box score') {
            j++;
            continue;
          }
          const numMatch = val.match(/^(\.?\d+\.?\d*)$/);
          if (numMatch) {
            if (values.length < 2) {
              // FG% or FT%
              const pct = numMatch[1].startsWith('.') ? parseFloat(numMatch[1]) : parseFloat('0.' + numMatch[1]);
              values.push(pct);
            } else {
              values.push(parseInt(numMatch[1]));
            }
            j++;
          } else {
            break;
          }
        }
        
        if (values.length === 9) {
          statsRows.push({ token: line, stats: values });
          i = j - 1; // Skip ahead
        }
      }
    }
    
    // Need at least 2 team headers and 2 stats rows
    if (teamHeaders.length >= 2 && statsRows.length >= 2) {
      const teamA = teamHeaders[teamHeaders.length - 2];
      const teamB = teamHeaders[teamHeaders.length - 1];
      const statsA = statsRows[0];
      const statsB = statsRows[1];
      
      matchups.push({
        teamA: {
          token: statsA.token,
          tokenUpper: statsA.token.toUpperCase(),
          name: teamA.name,
          recordStanding: teamA.recordStanding,
          currentMatchup: teamA.currentMatchup,
          stats: {
            fgPct: statsA.stats[0],
            ftPct: statsA.stats[1],
            threepm: statsA.stats[2],
            rebounds: statsA.stats[3],
            assists: statsA.stats[4],
            steals: statsA.stats[5],
            blocks: statsA.stats[6],
            turnovers: statsA.stats[7],
            points: statsA.stats[8],
          }
        },
        teamB: {
          token: statsB.token,
          tokenUpper: statsB.token.toUpperCase(),
          name: teamB.name,
          recordStanding: teamB.recordStanding,
          currentMatchup: teamB.currentMatchup,
          stats: {
            fgPct: statsB.stats[0],
            ftPct: statsB.stats[1],
            threepm: statsB.stats[2],
            rebounds: statsB.stats[3],
            assists: statsB.stats[4],
            steals: statsB.stats[5],
            blocks: statsB.stats[6],
            turnovers: statsB.stats[7],
            points: statsB.stats[8],
          }
        }
      });
      
      debugInfo.push(`Matchup ${matchups.length}: ${statsA.token} vs ${statsB.token}`);
    }
  }
  
  debugInfo.push(`Total matchups parsed: ${matchups.length}`);
  
  return { matchups, weekLabel, debugInfo };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatStat(value: number, format: string): string {
  if (format === 'pct') {
    return value.toFixed(3);
  }
  return value.toString();
}

function compareCategory(valA: number, valB: number, key: string): 'A' | 'B' | 'tie' {
  if (valA === valB) return 'tie';
  // TO: lower is better
  if (key === 'turnovers') {
    return valA < valB ? 'A' : 'B';
  }
  return valA > valB ? 'A' : 'B';
}

function computeCategoryWins(teamA: TeamStats, teamB: TeamStats): { winsA: number; winsB: number; ties: number } {
  let winsA = 0, winsB = 0, ties = 0;
  
  for (const cat of STAT_CATEGORIES) {
    const valA = teamA[cat.key as keyof TeamStats];
    const valB = teamB[cat.key as keyof TeamStats];
    const result = compareCategory(valA, valB, cat.key);
    if (result === 'A') winsA++;
    else if (result === 'B') winsB++;
    else ties++;
  }
  
  return { winsA, winsB, ties };
}

// ============================================================================
// COMPONENT
// ============================================================================

export const WeeklyPerformance = ({ 
  persistedMatchups = [], 
  persistedTitle = "",
  onMatchupsChange,
  onTitleChange 
}: WeeklyPerformanceProps) => {
  const [rawData, setRawData] = useState("");
  const [matchups, setMatchups] = useState<ParsedMatchup[]>(persistedMatchups as ParsedMatchup[]);
  const [weekTitle, setWeekTitle] = useState(persistedTitle);
  const [isParsing, setIsParsing] = useState(false);
  const { toast } = useToast();

  // Sync with persisted data
  useEffect(() => {
    if (persistedMatchups.length > 0 && matchups.length === 0) {
      setMatchups(persistedMatchups as ParsedMatchup[]);
    }
    if (persistedTitle && !weekTitle) {
      setWeekTitle(persistedTitle);
    }
  }, [persistedMatchups, persistedTitle]);

  // Notify parent of changes
  useEffect(() => {
    if (onMatchupsChange && matchups.length > 0) {
      onMatchupsChange(matchups);
    }
    if (onTitleChange && weekTitle) {
      onTitleChange(weekTitle);
    }
  }, [matchups, weekTitle]);

  // Build table rows: flatten all teams, compute category wins, sort by wins
  const tableRows = useMemo(() => {
    if (matchups.length === 0) return [];
    
    const rows: {
      team: ParsedTeam;
      opponent: ParsedTeam;
      categoryWins: number;
      categoryLosses: number;
      categoryTies: number;
    }[] = [];
    
    for (const m of matchups) {
      const { winsA, winsB, ties } = computeCategoryWins(m.teamA.stats, m.teamB.stats);
      
      rows.push({
        team: m.teamA,
        opponent: m.teamB,
        categoryWins: winsA,
        categoryLosses: winsB,
        categoryTies: ties,
      });
      
      rows.push({
        team: m.teamB,
        opponent: m.teamA,
        categoryWins: winsB,
        categoryLosses: winsA,
        categoryTies: ties,
      });
    }
    
    // Sort by category wins (desc), then PTS (desc), then FG% (desc)
    rows.sort((a, b) => {
      if (b.categoryWins !== a.categoryWins) return b.categoryWins - a.categoryWins;
      if (b.team.stats.points !== a.team.stats.points) return b.team.stats.points - a.team.stats.points;
      return b.team.stats.fgPct - a.team.stats.fgPct;
    });
    
    return rows;
  }, [matchups]);

  const handleParse = async () => {
    if (!rawData.trim()) {
      toast({
        title: "No data",
        description: "Please paste your weekly scoreboard data first",
        variant: "destructive",
      });
      return;
    }
    
    if (rawData.length > MAX_INPUT_SIZE) {
      toast({
        title: "Input too large",
        description: `Data exceeds maximum size of ${MAX_INPUT_SIZE / 1024}KB.`,
        variant: "destructive",
      });
      return;
    }
    
    setIsParsing(true);
    
    try {
      const { matchups: parsed, weekLabel } = await parseWithTimeout(() => parseWeeklyScoreboard(rawData));
      
      if (parsed.length >= 5) {
        setMatchups(parsed);
        setWeekTitle(weekLabel);
        toast({
          title: "Success!",
          description: `Loaded ${parsed.length} matchups (${parsed.length * 2} teams)`,
        });
      } else if (parsed.length > 0) {
        setMatchups(parsed);
        setWeekTitle(weekLabel);
        toast({
          title: "Partial parse",
          description: `Found ${parsed.length}/5 matchups. Make sure to paste the full ESPN Scoreboard page.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "No matchups found",
          description: "Could not parse any matchup data. Please paste the full ESPN Scoreboard page.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: "Parse error",
        description: error instanceof Error ? error.message : "Could not parse the data.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleReset = () => {
    setMatchups([]);
    setWeekTitle("");
    setRawData("");
    if (onMatchupsChange) onMatchupsChange([]);
    if (onTitleChange) onTitleChange("");
  };

  // Get heatmap color for category value (among all 10 teams)
  const getCategoryColor = (value: number, key: string): string => {
    const allValues = tableRows.map(r => r.team.stats[key as keyof TeamStats]);
    const isLowerBetter = key === 'turnovers';
    const sorted = [...allValues].sort((a, b) => isLowerBetter ? a - b : b - a);
    const rank = sorted.indexOf(value) + 1;
    const percentile = rank / sorted.length;
    
    if (percentile <= 0.2) return 'bg-stat-positive/20';
    if (percentile <= 0.4) return 'bg-emerald-500/15';
    if (percentile <= 0.6) return '';
    if (percentile <= 0.8) return 'bg-orange-500/15';
    return 'bg-stat-negative/15';
  };

  // ============================================================================
  // RENDER: Empty state (no data)
  // ============================================================================
  
  if (matchups.length === 0) {
    return (
      <Card className="gradient-card shadow-card p-6 border-border max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-lg bg-primary/10">
            <Trophy className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">Weekly Performance</h2>
            <p className="text-sm text-muted-foreground">
              Copy and paste the ESPN scoreboard page for a matchup week
            </p>
          </div>
        </div>

        <Textarea
          placeholder={`Paste the ENTIRE ESPN Scoreboard page here (Ctrl+A, Ctrl+C from ESPN).

The page should include all 5 matchups with team names, records, and stats.`}
          value={rawData}
          onChange={(e) => setRawData(e.target.value)}
          className="min-h-[200px] font-mono text-sm mb-4 bg-muted/50"
        />


        <Button onClick={handleParse} disabled={isParsing} className="w-full gradient-primary font-display font-bold">
          <Upload className="w-4 h-4 mr-2" />
          {isParsing ? "Parsing..." : "Load Weekly Data"}
        </Button>
        
      </Card>
    );
  }

  // ============================================================================
  // RENDER: Weekly Performance Table + Matchup Details
  // ============================================================================
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl">Weekly Performance</h2>
          {weekTitle && <p className="text-muted-foreground">{weekTitle}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RefreshCw className="w-4 h-4 mr-2" />
          New Import
        </Button>
      </div>
      

      {/* Weekly Performance Table */}
      <Card className="gradient-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-accent/20">
                <th className="p-3 text-left font-display text-sm">#</th>
                <th className="p-3 text-left font-display text-sm min-w-[100px]">TEAM</th>
                <th className="p-3 text-center font-display text-sm min-w-[100px]">Current Matchup</th>
                {STAT_CATEGORIES.map(cat => (
                  <th key={cat.key} className="p-3 text-center font-display text-sm text-muted-foreground">
                    {cat.label}
                  </th>
                ))}
                <th className="p-3 text-center font-display text-sm border-l border-primary/50 text-primary">CRI</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => (
                <tr 
                  key={`${row.team.token}-${idx}`}
                  className="border-b border-border/50 hover:bg-muted/20"
                >
                  <td className="p-3 font-bold text-primary text-base">{idx + 1}</td>
                  <td className="p-3">
                    <div className="font-bold text-base">{row.team.tokenUpper}</div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="text-xs text-muted-foreground">vs {row.opponent.tokenUpper}</div>
                    <div className={cn(
                      "font-bold",
                      row.categoryWins > row.categoryLosses ? "text-stat-positive" : 
                      row.categoryWins < row.categoryLosses ? "text-stat-negative" : "text-muted-foreground"
                    )}>
                      {row.team.currentMatchup}
                    </div>
                  </td>
                  {STAT_CATEGORIES.map(cat => {
                    const value = row.team.stats[cat.key as keyof TeamStats];
                    const colorClass = getCategoryColor(value, cat.key);
                    
                    return (
                      <td key={cat.key} className={cn("p-3 text-center font-mono text-sm", colorClass)}>
                        {formatStat(value, cat.format)}
                      </td>
                    );
                  })}
                  <td className="p-3 text-center font-bold text-primary text-base border-l border-primary/50">
                    —
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Matchup Details */}
      <h3 className="font-display font-bold text-lg mt-8">Matchup Details</h3>
      <div className="grid gap-4">
        {matchups.map((matchup, idx) => {
          const { winsA, winsB, ties } = computeCategoryWins(matchup.teamA.stats, matchup.teamB.stats);
          
          const categoryResults = STAT_CATEGORIES.map(cat => {
            const valA = matchup.teamA.stats[cat.key as keyof TeamStats];
            const valB = matchup.teamB.stats[cat.key as keyof TeamStats];
            const winner = compareCategory(valA, valB, cat.key);
            return { ...cat, valA, valB, winner };
          });

          return (
            <Card key={idx} className="gradient-card border-border overflow-hidden">
              {/* Matchup Header */}
              <div className="p-4 border-b border-border bg-secondary/20">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-display font-bold text-lg">{matchup.teamA.tokenUpper}</p>
                    <p className="text-xs text-muted-foreground">{matchup.teamA.currentMatchup}</p>
                  </div>
                  <div className="text-center px-4">
                    <span className="font-display font-bold text-lg">
                      <span className={winsA > winsB ? 'text-stat-positive' : ''}>{winsA}</span>
                      <span className="text-muted-foreground mx-1">-</span>
                      <span className={winsB > winsA ? 'text-stat-positive' : ''}>{winsB}</span>
                      <span className="text-muted-foreground mx-1">-</span>
                      <span>{ties}</span>
                    </span>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="font-display font-bold text-lg">{matchup.teamB.tokenUpper}</p>
                    <p className="text-xs text-muted-foreground">{matchup.teamB.currentMatchup}</p>
                  </div>
                </div>
              </div>

              {/* Stats Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 text-left font-display">Team</th>
                      {STAT_CATEGORIES.map(cat => (
                        <th key={cat.key} className="p-2 text-center font-display text-muted-foreground text-xs">
                          {cat.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="p-2 font-semibold">{matchup.teamA.tokenUpper}</td>
                      {categoryResults.map(cat => (
                        <td key={cat.key} className={cn(
                          "p-2 text-center font-mono text-xs",
                          cat.winner === 'A' && "text-stat-positive font-bold bg-stat-positive/10",
                          cat.winner === 'B' && "text-stat-negative"
                        )}>
                          {formatStat(cat.valA, cat.format)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="p-2 font-semibold">{matchup.teamB.tokenUpper}</td>
                      {categoryResults.map(cat => (
                        <td key={cat.key} className={cn(
                          "p-2 text-center font-mono text-xs",
                          cat.winner === 'B' && "text-stat-positive font-bold bg-stat-positive/10",
                          cat.winner === 'A' && "text-stat-negative"
                        )}>
                          {formatStat(cat.valB, cat.format)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
