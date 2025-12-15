import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Trophy, Upload, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPct, CATEGORIES, calculateCRISForAll } from "@/lib/crisUtils";
import { validateParseInput, parseWithTimeout, createLoopGuard, MAX_INPUT_SIZE } from "@/lib/parseUtils";

interface MatchupTeam {
  abbr: string;
  name: string;
  record: string;
  weekRecord: string;
  stats: {
    fgPct: number;
    ftPct: number;
    threepm: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    points: number;
  };
}

interface Matchup {
  team1: MatchupTeam;
  team2: MatchupTeam;
}

interface WeeklyPerformanceProps {
  persistedMatchups?: Matchup[];
  persistedTitle?: string;
  onMatchupsChange?: (matchups: Matchup[]) => void;
  onTitleChange?: (title: string) => void;
}

export const WeeklyPerformance = ({ 
  persistedMatchups = [], 
  persistedTitle = "",
  onMatchupsChange,
  onTitleChange 
}: WeeklyPerformanceProps) => {
  const [rawData, setRawData] = useState("");
  const [matchups, setMatchups] = useState<Matchup[]>(persistedMatchups);
  const [weekTitle, setWeekTitle] = useState(persistedTitle);
  const [useCris, setUseCris] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const { toast } = useToast();

  // Sync with persisted data
  useEffect(() => {
    if (persistedMatchups.length > 0 && matchups.length === 0) {
      setMatchups(persistedMatchups);
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

  // Calculate CRIS for all teams
  const teamsWithCRIS = useMemo(() => {
    if (matchups.length === 0) return [];
    
    // Flatten all teams
    const allTeams = matchups.flatMap(m => [
      { ...m.team1.stats, name: m.team1.name, abbr: m.team1.abbr },
      { ...m.team2.stats, name: m.team2.name, abbr: m.team2.abbr }
    ]);
    
    return calculateCRISForAll(allTeams);
  }, [matchups]);

  const getTeamCRIS = (abbr: string): { cri: number; wCri: number } => {
    const team = teamsWithCRIS.find(t => t.abbr === abbr);
    return { cri: team?.cri || 0, wCri: team?.wCri || 0 };
  };

  const parseWeeklyData = (data: string): { matchups: Matchup[]; week: string } => {
    // Validate input
    validateParseInput(data);
    
    const lines = data.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const result: Matchup[] = [];
    let week = "";
    const loopGuard = createLoopGuard();
    
    // Step 1: Extract week label like "Matchup 8 (Dec 8 - 14)"
    const weekMatch = data.match(/Matchup\s+\d+\s*\([^)]+\)/i);
    if (weekMatch) week = weekMatch[0];
    
    // Skip ESPN navigation - find "Scoreboard" and only parse after that
    const scoreboardIdx = lines.findIndex(l => l.toLowerCase() === 'scoreboard');
    const startIdx = scoreboardIdx > -1 ? scoreboardIdx + 1 : 0;
    
    // Filter out ESPN navigation items
    const skipPatterns = /^(ESPN|NFL|NBA|MLB|NCAAF|NHL|Soccer|WNBA|More Sports|Watch|Fantasy|Where to Watch|hsb\.|Copyright|Fantasy Basketball Home|My Team|League|Settings|Members|Rosters|Schedule|Message Board|Transaction Counter|History|Draft Recap|Email League|Recent Activity|Players|Add Players|Watch List|Daily Leaders|Live Draft Trends|Added \/ Dropped|Player Rater|Player News|Projections|Waiver Order|Waiver Report|Undroppables|FantasyCast|Standings|Opposing Teams|ESPN BET|Fantasy Games|Help|Interest-Based Ads|Do Not Sell My Info|Member Services)$/i;
    
    const relevantLines = lines.slice(startIdx).filter(l => !skipPatterns.test(l));
    
    // Patterns
    // Team header pattern: "(W-L-T, Xth)" or "(W-L-T, Xst)" etc
    const recordStandingPattern = /^\((\d+-\d+-\d+),\s*(\d+(?:st|nd|rd|th))\)$/i;
    // Current matchup record: strict W-L-T (three numbers)
    const currentMatchupPattern = /^(\d+)-(\d+)-(\d+)$/;
    // Stats row: TOKEN followed by 9 stat values
    const statsRowPattern = /^([A-Za-z][A-Za-z0-9]{1,5})\s+(\.?\d+)\s+(\.?\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/;
    
    // Step 2: Find all FG% markers (category headers) - each marks start of stats section
    const fgIndices: number[] = [];
    for (let i = 0; i < relevantLines.length; i++) {
      loopGuard.check();
      if (relevantLines[i] === 'FG%') {
        fgIndices.push(i);
      }
    }
    
    // For each FG% marker, look backwards to find the two team blocks, then forwards to find stats rows
    for (let blockIdx = 0; blockIdx < fgIndices.length; blockIdx++) {
      loopGuard.check();
      
      const fgIdx = fgIndices[blockIdx];
      const prevFgIdx = blockIdx > 0 ? fgIndices[blockIdx - 1] : -10;
      
      // Search backwards from FG% to find team headers
      // Team blocks look like:
      // Line N: Team Name
      // Line N+1: (W-L-T, Xth)
      // Line N+2: W-L-T (current matchup)
      
      interface TeamBlock {
        name: string;
        recordStanding: string;
        currentMatchup: string;
        lineIdx: number;
      }
      
      const teamBlocks: TeamBlock[] = [];
      const searchStart = Math.max(0, prevFgIdx + 10);
      
      for (let i = searchStart; i < fgIdx - 1; i++) {
        loopGuard.check();
        const line = relevantLines[i];
        const nextLine = relevantLines[i + 1];
        const lineAfter = relevantLines[i + 2];
        
        // Check if next line is a record+standing pattern
        if (nextLine && recordStandingPattern.test(nextLine)) {
          const recMatch = nextLine.match(recordStandingPattern);
          if (recMatch) {
            // Look for current matchup W-L-T
            let currentMatchup = "0-0-0";
            if (lineAfter && currentMatchupPattern.test(lineAfter)) {
              currentMatchup = lineAfter;
            }
            
            teamBlocks.push({
              name: line,
              recordStanding: `${recMatch[1]}, ${recMatch[2]}`,
              currentMatchup,
              lineIdx: i
            });
          }
        }
      }
      
      // Find stats rows after FG% (skip category headers: FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS)
      const nextFgIdx = fgIndices[blockIdx + 1] || relevantLines.length;
      const categoryHeaders = ['FG%', 'FT%', '3PM', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PTS'];
      
      interface StatsRow {
        token: string;
        stats: number[];
      }
      
      const statsRows: StatsRow[] = [];
      
      for (let i = fgIdx + 1; i < nextFgIdx && statsRows.length < 2; i++) {
        loopGuard.check();
        const line = relevantLines[i];
        
        // Skip category headers
        if (categoryHeaders.includes(line)) continue;
        // Skip "Box Score" text
        if (line.toLowerCase() === 'box score') continue;
        
        const statsMatch = line.match(statsRowPattern);
        if (statsMatch) {
          // Parse FG% and FT% - handle both ".485" and "485" formats
          const fg = statsMatch[2].startsWith('.') ? parseFloat(statsMatch[2]) : parseFloat('0.' + statsMatch[2]);
          const ft = statsMatch[3].startsWith('.') ? parseFloat(statsMatch[3]) : parseFloat('0.' + statsMatch[3]);
          
          statsRows.push({
            token: statsMatch[1],
            stats: [
              fg,
              ft,
              parseInt(statsMatch[4]),
              parseInt(statsMatch[5]),
              parseInt(statsMatch[6]),
              parseInt(statsMatch[7]),
              parseInt(statsMatch[8]),
              parseInt(statsMatch[9]),
              parseInt(statsMatch[10]),
            ]
          });
        }
      }
      
      // Need exactly 2 team blocks and 2 stats rows
      if (teamBlocks.length >= 2 && statsRows.length >= 2) {
        // Use the last 2 team blocks (closest to FG% header)
        const team1Block = teamBlocks[teamBlocks.length - 2];
        const team2Block = teamBlocks[teamBlocks.length - 1];
        const stats1 = statsRows[0];
        const stats2 = statsRows[1];
        
        result.push({
          team1: {
            abbr: stats1.token,
            name: team1Block.name,
            record: team1Block.recordStanding,
            weekRecord: team1Block.currentMatchup,
            stats: {
              fgPct: stats1.stats[0],
              ftPct: stats1.stats[1],
              threepm: stats1.stats[2],
              rebounds: stats1.stats[3],
              assists: stats1.stats[4],
              steals: stats1.stats[5],
              blocks: stats1.stats[6],
              turnovers: stats1.stats[7],
              points: stats1.stats[8],
            }
          },
          team2: {
            abbr: stats2.token,
            name: team2Block.name,
            record: team2Block.recordStanding,
            weekRecord: team2Block.currentMatchup,
            stats: {
              fgPct: stats2.stats[0],
              ftPct: stats2.stats[1],
              threepm: stats2.stats[2],
              rebounds: stats2.stats[3],
              assists: stats2.stats[4],
              steals: stats2.stats[5],
              blocks: stats2.stats[6],
              turnovers: stats2.stats[7],
              points: stats2.stats[8],
            }
          }
        });
      }
    }
    
    return { matchups: result, week };
  };

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
        description: `Data exceeds maximum size of ${MAX_INPUT_SIZE / 1024}KB. Please copy only the scoreboard section.`,
        variant: "destructive",
      });
      return;
    }
    
    setIsParsing(true);
    
    try {
      const { matchups: parsed, week } = await parseWithTimeout(() => parseWeeklyData(rawData));
      if (parsed.length >= 5) {
        setMatchups(parsed);
        setWeekTitle(week);
        toast({
          title: "Success!",
          description: `Loaded ${parsed.length} matchups`,
        });
      } else if (parsed.length > 0) {
        // Partial parse - still show but warn
        setMatchups(parsed);
        setWeekTitle(week);
        toast({
          title: "Partial parse",
          description: `Could not parse all matchups from ESPN paste (found ${parsed.length}/5). Make sure you paste the full Scoreboard page including all Matchups.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "No matchups found",
          description: "Could not parse any matchup data. Paste the full ESPN Scoreboard page including the Matchups section.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Parse error:', error);
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

  const handleReset = () => {
    setMatchups([]);
    setWeekTitle("");
    setRawData("");
    if (onMatchupsChange) onMatchupsChange([]);
    if (onTitleChange) onTitleChange("");
  };

  const formatValue = (value: number, format: string) => {
    if (format === 'pct') return formatPct(value);
    return value.toString();
  };

  const getWinner = (val1: number, val2: number, key: string): 'team1' | 'team2' | 'tie' => {
    if (val1 === val2) return 'tie';
    if (key === 'turnovers') return val1 < val2 ? 'team1' : 'team2';
    return val1 > val2 ? 'team1' : 'team2';
  };

  // Get category rank color (1-10 scale for league of 10) - toned down for better readability
  const getCategoryRankColor = (value: number, category: string, allValues: number[]): string => {
    const isLowerBetter = category === 'turnovers';
    const sorted = [...allValues].sort((a, b) => isLowerBetter ? a - b : b - a);
    const rank = sorted.indexOf(value) + 1;
    const total = sorted.length;
    const percentile = rank / total;
    
    // Toned down colors for better text readability
    if (percentile <= 0.2) return 'bg-stat-positive/20 text-foreground';
    if (percentile <= 0.4) return 'bg-emerald-500/15 text-foreground';
    if (percentile <= 0.6) return 'bg-transparent text-foreground';
    if (percentile <= 0.8) return 'bg-orange-500/15 text-foreground';
    return 'bg-stat-negative/15 text-foreground';
  };

  // Get all values for a category across all teams
  const getCategoryValues = (category: string): number[] => {
    return matchups.flatMap(m => [
      m.team1.stats[category as keyof typeof m.team1.stats],
      m.team2.stats[category as keyof typeof m.team2.stats]
    ]);
  };

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
          placeholder={`Copy the ENTIRE ESPN scoreboard page (Ctrl+A, Ctrl+C) and paste here.

This will show league-wide CRIS rankings for the week.
Only data below "Scoreboard" will be parsed.`}
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

  // Flatten and sort teams by CRI/wCRI for league-wide view
  const scoreKey = useCris ? 'cri' : 'wCri';
  const scoreLabel = useCris ? 'CRI' : 'wCRI';
  
  const allTeamRows = matchups.flatMap((matchup, matchupIdx) => {
    const team1CRIS = getTeamCRIS(matchup.team1.abbr);
    const team2CRIS = getTeamCRIS(matchup.team2.abbr);
    
    const categoryResults = CATEGORIES.map(cat => {
      const val1 = matchup.team1.stats[cat.key as keyof typeof matchup.team1.stats];
      const val2 = matchup.team2.stats[cat.key as keyof typeof matchup.team2.stats];
      return { ...cat, winner: getWinner(val1, val2, cat.key) };
    });
    
    const team1Wins = categoryResults.filter(r => r.winner === 'team1').length;
    const team2Wins = categoryResults.filter(r => r.winner === 'team2').length;
    const ties = categoryResults.filter(r => r.winner === 'tie').length;
    
    return [
      { 
        matchupIdx, 
        team: matchup.team1, 
        opponent: matchup.team2,
        cri: team1CRIS.cri,
        wCri: team1CRIS.wCri,
        weekWins: team1Wins,
        weekLosses: team2Wins,
        weekTies: ties,
        isFirstInMatchup: true 
      },
      { 
        matchupIdx, 
        team: matchup.team2, 
        opponent: matchup.team1,
        cri: team2CRIS.cri,
        wCri: team2CRIS.wCri,
        weekWins: team2Wins,
        weekLosses: team1Wins,
        weekTies: ties,
        isFirstInMatchup: false 
      },
    ];
  }).sort((a, b) => b[scoreKey] - a[scoreKey]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl">Weekly Performance</h2>
          {weekTitle && <p className="text-muted-foreground">{weekTitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {/* CRI/wCRI Toggle */}
          <div className="flex">
            <Button
              variant={useCris ? "default" : "outline"}
              size="sm"
              onClick={() => setUseCris(true)}
              className="rounded-r-none font-display text-xs"
            >
              CRI
            </Button>
            <Button
              variant={!useCris ? "default" : "outline"}
              size="sm"
              onClick={() => setUseCris(false)}
              className="rounded-l-none font-display text-xs"
            >
              wCRI
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            New Import
          </Button>
        </div>
      </div>

      {/* League-wide Stats Table */}
      <Card className="gradient-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="p-3 text-left font-display text-sm">#</th>
                <th className="p-3 text-left font-display text-sm min-w-[140px]">TEAM</th>
                <th className="p-3 text-center font-display text-sm">Current Matchup</th>
                {CATEGORIES.map(cat => (
                  <th key={cat.key} className="p-3 text-center font-display text-sm text-muted-foreground">
                    {cat.label}
                  </th>
                ))}
                <th className="p-3 text-center font-display text-sm border-l border-primary/50 text-primary">{scoreLabel}</th>
              </tr>
            </thead>
            <tbody>
              {allTeamRows.map((row, idx) => {
                const categoryValues = CATEGORIES.reduce((acc, cat) => {
                  acc[cat.key] = getCategoryValues(cat.key);
                  return acc;
                }, {} as Record<string, number[]>);

                return (
                  <tr 
                    key={`${row.matchupIdx}-${row.team.abbr}`} 
                    className={cn(
                      "border-b border-border/50 hover:bg-muted/20",
                      row.isFirstInMatchup && idx > 0 && "border-t-2 border-t-border"
                    )}
                  >
                    <td className="p-3 font-bold text-primary text-base">{idx + 1}</td>
                    <td className="p-3">
                      <div>
                        <div className="font-semibold text-base">
                          {row.team.name && row.team.name !== row.team.abbr 
                            ? <>{row.team.name} <span className="text-muted-foreground font-normal">({row.team.abbr})</span></>
                            : row.team.abbr
                          }
                        </div>
                        <div className="text-sm text-muted-foreground">
                          vs {row.opponent.name && row.opponent.name !== row.opponent.abbr 
                            ? `${row.opponent.name} (${row.opponent.abbr})`
                            : row.opponent.abbr
                          }
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {(() => {
                        // Parse W-L-T from weekRecord to determine color
                        const record = row.team.weekRecord && row.team.weekRecord !== '—' 
                          ? row.team.weekRecord 
                          : `${row.weekWins}-${row.weekLosses}-${row.weekTies}`;
                        const parts = record.match(/^(\d+)-(\d+)-(\d+)$/);
                        const w = parts ? parseInt(parts[1]) : row.weekWins;
                        const l = parts ? parseInt(parts[2]) : row.weekLosses;
                        const colorClass = w > l ? "text-stat-positive" : w < l ? "text-stat-negative" : "text-muted-foreground";
                        return (
                          <span className={cn("font-bold text-base", colorClass)}>
                            {record}
                          </span>
                        );
                      })()}
                    </td>
                    {CATEGORIES.map(cat => {
                      const value = row.team.stats[cat.key as keyof typeof row.team.stats];
                      const colorClass = getCategoryRankColor(value, cat.key, categoryValues[cat.key]);
                      
                      return (
                        <td key={cat.key} className={cn("p-3 text-center font-mono text-sm", colorClass)}>
                          {formatValue(value, cat.format)}
                        </td>
                      );
                    })}
                    <td className="p-3 text-center font-bold text-primary text-base border-l border-primary/50">
                      {row[scoreKey].toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Individual Matchup Cards */}
      <h3 className="font-display font-bold text-lg mt-8">Matchup Details</h3>
      <div className="grid gap-4">
        {matchups.map((matchup, idx) => {
          const categoryResults = CATEGORIES.map(cat => {
            const val1 = matchup.team1.stats[cat.key as keyof typeof matchup.team1.stats];
            const val2 = matchup.team2.stats[cat.key as keyof typeof matchup.team2.stats];
            return { ...cat, val1, val2, winner: getWinner(val1, val2, cat.key) };
          });
          
          const team1Wins = categoryResults.filter(r => r.winner === 'team1').length;
          const team2Wins = categoryResults.filter(r => r.winner === 'team2').length;
          const ties = categoryResults.filter(r => r.winner === 'tie').length;

          return (
            <Card key={idx} className="gradient-card border-border overflow-hidden">
              <div className="p-4 border-b border-border bg-secondary/20">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-display font-bold">
                      {matchup.team1.name && matchup.team1.name !== matchup.team1.abbr 
                        ? <>{matchup.team1.name} <span className="font-normal text-muted-foreground">({matchup.team1.abbr})</span></>
                        : matchup.team1.abbr
                      }
                    </p>
                  </div>
                  <div className="text-center px-4">
                    <span className="font-display font-bold text-lg">
                      <span className={team1Wins > team2Wins ? 'text-stat-positive' : ''}>{team1Wins}</span>
                      <span className="text-muted-foreground mx-1">-</span>
                      <span className={team2Wins > team1Wins ? 'text-stat-positive' : ''}>{team2Wins}</span>
                      <span className="text-muted-foreground mx-1">-</span>
                      <span>{ties}</span>
                    </span>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="font-display font-bold">
                      {matchup.team2.name && matchup.team2.name !== matchup.team2.abbr 
                        ? <>{matchup.team2.name} <span className="font-normal text-muted-foreground">({matchup.team2.abbr})</span></>
                        : matchup.team2.abbr
                      }
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 text-left font-display">Team</th>
                      {CATEGORIES.map(cat => (
                        <th key={cat.key} className="p-2 text-center font-display text-muted-foreground text-xs">{cat.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="p-2 font-semibold">{matchup.team1.abbr}</td>
                      {categoryResults.map(cat => (
                        <td key={cat.key} className={cn(
                          "p-2 text-center font-display text-xs",
                          cat.winner === 'team1' && "text-stat-positive font-bold bg-stat-positive/10",
                          cat.winner === 'team2' && "text-stat-negative"
                        )}>
                          {formatValue(cat.val1, cat.format)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="p-2 font-semibold">{matchup.team2.abbr}</td>
                      {categoryResults.map(cat => (
                        <td key={cat.key} className={cn(
                          "p-2 text-center font-display text-xs",
                          cat.winner === 'team2' && "text-stat-positive font-bold bg-stat-positive/10",
                          cat.winner === 'team1' && "text-stat-negative"
                        )}>
                          {formatValue(cat.val2, cat.format)}
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
