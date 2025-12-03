import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORIES } from "@/types/fantasy";
import { sampleWeeklyStats } from "@/data/sampleData";
import { cn } from "@/lib/utils";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";

export const WeeklyPerformance = () => {
  const [selectedWeek, setSelectedWeek] = useState("1");
  const weekData = sampleWeeklyStats.find(w => w.week.toString() === selectedWeek);

  // Calculate category leaders for heatmap
  const getCategoryRank = (value: number, category: string) => {
    if (!weekData) return 0;
    const allValues = weekData.teams.map(t => t.stats[category as keyof typeof t.stats] as number);
    const sorted = [...allValues].sort((a, b) => {
      const cat = CATEGORIES.find(c => c.key === category);
      return cat?.lowerIsBetter ? a - b : b - a;
    });
    return sorted.indexOf(value) + 1;
  };

  const getHeatmapClass = (rank: number, total: number) => {
    const percentile = rank / total;
    if (percentile <= 0.25) return "heatmap-best";
    if (percentile <= 0.5) return "heatmap-good";
    if (percentile <= 0.75) return "heatmap-poor";
    return "heatmap-worst";
  };

  const formatValue = (value: number, format: string) => {
    if (format === 'pct') {
      return value < 1 ? `.${Math.round(value * 1000).toString().padStart(3, '0')}` : `${value.toFixed(1)}%`;
    }
    return value.toFixed(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Week Selector */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-2xl">Weekly Performance</h2>
        <Select value={selectedWeek} onValueChange={setSelectedWeek}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select week" />
          </SelectTrigger>
          <SelectContent>
            {sampleWeeklyStats.map(w => (
              <SelectItem key={w.week} value={w.week.toString()}>
                Week {w.week}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Performance Table */}
      {weekData && (
        <Card className="gradient-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 font-display font-bold text-muted-foreground">Team</th>
                  <th className="text-center p-4 font-display font-bold text-muted-foreground">W-L-T</th>
                  {CATEGORIES.map(cat => (
                    <th key={cat.key} className="text-center p-3 font-display font-bold text-muted-foreground text-sm">
                      {cat.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekData.teams.map((teamData, idx) => (
                  <tr key={teamData.team.id} className={cn(
                    "border-b border-border/50 hover:bg-secondary/20 transition-colors",
                    idx === 0 && "bg-primary/5"
                  )}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {idx === 0 && <Trophy className="w-4 h-4 text-primary" />}
                        <div>
                          <p className="font-display font-bold">{teamData.team.name}</p>
                          {teamData.team.manager && (
                            <p className="text-xs text-muted-foreground">{teamData.team.manager}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-center p-4">
                      <span className="font-display font-bold">
                        <span className="text-stat-positive">{teamData.wins}</span>
                        -
                        <span className="text-stat-negative">{teamData.losses}</span>
                        -
                        <span className="text-muted-foreground">{teamData.ties}</span>
                      </span>
                    </td>
                    {CATEGORIES.map(cat => {
                      const value = teamData.stats[cat.key as keyof typeof teamData.stats] as number;
                      const rank = getCategoryRank(value, cat.key);
                      const totalTeams = weekData.teams.length;
                      
                      return (
                        <td
                          key={cat.key}
                          className={cn(
                            "text-center p-3 transition-colors",
                            getHeatmapClass(rank, totalTeams)
                          )}
                        >
                          <div className="flex flex-col items-center">
                            <span className="font-display font-bold">
                              {formatValue(value, cat.format)}
                            </span>
                            {rank === 1 && (
                              <TrendingUp className="w-3 h-3 text-stat-positive mt-1" />
                            )}
                            {rank === totalTeams && (
                              <TrendingDown className="w-3 h-3 text-stat-negative mt-1" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded heatmap-best" />
          <span className="text-muted-foreground">Best</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded heatmap-good" />
          <span className="text-muted-foreground">Good</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded heatmap-poor" />
          <span className="text-muted-foreground">Below Avg</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded heatmap-worst" />
          <span className="text-muted-foreground">Worst</span>
        </div>
      </div>
    </div>
  );
};