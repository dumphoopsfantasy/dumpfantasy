import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowRight, Trophy, Target, Minus, Upload, RefreshCw, Info } from "lucide-react";
import { formatPct, CATEGORIES } from "@/lib/crisUtils";

interface TeamStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

interface MatchupData {
  myTeam: { name: string; stats: TeamStats };
  opponent: { name: string; stats: TeamStats };
}

interface MatchupProjectionProps {
  persistedMatchup: MatchupData | null;
  onMatchupChange: (data: MatchupData | null) => void;
}

const COUNTING_STATS = ['threepm', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'points'];
const MULTIPLIER = 40;

export const MatchupProjection = ({ persistedMatchup, onMatchupChange }: MatchupProjectionProps) => {
  const [myTeamData, setMyTeamData] = useState("");
  const [opponentData, setOpponentData] = useState("");

  // Parse team stats from ESPN paste (averages section)
  const parseTeamStats = (data: string): { name: string; stats: TeamStats } | null => {
    const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
    
    let teamName = "Team";
    const numbers: number[] = [];
    
    for (const line of lines) {
      // Team name might be a line that's not a number
      if (!line.match(/^[.\d]+$/) && line.length > 2 && !line.toLowerCase().includes('avg')) {
        // Could be team name
        if (!line.match(/^(FG%|FT%|3PM|REB|AST|STL|BLK|TO|PTS|MIN)/i)) {
          teamName = line;
        }
      }
      
      // Collect numbers
      const numMatch = line.match(/^([.\d]+)$/);
      if (numMatch) {
        numbers.push(parseFloat(numMatch[1]));
      }
    }
    
    // If we have 9 numbers, they should be FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS
    if (numbers.length >= 9) {
      return {
        name: teamName,
        stats: {
          fgPct: numbers[0] < 1 ? numbers[0] : numbers[0] / 100,
          ftPct: numbers[1] < 1 ? numbers[1] : numbers[1] / 100,
          threepm: numbers[2],
          rebounds: numbers[3],
          assists: numbers[4],
          steals: numbers[5],
          blocks: numbers[6],
          turnovers: numbers[7],
          points: numbers[8],
        }
      };
    }
    
    return null;
  };

  const handleCompare = () => {
    const myParsed = parseTeamStats(myTeamData);
    const oppParsed = parseTeamStats(opponentData);
    
    if (myParsed && oppParsed) {
      const newMatchup = {
        myTeam: { name: myParsed.name || "Your Team", stats: myParsed.stats },
        opponent: { name: oppParsed.name || "Opponent", stats: oppParsed.stats },
      };
      onMatchupChange(newMatchup);
    }
  };

  const handleReset = () => {
    onMatchupChange(null);
    setMyTeamData("");
    setOpponentData("");
  };

  const formatValue = (value: number, format: string, isMultiplied: boolean) => {
    if (format === 'pct') return formatPct(value);
    if (isMultiplied) return Math.round(value).toString();
    return value.toFixed(1);
  };

  if (!persistedMatchup) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h2 className="font-display font-bold text-2xl text-center">Matchup Projection</h2>
        <p className="text-center text-muted-foreground">
          Paste your team's category averages and your opponent's to compare
        </p>
        
        {/* Multiplier Notice */}
        <Card className="p-4 bg-primary/10 border-primary/30">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-semibold text-primary">Counting Stats Multiplier</p>
              <p className="text-sm text-muted-foreground">
                Counting stats (3PM, REB, AST, STL, BLK, TO, PTS) are multiplied by {MULTIPLIER} to simulate an average {MULTIPLIER}-game fantasy week.
                Percentages (FG%, FT%) are not multiplied.
              </p>
            </div>
          </div>
        </Card>
        
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="gradient-card shadow-card p-4 border-border">
            <h3 className="font-display font-bold mb-2 text-stat-positive">Your Team</h3>
            <Textarea
              placeholder={`Paste your team's stats:

.487
.825
52
198
112
42
24
58
542

(FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS)`}
              value={myTeamData}
              onChange={(e) => setMyTeamData(e.target.value)}
              className="min-h-[200px] font-mono text-sm bg-muted/50"
            />
          </Card>
          
          <Card className="gradient-card shadow-card p-4 border-border">
            <h3 className="font-display font-bold mb-2 text-stat-negative">Opponent</h3>
            <Textarea
              placeholder={`Paste opponent's stats:

.465
.792
48
185
125
38
28
52
528

(FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS)`}
              value={opponentData}
              onChange={(e) => setOpponentData(e.target.value)}
              className="min-h-[200px] font-mono text-sm bg-muted/50"
            />
          </Card>
        </div>
        
        <Button onClick={handleCompare} className="w-full gradient-primary font-display font-bold">
          <Upload className="w-4 h-4 mr-2" />
          Compare Matchup
        </Button>
      </div>
    );
  }

  // Calculate comparisons with multiplied counting stats
  const comparisons = CATEGORIES.map(cat => {
    const isCountingStat = COUNTING_STATS.includes(cat.key);
    const multiplier = isCountingStat ? MULTIPLIER : 1;
    
    const myRaw = persistedMatchup.myTeam.stats[cat.key as keyof TeamStats];
    const theirRaw = persistedMatchup.opponent.stats[cat.key as keyof TeamStats];
    
    const myValue = myRaw * multiplier;
    const theirValue = theirRaw * multiplier;
    
    let winner: 'you' | 'them' | 'tie';
    // For turnovers, lower is better
    if (cat.key === 'turnovers') {
      winner = myValue < theirValue ? 'you' : myValue > theirValue ? 'them' : 'tie';
    } else {
      winner = myValue > theirValue ? 'you' : myValue < theirValue ? 'them' : 'tie';
    }

    return {
      category: cat.label,
      key: cat.key,
      myValue,
      theirValue,
      winner,
      format: cat.format,
      isMultiplied: isCountingStat,
    };
  });

  const wins = comparisons.filter(c => c.winner === 'you').length;
  const losses = comparisons.filter(c => c.winner === 'them').length;
  const ties = comparisons.filter(c => c.winner === 'tie').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-2xl">Matchup Projection</h2>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RefreshCw className="w-4 h-4 mr-2" />
          New Matchup
        </Button>
      </div>

      {/* Multiplier Notice */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="w-4 h-4" />
        <span>Counting stats are multiplied by {MULTIPLIER} to simulate an average {MULTIPLIER}-game week.</span>
      </div>

      {/* Matchup Summary */}
      <Card className="gradient-card border-border p-6">
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">You</p>
            <p className="font-display font-bold text-xl md:text-2xl">{persistedMatchup.myTeam.name}</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/30">
            <span className="font-display font-bold text-2xl md:text-4xl text-stat-positive">{wins}</span>
            <span className="text-muted-foreground">-</span>
            <span className="font-display font-bold text-2xl md:text-4xl text-stat-negative">{losses}</span>
            <span className="text-muted-foreground">-</span>
            <span className="font-display font-bold text-2xl md:text-4xl text-muted-foreground">{ties}</span>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Opponent</p>
            <p className="font-display font-bold text-xl md:text-2xl">{persistedMatchup.opponent.name}</p>
          </div>
        </div>

        <div className="text-center mt-4 pt-4 border-t border-border">
          {wins > losses ? (
            <p className="text-stat-positive font-display font-bold flex items-center justify-center gap-2">
              <Trophy className="w-5 h-5" />
              You are projected to WIN {wins}-{losses}-{ties}
            </p>
          ) : wins < losses ? (
            <p className="text-stat-negative font-display font-bold flex items-center justify-center gap-2">
              <Target className="w-5 h-5" />
              You are projected to LOSE {losses}-{wins}-{ties}
            </p>
          ) : (
            <p className="text-muted-foreground font-display font-bold flex items-center justify-center gap-2">
              <Minus className="w-5 h-5" />
              Projected TIE {wins}-{losses}-{ties}
            </p>
          )}
        </div>
      </Card>

      {/* Category Breakdown */}
      <div className="space-y-3">
        {comparisons.map((comp) => (
          <Card
            key={comp.category}
            className={cn(
              "border-border p-4 transition-all",
              comp.winner === 'you' && "bg-stat-positive/5 border-stat-positive/30",
              comp.winner === 'them' && "bg-stat-negative/5 border-stat-negative/30",
              comp.winner === 'tie' && "bg-muted/20"
            )}
          >
            <div className="flex items-center justify-between">
              {/* Your Value */}
              <div className={cn(
                "flex-1 text-center",
                comp.winner === 'you' && "text-stat-positive"
              )}>
                <p className="font-display font-bold text-2xl md:text-3xl">
                  {formatValue(comp.myValue, comp.format, comp.isMultiplied)}
                </p>
                {comp.winner === 'you' && (
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <ArrowRight className="w-4 h-4" />
                    <span className="text-xs font-medium">WIN</span>
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="px-4 md:px-8">
                <div className={cn(
                  "px-4 py-2 rounded-lg font-display font-bold text-sm md:text-base",
                  comp.winner === 'you' && "bg-stat-positive/20 text-stat-positive",
                  comp.winner === 'them' && "bg-stat-negative/20 text-stat-negative",
                  comp.winner === 'tie' && "bg-muted text-muted-foreground"
                )}>
                  {comp.category}
                  {comp.key === 'turnovers' && <span className="text-xs ml-1">(lower)</span>}
                  {comp.isMultiplied && <span className="text-xs ml-1">×{MULTIPLIER}</span>}
                </div>
              </div>

              {/* Their Value */}
              <div className={cn(
                "flex-1 text-center",
                comp.winner === 'them' && "text-stat-negative"
              )}>
                <p className="font-display font-bold text-2xl md:text-3xl">
                  {formatValue(comp.theirValue, comp.format, comp.isMultiplied)}
                </p>
                {comp.winner === 'them' && (
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="text-xs font-medium">WIN</span>
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
