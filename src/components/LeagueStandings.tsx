import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LeagueTeam } from "@/types/league";
import { cn } from "@/lib/utils";

export const LeagueStandings = () => {
  const [rawData, setRawData] = useState("");
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const { toast } = useToast();

  const parseLeagueData = (data: string): LeagueTeam[] => {
    const lines = data.trim().split('\n').filter(l => l.trim());
    const result: LeagueTeam[] = [];

    // Try to detect if data is tab-separated or multi-line format
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Skip header rows
      if (line.toLowerCase().includes('team') || 
          line.toLowerCase().includes('rank') ||
          line.match(/^(rk|fg%|ft%|3pm|reb|ast|stl|blk|to|pts|all|last|moves)/i)) {
        i++;
        continue;
      }

      // Try to parse as tab-separated row first
      const tabs = line.split('\t').map(c => c.trim()).filter(c => c);
      
      if (tabs.length >= 10) {
        // Tab-separated format: Name, FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, ...
        const teamName = tabs[0];
        const stats = tabs.slice(1).map(v => {
          // Handle percentage values that might be like ".4853"
          const num = parseFloat(v);
          return isNaN(num) ? 0 : num;
        });
        
        if (stats.some(v => v > 0)) {
          result.push({
            name: teamName,
            manager: '',
            fgPct: stats[0] || 0,
            ftPct: stats[1] || 0,
            threepm: stats[2] || 0,
            rebounds: stats[3] || 0,
            assists: stats[4] || 0,
            steals: stats[5] || 0,
            blocks: stats[6] || 0,
            turnovers: stats[7] || 0,
            points: stats[8] || 0,
            record: tabs[10] || '',
          });
        }
        i++;
        continue;
      }

      // Check if this looks like a rank number
      const rankMatch = line.match(/^(\d+)$/);
      if (rankMatch) {
        i++;
        continue;
      }

      // Check if this is a team name line (not starting with a number or stat)
      const isTeamName = !line.match(/^[\d.]+$/) && 
                         !line.match(/^[.\d-]+$/) &&
                         line.length > 2 &&
                         !line.match(/^\d+-\d+-\d+$/);

      if (isTeamName) {
        let teamName = line;
        let manager = '';
        
        // Check if next line is manager name in parentheses
        if (i + 1 < lines.length && lines[i + 1].trim().startsWith('(')) {
          const managerLine = lines[i + 1].trim();
          manager = managerLine.replace(/[()]/g, '').trim();
          i++;
        }
        
        // Extract manager from same line if in parentheses
        const parenthMatch = teamName.match(/(.+?)\s*\(([^)]+)\)/);
        if (parenthMatch) {
          teamName = parenthMatch[1].trim();
          manager = parenthMatch[2].trim();
        }

        // Now look for stats in subsequent lines
        const stats: number[] = [];
        let j = i + 1;
        while (j < lines.length && stats.length < 10) {
          const statLine = lines[j].trim();
          
          // Stop if we hit another team name or header
          if (statLine.match(/^[A-Za-z]/) && !statLine.match(/^[.\d]+$/)) {
            break;
          }
          
          // Parse numbers from this line
          const nums = statLine.split(/[\s\t]+/).map(v => {
            const num = parseFloat(v);
            return isNaN(num) ? null : num;
          }).filter(n => n !== null) as number[];
          
          stats.push(...nums);
          j++;
        }

        if (stats.length >= 9 && stats.some(v => v > 0)) {
          result.push({
            name: teamName,
            manager: manager,
            fgPct: stats[0] || 0,
            ftPct: stats[1] || 0,
            threepm: stats[2] || 0,
            rebounds: stats[3] || 0,
            assists: stats[4] || 0,
            steals: stats[5] || 0,
            blocks: stats[6] || 0,
            turnovers: stats[7] || 0,
            points: stats[8] || 0,
            record: stats[9]?.toString() || '',
          });
          i = j;
          continue;
        }
      }
      
      i++;
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
        description: "Could not parse league data. Try copying the full standings table from ESPN.",
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
    { key: 'fgPct' as keyof LeagueTeam, label: 'FG%', format: (v: number) => v < 1 ? `${(v * 100).toFixed(1)}%` : `${v.toFixed(1)}%` },
    { key: 'ftPct' as keyof LeagueTeam, label: 'FT%', format: (v: number) => v < 1 ? `${(v * 100).toFixed(1)}%` : `${v.toFixed(1)}%` },
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
              Paste your league's season category totals from ESPN
            </p>
          </div>
        </div>

        <Textarea
          placeholder={`Paste league standings data from ESPN. Example format:

Wooden Nickelers
  (Quentin Lee)
.4853  .8036  398  1643  1012  233  214  568  4586  8-1-0

Or tab-separated:
Team Name	.4853	.8036	398	1643	1012	233	214	568	4586`}
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
