import { Player } from "@/types/fantasy";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { StatBadge } from "@/components/StatBadge";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatStat, getStatusColor, calculatePlayerScore } from "@/lib/playerUtils";
import { cn } from "@/lib/utils";
import { Trophy, TrendingUp, Target } from "lucide-react";

interface PlayerDetailSheetProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PlayerDetailSheet = ({ player, open, onOpenChange }: PlayerDetailSheetProps) => {
  if (!player) return null;

  const statusColor = getStatusColor(player.status);
  const fantasyScore = calculatePlayerScore(player);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg gradient-card border-border overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-start gap-4 mb-4">
            <PlayerPhoto name={player.name} size="xl" />
            <div className="flex-1">
              <SheetTitle className="text-2xl font-display">{player.name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="font-medium">
                  {player.nbaTeam}
                </Badge>
                <span className="text-muted-foreground">{player.positions.join(" / ")}</span>
              </div>
              {player.status && player.status !== "healthy" && (
                <Badge variant="outline" className={cn("mt-2", statusColor)}>
                  {player.status} {player.statusNote && `- ${player.statusNote}`}
                </Badge>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Game Info */}
        {player.opponent && (
          <div className="bg-secondary/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground mb-1">Next Game</p>
            <p className="font-display font-bold text-lg">
              vs {player.opponent} {player.gameTime && <span className="text-primary">@ {player.gameTime}</span>}
            </p>
          </div>
        )}

        {/* Fantasy Score */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-primary/10 rounded-lg p-4 text-center">
            <Trophy className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">Fantasy Value</p>
            <p className="font-display font-bold text-xl text-primary">{fantasyScore.toFixed(1)}</p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-stat-positive" />
            <p className="text-xs text-muted-foreground">CRI</p>
            <p className="font-display font-bold text-xl">{player.cri?.toFixed(2) ?? "--"}</p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4 text-center">
            <Target className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Rost %</p>
            <p className="font-display font-bold text-xl">{player.rostPct?.toFixed(1) ?? "--"}%</p>
          </div>
        </div>

        {/* Full Stats */}
        <div className="space-y-4">
          <h4 className="font-display font-bold text-sm text-muted-foreground uppercase tracking-wider">
            Season Averages
          </h4>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="MIN" value={formatStat(player.minutes, "decimal")} />
            </div>
            <div className="bg-primary/10 rounded-lg p-3">
              <StatBadge label="PTS" value={formatStat(player.points, "decimal")} highlight />
            </div>
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="REB" value={formatStat(player.rebounds, "decimal")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="AST" value={formatStat(player.assists, "decimal")} />
            </div>
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="STL" value={formatStat(player.steals, "decimal")} />
            </div>
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="BLK" value={formatStat(player.blocks, "decimal")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="3PM" value={formatStat(player.threepm, "decimal")} />
            </div>
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="FG%" value={formatStat(player.fgPct, "pct")} />
            </div>
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="FT%" value={formatStat(player.ftPct, "pct")} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-stat-negative/10 rounded-lg p-3">
              <StatBadge label="TO" value={formatStat(player.turnovers, "decimal")} negative />
            </div>
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="FGM" value={`${formatStat(player.fgm, "decimal")}/${formatStat(player.fga, "decimal")}`} />
            </div>
            <div className="bg-secondary/20 rounded-lg p-3">
              <StatBadge label="FTM" value={`${formatStat(player.ftm, "decimal")}/${formatStat(player.fta, "decimal")}`} />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};