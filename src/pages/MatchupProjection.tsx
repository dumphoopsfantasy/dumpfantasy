import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

interface TeamInfo {
  name: string;
  record: string;
  standing: string;
  owner?: string;
  lastMatchup?: string;
}

interface MatchupTeam extends TeamInfo {
  stats: TeamStats;
}

interface MatchupData {
  myTeam: MatchupTeam;
  opponent: MatchupTeam;
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

  // Parse ESPN full page paste
  const parseESPNTeamPage = (data: string): { info: TeamInfo; stats: TeamStats } | null => {
    const lines = data.trim().split('\n').map(l => l.trim()).filter(l => l);
    
    // Skip ESPN navigation
    const skipPatterns = /^(hsb\.|ESPN|NFL|NBA|MLB|NCAAF|NHL|Soccer|WNBA|More Sports|Watch|Fantasy|Where to Watch|Fantasy Basketball Home|My Team|League|Settings|Members|Rosters|Schedule|Message Board|Transaction Counter|History|Draft Recap|Email League|Recent Activity|Players|Add Players|Watch List|Daily Leaders|Live Draft Trends|Added \/ Dropped|Player Rater|Player News|Projections|Waiver Order|Waiver Report|Undroppables|FantasyCast|Scoreboard|Standings|Opposing Teams|ESPN BET|Copyright|ESPN\.com|Member Services|Interest-Based|Privacy|Terms|NBPA)$/i;
    
    let teamName = "";
    let record = "";
    let standing = "";
    let owner = "";
    let lastMatchup = "";
    
    // Find team info block pattern: "TeamName\n4-2-0\n(2nd of 10)\nAll Hail WembyBill Vasiliadis"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip navigation/headers
      if (skipPatterns.test(line)) continue;
      if (line.length < 2 || line.length > 50) continue;
      
      // Look for record pattern (e.g., "4-2-0")
      const recordMatch = line.match(/^(\d+-\d+-\d+)$/);
      if (recordMatch) {
        // Previous line might be team name
        if (i > 0 && !skipPatterns.test(lines[i - 1])) {
          const prevLine = lines[i - 1];
          // Check it's not a position or stat header
          if (!prevLine.match(/^(PG|SG|SF|PF|C|G|F|UTIL|Bench|IR|STARTERS|STATS|MIN|FG|FT|3PM|REB|AST|STL|BLK|TO|PTS)/i)) {
            teamName = prevLine;
            record = recordMatch[1];
            
            // Check next line for standing
            if (i + 1 < lines.length) {
              const standingMatch = lines[i + 1].match(/\((\d+)(st|nd|rd|th) of (\d+)\)/i);
              if (standingMatch) {
                standing = `${standingMatch[1]}${standingMatch[2]} of ${standingMatch[3]}`;
                
                // Next line after standing might have owner name
                // Pattern: "All Hail WembyBill Vasiliadis" or just "Bill Vasiliadis"
                if (i + 2 < lines.length) {
                  const ownerLine = lines[i + 2];
                  // Look for pattern with name (first + last name typically)
                  // The line might have team motto + owner name combined
                  const ownerMatch = ownerLine.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)$/);
                  if (ownerMatch) {
                    owner = ownerMatch[1];
                  }
                }
              }
            }
          }
        }
      }
      
      // Look for "Last Matchup" section
      if (line === 'Last Matchup' && i + 4 < lines.length) {
        // Pattern: FREAK\n3-6-0\nBilbo\n6-3-0
        const team1 = lines[i + 1];
        const score1 = lines[i + 2];
        const team2 = lines[i + 3];
        const score2 = lines[i + 4];
        if (score1?.match(/^\d+-\d+-\d+$/) && score2?.match(/^\d+-\d+-\d+$/)) {
          lastMatchup = `${team1} ${score1} vs ${team2} ${score2}`;
        }
      }
    }
    
    // Parse stats - look for the stats table (after "STATS" or "Research" header)
    // Stats order: MIN, FGM/FGA, FG%, FTM/FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS
    const statsStartIdx = lines.findIndex(l => l === 'STATS' || l === 'Research');
    
    // Collect all numeric stat lines
    const statNumbers: number[] = [];
    
    if (statsStartIdx > -1) {
      for (let i = statsStartIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip headers
        if (/^(MIN|FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|STATS)$/i.test(line)) continue;
        
        // Stop at footer
        if (line.includes('ESPN.com') || line.includes('Copyright')) break;
        
        // Collect numbers and percentages
        if (/^[.\d]+$/.test(line) || line === '--') {
          statNumbers.push(line === '--' ? 0 : parseFloat(line));
        }
      }
    }
    
    // Calculate averages from all player rows
    // Each player has 15 stats: MIN, FGM/FGA (skip), FG%, FTM/FTA (skip), FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
    // We need: FG%, FT%, 3PM, REB, AST, STL, BLK, TO, PTS (indices: 2, 4, 5, 6, 7, 8, 9, 10, 11)
    
    const COLS = 15;
    const numPlayers = Math.floor(statNumbers.length / COLS);
    
    if (numPlayers > 0) {
      let totals = { fgPct: 0, ftPct: 0, threepm: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, points: 0 };
      let validCount = 0;
      
      for (let p = 0; p < numPlayers; p++) {
        const base = p * COLS;
        const min = statNumbers[base]; // MIN
        
        // Skip players with no minutes (injured)
        if (min === 0 || isNaN(min)) continue;
        
        validCount++;
        totals.fgPct += statNumbers[base + 2] || 0;      // FG%
        totals.ftPct += statNumbers[base + 4] || 0;      // FT%
        totals.threepm += statNumbers[base + 5] || 0;    // 3PM
        totals.rebounds += statNumbers[base + 6] || 0;   // REB
        totals.assists += statNumbers[base + 7] || 0;    // AST
        totals.steals += statNumbers[base + 8] || 0;     // STL
        totals.blocks += statNumbers[base + 9] || 0;     // BLK
        totals.turnovers += statNumbers[base + 10] || 0; // TO
        totals.points += statNumbers[base + 11] || 0;    // PTS
      }
      
      if (validCount > 0) {
        // Return averages for all stats (like TeamAverages component)
        return {
          info: {
            name: teamName || "Team",
            record,
            standing,
            owner,
            lastMatchup,
          },
          stats: {
            fgPct: totals.fgPct / validCount,
            ftPct: totals.ftPct / validCount,
            threepm: totals.threepm / validCount,
            rebounds: totals.rebounds / validCount,
            assists: totals.assists / validCount,
            steals: totals.steals / validCount,
            blocks: totals.blocks / validCount,
            turnovers: totals.turnovers / validCount,
            points: totals.points / validCount,
          }
        };
      }
    }
    
    // Fallback: try simple number extraction for manual paste
    const simpleNumbers: number[] = [];
    for (const line of lines) {
      const numMatch = line.match(/^([.\d]+)$/);
      if (numMatch) {
        simpleNumbers.push(parseFloat(numMatch[1]));
      }
    }
    
    if (simpleNumbers.length >= 9) {
      return {
        info: { name: teamName || "Team", record, standing, owner, lastMatchup },
        stats: {
          fgPct: simpleNumbers[0] < 1 ? simpleNumbers[0] : simpleNumbers[0] / 100,
          ftPct: simpleNumbers[1] < 1 ? simpleNumbers[1] : simpleNumbers[1] / 100,
          threepm: simpleNumbers[2],
          rebounds: simpleNumbers[3],
          assists: simpleNumbers[4],
          steals: simpleNumbers[5],
          blocks: simpleNumbers[6],
          turnovers: simpleNumbers[7],
          points: simpleNumbers[8],
        }
      };
    }
    
    return null;
  };

  const handleCompare = () => {
    const myParsed = parseESPNTeamPage(myTeamData);
    const oppParsed = parseESPNTeamPage(opponentData);
    
    if (myParsed && oppParsed) {
      const newMatchup: MatchupData = {
        myTeam: { ...myParsed.info, stats: myParsed.stats },
        opponent: { ...oppParsed.info, stats: oppParsed.stats },
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
          Paste the full ESPN team page for each team (Your Team & Opponent)
        </p>
        
        <Card className="p-4 bg-primary/10 border-primary/30">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-semibold text-primary">How Projections Work</p>
              <ul className="text-sm text-muted-foreground space-y-1 mt-1">
                <li>• All stats are <strong>Last 15 AVERAGES</strong> (per game)</li>
                <li>• <strong>Counting stats</strong> (3PM, REB, AST, STL, BLK, TO, PTS) are multiplied by <strong>×{MULTIPLIER}</strong></li>
                <li>• <strong>Percentages</strong> (FG%, FT%) are NOT multiplied</li>
                <li>• The ×{MULTIPLIER} simulates a full matchup week (~40 player-games)</li>
              </ul>
            </div>
          </div>
        </Card>
        
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="gradient-card shadow-card p-4 border-border">
            <h3 className="font-display font-bold mb-2 text-stat-positive">Your Team</h3>
            <Textarea
              placeholder={`Paste the full ESPN page for your team...

The parser will extract:
- Team name (e.g., "Bilbo")
- Record (e.g., "4-2-0")
- Standing (e.g., "2nd of 10")
- Player stats to calculate averages`}
              value={myTeamData}
              onChange={(e) => setMyTeamData(e.target.value)}
              className="min-h-[200px] font-mono text-sm bg-muted/50"
            />
          </Card>
          
          <Card className="gradient-card shadow-card p-4 border-border">
            <h3 className="font-display font-bold mb-2 text-stat-negative">Opponent</h3>
            <Textarea
              placeholder={`Paste the full ESPN page for opponent...

Navigate to their team page and copy the whole page.`}
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

      {/* Stats Info Notice */}
      <Card className="p-3 bg-amber-500/10 border-amber-500/30">
        <div className="flex items-center gap-2 text-xs">
          <Info className="w-4 h-4 text-amber-400" />
          <span className="text-muted-foreground">
            Stats are <strong className="text-amber-400">Last 15 Averages</strong>. 
            Counting stats (3PM, REB, AST, STL, BLK, TO, PTS) × <strong className="text-amber-400">{MULTIPLIER}</strong> for weekly projection.
            FG% and FT% are NOT multiplied.
          </span>
        </div>
      </Card>

      {/* Matchup Summary */}
      <Card className="gradient-card border-border p-6">
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Your Team</p>
            <p className="font-display font-bold text-xl md:text-2xl">{persistedMatchup.myTeam.name}</p>
            {persistedMatchup.myTeam.owner && (
              <p className="text-xs text-muted-foreground">{persistedMatchup.myTeam.owner}</p>
            )}
            {persistedMatchup.myTeam.record && (
              <p className="text-sm text-muted-foreground">{persistedMatchup.myTeam.record}</p>
            )}
            {persistedMatchup.myTeam.standing && (
              <p className="text-xs text-primary">{persistedMatchup.myTeam.standing}</p>
            )}
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
            {persistedMatchup.opponent.record && (
              <p className="text-sm text-muted-foreground">{persistedMatchup.opponent.record}</p>
            )}
            {persistedMatchup.opponent.standing && (
              <p className="text-xs text-primary">{persistedMatchup.opponent.standing}</p>
            )}
          </div>
        </div>

        {/* Previous Matchup Info */}
        {persistedMatchup.myTeam.lastMatchup && (
          <div className="text-center mt-2 text-xs text-muted-foreground">
            Last: {persistedMatchup.myTeam.lastMatchup}
          </div>
        )}

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
              <div className={cn("flex-1 text-center", comp.winner === 'you' && "text-stat-positive")}>
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

              <div className={cn("flex-1 text-center", comp.winner === 'them' && "text-stat-negative")}>
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
