import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Trophy, Upload, RefreshCw } from "lucide-react";
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

  const parseWeeklyData = (data: string): { matchups: Matchup[]; week: string } => {
    const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
    const result: Matchup[] = [];
    let week = "";
    
    // Find week title like "Matchup 7 (Dec 1 - 7)"
    const weekMatch = lines.find(l => l.toLowerCase().includes('matchup') && l.includes('(') && l.includes('-'));
    if (weekMatch) week = weekMatch;
    
    // Find stat blocks: ABBR followed by 9 numbers
    const statBlockRegex = /^([A-Za-z]+)\s+([.\d]+)\s+([.\d]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/;
    
    const statBlocks: { abbr: string; stats: number[] }[] = [];
    
    for (const line of lines) {
      const match = line.match(statBlockRegex);
      if (match) {
        statBlocks.push({
          abbr: match[1],
          stats: match.slice(2).map(n => parseFloat(n))
        });
      }
    }
    
    // Find team name/record headers
    const teamHeaders: { name: string; record: string; weekRecord: string }[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const recordMatch = line.match(/^\((\d+-\d+-\d+),\s*\d+\w*\)$/);
      if (recordMatch && i > 0) {
        const teamName = lines[i - 1];
        const weekRecord = i + 1 < lines.length && lines[i + 1].match(/^\d+-\d+-\d+$/) 
          ? lines[i + 1] 
          : '';
        
        if (teamName && !teamName.match(/^\d/) && teamName.length > 2) {
          teamHeaders.push({
            name: teamName,
            record: recordMatch[1],
            weekRecord
          });
        }
      }
    }
    
    // Match headers with stat blocks in pairs
    for (let i = 0; i + 1 < statBlocks.length; i += 2) {
      const block1 = statBlocks[i];
      const block2 = statBlocks[i + 1];
      
      const header1 = teamHeaders[i] || { name: block1.abbr, record: '', weekRecord: '' };
      const header2 = teamHeaders[i + 1] || { name: block2.abbr, record: '', weekRecord: '' };
      
      result.push({
        team1: {
          abbr: block1.abbr,
          name: header1.name,
          record: header1.record,
          weekRecord: header1.weekRecord,
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
          name: header2.name,
          record: header2.record,
          weekRecord: header2.weekRecord,
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
    if (!rawData.trim()) return;
    
    const { matchups: parsed, week } = parseWeeklyData(rawData);
    if (parsed.length > 0) {
      setMatchups(parsed);
      setWeekTitle(week);
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
