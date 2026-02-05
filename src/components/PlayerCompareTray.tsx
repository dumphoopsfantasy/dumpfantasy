/**
 * Player Compare Tray
 * Sticky bottom bar showing selected players for comparison.
 */

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { X, GitCompare, ArrowRightLeft, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Player } from "@/types/fantasy";

interface PlayerCompareTrayProps {
  selectedPlayers: Player[];
  onRemove: (playerId: string) => void;
  onClear: () => void;
  onCompare: () => void;
  onSwap?: () => void;
  maxPlayers?: number;
}

export const PlayerCompareTray = memo(function PlayerCompareTray({
  selectedPlayers,
  onRemove,
  onClear,
  onCompare,
  onSwap,
  maxPlayers = 2,
}: PlayerCompareTrayProps) {
  if (selectedPlayers.length === 0) return null;

  const canCompare = selectedPlayers.length === 2;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Selected Players */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Badge variant="outline" className="shrink-0 text-xs">
              <GitCompare className="w-3 h-3 mr-1" />
              Compare ({selectedPlayers.length}/{maxPlayers})
            </Badge>
            
            <div className="flex items-center gap-2 overflow-x-auto">
              {selectedPlayers.map((player, idx) => (
                <div
                  key={player.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1 rounded-lg border bg-muted/30",
                    idx === 0 && "border-primary/50",
                    idx === 1 && "border-orange-500/50"
                  )}
                >
                  <PlayerPhoto name={player.name} size="xs" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate max-w-[100px]">
                      {player.name.split(" ").slice(-1)[0]}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {player.nbaTeam}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => onRemove(player.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              
              {selectedPlayers.length < maxPlayers && (
                <div className="flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed border-muted-foreground/30 text-muted-foreground">
                  <span className="text-xs">Select another player</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {canCompare && onSwap && (
              <Button variant="outline" size="sm" onClick={onSwap}>
                <ArrowRightLeft className="w-4 h-4" />
              </Button>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            
            <Button
              size="sm"
              onClick={onCompare}
              disabled={!canCompare}
              className="gap-1"
            >
              <GitCompare className="w-4 h-4" />
              Compare
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
