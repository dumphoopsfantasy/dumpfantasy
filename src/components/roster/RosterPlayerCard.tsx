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
        "gradient-card border-border p-4 hover:border-primary/50 transition-all cursor-pointer group",
        isIR && "opacity-60 border-destructive/30"
      )}
    >
      <div className="flex items-center gap-4">
        {/* Slot Badge */}
        <div className="w-12 flex-shrink-0">
          <Badge
            variant={slotType === "ir" ? "destructive" : "outline"}
            className={cn(
              "w-full justify-center font-display text-xs",
              slotType === "starter" && "bg-primary/20 border-primary/50",
              slotType === "bench" && "bg-secondary/50"
            )}
          >
            {slot}
          </Badge>
        </div>

        {/* Photo & Team Logo */}
        <div className="flex items-center gap-2">
          <PlayerPhoto name={player.name} size="md" />
          <NBATeamLogo teamCode={player.nbaTeam} size="sm" />
        </div>

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
            {/* Today's Matchup */}
            {player.opponent ? (
              <>
                <span>•</span>
                <span className="text-primary font-medium">{player.opponent}</span>
                {player.gameTime && (
                  <span className="text-xs text-muted-foreground">({player.gameTime})</span>
                )}
              </>
            ) : (
              <>
                <span>•</span>
                <span className="text-muted-foreground/60 text-xs">No game today</span>
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

        {/* CRI/wCRI Score & Rank */}
        {player.cri !== undefined && (
          <div className="hidden lg:block text-right min-w-[60px]">
            <p className="text-xs text-muted-foreground uppercase">{scoreLabel}#</p>
            <p className={cn(
              "font-display font-bold text-lg",
              player.criRank && player.criRank <= 3 ? "text-stat-positive" : 
              player.criRank && player.criRank > 10 ? "text-stat-negative" : "text-primary"
            )}>
              #{player.criRank || '--'}
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
        {player.criRank && (
          <div className="mt-2 text-center">
            <Badge variant="outline" className="text-xs">
              {scoreLabel}# {player.criRank}
            </Badge>
          </div>
        )}
      </div>
    </Card>
  );
};
