import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Trophy, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LeagueTeam } from "@/types/league";
import { cn } from "@/lib/utils";

export const LeagueStandings = () => {
  const [rawData, setRawData] = useState("");
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const { toast } = useToast();

  const parseLeagueData = (data: string): LeagueTeam[] => {
    const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
    const result: LeagueTeam[] = [];
    
    // Find where "Season Stats" section starts
    let seasonStatsStart = lines.findIndex(l => l.toLowerCase().includes('season stats'));
    if (seasonStatsStart === -1) {
      // Try to find by looking for the pattern of team names
      seasonStatsStart = 0;
    }
    
    // Collect team names with managers and their stats
    const teamEntries: { name: string; manager: string }[] = [];
    const statValues: number[] = [];
    const records: string[] = [];
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      // Skip header lines
      if (line.toLowerCase() === 'rk' || 
          line.toLowerCase() === 'team' ||
          line.toLowerCase() === 'all' ||
          line.toLowerCase() === 'last' ||
          line.toLowerCase() === 'moves' ||
          line.toLowerCase().includes('fg%') ||
          line.toLowerCase().includes('season stats') ||
          line.toLowerCase().includes('projected') ||
          line.toLowerCase().includes('playoff')) {
        i++;
        continue;
      }
      
      // Check for manager line (in parentheses)
      if (line.startsWith('(') && line.endsWith(')')) {
        if (teamEntries.length > 0 && !teamEntries[teamEntries.length - 1].manager) {
          teamEntries[teamEntries.length - 1].manager = line.slice(1, -1).trim();
        }
        i++;
        continue;
      }
      
      // Check if this is a record (W-L-T format like "8-1-0")
      const recordMatch = line.match(/^(\d+-\d+-\d+)$/);
      if (recordMatch) {
        records.push(recordMatch[1]);
        i++;
        continue;
      }
      
      // Check if this is just a rank number (1-20)
      if (line.match(/^\d+$/) && parseInt(line) <= 30) {
        i++;
        continue;
      }
      
      // Check if this is a number (stat value like .4853 or 398)
      const numMatch = line.match(/^[.\d]+$/);
      if (numMatch) {
        statValues.push(parseFloat(line));
        i++;
        continue;
      }
      
      // Otherwise it's likely a team name (non-numeric, more than 2 chars)
      if (line.length > 2 && !line.match(/^[\d.]+$/)) {
        teamEntries.push({ name: line, manager: '' });
      }
      
      i++;
    }
    
    // We expect 9 stats per team (FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS)
    const statsPerTeam = 9;
    const numTeams = teamEntries.length;
    
    if (numTeams > 0 && statValues.length >= numTeams * statsPerTeam) {
      for (let t = 0; t < numTeams; t++) {
        const startIdx = t * statsPerTeam;
        const stats = statValues.slice(startIdx, startIdx + statsPerTeam);
        
        result.push({
          name: teamEntries[t].name,
          manager: teamEntries[t].manager,
          fgPct: stats[0] || 0,
          ftPct: stats[1] || 0,
          threepm: stats[2] || 0,
          rebounds: stats[3] || 0,
          assists: stats[4] || 0,
          steals: stats[5] || 0,
          blocks: stats[6] || 0,
          turnovers: stats[7] || 0,
          points: stats[8] || 0,
          record: records[t] || '',
        });
      }
    }

    return result;
  };

  const handleParse = () => {
    if (!rawData.trim()) {
      toast({
        title: "No data",
        description: "Please paste your league standings data",
        variant: "destructive",
      });
      return;
    }

    const parsed = parseLeagueData(rawData);
    if (parsed.length === 0) {
      toast({
        title: "No teams found",
        description: "Could not parse league data. Try copying the entire page from ESPN standings.",
        variant: "destructive",
      });
      return;
    }

    setTeams(parsed);
    toast({
      title: "Success!",
      description: `Loaded ${parsed.length} teams`,
    });
  };

  const getCategoryRank = (team: LeagueTeam, category: keyof LeagueTeam, isLowerBetter = false) => {
    const sorted = [...teams].sort((a, b) => {
      const aVal = a[category] as number;
      const bVal = b[category] as number;
      return isLowerBetter ? aVal - bVal : bVal - aVal;
    });
    return sorted.findIndex(t => t.name === team.name) + 1;
  };

  const getRankColor = (rank: number, total: number) => {
    if (rank <= 3) return 'bg-stat-positive/20 text-stat-positive';
    if (rank >= total - 2) return 'bg-stat-negative/20 text-stat-negative';
    return '';
  };

  const categories = [
    { key: 'fgPct' as keyof LeagueTeam, label: 'FG%', format: (v: number) => v < 1 ? `.${Math.round(v * 10000).toString().slice(0,4)}` : `${v.toFixed(1)}%` },
    { key: 'ftPct' as keyof LeagueTeam, label: 'FT%', format: (v: number) => v < 1 ? `.${Math.round(v * 10000).toString().slice(0,4)}` : `${v.toFixed(1)}%` },
    { key: 'threepm' as keyof LeagueTeam, label: '3PM', format: (v: number) => v.toFixed(0) },
    { key: 'rebounds' as keyof LeagueTeam, label: 'REB', format: (v: number) => v.toFixed(0) },
    { key: 'assists' as keyof LeagueTeam, label: 'AST', format: (v: number) => v.toFixed(0) },
    { key: 'steals' as keyof LeagueTeam, label: 'STL', format: (v: number) => v.toFixed(0) },
    { key: 'blocks' as keyof LeagueTeam, label: 'BLK', format: (v: number) => v.toFixed(0) },
    { key: 'turnovers' as keyof LeagueTeam, label: 'TO', format: (v: number) => v.toFixed(0), lowerBetter: true },
    { key: 'points' as keyof LeagueTeam, label: 'PTS', format: (v: number) => v.toFixed(0) },
  ];

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">League Category Rankings</h2>
        <Button variant="outline" size="sm" onClick={() => setTeams([])}>
          <RefreshCw className="w-4 h-4 mr-2" />
          New Import
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-2 font-display sticky left-0 bg-background">RK</th>
              <th className="text-left p-2 font-display sticky left-0 bg-background min-w-[150px]">Team</th>
              {categories.map(c => (
                <th key={c.key} className="text-center p-2 font-display min-w-[70px]">{c.label}</th>
              ))}
              <th className="text-center p-2 font-display">Record</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-2 font-bold text-primary">{i + 1}</td>
                <td className="p-2">
                  <div className="font-semibold">{team.name}</div>
                  {team.manager && (
                    <div className="text-xs text-muted-foreground">{team.manager}</div>
                  )}
                </td>
                {categories.map(c => {
                  const rank = getCategoryRank(team, c.key, c.lowerBetter);
                  const value = team[c.key] as number;
                  return (
                    <td key={c.key} className="text-center p-2">
                      <div className={cn(
                        "rounded px-1 py-0.5 inline-block min-w-[50px]",
                        getRankColor(rank, teams.length)
                      )}>
                        <span className="font-semibold">{c.format(value)}</span>
                        <span className="text-xs text-muted-foreground ml-1">#{rank}</span>
                      </div>
                    </td>
                  );
                })}
                <td className="text-center p-2 font-semibold">
                  {team.record || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
