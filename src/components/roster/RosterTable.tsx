import { Player, RosterSlot } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getStatusColor } from "@/lib/playerUtils";
import { formatPct } from "@/lib/crisUtils";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown, Lock } from "lucide-react";

interface PlayerWithCRI extends Player {
  cri?: number;
  wCri?: number;
  criRank?: number;
  wCriRank?: number;
}

interface RosterTableProps {
  roster: (RosterSlot & { player: PlayerWithCRI })[];
  useCris: boolean;
  sortColumn: string;
  sortDirection: "asc" | "desc";
  onSort: (column: string) => void;
  onPlayerClick: (player: Player) => void;
  categoryRanks: Record<string, Record<string, number>>;
  activePlayerCount: number;
}

// Map column keys to category rank keys
const STAT_TO_CATEGORY: Record<string, string> = {
  fgPct: "fgPct",
  ftPct: "ftPct",
  threepm: "threepm",
  rebounds: "rebounds",
  assists: "assists",
  steals: "steals",
  blocks: "blocks",
  turnovers: "turnovers",
  points: "points",
};

export const RosterTable = ({
  roster,
  useCris,
  sortColumn,
  sortDirection,
  onSort,
  onPlayerClick,
  categoryRanks,
  activePlayerCount,
}: RosterTableProps) => {
  // Build columns dynamically based on useCris toggle
  const columns = [
    { key: "rank", label: "#", sortable: false, className: "w-[36px]" },
    { key: "player", label: "Player", sortable: true, className: "min-w-[160px]" },
    { key: "slot", label: "Slot", sortable: false, className: "w-[60px]" },
    { key: "min", label: "MIN", sortable: true },
    { key: "fgPct", label: "FG%", sortable: true },
    { key: "ftPct", label: "FT%", sortable: true },
    { key: "threepm", label: "3PM", sortable: true },
    { key: "rebounds", label: "REB", sortable: true },
    { key: "assists", label: "AST", sortable: true },
    { key: "steals", label: "STL", sortable: true },
    { key: "blocks", label: "BLK", sortable: true },
    { key: "turnovers", label: "TO", sortable: true },
    { key: "points", label: "PTS", sortable: true },
    // Only show the selected metric column
    useCris
      ? { key: "cri", label: "CRI", sortable: true, className: "border-l border-border min-w-[60px]" }
      : { key: "wCri", label: "wCRI", sortable: true, className: "border-l border-border min-w-[60px]" },
  ];

  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === "desc" ? (
      <ArrowDown className="h-3 w-3 ml-1" />
    ) : (
      <ArrowUp className="h-3 w-3 ml-1" />
    );
  };

  const formatStat = (value: number | undefined, format: "pct" | "num" = "num") => {
    if (value === undefined || value === null) return "--";
    if (format === "pct") return formatPct(value);
    return value % 1 === 0 ? value.toString() : value.toFixed(1);
  };

  // Get heatmap color and tooltip info based on player's rank in category
  // Top 33% = green, Bottom 22% = red, otherwise neutral
  const getHeatmapInfo = (playerId: string, categoryKey: string, isIR: boolean, hasStats: boolean): { color: string; tooltip: string | null } => {
    if (isIR || !hasStats || activePlayerCount === 0) return { color: "", tooltip: null };
    
    const catKey = STAT_TO_CATEGORY[categoryKey];
    if (!catKey || !categoryRanks[catKey]) return { color: "", tooltip: null };
    
    const rank = categoryRanks[catKey][playerId];
    if (!rank) return { color: "", tooltip: null };
    
    const N = activePlayerCount;
    const topThreshold = Math.ceil(0.33 * N);
    const bottomThreshold = Math.ceil(0.78 * N);
    
    if (rank <= topThreshold) {
      return { 
        color: "bg-stat-positive/15 text-stat-positive", 
        tooltip: `Top 33% of team (Rank #${rank} of ${N})` 
      };
    } else if (rank >= bottomThreshold) {
      return { 
        color: "bg-stat-negative/15 text-stat-negative", 
        tooltip: `Bottom 22% of team (Rank #${rank} of ${N})` 
      };
    }
    return { color: "", tooltip: `Rank #${rank} of ${N}` };
  };

  // Helper to wrap stat cell with tooltip if needed
  const StatCell = ({ playerId, categoryKey, isIR, hasStats, value, format = "num" }: {
    playerId: string;
    categoryKey: string;
    isIR: boolean;
    hasStats: boolean;
    value: number | undefined;
    format?: "pct" | "num";
  }) => {
    const { color, tooltip } = getHeatmapInfo(playerId, categoryKey, isIR, hasStats);
    const displayValue = hasStats ? formatStat(value, format) : "--";
    
    if (tooltip) {
      return (
        <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", color)}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">{displayValue}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        </TableCell>
      );
    }
    
    return (
      <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", color)}>
        {displayValue}
      </TableCell>
    );
  };

  return (
    <TooltipProvider>
      <div className="overflow-x-auto bg-card/30 rounded-lg border border-border">
        <Table className="w-full">
        <TableHeader className="bg-accent/20">
          <TableRow className="hover:bg-transparent border-border">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  "text-xs uppercase font-display h-9 px-2 whitespace-nowrap",
                  col.sortable && "cursor-pointer hover:text-primary",
                  col.className
                )}
                onClick={() => col.sortable && onSort(col.key)}
              >
                <div className="flex items-center">
                  {col.label}
                  {col.sortable && renderSortIcon(col.key)}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.map((slot, idx) => {
            const player = slot.player;
            const statusColor = getStatusColor(player.status);
            const isIR = slot.slotType === "ir";
            const hasStats = player.minutes > 0;
            const rank = useCris ? player.criRank : player.wCriRank;
            const metricValue = useCris ? player.cri : player.wCri;
            const metricRank = useCris ? player.criRank : player.wCriRank;

            return (
              <TableRow
                key={player.id + idx}
                onClick={() => onPlayerClick(player)}
                className={cn(
                  "cursor-pointer hover:bg-primary/5 border-border transition-colors",
                  isIR && "opacity-60 bg-destructive/5"
                )}
              >
                {/* Rank - always shows rank by selected metric for active players */}
                <TableCell className="px-2 py-1.5 text-center">
                  {rank ? (
                    <span
                      className={cn(
                        "font-display font-bold text-sm",
                        rank <= 3 ? "text-stat-positive" : rank > 10 ? "text-stat-negative" : "text-muted-foreground"
                      )}
                    >
                      #{rank}
                    </span>
                  ) : isIR ? (
                    <span className="text-muted-foreground text-xs font-display flex items-center gap-0.5">
                      <Lock className="h-3 w-3" />
                      IR
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">--</span>
                  )}
                </TableCell>

                {/* Player */}
                <TableCell className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <PlayerPhoto name={player.name} size="xs" />
                    <NBATeamLogo teamCode={player.nbaTeam} size="xs" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-display font-medium text-sm truncate max-w-[120px]">
                          {player.name}
                        </span>
                        {player.status && player.status !== "healthy" && (
                          <Badge variant="outline" className={cn("text-[9px] px-1 py-0", statusColor)}>
                            {player.status}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {player.positions.join("/")}
                        {player.opponent && player.opponent !== "MOVE" && (
                          <span className="ml-1 text-primary">{player.opponent}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* Slot */}
                <TableCell className="px-2 py-1.5">
                  <Badge
                    variant={isIR ? "destructive" : "outline"}
                    className={cn(
                      "text-[10px] px-1.5 py-0 font-display",
                      slot.slotType === "starter" && "bg-primary/20 border-primary/50",
                      slot.slotType === "bench" && "bg-secondary/50"
                    )}
                  >
                    {slot.slot}
                  </Badge>
                </TableCell>

                {/* MIN - no heatmap */}
                <TableCell className="px-2 py-1.5 text-sm text-center font-mono">
                  {hasStats ? formatStat(player.minutes) : "--"}
                </TableCell>

                {/* Stats with heatmap colors and tooltips */}
                <StatCell playerId={player.id} categoryKey="fgPct" isIR={isIR} hasStats={hasStats} value={player.fgPct} format="pct" />
                <StatCell playerId={player.id} categoryKey="ftPct" isIR={isIR} hasStats={hasStats} value={player.ftPct} format="pct" />
                <StatCell playerId={player.id} categoryKey="threepm" isIR={isIR} hasStats={hasStats} value={player.threepm} />
                <StatCell playerId={player.id} categoryKey="rebounds" isIR={isIR} hasStats={hasStats} value={player.rebounds} />
                <StatCell playerId={player.id} categoryKey="assists" isIR={isIR} hasStats={hasStats} value={player.assists} />
                <StatCell playerId={player.id} categoryKey="steals" isIR={isIR} hasStats={hasStats} value={player.steals} />
                <StatCell playerId={player.id} categoryKey="blocks" isIR={isIR} hasStats={hasStats} value={player.blocks} />
                <StatCell playerId={player.id} categoryKey="turnovers" isIR={isIR} hasStats={hasStats} value={player.turnovers} />
                <StatCell playerId={player.id} categoryKey="points" isIR={isIR} hasStats={hasStats} value={player.points} />

                {/* CRI or wCRI (only the selected metric) */}
                <TableCell className="px-2 py-1.5 text-center border-l border-border">
                  {hasStats && metricValue !== undefined ? (
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-mono font-semibold">{metricValue.toFixed(1)}</span>
                      {metricRank && (
                        <span
                          className={cn(
                            "text-[10px] font-display",
                            metricRank <= 3
                              ? "text-stat-positive"
                              : metricRank > 10
                              ? "text-stat-negative"
                              : "text-muted-foreground"
                          )}
                        >
                          #{metricRank}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
};