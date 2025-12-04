import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { StatBadge } from "@/components/StatBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatStat, getStatusColor } from "@/lib/playerUtils";
import { cn } from "@/lib/utils";

interface RosterPlayerCardProps {
  player: Player & { criRank?: number };
  slot: string;
  slotType?: "starter" | "bench" | "ir";
  onClick?: () => void;
  useCris?: boolean;
}

export const RosterPlayerCard = ({ player, slot, slotType, onClick, useCris = true }: RosterPlayerCardProps) => {
  const statusColor = getStatusColor(player.status);
  const isIR = slotType === "ir" || player.status === "IR" || player.status === "O";
  const scoreLabel = useCris ? "CRI" : "wCRI";

  return (
    <Card
      onClick={onClick}
      className={cn(
        "gradient-card border-border p-2 px-3 hover:border-primary/50 transition-all cursor-pointer group",
        isIR && "opacity-60 border-destructive/30"
      )}
    >
      <div className="flex items-center gap-2">
        {/* Slot Badge */}
        <Badge
          variant={slotType === "ir" ? "destructive" : "outline"}
          className={cn(
            "w-10 justify-center font-display text-[10px] flex-shrink-0",
            slotType === "starter" && "bg-primary/20 border-primary/50",
            slotType === "bench" && "bg-secondary/50"
          )}
        >
          {slot}
        </Badge>

        {/* Photo */}
        <PlayerPhoto name={player.name} size="sm" />
        <NBATeamLogo teamCode={player.nbaTeam} size="xs" />

        {/* Player Info */}
        <div className="min-w-[140px] max-w-[180px]">
          <div className="flex items-center gap-1">
            <h3 className="font-display font-semibold text-sm truncate group-hover:text-primary transition-colors">
              {player.name}
            </h3>
            {player.status && player.status !== "healthy" && (
              <Badge variant="outline" className={cn("text-[9px] px-1 py-0", statusColor)}>
                {player.status}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>{player.positions.join("/")}</span>
            {player.opponent && player.opponent !== 'MOVE' ? (
              <>
                <span>•</span>
                <span className="text-primary font-medium">{player.opponent}</span>
              </>
            ) : (
              <>
                <span>•</span>
                <span className="text-muted-foreground/50">--</span>
              </>
            )}
          </div>
        </div>

        {/* Compact Stats */}
        <div className="hidden md:flex items-center gap-1 flex-1 justify-end">
          <StatBadge label="PTS" value={formatStat(player.points, "decimal")} highlight size="xs" />
          <StatBadge label="REB" value={formatStat(player.rebounds, "decimal")} size="xs" />
          <StatBadge label="AST" value={formatStat(player.assists, "decimal")} size="xs" />
          <StatBadge label="3PM" value={formatStat(player.threepm, "decimal")} size="xs" />
          <StatBadge label="STL" value={formatStat(player.steals, "decimal")} size="xs" />
          <StatBadge label="BLK" value={formatStat(player.blocks, "decimal")} size="xs" />
          <StatBadge label="FG%" value={formatStat(player.fgPct, "pct")} size="xs" />
          <StatBadge label="FT%" value={formatStat(player.ftPct, "pct")} size="xs" />
          <StatBadge label="TO" value={formatStat(player.turnovers, "decimal")} negative size="xs" />
        </div>

        {/* CRI/wCRI Rank */}
        {player.cri !== undefined && (
          <div className="text-right min-w-[40px]">
            <p className="text-[9px] text-muted-foreground uppercase">{scoreLabel}</p>
            <p className={cn(
              "font-display font-bold text-sm",
              player.criRank && player.criRank <= 3 ? "text-stat-positive" : 
              player.criRank && player.criRank > 10 ? "text-stat-negative" : "text-primary"
            )}>
              #{player.criRank || '--'}
            </p>
          </div>
        )}
      </div>

      {/* Mobile Stats */}
      <div className="md:hidden mt-2 pt-2 border-t border-border">
        <div className="grid grid-cols-5 gap-1">
          <StatBadge label="PTS" value={formatStat(player.points, "decimal")} highlight size="xs" />
          <StatBadge label="REB" value={formatStat(player.rebounds, "decimal")} size="xs" />
          <StatBadge label="AST" value={formatStat(player.assists, "decimal")} size="xs" />
          <StatBadge label="STL" value={formatStat(player.steals, "decimal")} size="xs" />
          <StatBadge label="BLK" value={formatStat(player.blocks, "decimal")} size="xs" />
        </div>
        {player.criRank && (
          <div className="mt-1 text-center">
            <Badge variant="outline" className="text-[10px]">
              {scoreLabel}# {player.criRank}
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
};
