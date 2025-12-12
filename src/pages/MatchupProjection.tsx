import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ArrowRight, Trophy, Target, Minus, Upload, RefreshCw, Info, AlertTriangle } from "lucide-react";
import { formatPct, CATEGORIES } from "@/lib/crisUtils";

// Detect stat window from ESPN paste
const detectStatWindow = (data: string): string | null => {
  // Look for stat window patterns in the Stats section specifically
  const statsPattern = /Stats\s+(Last\s+\d+|2024|2025|2026|Season|Projections)/i;
  const match = data.match(statsPattern);
  if (match) {
    return match[1].replace(/\s+/g, ' ').trim();
  }
  
  // Fallback patterns
  const patterns = [
    /Last\s+7/i,
    /Last\s+15/i,
    /Last\s+30/i,
    /2024\s+Season/i,
    /2025\s+Season/i,
    /2026\s+Season/i,
    /Season\s+Averages/i,
    /Projections/i,
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(data)) {
      const m = data.match(pattern);
      return m ? m[0].replace(/\s+/g, ' ').trim() : null;
    }
  }
  
  return null;
};

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
  const [statWindowMismatch, setStatWindowMismatch] = useState<{ myWindow: string | null; oppWindow: string | null } | null>(null);

  // Extract opponent name from "Current Matchup" section
  const extractOpponentFromCurrentMatchup = (data: string, myTeamName: string): string | null => {
    const lines = data.trim().split("\n").map(l => l.trim()).filter(l => l);
    
    // Find "Current Matchup" section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase() === 'current matchup') {
        // Look at the next few lines for team names and W-L-T records
        // Format: "Team Name" followed by "W-L-T" (e.g., "Mr. Bane" then "6-3-0")
        const matchupTeams: string[] = [];
        
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const line = lines[j];
          // Skip stat headers and navigation
          if (/^(FG%|FT%|3PM|REB|AST|STL|BLK|TO|PTS|Last Matchup|Matchup History|Season|Stats|MIN)$/i.test(line)) break;
          
          // Check if next line is a W-L-T record - if so, current line is a team name
          const nextLine = lines[j + 1];
          if (nextLine && /^\d+-\d+-\d+$/.test(nextLine) && line.length >= 2 && line.length <= 50) {
            // Skip ESPN navigation-like text
            if (!/^(Start|Bench|Set|Trade|Waiver|Full|LM Tools)/i.test(line)) {
              matchupTeams.push(line);
            }
          }
        }
        
        // Find the team that is NOT myTeamName (case-insensitive)
        if (matchupTeams.length >= 2) {
          const opponent = matchupTeams.find(t => t.toLowerCase() !== myTeamName.toLowerCase());
          if (opponent) return opponent;
        } else if (matchupTeams.length === 1 && matchupTeams[0].toLowerCase() !== myTeamName.toLowerCase()) {
          return matchupTeams[0];
        }
        break;
      }
    }
    return null;
  };

  // Parse ESPN full page paste - extract team info and calculate averages from active players
  const parseESPNTeamPage = (data: string): { info: TeamInfo; stats: TeamStats } | null => {
    const lines = data
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);

    // Skip ESPN navigation and irrelevant text like "Team Settings"
    const skipPatterns =
      /^(hsb\.|ESPN|NFL|NBA|MLB|NCAAF|NHL|Soccer|WNBA|More Sports|Watch|Fantasy|Where to Watch|Fantasy Basketball Home|My Team|League|Settings|Members|Rosters|Schedule|Message Board|Transaction Counter|History|Draft Recap|Email League|Recent Activity|Players|Add Players|Watch List|Daily Leaders|Live Draft Trends|Added \/ Dropped|Player Rater|Player News|Projections|Waiver Order|Waiver Report|Undroppables|FantasyCast|Scoreboard|Standings|Opposing Teams|ESPN BET|Copyright|ESPN\.com|Member Services|Interest-Based|Privacy|Terms|NBPA|Team Settings|LM Tools)$/i;

    let teamName = "";
    let teamAbbr = "";
    let record = "";
    let standing = "";
    let owner = "";
    let lastMatchup = "";

    // Find team info block pattern - look for "Team Name" followed by record and standing
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (skipPatterns.test(line)) continue;
      
      // Look for standing pattern like "(5th of 10)" which uniquely identifies the team header block
      const standingMatch = line.match(/^\((\d+)(st|nd|rd|th)\s+of\s+(\d+)\)$/i);
      if (standingMatch && i >= 2) {
        // Standing found - look backwards for record and team name
        const recordLine = lines[i - 1];
        let teamLine = lines[i - 2];
        
        // Skip "Team Settings" if it's the team line
        if (skipPatterns.test(teamLine) && i >= 3) {
          teamLine = lines[i - 3];
        }
        
        const recordMatch = recordLine.match(/^(\d+-\d+-\d+)$/);
        if (recordMatch && teamLine && !skipPatterns.test(teamLine) && 
            !teamLine.match(/^(PG|SG|SF|PF|C|G|F|UTIL|Bench|IR|STARTERS|STATS|MIN|FG|FT|3PM|REB|AST|STL|BLK|TO|PTS|LM Tools|Get Another Team|Team Settings)/i)) {
          teamName = teamLine;
          record = recordMatch[1];
          standing = `${standingMatch[1]}${standingMatch[2]} of ${standingMatch[3]}`;
          
          // Look for owner name after standing - typically "FirstName LastName" pattern
          // Skip "Team Settings" and similar
          for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
            const ownerLine = lines[j];
            // Skip navigation/settings text
            if (skipPatterns.test(ownerLine)) continue;
            if (ownerLine.length < 5) continue;
            if (/^(Waiver|Full|Last|Current|Set|Trade|Matchup|Season|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Today|Fri|Sat|Sun|Mon|Tue|Wed|Thu)/i.test(ownerLine)) continue;
            
            // Match owner pattern: "FirstName LastName" (two capitalized words)
            const ownerMatch = ownerLine.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)$/);
            if (ownerMatch) {
              owner = ownerMatch[1];
              break;
            }
          }
          break; // Found the main team info block
        }
      }
    }

    // Look for "Last Matchup" section
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === "Last Matchup" && i + 4 < lines.length) {
        const team1 = lines[i + 1];
        const score1 = lines[i + 2];
        const team2 = lines[i + 3];
        const score2 = lines[i + 4];
        if (score1?.match(/^\d+-\d+-\d+$/) && score2?.match(/^\d+-\d+-\d+$/)) {
          lastMatchup = `${team1} ${score1} vs ${team2} ${score2}`;
        }
        break;
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

    // Parse stats - align with Free Agents / Roster table structure
    const statTokens: string[] = [];

    // Find the stats section - look for "MIN" followed by stat headers
    let statsStartIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'MIN' && i + 1 < lines.length) {
        const nextFew = lines.slice(i, i + 5).join(' ');
        if (nextFew.includes('FG') || nextFew.includes('3PM') || nextFew.includes('REB')) {
          statsStartIdx = i;
          break;
        }
      }
    }

    if (statsStartIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/^STATS$/i.test(lines[i]) || /^Research$/i.test(lines[i])) {
          for (let j = i; j < Math.min(i + 20, lines.length); j++) {
            if (lines[j] === 'MIN') {
              statsStartIdx = j;
              break;
            }
          }
          if (statsStartIdx > -1) break;
        }
      }
    }

    const COLS = 17;
    let validCount = 0;
    let sums = {
      fgPct: 0,
      ftPct: 0,
      threepm: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      points: 0,
    };

    if (statsStartIdx > -1) {
      let dataStartIdx = statsStartIdx + 1;
      while (
        dataStartIdx < lines.length &&
        /^(FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-|Research|MIN)$/i.test(
          lines[dataStartIdx]
        )
      ) {
        dataStartIdx++;
      }

      for (let i = dataStartIdx; i < lines.length; i++) {
        const line = lines[i];

        if (/^(Username|Password|ESPN\.com|Copyright|©|Sign\s*(Up|In)|Log\s*In|Terms\s*of|Privacy|Fantasy Basketball Support)/i.test(line)) {
          break;
        }

        if (/^(Fantasy|Support|About|Help|Contact|Page|Showing|Results|\d+\s+of\s+\d+)$/i.test(line)) continue;

        if (/^(\d+\s+)+\.\.\.\s*\d+$/.test(line)) continue;

        if (/^\d+\.?\d*\/\d+\.?\d*$/.test(line)) {
          const parts = line.split('/');
          statTokens.push(parts[0], parts[1]);
          continue;
        }

        if (/^[-+]?\d+\.?\d*$/.test(line) || /^\.\d+$/.test(line) || line === '--') {
          statTokens.push(line);
        }
      }

      const numStatRows = Math.floor(statTokens.length / COLS);
      for (let i = 0; i < numStatRows; i++) {
        const base = i * COLS;
        const parseVal = (idx: number): number => {
          const val = statTokens[base + idx];
          if (!val || val === '--') return 0;
          return parseFloat(val);
        };

        const min = parseVal(0);
        if (!min || isNaN(min) || min === 0) continue;

        let fgPct = parseVal(3);
        if (fgPct > 1) fgPct = fgPct / (fgPct >= 100 ? 1000 : 100);

        let ftPct = parseVal(6);
        if (ftPct > 1) ftPct = ftPct / (ftPct >= 100 ? 1000 : 100);

        sums.fgPct += fgPct;
        sums.ftPct += ftPct;
        sums.threepm += parseVal(7);
        sums.rebounds += parseVal(8);
        sums.assists += parseVal(9);
        sums.steals += parseVal(10);
        sums.blocks += parseVal(11);
        sums.turnovers += parseVal(12);
        sums.points += parseVal(13);
        validCount++;
      }
    }

    if (validCount > 0) {
      return {
        info: { name: teamName || "Team", abbr: teamAbbr, record, standing, owner, lastMatchup },
        stats: {
          fgPct: sums.fgPct / validCount,
          ftPct: sums.ftPct / validCount,
          threepm: sums.threepm / validCount,
          rebounds: sums.rebounds / validCount,
          assists: sums.assists / validCount,
          steals: sums.steals / validCount,
          blocks: sums.blocks / validCount,
          turnovers: sums.turnovers / validCount,
          points: sums.points / validCount,
        },
      };
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

    // Detect stat windows
    const myWindow = detectStatWindow(myTeamData);
    const oppWindow = detectStatWindow(opponentData);
    
    // Check for mismatch
    if (myWindow && oppWindow && myWindow.toLowerCase() !== oppWindow.toLowerCase()) {
      setStatWindowMismatch({ myWindow, oppWindow });
    } else {
      setStatWindowMismatch(null);
    }

    if (myParsed && oppParsed) {
      const finalOppInfo = { ...oppParsed.info };
      
      // Try to extract opponent from "Current Matchup" section of my team's paste
      const opponentFromCurrentMatchup = extractOpponentFromCurrentMatchup(myTeamData, myParsed.info.name);
      
      // If opponent name is same as my team or empty, try to find the correct opponent
      if (finalOppInfo.name === myParsed.info.name || !finalOppInfo.name || finalOppInfo.name === "Team") {
        if (opponentFromCurrentMatchup) {
          finalOppInfo.name = opponentFromCurrentMatchup;
        } else {
          // Fallback: Try to find a different team name in opponent data
          const oppLines = opponentData.trim().split("\n").map(l => l.trim()).filter(l => l);
          const skipPatterns = /^(Team Settings|LM Tools|hsb\.|ESPN|Settings|Get Another Team)$/i;
          
          for (let i = 0; i < oppLines.length; i++) {
            const line = oppLines[i];
            // Look for record pattern and get preceding line
            if (/^\d+-\d+-\d+$/.test(line) && i > 0) {
              const prevLine = oppLines[i - 1];
              if (prevLine !== myParsed.info.name && 
                  !skipPatterns.test(prevLine) &&
                  prevLine.length >= 2 && 
                  prevLine.length <= 50 && 
                  !/^(PG|SG|SF|PF|C|G|F|UTIL|Bench|IR|STARTERS|STATS|MIN)/i.test(prevLine)) {
                finalOppInfo.name = prevLine;
                finalOppInfo.record = line;
                break;
              }
            }
          }
          
          // If still same name, set to "—" to indicate parsing failure
          if (finalOppInfo.name === myParsed.info.name) {
            finalOppInfo.name = "—";
          }
        }
      }
      
      // Validate: opponent name must differ from my team name
      if (finalOppInfo.name.toLowerCase() === myParsed.info.name.toLowerCase()) {
        finalOppInfo.name = "—";
      }
      
      onMatchupChange({
        myTeam: { ...myParsed.info, stats: myParsed.stats },
        opponent: { ...finalOppInfo, stats: oppParsed.stats },
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
                <li>• <strong>Team Average</strong> = (Sum of all active player stats) ÷ (Number of active players)</li>
                <li>• <strong>Weekly projection</strong> = Team Average × <strong>{MULTIPLIER}</strong></li>
                <li>• <strong>Percentages</strong> (FG%, FT%) = Team average (NOT multiplied)</li>
                <li>• <strong>TO (Turnovers)</strong>: Lower is better - fewer turnovers wins the category</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Stat Window Mismatch Alert */}
        {statWindowMismatch && (
          <Alert variant="destructive" className="border-stat-negative/50 bg-stat-negative/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              <span className="font-semibold">Stat window mismatch detected!</span> Your team is using <span className="font-bold text-primary">{statWindowMismatch.myWindow}</span> stats, 
              but your opponent is using <span className="font-bold text-primary">{statWindowMismatch.oppWindow}</span> stats. 
              For accurate comparison, ensure both teams use the same stat window on ESPN before pasting.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="gradient-card shadow-card p-4 border-border">
            <h3 className="font-display font-bold mb-2 text-stat-positive">Your Team</h3>
            <Textarea
              placeholder={`Paste the full ESPN page for your team...

Navigate to your team page and copy the whole page.`}
              value={myTeamData}
              onChange={(e) => {
                setMyTeamData(e.target.value);
                // Real-time stat window mismatch detection
                const myWindow = detectStatWindow(e.target.value);
                const oppWindow = opponentData ? detectStatWindow(opponentData) : null;
                if (myWindow && oppWindow && myWindow !== oppWindow) {
                  setStatWindowMismatch({ myWindow, oppWindow });
                } else if (!myWindow || !oppWindow || myWindow === oppWindow) {
                  setStatWindowMismatch(null);
                }
              }}
              className="min-h-[200px] font-mono text-sm bg-muted/50"
            />
          </Card>

          <Card className="gradient-card shadow-card p-4 border-border">
            <h3 className="font-display font-bold mb-2 text-stat-negative">Opponent</h3>
            <Textarea
              placeholder={`Paste the full ESPN page for opponent...

Navigate to their team page and copy the whole page.`}
              value={opponentData}
              onChange={(e) => {
                setOpponentData(e.target.value);
                // Real-time stat window mismatch detection
                const myWindow = myTeamData ? detectStatWindow(myTeamData) : null;
                const oppWindow = detectStatWindow(e.target.value);
                if (myWindow && oppWindow && myWindow !== oppWindow) {
                  setStatWindowMismatch({ myWindow, oppWindow });
                } else if (!myWindow || !oppWindow || myWindow === oppWindow) {
                  setStatWindowMismatch(null);
                }
              }}
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
            Team average × <strong className="text-amber-400">{MULTIPLIER}</strong> = weekly projection.
            FG%/FT% = team average. <strong className="text-amber-400">TO: Lower wins.</strong>
          </span>
        </div>
      </Card>

      {/* Matchup Summary - Compact */}
      <Card className="gradient-card border-border p-4">
        <div className="flex items-center justify-center gap-3 md:gap-6">
          <div className="text-center flex-1 max-w-[200px]">
            <p className="text-xs text-muted-foreground mb-0.5">Your Team</p>
            <p className="font-display font-bold text-base md:text-lg truncate">
              {persistedMatchup.myTeam.name}
            </p>
            {persistedMatchup.myTeam.owner && (
              <p className="text-[10px] text-muted-foreground">{persistedMatchup.myTeam.owner}</p>
            )}
            <p className="text-xs text-muted-foreground">{persistedMatchup.myTeam.record}</p>
          </div>
          
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/30">
            <span className="font-display font-bold text-xl md:text-2xl text-stat-positive">{wins}</span>
            <span className="text-muted-foreground text-sm">-</span>
            <span className="font-display font-bold text-xl md:text-2xl text-stat-negative">{losses}</span>
            <span className="text-muted-foreground text-sm">-</span>
            <span className="font-display font-bold text-xl md:text-2xl text-muted-foreground">{ties}</span>
          </div>
          
          <div className="text-center flex-1 max-w-[200px]">
            <p className="text-xs text-muted-foreground mb-0.5">Opponent</p>
            <p className="font-display font-bold text-base md:text-lg truncate">
              {persistedMatchup.opponent.name}
            </p>
            {persistedMatchup.opponent.owner && (
              <p className="text-[10px] text-muted-foreground">{persistedMatchup.opponent.owner}</p>
            )}
            <p className="text-xs text-muted-foreground">{persistedMatchup.opponent.record}</p>
          </div>
        </div>

        <div className="text-center mt-3 pt-3 border-t border-border">
          {wins > losses ? (
            <p className="text-stat-positive font-display font-semibold text-sm flex items-center justify-center gap-1.5">
              <Trophy className="w-4 h-4" />
              Projected WIN {wins}-{losses}-{ties}
            </p>
          ) : wins < losses ? (
            <p className="text-stat-negative font-display font-semibold text-sm flex items-center justify-center gap-1.5">
              <Target className="w-4 h-4" />
              Projected LOSE {losses}-{wins}-{ties}
            </p>
          ) : (
            <p className="text-muted-foreground font-display font-semibold text-sm flex items-center justify-center gap-1.5">
              <Minus className="w-4 h-4" />
              Projected TIE {wins}-{losses}-{ties}
            </p>
          )}
        </div>
      </Card>

      {/* Team Averages Summary - Compact */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Your Team */}
        <Card className="gradient-card border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-semibold text-sm text-stat-positive">{persistedMatchup.myTeam.name}</h3>
            <span className="text-[10px] text-muted-foreground">×{MULTIPLIER}</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            <StatBox label="PTS" avg={persistedMatchup.myTeam.stats.points} multiplier={MULTIPLIER} />
            <StatBox label="REB" avg={persistedMatchup.myTeam.stats.rebounds} multiplier={MULTIPLIER} />
            <StatBox label="AST" avg={persistedMatchup.myTeam.stats.assists} multiplier={MULTIPLIER} />
            <StatBox label="3PM" avg={persistedMatchup.myTeam.stats.threepm} multiplier={MULTIPLIER} />
            <StatBox label="STL" avg={persistedMatchup.myTeam.stats.steals} multiplier={MULTIPLIER} />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <StatBox label="BLK" avg={persistedMatchup.myTeam.stats.blocks} multiplier={MULTIPLIER} />
            <StatBox label="TO" avg={persistedMatchup.myTeam.stats.turnovers} multiplier={MULTIPLIER} />
            <StatBox label="FG%" avg={persistedMatchup.myTeam.stats.fgPct} isPct />
            <StatBox label="FT%" avg={persistedMatchup.myTeam.stats.ftPct} isPct />
          </div>
        </Card>

        <Card className="gradient-card border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-semibold text-sm text-stat-negative">{persistedMatchup.opponent.name}</h3>
            <span className="text-[10px] text-muted-foreground">×{MULTIPLIER}</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            <StatBox label="PTS" avg={persistedMatchup.opponent.stats.points} multiplier={MULTIPLIER} />
            <StatBox label="REB" avg={persistedMatchup.opponent.stats.rebounds} multiplier={MULTIPLIER} />
            <StatBox label="AST" avg={persistedMatchup.opponent.stats.assists} multiplier={MULTIPLIER} />
            <StatBox label="3PM" avg={persistedMatchup.opponent.stats.threepm} multiplier={MULTIPLIER} />
            <StatBox label="STL" avg={persistedMatchup.opponent.stats.steals} multiplier={MULTIPLIER} />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <StatBox label="BLK" avg={persistedMatchup.opponent.stats.blocks} multiplier={MULTIPLIER} />
            <StatBox label="TO" avg={persistedMatchup.opponent.stats.turnovers} multiplier={MULTIPLIER} />
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

// StatBox component for team averages display - avg bold, projection smaller
interface StatBoxProps {
  label: string;
  avg: number;
  projected?: boolean;
  multiplier?: number;
  isPct?: boolean;
}

const StatBox = ({ label, avg, multiplier = 40, isPct }: StatBoxProps) => (
  <div className="text-center">
    <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
    {isPct ? (
      <p className="font-display font-bold text-sm">{formatPct(avg)}</p>
    ) : (
      <>
        <p className="font-display font-bold text-sm">{avg.toFixed(1)}</p>
        <p className="text-[10px] text-muted-foreground">
          {Math.round(avg * multiplier)}
        </p>
      </>
    )}
  </div>
);