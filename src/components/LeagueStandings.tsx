import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Trophy, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LeagueTeam } from "@/types/league";
import { cn } from "@/lib/utils";
import { CrisToggle } from "@/components/CrisToggle";
import { CrisExplanation } from "@/components/CrisExplanation";
import { calculateCRISForAll, formatPct, CATEGORIES } from "@/lib/crisUtils";

interface TeamWithCris extends LeagueTeam {
  cris: number;
  wCris: number;
}

export const LeagueStandings = () => {
  const [rawData, setRawData] = useState("");
  const [rawTeams, setRawTeams] = useState<LeagueTeam[]>([]);
  const [useCris, setUseCris] = useState(true);
  const { toast } = useToast();

  const parseLeagueData = (data: string): LeagueTeam[] => {
    const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
    const result: LeagueTeam[] = [];
    
    // Method 1: Find "Season Stats" section
    const seasonStatsIdx = lines.findIndex(l => l.toLowerCase() === 'season stats');
    
    // Look for stat values (9 stats per team)
    // Stats appear as individual lines with decimal numbers like .4853 or integers like 398
    const statValues: number[] = [];
    const records: string[] = [];
    const teamEntries: { name: string; manager: string }[] = [];
    
    let inTeamSection = false;
    let inStatsSection = false;
    let inRecordsSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip footers
      if (line.toLowerCase().includes('fantasy basketball support') ||
          line.toLowerCase().includes('copyright')) break;
      
      // Detect sections
      if (line.toLowerCase() === 'season stats') {
        inTeamSection = true;
        continue;
      }
      if (line.toLowerCase() === 'all') {
        inTeamSection = false;
        inStatsSection = true;
        continue;
      }
      if (line.toLowerCase() === 'last') {
        inStatsSection = false;
        inRecordsSection = true;
        continue;
      }
      if (line.toLowerCase() === 'moves') continue;
      
      // Parse team entries (between "Season Stats" and "All")
      if (inTeamSection) {
        // Skip rank numbers
        if (line.match(/^\d+$/) && parseInt(line) <= 20) continue;
        
        // Manager in parentheses
        if (line.startsWith('(') && line.endsWith(')')) {
          if (teamEntries.length > 0 && !teamEntries[teamEntries.length - 1].manager) {
            teamEntries[teamEntries.length - 1].manager = line.slice(1, -1).trim();
          }
          continue;
        }
        
        // Team name - not a number, not a header
        if (!line.match(/^[\d.]+$/) && 
            !['rk', 'team', 'fg%', 'ft%'].includes(line.toLowerCase()) &&
            line.length > 2) {
          teamEntries.push({ name: line, manager: '' });
        }
      }
      
      // Parse stats
      if (inStatsSection) {
        if (line.match(/^[.\d]+$/) && !['fg%', 'ft%', '3pm', 'reb', 'ast', 'stl', 'blk', 'to', 'pts'].includes(line.toLowerCase())) {
          statValues.push(parseFloat(line));
        }
      }
      
      // Parse records
      if (inRecordsSection) {
        if (line.match(/^\d+-\d+-\d+$/)) {
          records.push(line);
        }
      }
    }
    
    // Match stats to teams (9 stats per team)
    const numTeams = teamEntries.length;
    if (numTeams > 0 && statValues.length >= numTeams * 9) {
      for (let t = 0; t < numTeams; t++) {
        const s = t * 9;
        result.push({
          name: teamEntries[t].name,
          manager: teamEntries[t].manager,
          fgPct: statValues[s] || 0,
          ftPct: statValues[s + 1] || 0,
          threepm: statValues[s + 2] || 0,
          rebounds: statValues[s + 3] || 0,
          assists: statValues[s + 4] || 0,
          steals: statValues[s + 5] || 0,
          blocks: statValues[s + 6] || 0,
          turnovers: statValues[s + 7] || 0,
          points: statValues[s + 8] || 0,
          record: records[t] || '',
        });
      }
    }

    return result;
  };

  const handleParse = () => {
    if (!rawData.trim()) {
      toast({ title: "No data", description: "Please paste your league standings data", variant: "destructive" });
      return;
    }

    const parsed = parseLeagueData(rawData);
    if (parsed.length === 0) {
      toast({ title: "No teams found", description: "Could not parse league data. Try copying the entire page.", variant: "destructive" });
      return;
    }

    setRawTeams(parsed);
    toast({ title: "Success!", description: `Loaded ${parsed.length} teams` });
  };

  // Calculate CRIS for all teams
  const teams = useMemo((): TeamWithCris[] => {
    if (rawTeams.length === 0) return [];
    return calculateCRISForAll(rawTeams.map(t => ({
      ...t,
      fgPct: t.fgPct,
      ftPct: t.ftPct,
      threepm: t.threepm,
      rebounds: t.rebounds,
      assists: t.assists,
      steals: t.steals,
      blocks: t.blocks,
      turnovers: t.turnovers,
      points: t.points,
    })));
  }, [rawTeams]);

  // Sort by CRIS
  const sortedTeams = useMemo(() => {
    const scoreKey = useCris ? 'cris' : 'wCris';
    return [...teams].sort((a, b) => b[scoreKey] - a[scoreKey]);
  }, [teams, useCris]);

  const getCategoryRank = (team: TeamWithCris, category: keyof LeagueTeam, isLowerBetter = false) => {
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

  const scoreKey = useCris ? 'cris' : 'wCris';
  const scoreLabel = useCris ? 'CRIS' : 'wCRIS';

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold">League Category Rankings</h2>
          <CrisExplanation />
        </div>
        <div className="flex items-center gap-3">
          <CrisToggle useCris={useCris} onChange={setUseCris} />
          <Button variant="outline" size="sm" onClick={() => setRawTeams([])}>
            <RefreshCw className="w-4 h-4 mr-2" />
            New Import
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-2 font-display sticky left-0 bg-background">RK</th>
              <th className="text-left p-2 font-display sticky left-0 bg-background min-w-[150px]">Team</th>
              {CATEGORIES.map(c => (
                <th key={c.key} className="text-center p-2 font-display min-w-[70px]">{c.label}</th>
              ))}
              <th className="text-center p-2 font-display">Record</th>
              <th className="text-center p-2 font-display border-l-2 border-primary/50 min-w-[70px]">{scoreLabel}</th>
            </tr>
          </thead>
          <tbody>
            {sortedTeams.map((team, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-2 font-bold text-primary">{i + 1}</td>
                <td className="p-2">
                  <div className="font-semibold">{team.name}</div>
                  {team.manager && (
                    <div className="text-xs text-muted-foreground">{team.manager}</div>
                  )}
                </td>
                {CATEGORIES.map(c => {
                  const isLowerBetter = c.key === 'turnovers';
                  const rank = getCategoryRank(team, c.key as keyof LeagueTeam, isLowerBetter);
                  const value = team[c.key as keyof TeamWithCris] as number;
                  return (
                    <td key={c.key} className="text-center p-2">
                      <div className={cn(
                        "rounded px-1 py-0.5 inline-block min-w-[50px]",
                        getRankColor(rank, teams.length)
                      )}>
                        <span className="font-semibold">
                          {c.format === 'pct' ? formatPct(value) : value.toFixed(0)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">#{rank}</span>
                      </div>
                    </td>
                  );
                })}
                <td className="text-center p-2 font-semibold">
                  {team.record || '-'}
                </td>
                <td className="text-center p-2 font-bold text-primary border-l-2 border-primary/50">
                  {team[scoreKey].toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
