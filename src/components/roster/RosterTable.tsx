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
}

const COLUMNS = [
  { key: "slot", label: "Slot", sortable: false },
  { key: "player", label: "Player", sortable: true },
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
  { key: "cri", label: "CRI", sortable: true },
  { key: "wCri", label: "wCRI", sortable: true },
];

export const RosterTable = ({
  roster,
  useCris,
  sortColumn,
  sortDirection,
  onSort,
  onPlayerClick,
}: RosterTableProps) => {
  const scoreLabel = useCris ? "CRI" : "wCRI";

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

  return (
    <div className="overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          <TableRow className="hover:bg-transparent border-border">
            {COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  "text-[10px] uppercase font-display h-8 px-1.5 whitespace-nowrap",
                  col.sortable && "cursor-pointer hover:text-primary",
                  col.key === "player" && "min-w-[140px]",
                  col.key === "slot" && "w-[50px]",
                  (col.key === "cri" || col.key === "wCri") && "border-l border-border"
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
          {roster.map((slot) => {
            const player = slot.player;
            const statusColor = getStatusColor(player.status);
            const isIR = slot.slotType === "ir";
            const hasStats = player.minutes > 0;
            const rank = useCris ? player.criRank : player.wCriRank;
            const score = useCris ? player.cri : player.wCri;

            return (
              <TableRow
                key={player.id}
                onClick={() => onPlayerClick(player)}
                className={cn(
                  "cursor-pointer hover:bg-primary/5 border-border transition-colors",
                  isIR && "opacity-60 bg-destructive/5"
                )}
              >
                {/* Slot */}
                <TableCell className="px-1.5 py-1">
                  <Badge
                    variant={isIR ? "destructive" : "outline"}
                    className={cn(
                      "text-[9px] px-1.5 py-0 font-display",
                      slot.slotType === "starter" && "bg-primary/20 border-primary/50",
                      slot.slotType === "bench" && "bg-secondary/50"
                    )}
                  >
                    {slot.slot}
                  </Badge>
                </TableCell>

                {/* Player */}
                <TableCell className="px-1.5 py-1">
                  <div className="flex items-center gap-1.5">
                    <PlayerPhoto name={player.name} size="xs" />
                    <NBATeamLogo teamCode={player.nbaTeam} size="xs" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-display font-medium text-xs truncate max-w-[100px]">
                          {player.name}
                        </span>
                        {player.status && player.status !== "healthy" && (
                          <Badge variant="outline" className={cn("text-[8px] px-1 py-0", statusColor)}>
                            {player.status}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[9px] text-muted-foreground">
                        {player.positions.join("/")}
                        {player.opponent && player.opponent !== "MOVE" && (
                          <span className="ml-1 text-primary">{player.opponent}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>

                {/* Stats */}
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono">
                  {hasStats ? formatStat(player.minutes) : "--"}
                </TableCell>
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono">
                  {hasStats ? formatStat(player.fgPct, "pct") : "--"}
                </TableCell>
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono">
                  {hasStats ? formatStat(player.ftPct, "pct") : "--"}
                </TableCell>
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono">
                  {hasStats ? formatStat(player.threepm) : "--"}
                </TableCell>
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono">
                  {hasStats ? formatStat(player.rebounds) : "--"}
                </TableCell>
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono">
                  {hasStats ? formatStat(player.assists) : "--"}
                </TableCell>
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono">
                  {hasStats ? formatStat(player.steals) : "--"}
                </TableCell>
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono">
                  {hasStats ? formatStat(player.blocks) : "--"}
                </TableCell>
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono text-stat-negative">
                  {hasStats ? formatStat(player.turnovers) : "--"}
                </TableCell>
                <TableCell className="px-1.5 py-1 text-xs text-center font-mono text-primary font-semibold">
                  {hasStats ? formatStat(player.points) : "--"}
                </TableCell>

                {/* CRI */}
                <TableCell className="px-1.5 py-1 text-center border-l border-border">
                  {hasStats && player.cri !== undefined ? (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-mono">{player.cri.toFixed(1)}</span>
                      <span
                        className={cn(
                          "text-[9px] font-display font-bold",
                          player.criRank && player.criRank <= 3
                            ? "text-stat-positive"
                            : player.criRank && player.criRank > 10
                            ? "text-stat-negative"
                            : "text-muted-foreground"
                        )}
                      >
                        #{player.criRank || "--"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">--</span>
                  )}
                </TableCell>

                {/* wCRI */}
                <TableCell className="px-1.5 py-1 text-center border-l border-border">
                  {hasStats && player.wCri !== undefined ? (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-mono">{player.wCri.toFixed(1)}</span>
                      <span
                        className={cn(
                          "text-[9px] font-display font-bold",
                          player.wCriRank && player.wCriRank <= 3
                            ? "text-stat-positive"
                            : player.wCriRank && player.wCriRank > 10
                            ? "text-stat-negative"
                            : "text-muted-foreground"
                        )}
                      >
                        #{player.wCriRank || "--"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">--</span>
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
