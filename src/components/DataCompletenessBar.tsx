import { Progress } from "@/components/ui/progress";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlayerStats } from "@/types/player";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";

interface MatchupStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

interface MatchupTeam {
  name: string;
  record: string;
  standing: string;
  owner?: string;
  lastMatchup?: string;
  stats: MatchupStats;
}

interface DataCompletenessBarProps {
  players: PlayerStats[];
  matchupData: {
    myTeam: MatchupTeam;
    opponent: MatchupTeam;
  } | null;
  weeklyMatchups: Array<{
    teamA: { currentMatchup: string };
    teamB: { currentMatchup: string };
  }>;
  freeAgents: Player[];
  leagueTeams: LeagueTeam[];
  onNavigate: (tab: string, openImport?: boolean) => void;
}

interface DataItem {
  id: string;
  label: string;
  complete: boolean;
  tab: string;
}

export const DataCompletenessBar = ({
  players,
  matchupData,
  weeklyMatchups,
  freeAgents,
  leagueTeams,
  onNavigate,
}: DataCompletenessBarProps) => {
  // Check completion status for each data type
  const dataItems: DataItem[] = [
    {
      id: "roster",
      label: "My Roster",
      complete: players.length > 0,
      tab: "roster",
    },
    {
      id: "opponent",
      label: "Opponent",
      complete: Boolean(
        matchupData?.opponent?.name &&
        matchupData.opponent.name !== matchupData.myTeam?.name
      ),
      tab: "matchup",
    },
    {
      id: "weekly",
      label: "Weekly",
      complete: weeklyMatchups.length > 0 && weeklyMatchups.some(m => 
        m.teamA?.currentMatchup?.includes("-") || m.teamB?.currentMatchup?.includes("-")
      ),
      tab: "weekly",
    },
    {
      id: "freeagents",
      label: "Free Agents",
      complete: freeAgents.length === 50,
      tab: "freeagents",
    },
    {
      id: "standings",
      label: "Standings",
      complete: leagueTeams.length > 0 && leagueTeams.some(t => 
        t.fgPct !== undefined && 
        t.ftPct !== undefined && 
        t.threepm !== undefined &&
        t.rebounds !== undefined &&
        t.assists !== undefined &&
        t.steals !== undefined &&
        t.blocks !== undefined &&
        t.turnovers !== undefined &&
        t.points !== undefined
      ),
      tab: "league",
    },
  ];

  const completedCount = dataItems.filter(item => item.complete).length;
  const percentage = (completedCount / dataItems.length) * 100;

  // Generate helper text for what's missing
  const getMissingText = (): string => {
    const missing = dataItems.filter(item => !item.complete);
    if (missing.length === 0) return "All data imported. Full analytics available.";
    
    const firstMissing = missing[0];
    const textMap: Record<string, string> = {
      roster: "Import your roster to enable team analytics.",
      opponent: "Import opponent roster to enable matchup projections.",
      weekly: "Import Weekly Scoreboard to enable live matchup insights.",
      freeagents: "Import 50 Free Agents to enable pickup suggestions.",
      standings: "Import Standings to enable league-wide comparisons.",
    };
    
    return textMap[firstMissing.id] || "Import data to unlock features.";
  };

  const handleChipClick = (item: DataItem) => {
    if (!item.complete) {
      onNavigate(item.tab, true);
    }
  };

  return (
    <div className="bg-card/80 border-b border-border/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-2">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Progress section */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex-1 max-w-xs">
                <Progress value={percentage} className="h-2" />
              </div>
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                Data: {Math.round(percentage)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {getMissingText()}
            </p>
          </div>

          {/* Status chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {dataItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleChipClick(item)}
                disabled={item.complete}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all",
                  item.complete
                    ? "bg-success/20 text-success border border-success/30 cursor-default"
                    : "bg-muted/50 text-muted-foreground border border-border hover:bg-muted hover:border-primary/30 cursor-pointer"
                )}
              >
                {item.complete && <Check className="w-3 h-3" />}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
