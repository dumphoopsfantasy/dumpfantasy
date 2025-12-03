import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Trophy, Upload, RefreshCw } from "lucide-react";

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

const CATEGORIES = [
  { key: 'fgPct', label: 'FG%', format: 'pct', lowerIsBetter: false },
  { key: 'ftPct', label: 'FT%', format: 'pct', lowerIsBetter: false },
  { key: 'threepm', label: '3PM', format: 'num', lowerIsBetter: false },
  { key: 'rebounds', label: 'REB', format: 'num', lowerIsBetter: false },
  { key: 'assists', label: 'AST', format: 'num', lowerIsBetter: false },
  { key: 'steals', label: 'STL', format: 'num', lowerIsBetter: false },
  { key: 'blocks', label: 'BLK', format: 'num', lowerIsBetter: false },
  { key: 'turnovers', label: 'TO', format: 'num', lowerIsBetter: true },
  { key: 'points', label: 'PTS', format: 'num', lowerIsBetter: false },
];

export const WeeklyPerformance = () => {
  const [rawData, setRawData] = useState("");
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [weekTitle, setWeekTitle] = useState("");

  const parseWeeklyData = (data: string): { matchups: Matchup[]; week: string } => {
    const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
    const result: Matchup[] = [];
    let week = "";
    
    // Find week title like "Matchup 7 (Dec 1 - 7)"
    const weekMatch = lines.find(l => l.toLowerCase().includes('matchup') && l.includes('('));
    if (weekMatch) week = weekMatch;
    
    // Look for stat blocks: team abbr followed by 9 numbers
    // Pattern: ABBR .xxxx .xxxx num num num num num num num
    const statLineRegex = /^([A-Z]{2,5})\s+([.\d]+)\s+([.\d]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/;
    
    // Find team matchup headers like "Bilbo (4-2-0, 2nd) 2-7-0"
    const teamHeaderRegex = /^(.+?)\s*\((\d+-\d+-\d+),\s*\d+\w*\)\s*(\d+-\d+-\d+)$/;
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      // Try to match team header
      const team1Match = line.match(teamHeaderRegex);
      if (team1Match) {
        const team1Name = team1Match[1].trim();
        const team1Record = team1Match[2];
        const team1WeekRecord = team1Match[3];
        
        // Look for second team
        i++;
        while (i < lines.length) {
          const team2Match = lines[i].match(teamHeaderRegex);
          if (team2Match) {
            const team2Name = team2Match[1].trim();
            const team2Record = team2Match[2];
            const team2WeekRecord = team2Match[3];
            
            // Now find stat lines
            let team1Stats: number[] | null = null;
            let team2Stats: number[] | null = null;
            let team1Abbr = "";
            let team2Abbr = "";
            
            i++;
            while (i < lines.length && (!team1Stats || !team2Stats)) {
              const statMatch = lines[i].match(statLineRegex);
              if (statMatch) {
                const abbr = statMatch[1];
                const nums = statMatch.slice(2).map(n => parseFloat(n));
                if (!team1Stats) {
                  team1Abbr = abbr;
                  team1Stats = nums;
                } else if (!team2Stats) {
                  team2Abbr = abbr;
                  team2Stats = nums;
                }
              }
              // Stop if we hit next matchup header or specific keywords
              if (lines[i].match(teamHeaderRegex) && team1Stats) break;
              if (lines[i].toLowerCase().includes('matchup') && lines[i].toLowerCase().includes('box')) break;
              i++;
            }
            
            if (team1Stats && team2Stats && team1Stats.length === 9 && team2Stats.length === 9) {
              result.push({
                team1: {
                  abbr: team1Abbr,
                  name: team1Name,
                  record: team1Record,
                  weekRecord: team1WeekRecord,
                  stats: {
                    fgPct: team1Stats[0],
                    ftPct: team1Stats[1],
                    threepm: team1Stats[2],
                    rebounds: team1Stats[3],
                    assists: team1Stats[4],
                    steals: team1Stats[5],
                    blocks: team1Stats[6],
                    turnovers: team1Stats[7],
                    points: team1Stats[8],
                  }
                },
                team2: {
                  abbr: team2Abbr,
                  name: team2Name,
                  record: team2Record,
                  weekRecord: team2WeekRecord,
                  stats: {
                    fgPct: team2Stats[0],
                    ftPct: team2Stats[1],
                    threepm: team2Stats[2],
                    rebounds: team2Stats[3],
                    assists: team2Stats[4],
                    steals: team2Stats[5],
                    blocks: team2Stats[6],
                    turnovers: team2Stats[7],
                    points: team2Stats[8],
                  }
                }
              });
            }
            break;
          }
          i++;
        }
      }
      i++;
    }
    
    return { matchups: result, week };
  };

  const handleParse = () => {
    if (!rawData.trim()) return;
    
    const { matchups: parsed, week } = parseWeeklyData(rawData);
    if (parsed.length > 0) {
      setMatchups(parsed);
      setWeekTitle(week);
    }
  };

  const formatValue = (value: number, format: string) => {
    if (format === 'pct') {
      return `.${value.toFixed(3).slice(2)}`;
    }
    return value.toString();
  };

  const getWinner = (val1: number, val2: number, lowerIsBetter: boolean): 'team1' | 'team2' | 'tie' => {
    if (val1 === val2) return 'tie';
    if (lowerIsBetter) return val1 < val2 ? 'team1' : 'team2';
    return val1 > val2 ? 'team1' : 'team2';
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

This will show each matchup's category breakdown for the week.`}
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-2xl">Weekly Performance</h2>
          {weekTitle && <p className="text-muted-foreground">{weekTitle}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setMatchups([])}>
          <RefreshCw className="w-4 h-4 mr-2" />
          New Import
        </Button>
      </div>

      <div className="grid gap-4">
        {matchups.map((matchup, idx) => {
          const categoryResults = CATEGORIES.map(cat => {
            const val1 = matchup.team1.stats[cat.key as keyof typeof matchup.team1.stats];
            const val2 = matchup.team2.stats[cat.key as keyof typeof matchup.team2.stats];
            return {
              ...cat,
              val1,
              val2,
              winner: getWinner(val1, val2, cat.lowerIsBetter)
            };
          });
          
          const team1Wins = categoryResults.filter(r => r.winner === 'team1').length;
          const team2Wins = categoryResults.filter(r => r.winner === 'team2').length;
          const ties = categoryResults.filter(r => r.winner === 'tie').length;

          return (
            <Card key={idx} className="gradient-card border-border overflow-hidden">
              {/* Matchup Header */}
              <div className="p-4 border-b border-border bg-secondary/20">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-display font-bold">{matchup.team1.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ({matchup.team1.record}) • Week: <span className={team1Wins > team2Wins ? 'text-stat-positive' : 'text-stat-negative'}>{matchup.team1.weekRecord}</span>
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
                    <p className="font-display font-bold">{matchup.team2.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ({matchup.team2.record}) • Week: <span className={team2Wins > team1Wins ? 'text-stat-positive' : 'text-stat-negative'}>{matchup.team2.weekRecord}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-2 text-left font-display">{matchup.team1.abbr}</th>
                      {CATEGORIES.map(cat => (
                        <th key={cat.key} className="p-2 text-center font-display text-muted-foreground">{cat.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="p-2 font-semibold">{matchup.team1.abbr}</td>
                      {categoryResults.map(cat => (
                        <td key={cat.key} className={cn(
                          "p-2 text-center font-display",
                          cat.winner === 'team1' && "text-stat-positive font-bold",
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
                          "p-2 text-center font-display",
                          cat.winner === 'team2' && "text-stat-positive font-bold",
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