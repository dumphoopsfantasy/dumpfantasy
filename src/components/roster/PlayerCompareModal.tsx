import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { Player } from "@/types/fantasy";
import { formatPct, CRIS_WEIGHTS } from "@/lib/crisUtils";
import { cn } from "@/lib/utils";
import { ArrowRight, TrendingUp, TrendingDown, Minus, Calendar, X } from "lucide-react";

interface PlayerCompareModalProps {
  players: Player[];
  open: boolean;
  onClose: () => void;
}

interface CategoryComparison {
  key: string;
  label: string;
  playerAValue: number;
  playerBValue: number;
  delta: number;
  winner: 'A' | 'B' | 'tie';
  lowerIsBetter?: boolean;
}

const CATEGORIES = [
  { key: 'fgPct', label: 'FG%', format: 'pct' },
  { key: 'ftPct', label: 'FT%', format: 'pct' },
  { key: 'threepm', label: '3PM', format: 'num' },
  { key: 'rebounds', label: 'REB', format: 'num' },
  { key: 'assists', label: 'AST', format: 'num' },
  { key: 'steals', label: 'STL', format: 'num' },
  { key: 'blocks', label: 'BLK', format: 'num' },
  { key: 'turnovers', label: 'TO', format: 'num', lowerIsBetter: true },
  { key: 'points', label: 'PTS', format: 'num' },
];

const WEIGHT_KEYS: Record<string, keyof typeof CRIS_WEIGHTS> = {
  fgPct: 'fgPct',
  ftPct: 'ftPct',
  threepm: 'threepm',
  rebounds: 'rebounds',
  assists: 'assists',
  steals: 'steals',
  blocks: 'blocks',
  turnovers: 'turnovers',
  points: 'points',
};

export function PlayerCompareModal({ players, open, onClose }: PlayerCompareModalProps) {
  const [useWeights, setUseWeights] = useState(false);

  if (players.length !== 2) return null;

  const [playerA, playerB] = players;

  const comparisons = useMemo((): CategoryComparison[] => {
    return CATEGORIES.map(cat => {
      const valA = playerA[cat.key as keyof Player] as number || 0;
      const valB = playerB[cat.key as keyof Player] as number || 0;
      const delta = valA - valB;
      
      let winner: 'A' | 'B' | 'tie' = 'tie';
      if (cat.lowerIsBetter) {
        if (valA < valB) winner = 'A';
        else if (valB < valA) winner = 'B';
      } else {
        if (valA > valB) winner = 'A';
        else if (valB > valA) winner = 'B';
      }

      return {
        key: cat.key,
        label: cat.label,
        playerAValue: valA,
        playerBValue: valB,
        delta,
        winner,
        lowerIsBetter: cat.lowerIsBetter,
      };
    });
  }, [playerA, playerB]);

  const overallEdge = useMemo(() => {
    let scoreA = 0;
    let scoreB = 0;

    comparisons.forEach(comp => {
      const weight = useWeights ? (CRIS_WEIGHTS[WEIGHT_KEYS[comp.key]] || 1) : 1;
      if (comp.winner === 'A') scoreA += weight;
      else if (comp.winner === 'B') scoreB += weight;
    });

    return {
      scoreA: scoreA.toFixed(2),
      scoreB: scoreB.toFixed(2),
      winner: scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'tie',
      margin: Math.abs(scoreA - scoreB).toFixed(2),
    };
  }, [comparisons, useWeights]);

  const formatValue = (value: number, key: string) => {
    const cat = CATEGORIES.find(c => c.key === key);
    if (!cat) return value.toString();
    if (cat.format === 'pct') return formatPct(value);
    return value.toFixed(1);
  };

  const catWinCounts = comparisons.reduce(
    (acc, c) => {
      if (c.winner === 'A') acc.A++;
      else if (c.winner === 'B') acc.B++;
      else acc.tie++;
      return acc;
    },
    { A: 0, B: 0, tie: 0 }
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Compare Players
          </DialogTitle>
          <DialogDescription>
            Head-to-head statistical comparison
          </DialogDescription>
        </DialogHeader>

        {/* Player Headers */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-4">
          {/* Player A */}
          <div className={cn(
            "flex flex-col items-center p-4 rounded-lg border",
            overallEdge.winner === 'A' ? "border-stat-positive bg-stat-positive/10" : "border-border bg-card"
          )}>
            <PlayerPhoto name={playerA.name} size="lg" />
            <h3 className="font-display font-bold text-sm mt-2 text-center">{playerA.name}</h3>
            <div className="flex items-center gap-1 mt-1">
              <NBATeamLogo teamCode={playerA.nbaTeam} size="xs" />
              <span className="text-xs text-muted-foreground">{playerA.positions.join('/')}</span>
            </div>
            <Badge variant="outline" className="mt-2 text-xs">
              {playerA.minutes.toFixed(1)} MIN
            </Badge>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-lg font-display font-bold text-muted-foreground">VS</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* Player B */}
          <div className={cn(
            "flex flex-col items-center p-4 rounded-lg border",
            overallEdge.winner === 'B' ? "border-stat-positive bg-stat-positive/10" : "border-border bg-card"
          )}>
            <PlayerPhoto name={playerB.name} size="lg" />
            <h3 className="font-display font-bold text-sm mt-2 text-center">{playerB.name}</h3>
            <div className="flex items-center gap-1 mt-1">
              <NBATeamLogo teamCode={playerB.nbaTeam} size="xs" />
              <span className="text-xs text-muted-foreground">{playerB.positions.join('/')}</span>
            </div>
            <Badge variant="outline" className="mt-2 text-xs">
              {playerB.minutes.toFixed(1)} MIN
            </Badge>
          </div>
        </div>

        {/* Category Win Summary */}
        <div className="flex items-center justify-center gap-4 mb-4 p-3 bg-secondary/30 rounded-lg">
          <div className="text-center">
            <span className="text-lg font-display font-bold text-stat-positive">{catWinCounts.A}</span>
            <p className="text-[10px] text-muted-foreground">{playerA.name.split(' ').pop()}</p>
          </div>
          <span className="text-muted-foreground">-</span>
          <div className="text-center">
            <span className="text-lg font-display font-bold text-muted-foreground">{catWinCounts.tie}</span>
            <p className="text-[10px] text-muted-foreground">Tie</p>
          </div>
          <span className="text-muted-foreground">-</span>
          <div className="text-center">
            <span className="text-lg font-display font-bold text-stat-positive">{catWinCounts.B}</span>
            <p className="text-[10px] text-muted-foreground">{playerB.name.split(' ').pop()}</p>
          </div>
        </div>

        {/* Category Comparison Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-3 py-2 text-left font-display text-xs">{playerA.name.split(' ').pop()}</th>
                <th className="px-3 py-2 text-center font-display text-xs">CAT</th>
                <th className="px-3 py-2 text-right font-display text-xs">{playerB.name.split(' ').pop()}</th>
                <th className="px-3 py-2 text-center font-display text-xs w-20">Δ</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((comp) => (
                <tr key={comp.key} className="border-t border-border/50">
                  <td className={cn(
                    "px-3 py-2 text-left font-mono",
                    comp.winner === 'A' && "text-stat-positive font-semibold"
                  )}>
                    {formatValue(comp.playerAValue, comp.key)}
                    {comp.winner === 'A' && <TrendingUp className="inline w-3 h-3 ml-1" />}
                  </td>
                  <td className="px-3 py-2 text-center font-display text-xs text-muted-foreground">
                    {comp.label}
                    {comp.lowerIsBetter && <span className="text-[9px] ml-0.5">(↓)</span>}
                  </td>
                  <td className={cn(
                    "px-3 py-2 text-right font-mono",
                    comp.winner === 'B' && "text-stat-positive font-semibold"
                  )}>
                    {comp.winner === 'B' && <TrendingUp className="inline w-3 h-3 mr-1" />}
                    {formatValue(comp.playerBValue, comp.key)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {comp.winner === 'tie' ? (
                      <Minus className="w-3 h-3 text-muted-foreground mx-auto" />
                    ) : (
                      <span className={cn(
                        "text-xs font-mono",
                        comp.winner === 'A' ? "text-stat-positive" : "text-stat-negative"
                      )}>
                        {comp.delta > 0 ? '+' : ''}{comp.lowerIsBetter ? -comp.delta : comp.delta > 0 ? comp.delta : comp.delta}
                        {comp.key.includes('Pct') ? '' : ''}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Overall Edge */}
        <div className="mt-4 p-4 bg-card border border-border rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-display font-bold text-sm">Overall Edge</h4>
            <div className="flex items-center gap-2">
              <Label htmlFor="use-weights" className="text-xs text-muted-foreground">
                Use my weights
              </Label>
              <Switch
                id="use-weights"
                checked={useWeights}
                onCheckedChange={setUseWeights}
              />
            </div>
          </div>
          <div className="flex items-center justify-center gap-4">
            <div className={cn(
              "text-center p-3 rounded-lg flex-1",
              overallEdge.winner === 'A' ? "bg-stat-positive/20" : "bg-secondary/30"
            )}>
              <p className="text-2xl font-display font-bold">{overallEdge.scoreA}</p>
              <p className="text-xs text-muted-foreground">{playerA.name.split(' ').pop()}</p>
            </div>
            <span className="text-muted-foreground font-bold">vs</span>
            <div className={cn(
              "text-center p-3 rounded-lg flex-1",
              overallEdge.winner === 'B' ? "bg-stat-positive/20" : "bg-secondary/30"
            )}>
              <p className="text-2xl font-display font-bold">{overallEdge.scoreB}</p>
              <p className="text-xs text-muted-foreground">{playerB.name.split(' ').pop()}</p>
            </div>
          </div>
          {overallEdge.winner !== 'tie' && (
            <p className="text-center text-xs text-muted-foreground mt-2">
              {overallEdge.winner === 'A' ? playerA.name : playerB.name} has a <span className="text-stat-positive font-semibold">+{overallEdge.margin}</span> edge
              {useWeights ? ' (weighted)' : ' (equal weights)'}
            </p>
          )}
        </div>

        {/* Schedule Info (if available) */}
        {(playerA.opponent || playerB.opponent) && (
          <div className="mt-4 p-3 bg-secondary/20 rounded-lg">
            <h4 className="font-display font-bold text-xs mb-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Next Game
            </h4>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground">{playerA.name.split(' ').pop()}</p>
                <p className="font-semibold text-primary">{playerA.opponent || 'No game scheduled'}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">{playerB.name.split(' ').pop()}</p>
                <p className="font-semibold text-primary">{playerB.opponent || 'No game scheduled'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}