/**
 * MatchupLeftRail - Left sidebar containing Start/Sit Advisor and Rest of Week Planner
 * 
 * This is a compact, sticky sidebar for the matchup page that contains
 * actionable lineup decision tools.
 */

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RosterSlot } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { StartSitAdvisor } from "@/components/StartSitAdvisor";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Users, Calendar } from "lucide-react";

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

interface WeeklyTeam {
  token: string;
  tokenUpper: string;
  name: string;
  recordStanding: string;
  currentMatchup: string;
  stats: MatchupStats;
}

interface WeeklyMatchup {
  teamA: WeeklyTeam;
  teamB: WeeklyTeam;
}

interface MatchupProjectionData {
  myTeam: { name: string; stats: MatchupStats };
  opponent: { name: string; stats: MatchupStats };
}

interface MatchupLeftRailProps {
  roster: RosterSlot[];
  opponentRoster?: RosterSlot[];
  matchupData?: MatchupProjectionData | null;
  weeklyMatchups?: WeeklyMatchup[];
  gamesByDate: Map<string, NBAGame[]>;
  className?: string;
}

export const MatchupLeftRail = ({
  roster,
  opponentRoster,
  matchupData,
  weeklyMatchups = [],
  gamesByDate,
  className,
}: MatchupLeftRailProps) => {
  const [startSitOpen, setStartSitOpen] = useState(true);

  // Only show if we have roster data
  if (roster.length === 0) {
    return (
      <Card className={cn("p-4", className)}>
        <div className="text-center text-muted-foreground text-sm py-8">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Import your roster to see lineup tools</p>
        </div>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Start/Sit Advisor */}
      <Collapsible open={startSitOpen} onOpenChange={setStartSitOpen}>
        <CollapsibleTrigger asChild>
          <Card className="p-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="font-display font-semibold text-sm">Start/Sit Advisor</span>
              </div>
              <ChevronDown className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                startSitOpen && "rotate-180"
              )} />
            </div>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <StartSitAdvisor
            roster={roster}
            opponentRoster={opponentRoster}
            matchupData={matchupData}
            weeklyMatchups={weeklyMatchups}
            gamesByDate={gamesByDate}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
