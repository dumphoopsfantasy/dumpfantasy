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
    
    // Find Season Stats section
    const seasonStatsIdx = lines.findIndex(l => l.toLowerCase() === 'season stats');
    if (seasonStatsIdx === -1) return result;
    
    // After "Season Stats", look for RK then Team headers
    let startIdx = seasonStatsIdx + 1;
    while (startIdx < lines.length && lines[startIdx].toLowerCase() !== 'rk') {
      startIdx++;
    }
    startIdx++; // Skip "RK"
    while (startIdx < lines.length && lines[startIdx].toLowerCase() !== 'team') {
      startIdx++;
    }
    startIdx++; // Skip "Team"
    
    // Now parse teams - format is: rank, team name, (manager), repeated for all teams
    // Then stats section: All, FG%, FT%, etc headers, then 9 stats per team
    // Then LAST, MOVES headers, then record and moves per team
    
    const teamEntries: { name: string; manager: string }[] = [];
    const allStats: number[] = [];
    const records: string[] = [];
    
    let i = startIdx;
    let inStatsSection = false;
    let inRecordsSection = false;
    
    while (i < lines.length) {
      const line = lines[i];
      
      // Skip navigation/footer content
      if (line.toLowerCase().includes('fantasy basketball support') ||
          line.toLowerCase().includes('copyright') ||
          line.toLowerCase().includes('espn.com')) {
        break;
      }
      
      // Check for stats header
      if (line.toLowerCase() === 'all') {
        inStatsSection = true;
        i++;
        // Skip category headers (FG%, FT%, etc)
        while (i < lines.length && !lines[i].match(/^[.\d]+$/)) {
          i++;
        }
        continue;
      }
      
      // Check for LAST/MOVES section
      if (line.toLowerCase() === 'last') {
        inStatsSection = false;
        inRecordsSection = true;
        i++;
        // Skip MOVES header
        if (i < lines.length && lines[i].toLowerCase() === 'moves') i++;
        continue;
      }
      
      // Parse stats (numbers like .4853 or 398)
      if (inStatsSection && line.match(/^[.\d]+$/)) {
        allStats.push(parseFloat(line));
        i++;
        continue;
      }
      
      // Parse records (like 8-1-0)
      if (inRecordsSection && line.match(/^\d+-\d+-\d+$/)) {
        records.push(line);
        i++;
        continue;
      }
      
      // Skip move counts in records section
      if (inRecordsSection && line.match(/^\d+$/) && parseInt(line) < 100) {
        i++;
        continue;
      }
      
      // Before stats section - parsing teams
      if (!inStatsSection && !inRecordsSection) {
        // Skip rank numbers
        if (line.match(/^\d+$/) && parseInt(line) <= 20) {
          i++;
          continue;
        }
        
        // Check for manager (in parentheses)
        if (line.startsWith('(') && line.endsWith(')')) {
          if (teamEntries.length > 0 && !teamEntries[teamEntries.length - 1].manager) {
            teamEntries[teamEntries.length - 1].manager = line.slice(1, -1).trim();
          }
          i++;
          continue;
        }
        
        // Team name - non-numeric, more than 2 chars, not a header
        if (line.length > 2 && 
            !line.match(/^[\d.]+$/) && 
            !['rk', 'team', 'all', 'fg%', 'ft%', '3pm', 'reb', 'ast', 'stl', 'blk', 'to', 'pts', 'last', 'moves'].includes(line.toLowerCase())) {
          teamEntries.push({ name: line, manager: '' });
        }
      }
      
      i++;
    }
    
    // Match stats to teams (9 stats per team)
    const numTeams = teamEntries.length;
    const statsPerTeam = 9;
    
    if (numTeams > 0 && allStats.length >= numTeams * statsPerTeam) {
      for (let t = 0; t < numTeams; t++) {
        const startIdx = t * statsPerTeam;
        const stats = allStats.slice(startIdx, startIdx + statsPerTeam);
        
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

  const formatPct = (v: number) => v < 1 ? `.${v.toFixed(3).slice(2)}` : `${v.toFixed(1)}%`;

  const categories = [
    { key: 'fgPct' as keyof LeagueTeam, label: 'FG%', format: formatPct, highlightLeader: true },
    { key: 'ftPct' as keyof LeagueTeam, label: 'FT%', format: formatPct, highlightLeader: true },
    { key: 'threepm' as keyof LeagueTeam, label: '3PM', format: (v: number) => v.toFixed(0) },
    { key: 'rebounds' as keyof LeagueTeam, label: 'REB', format: (v: number) => v.toFixed(0) },
    { key: 'assists' as keyof LeagueTeam, label: 'AST', format: (v: number) => v.toFixed(0) },
    { key: 'steals' as keyof LeagueTeam, label: 'STL', format: (v: number) => v.toFixed(0) },
    { key: 'blocks' as keyof LeagueTeam, label: 'BLK', format: (v: number) => v.toFixed(0) },
    { key: 'turnovers' as keyof LeagueTeam, label: 'TO', format: (v: number) => v.toFixed(0), lowerBetter: true, highlightLeader: true },
    { key: 'points' as keyof LeagueTeam, label: 'PTS', format: (v: number) => v.toFixed(0) },
  ];

  // Get category leader index
  const getCategoryLeader = (category: keyof LeagueTeam, lowerBetter = false): number => {
    if (teams.length === 0) return -1;
    let leaderIdx = 0;
    for (let i = 1; i < teams.length; i++) {
      const current = teams[i][category] as number;
      const leader = teams[leaderIdx][category] as number;
      if (lowerBetter ? current < leader : current > leader) {
        leaderIdx = i;
      }
    }
    return leaderIdx;
  };

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
                  const isLeader = c.highlightLeader && i === getCategoryLeader(c.key, c.lowerBetter);
                  return (
                    <td key={c.key} className="text-center p-2">
                      <div className={cn(
                        "rounded px-1 py-0.5 inline-block min-w-[50px]",
                        getRankColor(rank, teams.length),
                        isLeader && "ring-2 ring-primary bg-primary/20"
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
