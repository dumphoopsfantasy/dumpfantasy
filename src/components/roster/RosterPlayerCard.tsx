import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { StatBadge } from "@/components/StatBadge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatStat, getStatusColor } from "@/lib/playerUtils";
import { cn } from "@/lib/utils";

interface RosterPlayerCardProps {
  player: Player;
  slot: string;
  onClick?: () => void;
}

export const RosterPlayerCard = ({ player, slot, onClick }: RosterPlayerCardProps) => {
  const statusColor = getStatusColor(player.status);

  return (
    <Card
      onClick={onClick}
      className={cn(
        "gradient-card border-border p-4 hover:border-primary/50 transition-all cursor-pointer group",
        player.status === "O" || player.status === "IR" ? "opacity-60" : ""
      )}
    >
      <div className="flex items-center gap-4">
        {/* Slot Badge */}
        <div className="w-12 flex-shrink-0">
          <Badge
            variant="outline"
            className="w-full justify-center font-display text-xs bg-secondary/50"
          >
            {slot}
          </Badge>
        </div>

        {/* Photo */}
        <PlayerPhoto name={player.name} size="md" />

        {/* Player Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-lg truncate group-hover:text-primary transition-colors">
              {player.name}
            </h3>
            {player.status && player.status !== "healthy" && (
              <Badge variant="outline" className={cn("text-xs", statusColor)}>
                {player.status}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium">{player.nbaTeam}</span>
            <span>•</span>
            <span>{player.positions.join("/")}</span>
            {player.opponent && (
              <>
                <span>•</span>
                <span className="text-primary">{player.opponent}</span>
                {player.gameTime && <span className="text-xs">({player.gameTime})</span>}
              </>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="hidden md:flex items-center gap-1 lg:gap-2">
          <StatBadge label="PTS" value={formatStat(player.points, "decimal")} highlight size="sm" />
          <StatBadge label="REB" value={formatStat(player.rebounds, "decimal")} size="sm" />
          <StatBadge label="AST" value={formatStat(player.assists, "decimal")} size="sm" />
          <StatBadge label="3PM" value={formatStat(player.threepm, "decimal")} size="sm" />
          <StatBadge label="STL" value={formatStat(player.steals, "decimal")} size="sm" />
          <StatBadge label="BLK" value={formatStat(player.blocks, "decimal")} size="sm" />
          <StatBadge label="FG%" value={formatStat(player.fgPct, "pct")} size="sm" />
          <StatBadge label="FT%" value={formatStat(player.ftPct, "pct")} size="sm" />
          <StatBadge label="TO" value={formatStat(player.turnovers, "decimal")} negative size="sm" />
        </div>

        {/* CRIS Score */}
        {player.cris !== undefined && (
          <div className="hidden lg:block text-right">
            <p className="text-xs text-muted-foreground uppercase">CRIS</p>
            <p className={cn(
              "font-display font-bold text-lg",
              player.cris > 5 ? "text-stat-positive" : player.cris < 0 ? "text-stat-negative" : "text-foreground"
            )}>
              {player.cris.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Mobile Stats */}
      <div className="md:hidden mt-3 pt-3 border-t border-border">
        <div className="grid grid-cols-5 gap-2">
          <StatBadge label="PTS" value={formatStat(player.points, "decimal")} highlight size="sm" />
          <StatBadge label="REB" value={formatStat(player.rebounds, "decimal")} size="sm" />
          <StatBadge label="AST" value={formatStat(player.assists, "decimal")} size="sm" />
          <StatBadge label="STL" value={formatStat(player.steals, "decimal")} size="sm" />
          <StatBadge label="BLK" value={formatStat(player.blocks, "decimal")} size="sm" />
        </div>
      </div>
    </Card>
  );
};