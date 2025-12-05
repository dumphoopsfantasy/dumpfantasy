import { Player, RosterSlot } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStatusColor } from "@/lib/playerUtils";
import { formatPct } from "@/lib/crisUtils";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

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

  // Get heatmap color based on player's rank in category
  // Top 33% = green, Bottom 22% = red, otherwise neutral
  const getHeatmapColor = (playerId: string, categoryKey: string, isIR: boolean, hasStats: boolean) => {
    if (isIR || !hasStats || activePlayerCount === 0) return "";
    
    const catKey = STAT_TO_CATEGORY[categoryKey];
    if (!catKey || !categoryRanks[catKey]) return "";
    
    const rank = categoryRanks[catKey][playerId];
    if (!rank) return "";
    
    const N = activePlayerCount;
    const topThreshold = Math.ceil(0.33 * N);
    const bottomThreshold = Math.ceil(0.78 * N);
    
    if (rank <= topThreshold) {
      return "bg-stat-positive/15 text-stat-positive";
    } else if (rank >= bottomThreshold) {
      return "bg-stat-negative/15 text-stat-negative";
    }
    return "";
  };

  return (
    <div className="overflow-x-auto bg-card/30 rounded-lg border border-border">
      <Table className="w-full">
        <TableHeader>
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
                    <span className="text-muted-foreground text-xs font-display">IR</span>
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

                {/* Stats with heatmap colors */}
                <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", getHeatmapColor(player.id, "fgPct", isIR, hasStats))}>
                  {hasStats ? formatStat(player.fgPct, "pct") : "--"}
                </TableCell>
                <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", getHeatmapColor(player.id, "ftPct", isIR, hasStats))}>
                  {hasStats ? formatStat(player.ftPct, "pct") : "--"}
                </TableCell>
                <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", getHeatmapColor(player.id, "threepm", isIR, hasStats))}>
                  {hasStats ? formatStat(player.threepm) : "--"}
                </TableCell>
                <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", getHeatmapColor(player.id, "rebounds", isIR, hasStats))}>
                  {hasStats ? formatStat(player.rebounds) : "--"}
                </TableCell>
                <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", getHeatmapColor(player.id, "assists", isIR, hasStats))}>
                  {hasStats ? formatStat(player.assists) : "--"}
                </TableCell>
                <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", getHeatmapColor(player.id, "steals", isIR, hasStats))}>
                  {hasStats ? formatStat(player.steals) : "--"}
                </TableCell>
                <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", getHeatmapColor(player.id, "blocks", isIR, hasStats))}>
                  {hasStats ? formatStat(player.blocks) : "--"}
                </TableCell>
                <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", getHeatmapColor(player.id, "turnovers", isIR, hasStats))}>
                  {hasStats ? formatStat(player.turnovers) : "--"}
                </TableCell>
                <TableCell className={cn("px-2 py-1.5 text-sm text-center font-mono", getHeatmapColor(player.id, "points", isIR, hasStats))}>
                  {hasStats ? formatStat(player.points) : "--"}
                </TableCell>

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
  );
};