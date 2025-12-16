import { useMemo, useState } from "react";
import { Player, RosterSlot } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { ChevronDown, ChevronUp, Users, TrendingUp, AlertCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface RosterFreeAgentSuggestionsProps {
  freeAgents: Player[];
  leagueTeams: LeagueTeam[];
  roster: (RosterSlot & { player: Player })[];
  onPlayerClick?: (player: Player) => void;
}

// Category keys for comparison
const CATEGORIES = [
  { key: "fgPct", label: "FG%", lowerBetter: false },
  { key: "ftPct", label: "FT%", lowerBetter: false },
  { key: "threepm", label: "3PM", lowerBetter: false },
  { key: "rebounds", label: "REB", lowerBetter: false },
  { key: "assists", label: "AST", lowerBetter: false },
  { key: "steals", label: "STL", lowerBetter: false },
  { key: "blocks", label: "BLK", lowerBetter: false },
  { key: "turnovers", label: "TO", lowerBetter: true },
  { key: "points", label: "PTS", lowerBetter: false },
] as const;

export function RosterFreeAgentSuggestions({ 
  freeAgents, 
  leagueTeams, 
  roster,
  onPlayerClick 
}: RosterFreeAgentSuggestionsProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Find user's team in standings (Mr. Bane)
  const userTeam = leagueTeams.find(t => t.name.toLowerCase().includes('bane'));

  // If no free agents or standings, show message
  if (freeAgents.length === 0) {
    return (
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <p className="text-sm">Import free agents data to see pickup suggestions</p>
        </div>
      </Card>
    );
  }

  // Calculate weak categories based on league standings
  const weakCategories = useMemo(() => {
    if (!userTeam || leagueTeams.length === 0) return [];

    const categoryRanks: { key: string; label: string; rank: number }[] = [];

    CATEGORIES.forEach(cat => {
      const values = leagueTeams.map(t => ({
        team: t.name,
        value: (t[cat.key as keyof LeagueTeam] as number) ?? 0
      }));

      const sorted = [...values].sort((a, b) => 
        cat.lowerBetter ? a.value - b.value : b.value - a.value
      );

      const rank = sorted.findIndex(s => s.team === userTeam.name) + 1;
      categoryRanks.push({ key: cat.key, label: cat.label, rank });
    });

    // Return bottom 3-4 categories (worst rankings)
    return categoryRanks
      .filter(c => c.rank >= leagueTeams.length - 3)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 4);
  }, [userTeam, leagueTeams]);

  // Score free agents based on their strength in weak categories
  const suggestions = useMemo(() => {
    if (weakCategories.length === 0 || freeAgents.length === 0) return [];

    // Rank all free agents by each category
    const categoryFARanks: Record<string, Record<string, number>> = {};
    
    CATEGORIES.forEach(cat => {
      const sorted = [...freeAgents]
        .filter(p => p.minutes > 0)
        .sort((a, b) => {
          const aVal = (a[cat.key as keyof Player] as number) ?? 0;
          const bVal = (b[cat.key as keyof Player] as number) ?? 0;
          return cat.lowerBetter ? aVal - bVal : bVal - aVal;
        });

      categoryFARanks[cat.key] = {};
      sorted.forEach((p, idx) => {
        categoryFARanks[cat.key][p.id] = idx + 1;
      });
    });

    // Score each free agent based on weak categories
    const scored = freeAgents
      .filter(p => p.minutes > 0)
      .map(player => {
        let score = 0;
        const boostCategories: string[] = [];

        weakCategories.forEach(weakCat => {
          const rank = categoryFARanks[weakCat.key]?.[player.id] ?? freeAgents.length;
          // Top 25% in this category = big boost
          if (rank <= freeAgents.length * 0.25) {
            score += 3;
            boostCategories.push(weakCat.label);
          } else if (rank <= freeAgents.length * 0.5) {
            score += 1;
          }
        });

        return { player, score, boostCategories };
      });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [freeAgents, weakCategories]);

  if (suggestions.length === 0 && leagueTeams.length === 0) {
    return (
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <p className="text-sm">Import league standings to see category-based suggestions</p>
        </div>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="gradient-card border-border overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 flex items-center justify-between hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-display font-bold text-sm">Free Agent Suggestions</h3>
              {weakCategories.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  Weak: {weakCategories.map(c => c.label).join(", ")}
                </Badge>
              )}
            </div>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="px-4 pb-4">
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No strong matches found for your weak categories</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {suggestions.map(({ player, boostCategories }) => (
                  <button
                    key={player.id}
                    onClick={() => onPlayerClick?.(player)}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-primary/20 transition-colors text-left"
                  >
                    <PlayerPhoto name={player.name} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{player.name}</p>
                      <div className="flex items-center gap-1">
                        <NBATeamLogo teamCode={player.nbaTeam} size="xs" />
                        <span className="text-[10px] text-muted-foreground">
                          {player.positions?.join("/")}
                        </span>
                      </div>
                      {boostCategories.length > 0 && (
                        <p className="text-[10px] text-stat-positive">
                          +{boostCategories.join(", ")}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
