import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Trophy, Upload, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatPct, CATEGORIES } from "@/lib/crisUtils";

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

export const WeeklyPerformance = () => {
  const [rawData, setRawData] = useState("");
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [weekTitle, setWeekTitle] = useState("");
  const { toast } = useToast();

  const parseWeeklyData = (data: string): { matchups: Matchup[]; week: string } => {
    const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
    const result: Matchup[] = [];
    let week = "";
    
    // Find week title like "Matchup 7 (Dec 1 - 7)"
    const weekMatch = lines.find(l => l.toLowerCase().includes('matchup') && l.includes('(') && l.includes('-'));
    if (weekMatch) week = weekMatch;
    
    // Look for team abbreviation followed by 9 stat numbers on same or subsequent lines
    // ESPN format can be: ABBR .485 .812 52 198 112 42 24 58 542
    // Or spread across lines
    
    interface TeamBlock {
      abbr: string;
      name: string;
      record: string;
      stats: number[];
    }
    
    const teamBlocks: TeamBlock[] = [];
    
    // Find stat rows - look for lines with abbreviation followed by numbers
    const statRowRegex = /^([A-Za-z]{2,6})\s+([.\d]+)\s+([.\d]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(statRowRegex);
      if (match) {
        teamBlocks.push({
          abbr: match[1],
          name: match[1],
          record: '',
          stats: match.slice(2).map(n => parseFloat(n))
        });
      }
    }
    
    // If no inline stat rows found, try separate parsing
    if (teamBlocks.length === 0) {
      // Look for team abbreviations (2-4 letters that appear before stats)
      const abbrs: string[] = [];
      const statSets: number[][] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this is a potential team abbreviation
        if (/^[A-Z]{2,6}$/i.test(line) && !['FG', 'FT', 'PM', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PTS'].includes(line.toUpperCase())) {
          // Look ahead for 9 numbers
          const nums: number[] = [];
          for (let j = i + 1; j < lines.length && nums.length < 9; j++) {
            const numLine = lines[j];
            if (/^[.\d]+$/.test(numLine)) {
              nums.push(parseFloat(numLine));
            } else if (nums.length > 0) {
              break; // Stop if we hit non-numbers after finding some
            }
          }
          
          if (nums.length >= 9) {
            abbrs.push(line);
            statSets.push(nums.slice(0, 9));
          }
        }
      }
      
      // Match abbrs with stats
      for (let i = 0; i < Math.min(abbrs.length, statSets.length); i++) {
        teamBlocks.push({
          abbr: abbrs[i],
          name: abbrs[i],
          record: '',
          stats: statSets[i]
        });
      }
    }
    
    // Find team names and records
    const teamNameRecordRegex = /^(.+)\s*\((\d+-\d+-\d+),/;
    const teamRecords: { name: string; record: string }[] = [];
    
    for (const line of lines) {
      const match = line.match(teamNameRecordRegex);
      if (match) {
        teamRecords.push({
          name: match[1].trim(),
          record: match[2]
        });
      }
    }
    
    // Look for week records (standalone W-L-T patterns)
    const weekRecords: string[] = [];
    for (const line of lines) {
      if (/^\d-\d-\d$/.test(line)) {
        weekRecords.push(line);
      }
    }
    
    // Build matchups (pair consecutive teams)
    for (let i = 0; i + 1 < teamBlocks.length; i += 2) {
      const block1 = teamBlocks[i];
      const block2 = teamBlocks[i + 1];
      
      result.push({
        team1: {
          abbr: block1.abbr,
          name: teamRecords[i]?.name || block1.name,
          record: teamRecords[i]?.record || '',
          weekRecord: weekRecords[i] || '',
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
          name: teamRecords[i + 1]?.name || block2.name,
          record: teamRecords[i + 1]?.record || '',
          weekRecord: weekRecords[i + 1] || '',
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

  const formatValue = (value: number, format: string) => {
    if (format === 'pct') return formatPct(value);
    return value.toString();
  };

  const getWinner = (val1: number, val2: number, key: string): 'team1' | 'team2' | 'tie' => {
    if (val1 === val2) return 'tie';
    if (key === 'turnovers') return val1 < val2 ? 'team1' : 'team2';
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
              winner: getWinner(val1, val2, cat.key)
            };
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
                    <p className="text-xs text-muted-foreground">
                      {matchup.team1.record && `(${matchup.team1.record})`}
                      {matchup.team1.weekRecord && (
                        <span className={cn("ml-1", team1Wins > team2Wins ? 'text-stat-positive' : team1Wins < team2Wins ? 'text-stat-negative' : '')}>
                          {matchup.team1.weekRecord}
                        </span>
                      )}
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
                      {matchup.team2.record && `(${matchup.team2.record})`}
                      {matchup.team2.weekRecord && (
                        <span className={cn("ml-1", team2Wins > team1Wins ? 'text-stat-positive' : team2Wins < team1Wins ? 'text-stat-negative' : '')}>
                          {matchup.team2.weekRecord}
                        </span>
                      )}
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
                          "p-2 text-center font-display",
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
