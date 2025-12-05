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
  abbr?: string;
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

const COUNTING_STATS = ["threepm", "rebounds", "assists", "steals", "blocks", "turnovers", "points"];
const MULTIPLIER = 40;

export const MatchupProjection = ({ persistedMatchup, onMatchupChange }: MatchupProjectionProps) => {
  const [myTeamData, setMyTeamData] = useState("");
  const [opponentData, setOpponentData] = useState("");

  // Parse ESPN full page paste - extract team info and calculate averages from active players
  const parseESPNTeamPage = (data: string): { info: TeamInfo; stats: TeamStats } | null => {
    const lines = data
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);

    // Skip ESPN navigation
    const skipPatterns =
      /^(hsb\.|ESPN|NFL|NBA|MLB|NCAAF|NHL|Soccer|WNBA|More Sports|Watch|Fantasy|Where to Watch|Fantasy Basketball Home|My Team|League|Settings|Members|Rosters|Schedule|Message Board|Transaction Counter|History|Draft Recap|Email League|Recent Activity|Players|Add Players|Watch List|Daily Leaders|Live Draft Trends|Added \/ Dropped|Player Rater|Player News|Projections|Waiver Order|Waiver Report|Undroppables|FantasyCast|Scoreboard|Standings|Opposing Teams|ESPN BET|Copyright|ESPN\.com|Member Services|Interest-Based|Privacy|Terms|NBPA)$/i;

    let teamName = "";
    let teamAbbr = "";
    let record = "";
    let standing = "";
    let owner = "";
    let lastMatchup = "";

    // Find team info block pattern
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (skipPatterns.test(line)) continue;
      if (line.length < 2 || line.length > 50) continue;

      // Look for record pattern (e.g., "4-2-0")
      const recordMatch = line.match(/^(\d+-\d+-\d+)$/);
      if (recordMatch) {
        if (i > 0 && !skipPatterns.test(lines[i - 1])) {
          const prevLine = lines[i - 1];
          if (!prevLine.match(/^(PG|SG|SF|PF|C|G|F|UTIL|Bench|IR|STARTERS|STATS|MIN|FG|FT|3PM|REB|AST|STL|BLK|TO|PTS)/i)) {
            teamName = prevLine;
            record = recordMatch[1];

            if (i + 1 < lines.length) {
              const standingMatch = lines[i + 1].match(/\((\d+)(st|nd|rd|th) of (\d+)\)/i);
              if (standingMatch) {
                standing = `${standingMatch[1]}${standingMatch[2]} of ${standingMatch[3]}`;
                if (i + 2 < lines.length) {
                  const ownerLine = lines[i + 2];
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
      if (line === "Last Matchup" && i + 4 < lines.length) {
        const team1 = lines[i + 1];
        const score1 = lines[i + 2];
        const team2 = lines[i + 3];
        const score2 = lines[i + 4];
        if (score1?.match(/^\d+-\d+-\d+$/) && score2?.match(/^\d+-\d+-\d+$/)) {
          lastMatchup = `${team1} ${score1} vs ${team2} ${score2}`;
        }
      }
    }

    // Try to extract team abbreviation from "Opposing Teams" section or team name pattern
    // Common pattern: "Team Name (ABBR)" in league listing
    const abbrMatch = teamName.match(/^(.+?)\s*\(([A-Z]{2,6})\)$/i);
    if (abbrMatch) {
      teamName = abbrMatch[1].trim();
      teamAbbr = abbrMatch[2].toUpperCase();
    } else {
      // Generate abbreviation from first letters of team name words
      const words = teamName.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2) {
        teamAbbr = words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
      } else if (words.length === 1 && words[0].length >= 3) {
        teamAbbr = words[0].slice(0, 4).toUpperCase();
      }
    }

    // Parse stats - look for the stats table
    const statsStartIdx = lines.findIndex((l) => l === "STATS" || l === "Research");
    const statNumbers: number[] = [];

    if (statsStartIdx > -1) {
      for (let i = statsStartIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^(MIN|FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|STATS)$/i.test(line)) continue;
        if (line.includes("ESPN.com") || line.includes("Copyright")) break;
        if (/^[.\d]+$/.test(line) || line === "--") {
          statNumbers.push(line === "--" ? 0 : parseFloat(line));
        }
      }
    }

    // Calculate averages from all player rows
    // Each player has 15 stats: MIN, FGM/FGA (skip), FG%, FTM/FTA (skip), FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
    const COLS = 15;
    const numPlayers = Math.floor(statNumbers.length / COLS);

    if (numPlayers > 0) {
      let totals = {
        fgPct: 0, ftPct: 0, threepm: 0, rebounds: 0,
        assists: 0, steals: 0, blocks: 0, turnovers: 0, points: 0,
      };
      let validCount = 0;

      for (let p = 0; p < numPlayers; p++) {
        const base = p * COLS;
        const min = statNumbers[base];
        
        // Only include active players with stats (minutes > 0)
        if (min === 0 || isNaN(min)) continue;

        validCount++;
        totals.fgPct += statNumbers[base + 2] || 0;
        totals.ftPct += statNumbers[base + 4] || 0;
        totals.threepm += statNumbers[base + 5] || 0;
        totals.rebounds += statNumbers[base + 6] || 0;
        totals.assists += statNumbers[base + 7] || 0;
        totals.steals += statNumbers[base + 8] || 0;
        totals.blocks += statNumbers[base + 9] || 0;
        totals.turnovers += statNumbers[base + 10] || 0;
        totals.points += statNumbers[base + 11] || 0;
      }

      if (validCount > 0) {
        return {
          info: { name: teamName || "Team", abbr: teamAbbr, record, standing, owner, lastMatchup },
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
          },
        };
      }
    }

    // Fallback: simple number extraction
    const simpleNumbers: number[] = [];
    for (const line of lines) {
      const numMatch = line.match(/^([.\d]+)$/);
      if (numMatch) simpleNumbers.push(parseFloat(numMatch[1]));
    }

    if (simpleNumbers.length >= 9) {
      return {
        info: { name: teamName || "Team", abbr: teamAbbr, record, standing, owner, lastMatchup },
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
        },
      };
    }

    return null;
  };

  const handleCompare = () => {
    const myParsed = parseESPNTeamPage(myTeamData);
    const oppParsed = parseESPNTeamPage(opponentData);

    if (myParsed && oppParsed) {
      onMatchupChange({
        myTeam: { ...myParsed.info, stats: myParsed.stats },
        opponent: { ...oppParsed.info, stats: oppParsed.stats },
      });
    }
  };

  const handleReset = () => {
    onMatchupChange(null);
    setMyTeamData("");
    setOpponentData("");
  };

  const formatAverage = (value: number, format: string) => {
    if (format === "pct") return formatPct(value);
    return value.toFixed(1);
  };

  const formatProjection = (value: number) => Math.round(value).toString();

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
                <li>• Stats match the view you selected on ESPN (Last 7, Last 15, Last 30, or Season Stats)</li>
                <li>• <strong>Counting stats</strong> (3PM, REB, AST, STL, BLK, TO, PTS) are multiplied by <strong>×{MULTIPLIER}</strong></li>
                <li>• <strong>Percentages</strong> (FG%, FT%) are NOT multiplied</li>
                <li>• The ×{MULTIPLIER} simulates a full matchup week (~40 player-games)</li>
                <li>• <strong>TO (Turnovers)</strong>: Lower is better - fewer turnovers wins the category</li>
              </ul>
            </div>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="gradient-card shadow-card p-4 border-border">
            <h3 className="font-display font-bold mb-2 text-stat-positive">Your Team</h3>
            <Textarea
              placeholder={`Paste the full ESPN page for your team...

Navigate to your team page and copy the whole page.`}
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

  // Calculate comparisons with projected values
  const comparisons = CATEGORIES.map((cat) => {
    const isCountingStat = COUNTING_STATS.includes(cat.key);
    const myAvg = persistedMatchup.myTeam.stats[cat.key as keyof TeamStats];
    const theirAvg = persistedMatchup.opponent.stats[cat.key as keyof TeamStats];

    const myProjected = isCountingStat ? myAvg * MULTIPLIER : myAvg;
    const theirProjected = isCountingStat ? theirAvg * MULTIPLIER : theirAvg;

    let winner: "you" | "them" | "tie";
    if (cat.key === "turnovers") {
      // Lower TO is better
      winner = myProjected < theirProjected ? "you" : myProjected > theirProjected ? "them" : "tie";
    } else {
      winner = myProjected > theirProjected ? "you" : myProjected < theirProjected ? "them" : "tie";
    }

    return {
      category: cat.label,
      key: cat.key,
      myAvg, theirAvg,
      myProjected, theirProjected,
      winner,
      format: cat.format,
      isCountingStat,
    };
  });

  const wins = comparisons.filter((c) => c.winner === "you").length;
  const losses = comparisons.filter((c) => c.winner === "them").length;
  const ties = comparisons.filter((c) => c.winner === "tie").length;

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
            Stats match your ESPN view. Counting stats × <strong className="text-amber-400">{MULTIPLIER}</strong> for
            weekly projection. FG% and FT% are NOT multiplied. <strong className="text-amber-400">TO: Lower wins.</strong>
          </span>
        </div>
      </Card>

      {/* Matchup Summary */}
      <Card className="gradient-card border-border p-6">
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Your Team</p>
            <p className="font-display font-bold text-xl md:text-2xl">
              {persistedMatchup.myTeam.name}
              {persistedMatchup.myTeam.abbr && (
                <span className="text-muted-foreground font-normal text-base ml-1">({persistedMatchup.myTeam.abbr})</span>
              )}
            </p>
            {persistedMatchup.myTeam.owner && (
              <p className="text-xs text-muted-foreground">{persistedMatchup.myTeam.owner}</p>
            )}
            {persistedMatchup.myTeam.record && (
              <p className="text-sm text-muted-foreground">{persistedMatchup.myTeam.record}</p>
            )}
            {persistedMatchup.myTeam.standing && (
              <p className="text-xs text-primary">({persistedMatchup.myTeam.standing})</p>
            )}
            {persistedMatchup.myTeam.lastMatchup && (
              <p className="text-[10px] text-muted-foreground mt-1">Last: {persistedMatchup.myTeam.lastMatchup}</p>
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
            <p className="font-display font-bold text-xl md:text-2xl">
              {persistedMatchup.opponent.name}
              {persistedMatchup.opponent.abbr && (
                <span className="text-muted-foreground font-normal text-base ml-1">({persistedMatchup.opponent.abbr})</span>
              )}
            </p>
            {persistedMatchup.opponent.owner && (
              <p className="text-xs text-muted-foreground">{persistedMatchup.opponent.owner}</p>
            )}
            {persistedMatchup.opponent.record && (
              <p className="text-sm text-muted-foreground">{persistedMatchup.opponent.record}</p>
            )}
            {persistedMatchup.opponent.standing && (
              <p className="text-xs text-primary">({persistedMatchup.opponent.standing})</p>
            )}
            {persistedMatchup.opponent.lastMatchup && (
              <p className="text-[10px] text-muted-foreground mt-1">Last: {persistedMatchup.opponent.lastMatchup}</p>
            )}
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

      {/* Team Averages Summary */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Your Team */}
        <Card className="gradient-card border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-stat-positive">{persistedMatchup.myTeam.name}</h3>
            <span className="text-xs text-muted-foreground">Weekly projection (×{MULTIPLIER})</span>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            <StatBox label="PTS" avg={persistedMatchup.myTeam.stats.points} projected multiplier={MULTIPLIER} highlight />
            <StatBox label="REB" avg={persistedMatchup.myTeam.stats.rebounds} projected multiplier={MULTIPLIER} />
            <StatBox label="AST" avg={persistedMatchup.myTeam.stats.assists} projected multiplier={MULTIPLIER} />
            <StatBox label="3PM" avg={persistedMatchup.myTeam.stats.threepm} projected multiplier={MULTIPLIER} />
            <StatBox label="STL" avg={persistedMatchup.myTeam.stats.steals} projected multiplier={MULTIPLIER} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <StatBox label="BLK" avg={persistedMatchup.myTeam.stats.blocks} projected multiplier={MULTIPLIER} />
            <StatBox label="TO" avg={persistedMatchup.myTeam.stats.turnovers} projected multiplier={MULTIPLIER} negative />
            <StatBox label="FG%" avg={persistedMatchup.myTeam.stats.fgPct} isPct />
            <StatBox label="FT%" avg={persistedMatchup.myTeam.stats.ftPct} isPct />
          </div>
        </Card>

        {/* Opponent */}
        <Card className="gradient-card border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-stat-negative">{persistedMatchup.opponent.name}</h3>
            <span className="text-xs text-muted-foreground">Weekly projection (×{MULTIPLIER})</span>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            <StatBox label="PTS" avg={persistedMatchup.opponent.stats.points} projected multiplier={MULTIPLIER} highlight />
            <StatBox label="REB" avg={persistedMatchup.opponent.stats.rebounds} projected multiplier={MULTIPLIER} />
            <StatBox label="AST" avg={persistedMatchup.opponent.stats.assists} projected multiplier={MULTIPLIER} />
            <StatBox label="3PM" avg={persistedMatchup.opponent.stats.threepm} projected multiplier={MULTIPLIER} />
            <StatBox label="STL" avg={persistedMatchup.opponent.stats.steals} projected multiplier={MULTIPLIER} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <StatBox label="BLK" avg={persistedMatchup.opponent.stats.blocks} projected multiplier={MULTIPLIER} />
            <StatBox label="TO" avg={persistedMatchup.opponent.stats.turnovers} projected multiplier={MULTIPLIER} negative />
            <StatBox label="FG%" avg={persistedMatchup.opponent.stats.fgPct} isPct />
            <StatBox label="FT%" avg={persistedMatchup.opponent.stats.ftPct} isPct />
          </div>
        </Card>
      </div>

      {/* Category Breakdown */}
      <div className="space-y-3">
        {comparisons.map((comp) => (
          <Card
            key={comp.category}
            className={cn(
              "border-border p-4 transition-all",
              comp.winner === "you" && "bg-stat-positive/5 border-stat-positive/30",
              comp.winner === "them" && "bg-stat-negative/5 border-stat-negative/30",
              comp.winner === "tie" && "bg-muted/20"
            )}
          >
            <div className="flex items-center justify-between">
              <div className={cn("flex-1 text-center", comp.winner === "you" && "text-stat-positive")}>
                {comp.isCountingStat ? (
                  <>
                    <p className="font-display font-bold text-2xl md:text-3xl">{formatProjection(comp.myProjected)}</p>
                    <p className="text-xs text-muted-foreground">avg: {formatAverage(comp.myAvg, comp.format)}</p>
                  </>
                ) : (
                  <p className="font-display font-bold text-2xl md:text-3xl">{formatAverage(comp.myAvg, comp.format)}</p>
                )}
                {comp.winner === "you" && (
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <ArrowRight className="w-4 h-4" />
                    <span className="text-xs font-medium">WIN</span>
                  </div>
                )}
              </div>

              <div className="px-4 md:px-8">
                <div
                  className={cn(
                    "px-4 py-2 rounded-lg font-display font-bold text-sm md:text-base",
                    comp.winner === "you" && "bg-stat-positive/20 text-stat-positive",
                    comp.winner === "them" && "bg-stat-negative/20 text-stat-negative",
                    comp.winner === "tie" && "bg-muted text-muted-foreground"
                  )}
                >
                  {comp.category}
                  {comp.key === "turnovers" && <span className="text-xs ml-1">(lower)</span>}
                </div>
              </div>

              <div className={cn("flex-1 text-center", comp.winner === "them" && "text-stat-negative")}>
                {comp.isCountingStat ? (
                  <>
                    <p className="font-display font-bold text-2xl md:text-3xl">{formatProjection(comp.theirProjected)}</p>
                    <p className="text-xs text-muted-foreground">avg: {formatAverage(comp.theirAvg, comp.format)}</p>
                  </>
                ) : (
                  <p className="font-display font-bold text-2xl md:text-3xl">{formatAverage(comp.theirAvg, comp.format)}</p>
                )}
                {comp.winner === "them" && (
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

// StatBox component for team averages display
interface StatBoxProps {
  label: string;
  avg: number;
  projected?: boolean;
  multiplier?: number;
  isPct?: boolean;
  highlight?: boolean;
  negative?: boolean;
}

const StatBox = ({ label, avg, projected, multiplier = 40, isPct, highlight, negative }: StatBoxProps) => (
  <div className="text-center">
    <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
    {isPct ? (
      <p className="font-display font-bold text-lg">{formatPct(avg)}</p>
    ) : (
      <>
        <p className="text-xs text-muted-foreground">{avg.toFixed(1)}</p>
        <p className={cn(
          "font-display font-bold text-lg",
          highlight && "text-primary",
          negative && "text-stat-negative"
        )}>
          {Math.round(avg * multiplier)}
        </p>
      </>
    )}
  </div>
);