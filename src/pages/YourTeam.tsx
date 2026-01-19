import { useState, useMemo } from "react";
import { RosterSlot, Player } from "@/types/fantasy";
import { RosterTable } from "@/components/roster/RosterTable";
import { PlayerDetailSheet } from "@/components/roster/PlayerDetailSheet";
import { PlayerCompareModal } from "@/components/roster/PlayerCompareModal";
import { PositionBreakdown } from "@/components/roster/PositionBreakdown";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CrisExplanation } from "@/components/CrisExplanation";
import { formatPct, CRIS_WEIGHTS } from "@/lib/crisUtils";
import { sampleRoster } from "@/data/sampleData";
import { cn } from "@/lib/utils";
import { GitCompare, X } from "lucide-react";
import { useNBAUpcomingSchedule } from "@/hooks/useNBAUpcomingSchedule";
import { getMatchupWeekDates } from "@/lib/scheduleAwareProjection";

type SlotFilter = "all" | "starter" | "bench" | "ir";

export const YourTeam = () => {
  const [roster] = useState<RosterSlot[]>(sampleRoster);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [useCris, setUseCris] = useState(true);
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  const [sortColumn, setSortColumn] = useState<string>(useCris ? "cri" : "wCri");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [compareSelection, setCompareSelection] = useState<Player[]>([]);

  // Fetch NBA schedule for position breakdown
  const { gamesByDate, isLoading: scheduleLoading } = useNBAUpcomingSchedule(7);
  const matchupDates = useMemo(() => getMatchupWeekDates(), []);

  // Calculate CRI/wCRI using exact logic from user spec
  const { enhancedRoster, categoryRanks, activePlayerCount } = useMemo(() => {
    // Step 1: Identify active players with stats (Starter/Bench only, with min > 0)
    const activePlayersWithStats = roster.filter(
      (slot) =>
        (slot.slotType === "starter" || slot.slotType === "bench") &&
        slot.player.minutes > 0
    );

    const N = activePlayersWithStats.length;
    if (N === 0) return { 
      enhancedRoster: roster.map((slot) => ({ ...slot, player: { ...slot.player } })),
      categoryRanks: {},
      activePlayerCount: 0
    };

    // Step 2: Calculate category ranks (1 = best)
    const categories = [
      { key: "fgPct", higherBetter: true },
      { key: "ftPct", higherBetter: true },
      { key: "threepm", higherBetter: true },
      { key: "rebounds", higherBetter: true },
      { key: "assists", higherBetter: true },
      { key: "steals", higherBetter: true },
      { key: "blocks", higherBetter: true },
      { key: "turnovers", higherBetter: false }, // Lower is better
      { key: "points", higherBetter: true },
    ];

    // Map player id to category scores and ranks
    const categoryScores: Record<string, Record<string, number>> = {};
    const catRanks: Record<string, Record<string, number>> = {};
    activePlayersWithStats.forEach((slot) => {
      categoryScores[slot.player.id] = {};
    });

    categories.forEach((cat) => {
      catRanks[cat.key] = {};
      // Sort players by this category
      const sorted = [...activePlayersWithStats].sort((a, b) => {
        const valA = a.player[cat.key as keyof Player] as number;
        const valB = b.player[cat.key as keyof Player] as number;
        return cat.higherBetter ? valB - valA : valA - valB;
      });

      // Assign scores: best gets N, worst gets 1
      // Assign ranks: best gets 1, worst gets N
      sorted.forEach((slot, idx) => {
        const score = N - idx; // Best (idx=0) gets N, worst gets 1
        categoryScores[slot.player.id][cat.key] = score;
        catRanks[cat.key][slot.player.id] = idx + 1;
      });
    });

    // Step 3: Calculate CRI and wCRI for active players
    const criValues: Record<string, { cri: number; wCri: number }> = {};

    activePlayersWithStats.forEach((slot) => {
      const scores = categoryScores[slot.player.id];
      let cri = 0;
      let wCri = 0;

      cri += scores.fgPct + scores.ftPct + scores.threepm + scores.rebounds +
             scores.assists + scores.steals + scores.blocks + scores.turnovers + scores.points;

      wCri += scores.fgPct * CRIS_WEIGHTS.fgPct;
      wCri += scores.ftPct * CRIS_WEIGHTS.ftPct;
      wCri += scores.threepm * CRIS_WEIGHTS.threepm;
      wCri += scores.rebounds * CRIS_WEIGHTS.rebounds;
      wCri += scores.assists * CRIS_WEIGHTS.assists;
      wCri += scores.steals * CRIS_WEIGHTS.steals;
      wCri += scores.blocks * CRIS_WEIGHTS.blocks;
      wCri += scores.turnovers * CRIS_WEIGHTS.turnovers;
      wCri += scores.points * CRIS_WEIGHTS.points;

      criValues[slot.player.id] = { cri, wCri };
    });

    // Step 4: Calculate ranks (1 = highest CRI/wCRI)
    const criRanks: Record<string, number> = {};
    const wCriRanks: Record<string, number> = {};

    const sortedByCri = [...activePlayersWithStats].sort(
      (a, b) => criValues[b.player.id].cri - criValues[a.player.id].cri
    );
    sortedByCri.forEach((slot, idx) => {
      criRanks[slot.player.id] = idx + 1;
    });

    const sortedByWCri = [...activePlayersWithStats].sort(
      (a, b) => criValues[b.player.id].wCri - criValues[a.player.id].wCri
    );
    sortedByWCri.forEach((slot, idx) => {
      wCriRanks[slot.player.id] = idx + 1;
    });

    // Step 5: Enhance all roster slots with CRI data
    const finalRoster = roster.map((slot) => {
      const isActiveWithStats =
        (slot.slotType === "starter" || slot.slotType === "bench") &&
        slot.player.minutes > 0;

      if (isActiveWithStats && criValues[slot.player.id]) {
        return {
          ...slot,
          player: {
            ...slot.player,
            cri: criValues[slot.player.id].cri,
            wCri: criValues[slot.player.id].wCri,
            criRank: criRanks[slot.player.id],
            wCriRank: wCriRanks[slot.player.id],
          },
        };
      }

      // IR players or players without stats - no CRI
      return {
        ...slot,
        player: {
          ...slot.player,
          cri: undefined,
          wCri: undefined,
          criRank: undefined,
          wCriRank: undefined,
        },
      };
    });

    return { enhancedRoster: finalRoster, categoryRanks: catRanks, activePlayerCount: N };
  }, [roster]);

  // Filter by slot type
  const filteredRoster = useMemo(() => {
    if (slotFilter === "all") return enhancedRoster;
    return enhancedRoster.filter((slot) => slot.slotType === slotFilter);
  }, [enhancedRoster, slotFilter]);

  // Sort roster
  const sortedRoster = useMemo(() => {
    return [...filteredRoster].sort((a, b) => {
      const playerA = a.player;
      const playerB = b.player;
      let valA: number | undefined;
      let valB: number | undefined;

      switch (sortColumn) {
        case "cri":
          valA = playerA.cri;
          valB = playerB.cri;
          break;
        case "wCri":
          valA = playerA.wCri;
          valB = playerB.wCri;
          break;
        case "min":
          valA = playerA.minutes;
          valB = playerB.minutes;
          break;
        case "fgPct":
          valA = playerA.fgPct;
          valB = playerB.fgPct;
          break;
        case "ftPct":
          valA = playerA.ftPct;
          valB = playerB.ftPct;
          break;
        case "threepm":
          valA = playerA.threepm;
          valB = playerB.threepm;
          break;
        case "rebounds":
          valA = playerA.rebounds;
          valB = playerB.rebounds;
          break;
        case "assists":
          valA = playerA.assists;
          valB = playerB.assists;
          break;
        case "steals":
          valA = playerA.steals;
          valB = playerB.steals;
          break;
        case "blocks":
          valA = playerA.blocks;
          valB = playerB.blocks;
          break;
        case "turnovers":
          valA = playerA.turnovers;
          valB = playerB.turnovers;
          // Lower is better for TO, so reverse
          if (sortDirection === "desc") {
            return (valA ?? Infinity) - (valB ?? Infinity);
          }
          return (valB ?? 0) - (valA ?? 0);
        case "points":
          valA = playerA.points;
          valB = playerB.points;
          break;
        default:
          return 0;
      }

      // Handle undefined values (push to end)
      if (valA === undefined && valB === undefined) return 0;
      if (valA === undefined) return 1;
      if (valB === undefined) return -1;

      return sortDirection === "desc" ? valB - valA : valA - valB;
    });
  }, [filteredRoster, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const handleToggleCris = (useCriMode: boolean) => {
    setUseCris(useCriMode);
    setSortColumn(useCriMode ? "cri" : "wCri");
    setSortDirection("desc");
  };

  // Compare player toggle
  const handleCompareToggle = (player: Player) => {
    setCompareSelection((prev) => {
      const isSelected = prev.some((p) => p.id === player.id);
      if (isSelected) {
        return prev.filter((p) => p.id !== player.id);
      }
      if (prev.length >= 2) {
        // Replace oldest selection
        return [prev[1], player];
      }
      return [...prev, player];
    });
  };

  const clearCompareSelection = () => {
    setCompareSelection([]);
  };

  const isPlayerSelectedForCompare = (playerId: string) => {
    return compareSelection.some((p) => p.id === playerId);
  };

  // Get active players for team averages (excluding IR)
  const activePlayers = roster
    .filter((slot) => slot.slotType !== "ir" && slot.player.minutes > 0)
    .map((slot) => slot.player);

  // Team totals (averages)
  const teamTotals = useMemo(() => {
    const count = activePlayers.length || 1;
    return {
      pts: activePlayers.reduce((sum, p) => sum + p.points, 0) / count,
      reb: activePlayers.reduce((sum, p) => sum + p.rebounds, 0) / count,
      ast: activePlayers.reduce((sum, p) => sum + p.assists, 0) / count,
      threepm: activePlayers.reduce((sum, p) => sum + p.threepm, 0) / count,
      stl: activePlayers.reduce((sum, p) => sum + p.steals, 0) / count,
      blk: activePlayers.reduce((sum, p) => sum + p.blocks, 0) / count,
      to: activePlayers.reduce((sum, p) => sum + p.turnovers, 0) / count,
      fgPct: activePlayers.reduce((sum, p) => sum + p.fgPct, 0) / count,
      ftPct: activePlayers.reduce((sum, p) => sum + p.ftPct, 0) / count,
    };
  }, [activePlayers]);

  // Weekly projections (x40 for counting stats)
  const weeklyProjections = useMemo(
    () => ({
      pts: teamTotals.pts * 40,
      reb: teamTotals.reb * 40,
      ast: teamTotals.ast * 40,
      threepm: teamTotals.threepm * 40,
      stl: teamTotals.stl * 40,
      blk: teamTotals.blk * 40,
      to: teamTotals.to * 40,
      fgPct: teamTotals.fgPct,
      ftPct: teamTotals.ftPct,
    }),
    [teamTotals]
  );

  // Counts
  const startersCount = roster.filter((r) => r.slotType === "starter").length;
  const benchCount = roster.filter((r) => r.slotType === "bench").length;
  const irCount = roster.filter((r) => r.slotType === "ir").length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Team Summary Card */}
      <Card className="gradient-card border-border p-4">
        <div className="mb-3">
          <h2 className="font-display font-bold text-base">TEAM AVERAGES</h2>
          <p className="text-[10px] text-muted-foreground">
            Per-game averages from active roster ({activePlayers.length} players)
          </p>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-9 gap-3 mb-4">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">FG%</p>
            <p className="font-display font-bold text-lg">{formatPct(teamTotals.fgPct)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">FT%</p>
            <p className="font-display font-bold text-lg">{formatPct(teamTotals.ftPct)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">3PM</p>
            <p className="font-display font-bold text-lg">{teamTotals.threepm.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">REB</p>
            <p className="font-display font-bold text-lg">{teamTotals.reb.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">AST</p>
            <p className="font-display font-bold text-lg">{teamTotals.ast.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">STL</p>
            <p className="font-display font-bold text-lg">{teamTotals.stl.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">BLK</p>
            <p className="font-display font-bold text-lg">{teamTotals.blk.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">TO</p>
            <p className="font-display font-bold text-lg text-stat-negative">
              {teamTotals.to.toFixed(1)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase">PTS</p>
            <p className="font-display font-bold text-lg text-primary">
              {teamTotals.pts.toFixed(1)}
            </p>
          </div>
        </div>

        {/* Weekly Projections */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground mb-2">
            WEEKLY PROJECTIONS (×40 for counting stats)
          </p>
          <div className="grid grid-cols-3 md:grid-cols-9 gap-3">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">FG%</p>
              <p className="font-display font-semibold text-sm">{formatPct(weeklyProjections.fgPct)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">FT%</p>
              <p className="font-display font-semibold text-sm">{formatPct(weeklyProjections.ftPct)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">3PM</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.threepm.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">REB</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.reb.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">AST</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.ast.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">STL</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.stl.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">BLK</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.blk.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">TO</p>
              <p className="font-display font-semibold text-sm text-stat-negative">
                {weeklyProjections.to.toFixed(0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">PTS</p>
              <p className="font-display font-semibold text-sm text-primary">
                {weeklyProjections.pts.toFixed(0)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Position Breakdown Module */}
      <PositionBreakdown
        roster={roster}
        gamesByDate={gamesByDate}
        matchupDates={matchupDates}
        isLoading={scheduleLoading}
      />

      {/* Roster Header with Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-display font-bold text-lg">My Roster</h2>
          <Badge variant="outline" className="text-[10px]">{roster.length} players</Badge>
          
          {/* Compare Selection Indicator */}
          {compareSelection.length > 0 && (
            <div className="flex items-center gap-1 bg-primary/20 rounded-md px-2 py-1">
              <GitCompare className="w-3 h-3 text-primary" />
              <span className="text-xs text-primary font-medium">
                {compareSelection.length}/2 selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 ml-1 hover:bg-primary/20"
                onClick={clearCompareSelection}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Slot Filters */}
          <div className="flex items-center gap-1 bg-secondary/30 rounded-md p-0.5">
            {[
              { key: "all", label: "All" },
              { key: "starter", label: `Starters (${startersCount})` },
              { key: "bench", label: `Bench (${benchCount})` },
              { key: "ir", label: `IR (${irCount})` },
            ].map((filter) => (
              <Button
                key={filter.key}
                variant={slotFilter === filter.key ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-6 px-2 text-[10px]",
                  slotFilter === filter.key && "bg-secondary"
                )}
                onClick={() => setSlotFilter(filter.key as SlotFilter)}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          {/* CRI/wCRI Toggle */}
          <div className="flex items-center gap-1 bg-secondary/30 rounded-md p-0.5">
            <Button
              variant={useCris ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-6 px-3 text-[10px] font-display", useCris && "bg-primary text-primary-foreground")}
              onClick={() => handleToggleCris(true)}
            >
              CRI
            </Button>
            <Button
              variant={!useCris ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-6 px-3 text-[10px] font-display", !useCris && "bg-primary text-primary-foreground")}
              onClick={() => handleToggleCris(false)}
            >
              wCRI
            </Button>
          </div>

          <CrisExplanation />
        </div>
      </div>

      {/* Compact Roster Table */}
      <Card className="gradient-card border-border p-2">
        <RosterTable
          roster={sortedRoster as any}
          useCris={useCris}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          onPlayerClick={setSelectedPlayer}
          categoryRanks={categoryRanks}
          activePlayerCount={activePlayerCount}
          compareSelection={compareSelection}
          onCompareToggle={handleCompareToggle}
        />
      </Card>

      <PlayerDetailSheet
        player={selectedPlayer}
        open={!!selectedPlayer}
        onOpenChange={(open) => !open && setSelectedPlayer(null)}
        allPlayers={roster.map(slot => slot.player)}
      />

      <PlayerCompareModal
        players={compareSelection}
        open={compareSelection.length === 2}
        onClose={clearCompareSelection}
      />
    </div>
  );
};
