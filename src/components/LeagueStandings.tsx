import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LeagueTeam } from "@/types/league";

export const LeagueStandings = () => {
  const [rawData, setRawData] = useState("");
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const { toast } = useToast();

  const parseLeagueData = (data: string): LeagueTeam[] => {
    const lines = data.trim().split('\n').filter(l => l.trim());
    const result: LeagueTeam[] = [];

    for (const line of lines) {
      const cols = line.split('\t').map(c => c.trim());
      
      // Skip header rows
      if (cols[0]?.toLowerCase().includes('team') || cols[0]?.toLowerCase().includes('rank')) continue;
      
      // Look for team name followed by numbers
      if (cols.length >= 10) {
        const name = cols[0] || 'Unknown';
        const values = cols.slice(1).map(v => parseFloat(v) || 0);
        
        if (values.some(v => v > 0)) {
          result.push({
            name: name,
            manager: '',
            fgPct: values[0] || 0,
            ftPct: values[1] || 0,
            threepm: values[2] || 0,
            rebounds: values[3] || 0,
            assists: values[4] || 0,
            steals: values[5] || 0,
            blocks: values[6] || 0,
            turnovers: values[7] || 0,
            points: values[8] || 0,
          });
        }
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
        description: "Could not parse league data. Try copying the full standings table.",
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

  const categories = [
    { key: 'fgPct' as keyof LeagueTeam, label: 'FG%', format: (v: number) => `${(v * 100).toFixed(1)}%` },
    { key: 'ftPct' as keyof LeagueTeam, label: 'FT%', format: (v: number) => `${(v * 100).toFixed(1)}%` },
    { key: 'threepm' as keyof LeagueTeam, label: '3PM', format: (v: number) => v.toFixed(1) },
    { key: 'rebounds' as keyof LeagueTeam, label: 'REB', format: (v: number) => v.toFixed(1) },
    { key: 'assists' as keyof LeagueTeam, label: 'AST', format: (v: number) => v.toFixed(1) },
    { key: 'steals' as keyof LeagueTeam, label: 'STL', format: (v: number) => v.toFixed(1) },
    { key: 'blocks' as keyof LeagueTeam, label: 'BLK', format: (v: number) => v.toFixed(1) },
    { key: 'turnovers' as keyof LeagueTeam, label: 'TO', format: (v: number) => v.toFixed(1), lowerBetter: true },
    { key: 'points' as keyof LeagueTeam, label: 'PTS', format: (v: number) => v.toFixed(1) },
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
              Paste your league's season category totals
            </p>
          </div>
        </div>

        <Textarea
          placeholder="Paste league standings data from ESPN (copy the full table with team names and category stats)..."
          value={rawData}
          onChange={(e) => setRawData(e.target.value)}
          className="min-h-[150px] font-mono text-sm mb-4 bg-muted/50"
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
              <th className="text-left p-2 font-display">Team</th>
              {categories.map(c => (
                <th key={c.key} className="text-center p-2 font-display">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-2 font-semibold">{team.name}</td>
                {categories.map(c => {
                  const rank = getCategoryRank(team, c.key, c.lowerBetter);
                  const value = team[c.key] as number;
                  return (
                    <td key={c.key} className="text-center p-2">
                      <span className={`${rank <= 3 ? 'text-stat-positive font-bold' : rank >= teams.length - 2 ? 'text-stat-negative' : ''}`}>
                        {c.format(value)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">#{rank}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
