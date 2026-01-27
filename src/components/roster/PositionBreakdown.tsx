/**
 * Position Breakdown Module
 * 
 * Shows positional balance for the roster - compact inline display
 * Includes conference breakdown (East/West)
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RosterSlot } from "@/types/fantasy";
import { NBAGame } from "@/lib/nbaApi";
import { normalizeNbaTeamCode } from "@/lib/scheduleAwareProjection";
import { cn } from "@/lib/utils";
import { Users, Globe } from "lucide-react";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type Position = typeof POSITIONS[number];

// NBA Conference mapping
const EASTERN_CONFERENCE = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND",
  "MIA", "MIL", "NYK", "NY", "ORL", "PHI", "TOR", "WAS"
]);

const WESTERN_CONFERENCE = new Set([
  "DAL", "DEN", "GSW", "GS", "HOU", "LAC", "LAL", "MEM",
  "MIN", "NOP", "NO", "OKC", "PHX", "POR", "SAC", "SAS", "SA", "UTA", "UTAH"
]);

interface PositionBreakdownProps {
  roster: RosterSlot[];
  gamesByDate: Map<string, NBAGame[]>;
  matchupDates: string[];
  isLoading?: boolean;
}

/**
 * Count how many players are eligible for each position (excluding IR)
 */
function countPositionEligibility(roster: RosterSlot[]): Record<Position, number> {
  const counts: Record<Position, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  
  for (const slot of roster) {
    if (slot.slotType === "ir") continue;
    
    const positions = (slot.player.positions || []).map(p => p.toUpperCase());
    for (const pos of POSITIONS) {
      if (positions.includes(pos)) {
        counts[pos]++;
      }
    }
  }
  
  return counts;
}

/**
 * Count remaining games this week per position
 */
function countGamesThisWeek(
  roster: RosterSlot[],
  gamesByDate: Map<string, NBAGame[]>,
  matchupDates: string[]
): Record<Position, number> {
  const counts: Record<Position, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const remainingDates = matchupDates.filter(d => d >= todayStr);
  
  for (const slot of roster) {
    if (slot.slotType === "ir") continue;
    
    const player = slot.player;
    const normalizedTeam = player.nbaTeam ? normalizeNbaTeamCode(player.nbaTeam) : null;
    if (!normalizedTeam) continue;
    
    const positions = (player.positions || []).map(p => p.toUpperCase());
    
    let gamesCount = 0;
    for (const dateStr of remainingDates) {
      const games = gamesByDate.get(dateStr) || [];
      const hasGame = games.some(g => g.homeTeam === normalizedTeam || g.awayTeam === normalizedTeam);
      if (hasGame) gamesCount++;
    }
    
    for (const pos of POSITIONS) {
      if (positions.includes(pos)) {
        counts[pos] += gamesCount;
      }
    }
  }
  
  return counts;
}

/**
 * Count players by conference (excluding IR)
 */
function countByConference(roster: RosterSlot[]): { east: number; west: number } {
  let east = 0;
  let west = 0;
  
  for (const slot of roster) {
    if (slot.slotType === "ir") continue;
    
    const team = slot.player.nbaTeam?.toUpperCase();
    if (!team) continue;
    
    if (EASTERN_CONFERENCE.has(team)) {
      east++;
    } else if (WESTERN_CONFERENCE.has(team)) {
      west++;
    }
  }
  
  return { east, west };
}

export function PositionBreakdown({
  roster,
  gamesByDate,
  matchupDates,
  isLoading = false,
}: PositionBreakdownProps) {
  const positionCounts = useMemo(() => countPositionEligibility(roster), [roster]);
  
  const gamesPerPosition = useMemo(() => 
    countGamesThisWeek(roster, gamesByDate, matchupDates), 
    [roster, gamesByDate, matchupDates]
  );
  
  const conferenceCounts = useMemo(() => countByConference(roster), [roster]);
  
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-2 bg-card/30 rounded-md border border-border">
        <Skeleton className="h-4 w-4" />
        <div className="flex gap-2">
          {POSITIONS.map(pos => (
            <Skeleton key={pos} className="h-5 w-12" />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-wrap items-center gap-3 p-2 bg-card/30 rounded-md border border-border">
      {/* Position Depth */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Users className="w-3.5 h-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">Depth</span>
      </div>
      
      <div className="flex flex-wrap gap-1.5">
        {POSITIONS.map(pos => {
          const count = positionCounts[pos];
          const games = gamesPerPosition[pos];
          const isDeep = count >= 4;
          const isShallow = count <= 1;
          
          return (
            <Badge
              key={pos}
              variant="outline"
              className={cn(
                "text-[10px] font-mono px-1.5 py-0 h-5 gap-1",
                isDeep && "border-primary/50 bg-primary/10 text-primary",
                isShallow && "border-destructive/50 bg-destructive/10 text-destructive"
              )}
              title={`${count} player${count !== 1 ? 's' : ''} eligible, ${games} games remaining this week`}
            >
              <span className="font-semibold">{pos}</span>
              <span className="opacity-70">{count}</span>
              {games > 0 && (
                <span className="text-muted-foreground text-[9px]">({games}g)</span>
              )}
            </Badge>
          );
        })}
      </div>
      
      {/* Divider */}
      <div className="w-px h-4 bg-border" />
      
      {/* Conference Breakdown */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Globe className="w-3.5 h-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">Conf</span>
      </div>
      
      <div className="flex gap-1.5">
        <Badge
          variant="outline"
          className="text-[10px] font-mono px-1.5 py-0 h-5 gap-1 border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
          title={`${conferenceCounts.east} players from Eastern Conference`}
        >
          <span className="font-semibold">E</span>
          <span className="opacity-80">{conferenceCounts.east}</span>
        </Badge>
        <Badge
          variant="outline"
          className="text-[10px] font-mono px-1.5 py-0 h-5 gap-1 border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-400"
          title={`${conferenceCounts.west} players from Western Conference`}
        >
          <span className="font-semibold">W</span>
          <span className="opacity-80">{conferenceCounts.west}</span>
        </Badge>
      </div>
    </div>
  );
}
