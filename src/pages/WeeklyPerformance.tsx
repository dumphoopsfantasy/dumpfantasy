import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Trophy, Upload, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPct, CATEGORIES, calculateCRISForAll } from "@/lib/crisUtils";

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
    const lines = data.split('\n').map(l => l.trim()).filter(l => l);
    const result: Matchup[] = [];
    let week = "";
    
    // Skip ESPN navigation - find "Scoreboard" and only parse after that
    const scoreboardIdx = lines.findIndex(l => l.toLowerCase() === 'scoreboard');
    const startIdx = scoreboardIdx > -1 ? scoreboardIdx + 1 : 0;
    
    // Filter out ESPN navigation items
    const skipPatterns = /^(ESPN|NFL|NBA|MLB|NCAAF|NHL|Soccer|WNBA|More Sports|Watch|Fantasy|Where to Watch|hsb\.|Copyright|Fantasy Basketball Home|My Team|League|Settings|Members|Rosters|Schedule|Message Board|Transaction Counter|History|Draft Recap|Email League|Recent Activity|Players|Add Players|Watch List|Daily Leaders|Live Draft Trends|Added \/ Dropped|Player Rater|Player News|Projections|Waiver Order|Waiver Report|Undroppables|FantasyCast|Standings|Opposing Teams|ESPN BET|Fantasy Games|Help|Interest-Based Ads|Do Not Sell My Info|Member Services)$/i;
    
    const relevantLines = lines.slice(startIdx).filter(l => !skipPatterns.test(l));
    
    // Find week title like "Matchup 7 (Dec 1 - 7)"
    const weekMatch = relevantLines.find(l => l.toLowerCase().includes('matchup') && l.includes('('));
    if (weekMatch) week = weekMatch;
    
    // NEW PARSING APPROACH: Look for team header + current matchup W-L-T blocks
    // Pattern: "Team Name (W-L-T, Nth)" followed by current matchup "W-L-T" on next line
    interface ParsedTeamData {
      name: string;
      seasonRecord: string;
      standing: string;
      currentMatchupRecord: string; // W-L-T for this week's matchup
    }
    
    const teamDataBlocks: ParsedTeamData[] = [];
    
    // Team header pattern: "Team Name (5-2-0, 2nd)" or "Team Name (4-3-0, 5th)"
    const teamHeaderPattern = /^(.+?)\s*\((\d+-\d+-\d+),\s*(\d+)(st|nd|rd|th)\)$/i;
    // Current matchup record pattern: strict W-L-T format
    const currentMatchupPattern = /^(\d+)-(\d+)-(\d+)$/;
    
    for (let i = 0; i < relevantLines.length; i++) {
      const line = relevantLines[i];
      const headerMatch = line.match(teamHeaderPattern);
      
      if (headerMatch) {
        const teamName = headerMatch[1].trim();
        const seasonRecord = headerMatch[2];
        const standing = `${headerMatch[3]}${headerMatch[4]}`;
        
        // Look for the current matchup W-L-T on the next non-empty line
        let currentMatchupRecord = "—";
        for (let j = i + 1; j < Math.min(i + 5, relevantLines.length); j++) {
          const nextLine = relevantLines[j];
          // Skip stat headers
          if (/^(FG%|FT%|3PM|REB|AST|STL|BLK|TO|PTS)$/i.test(nextLine)) continue;
          
          const matchupMatch = nextLine.match(currentMatchupPattern);
          if (matchupMatch) {
            // Format as W-L-T, always include ties
            currentMatchupRecord = `${matchupMatch[1]}-${matchupMatch[2]}-${matchupMatch[3]}`;
            break;
          }
        }
        
        teamDataBlocks.push({
          name: teamName,
          seasonRecord,
          standing,
          currentMatchupRecord
        });
      }
    }
    
    // Look for team stat blocks (for category values)
    interface TeamBlock {
      abbr: string;
      name: string;
      record: string;
      weekRecord: string;
      stats: number[];
    }
    
    const teamBlocks: TeamBlock[] = [];
    
    // Try inline format first: ABBR .485 .812 52 198 112 42 24 58 542
    const inlineStatRegex = /^([A-Za-z]{2,6})\s+\.?(\d{3})\s+\.?(\d{3})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
    
    for (const line of relevantLines) {
      const match = line.match(inlineStatRegex);
      if (match) {
        teamBlocks.push({
          abbr: match[1].toUpperCase(),
          name: match[1].toUpperCase(),
          record: '',
          weekRecord: '',
          stats: [
            parseFloat('0.' + match[2]),
            parseFloat('0.' + match[3]),
            parseInt(match[4]),
            parseInt(match[5]),
            parseInt(match[6]),
            parseInt(match[7]),
            parseInt(match[8]),
            parseInt(match[9]),
            parseInt(match[10]),
          ]
        });
      }
    }
    
    // If no inline stats, try separate line parsing
    if (teamBlocks.length === 0) {
      let currentTeam: TeamBlock | null = null;
      let collectingStats = false;
      let currentStats: number[] = [];
      
      for (let i = 0; i < relevantLines.length; i++) {
        const line = relevantLines[i];
        
        if (/^[A-Z]{2,6}$/i.test(line) && 
            !['FG', 'FT', 'PM', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PTS', 'MIN'].includes(line.toUpperCase())) {
          if (currentTeam && currentStats.length >= 9) {
            currentTeam.stats = currentStats.slice(0, 9);
            teamBlocks.push(currentTeam);
          }
          
          currentTeam = {
            abbr: line.toUpperCase(),
            name: line.toUpperCase(),
            record: '',
            weekRecord: '',
            stats: []
          };
          collectingStats = true;
          currentStats = [];
          continue;
        }
        
        if (collectingStats && currentTeam) {
          if (/^\.?\d+$/.test(line)) {
            const val = line.startsWith('.') ? parseFloat(line) : parseFloat(line);
            currentStats.push(val);
          }
          
          if (currentStats.length >= 9) {
            currentTeam.stats = currentStats;
            teamBlocks.push(currentTeam);
            currentTeam = null;
            collectingStats = false;
            currentStats = [];
          }
        }
      }
      
      if (currentTeam && currentStats.length >= 9) {
        currentTeam.stats = currentStats.slice(0, 9);
        teamBlocks.push(currentTeam);
      }
    }
    
    // Build matchups by pairing consecutive team data blocks
    // Use teamDataBlocks for name/record/matchupRecord, and teamBlocks for stats
    for (let i = 0; i + 1 < teamBlocks.length; i += 2) {
      const block1 = teamBlocks[i];
      const block2 = teamBlocks[i + 1];
      
      // Match with teamDataBlocks based on index
      const teamData1 = teamDataBlocks[i] || { 
        name: block1.abbr, 
        seasonRecord: '', 
        standing: '', 
        currentMatchupRecord: '—' 
      };
      const teamData2 = teamDataBlocks[i + 1] || { 
        name: block2.abbr, 
        seasonRecord: '', 
        standing: '', 
        currentMatchupRecord: '—' 
      };
      
      result.push({
        team1: {
          abbr: block1.abbr,
          name: teamData1.name,
          record: teamData1.seasonRecord,
          weekRecord: teamData1.currentMatchupRecord,
          stats: {
            fgPct: block1.stats[0],
            ftPct: block1.stats[1],
            threepm: block1.stats[2],
            rebounds: block1.stats[3],
            assists: block1.stats[4],
            steals: block1.stats[5],
            blocks: block1.stats[6],
            turnovers: block1.stats[7],
            points: block1.stats[8],
          }
        },
        team2: {
          abbr: block2.abbr,
          name: teamData2.name,
          record: teamData2.seasonRecord,
          weekRecord: teamData2.currentMatchupRecord,
          stats: {
            fgPct: block2.stats[0],
            ftPct: block2.stats[1],
            threepm: block2.stats[2],
            rebounds: block2.stats[3],
            assists: block2.stats[4],
            steals: block2.stats[5],
            blocks: block2.stats[6],
            turnovers: block2.stats[7],
            points: block2.stats[8],
          }
        }
      });
    }
    
    return { matchups: result, week };
  };

  const handleParse = () => {
    if (!rawData.trim()) {
      toast({
        title: "No data",
        description: "Please paste your weekly scoreboard data first",
        variant: "destructive",
      });
      return;
    }
    
    const { matchups: parsed, week } = parseWeeklyData(rawData);
    if (parsed.length > 0) {
      setMatchups(parsed);
      setWeekTitle(week);
      toast({
        title: "Success!",
        description: `Loaded ${parsed.length} matchups`,
      });
    } else {
      toast({
        title: "No matchups found",
        description: "Could not parse any matchup data. Try copying the entire ESPN scoreboard page.",
        variant: "destructive",
      });
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

        <Button onClick={handleParse} className="w-full gradient-primary font-display font-bold">
          <Upload className="w-4 h-4 mr-2" />
          Load Weekly Data
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
    
    return [
      { 
        matchupIdx, 
        team: matchup.team1, 
        opponent: matchup.team2,
        cri: team1CRIS.cri,
        wCri: team1CRIS.wCri,
        weekWins: team1Wins,
        weekLosses: team2Wins,
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
                        <div className="font-semibold text-base">{row.team.name}</div>
                        <div className="text-sm text-muted-foreground">
                          vs {row.opponent.abbr}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={cn(
                        "font-bold text-base",
                        row.weekWins > row.weekLosses ? "text-stat-positive" : 
                        row.weekWins < row.weekLosses ? "text-stat-negative" : "text-muted-foreground"
                      )}>
                        {row.team.weekRecord && row.team.weekRecord !== '—' 
                          ? row.team.weekRecord 
                          : `${row.weekWins}-${row.weekLosses}-0`}
                      </span>
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
                    <p className="font-display font-bold">{matchup.team1.name}</p>
                    <p className="text-xs text-muted-foreground">{matchup.team1.abbr}</p>
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
                    <p className="font-display font-bold">{matchup.team2.name}</p>
                    <p className="text-xs text-muted-foreground">{matchup.team2.abbr}</p>
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
