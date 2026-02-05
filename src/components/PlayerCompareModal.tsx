/**
 * Player Compare Modal
 * Side-by-side comparison of two players.
 */

import { memo, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { cn } from "@/lib/utils";
import { Player } from "@/types/fantasy";
import { formatPct } from "@/lib/crisUtils";
import { Trophy, ArrowUp, ArrowDown, Minus } from "lucide-react";

interface PlayerCompareModalProps {
  players: [Player, Player] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
  { key: "fgPct", label: "FG%", isPercentage: true, lowerBetter: false },
  { key: "ftPct", label: "FT%", isPercentage: true, lowerBetter: false },
  { key: "threepm", label: "3PM", isPercentage: false, lowerBetter: false },
  { key: "rebounds", label: "REB", isPercentage: false, lowerBetter: false },
  { key: "assists", label: "AST", isPercentage: false, lowerBetter: false },
  { key: "steals", label: "STL", isPercentage: false, lowerBetter: false },
  { key: "blocks", label: "BLK", isPercentage: false, lowerBetter: false },
  { key: "turnovers", label: "TO", isPercentage: false, lowerBetter: true },
  { key: "points", label: "PTS", isPercentage: false, lowerBetter: false },
] as const;

type StatKey = typeof CATEGORIES[number]["key"];

interface ComparisonResult {
  playerAWins: number;
  playerBWins: number;
  ties: number;
  verdict: string;
  verdictPlayer: 0 | 1 | -1;  // 0 = player A, 1 = player B, -1 = tie
}

export const PlayerCompareModal = memo(function PlayerCompareModal({
  players,
  open,
  onOpenChange,
}: PlayerCompareModalProps) {
  const comparison = useMemo(() => {
    if (!players) return null;

    const [playerA, playerB] = players;
    let aWins = 0;
    let bWins = 0;
    let ties = 0;

    CATEGORIES.forEach((cat) => {
      const aVal = playerA[cat.key as keyof Player] as number;
      const bVal = playerB[cat.key as keyof Player] as number;
      
      if (Math.abs(aVal - bVal) < 0.001) {
        ties++;
      } else if (cat.lowerBetter) {
        if (aVal < bVal) aWins++;
        else bWins++;
      } else {
        if (aVal > bVal) aWins++;
        else bWins++;
      }
    });

    let verdict: string;
    let verdictPlayer: 0 | 1 | -1;

    if (aWins > bWins) {
      verdict = `${playerA.name.split(" ").slice(-1)[0]} wins ${aWins}-${bWins}`;
      verdictPlayer = 0;
    } else if (bWins > aWins) {
      verdict = `${playerB.name.split(" ").slice(-1)[0]} wins ${bWins}-${aWins}`;
      verdictPlayer = 1;
    } else {
      verdict = `Tied ${aWins}-${bWins}`;
      verdictPlayer = -1;
    }

    return {
      playerAWins: aWins,
      playerBWins: bWins,
      ties,
      verdict,
      verdictPlayer,
    } as ComparisonResult;
  }, [players]);

  if (!players || !comparison) return null;

  const [playerA, playerB] = players;

  const formatValue = (value: number, isPercentage: boolean): string => {
    if (isPercentage) return formatPct(value);
    return value.toFixed(1);
  };

  const getWinner = (cat: typeof CATEGORIES[number]): 0 | 1 | -1 => {
    const aVal = playerA[cat.key as keyof Player] as number;
    const bVal = playerB[cat.key as keyof Player] as number;
    
    if (Math.abs(aVal - bVal) < 0.001) return -1;
    
    if (cat.lowerBetter) {
      return aVal < bVal ? 0 : 1;
    }
    return aVal > bVal ? 0 : 1;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Trophy className="w-5 h-5 text-primary" />
            Head-to-Head Comparison
          </DialogTitle>
        </DialogHeader>

        {/* Verdict Banner */}
        <div className={cn(
          "p-3 rounded-lg text-center font-display font-bold",
          comparison.verdictPlayer === 0 && "bg-primary/20 text-primary",
          comparison.verdictPlayer === 1 && "bg-orange-500/20 text-orange-400",
          comparison.verdictPlayer === -1 && "bg-muted/50 text-muted-foreground"
        )}>
          {comparison.verdict}
          {comparison.ties > 0 && (
            <span className="text-xs font-normal ml-2">({comparison.ties} ties)</span>
          )}
        </div>

        {/* Player Headers */}
        <div className="grid grid-cols-3 gap-2 items-center">
          {/* Player A */}
          <div className={cn(
            "flex flex-col items-center p-2 rounded-lg border",
            comparison.verdictPlayer === 0 ? "border-primary/50 bg-primary/5" : "border-border"
          )}>
            <PlayerPhoto name={playerA.name} size="md" />
            <p className="text-sm font-semibold mt-1 text-center truncate w-full">
              {playerA.name.split(" ").slice(-1)[0]}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <NBATeamLogo teamCode={playerA.nbaTeam} size="xs" />
              <span className="text-[10px] text-muted-foreground">
                {playerA.positions?.join("/")}
              </span>
            </div>
            <Badge 
              variant="outline" 
              className="mt-1 text-[10px] text-primary border-primary/40"
            >
              {comparison.playerAWins} cats
            </Badge>
          </div>

          {/* VS */}
          <div className="flex items-center justify-center">
            <span className="text-2xl font-display font-bold text-muted-foreground">VS</span>
          </div>

          {/* Player B */}
          <div className={cn(
            "flex flex-col items-center p-2 rounded-lg border",
            comparison.verdictPlayer === 1 ? "border-orange-500/50 bg-orange-500/5" : "border-border"
          )}>
            <PlayerPhoto name={playerB.name} size="md" />
            <p className="text-sm font-semibold mt-1 text-center truncate w-full">
              {playerB.name.split(" ").slice(-1)[0]}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <NBATeamLogo teamCode={playerB.nbaTeam} size="xs" />
              <span className="text-[10px] text-muted-foreground">
                {playerB.positions?.join("/")}
              </span>
            </div>
            <Badge 
              variant="outline" 
              className="mt-1 text-[10px] text-orange-400 border-orange-500/40"
            >
              {comparison.playerBWins} cats
            </Badge>
          </div>
        </div>

        {/* Stats Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-center py-2 px-2 text-xs font-medium text-primary w-1/3">
                  {playerA.name.split(" ").slice(-1)[0]}
                </th>
                <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground">
                  Cat
                </th>
                <th className="text-center py-2 px-2 text-xs font-medium text-orange-400 w-1/3">
                  {playerB.name.split(" ").slice(-1)[0]}
                </th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => {
                const aVal = playerA[cat.key as keyof Player] as number;
                const bVal = playerB[cat.key as keyof Player] as number;
                const winner = getWinner(cat);

                return (
                  <tr key={cat.key} className="border-t border-border/50">
                    <td className={cn(
                      "text-center py-1.5 px-2 font-mono",
                      winner === 0 && "text-stat-positive font-semibold",
                      winner === 1 && "text-muted-foreground"
                    )}>
                      <div className="flex items-center justify-center gap-1">
                        {winner === 0 && <ArrowUp className="w-3 h-3" />}
                        {formatValue(aVal, cat.isPercentage)}
                      </div>
                    </td>
                    <td className="text-center py-1.5 px-2 text-xs font-medium text-muted-foreground">
                      {cat.label}
                      {cat.lowerBetter && <span className="ml-0.5 text-[8px]">↓</span>}
                    </td>
                    <td className={cn(
                      "text-center py-1.5 px-2 font-mono",
                      winner === 1 && "text-stat-positive font-semibold",
                      winner === 0 && "text-muted-foreground"
                    )}>
                      <div className="flex items-center justify-center gap-1">
                        {winner === 1 && <ArrowUp className="w-3 h-3" />}
                        {formatValue(bVal, cat.isPercentage)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Minutes comparison */}
        <div className="flex items-center justify-between text-xs text-muted-foreground p-2 bg-muted/30 rounded">
          <span>Minutes: {playerA.minutes?.toFixed(1) ?? "—"}</span>
          <span className="font-medium">MIN</span>
          <span>Minutes: {playerB.minutes?.toFixed(1) ?? "—"}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
});
