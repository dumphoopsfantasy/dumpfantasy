import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PlayerStats } from "@/types/player";

interface DataUploadProps {
  onDataParsed: (data: PlayerStats[]) => void;
}

export const DataUpload = ({ onDataParsed }: DataUploadProps) => {
  const [rawData, setRawData] = useState("");
  const { toast } = useToast();

  const parseESPNData = (data: string): PlayerStats[] => {
    console.log('Starting to parse ESPN data...');
    const text = data.trim();
    
    // Split by STATS to separate player info from stats
    const parts = text.split(/STATS/i);
    if (parts.length < 2) {
      console.log('Could not find STATS section');
      return [];
    }

    const playerSection = parts[0];
    const statsSection = parts[1];

    console.log('Found player and stats sections');

    // Parse player info
    const playerLines = playerSection.split('\n');
    const players: Array<{slot: string, player: string, team: string, position: string, opponent: string}> = [];
    
    let currentSlot = '';
    let currentPlayer = '';
    let currentTeam = '';
    let currentPosition = '';
    let currentOpponent = '';

    for (let i = 0; i < playerLines.length; i++) {
      const line = playerLines[i].trim();
      const cols = line.split('\t');
      
      // Check if this is a slot line (PG, SG, SF, PF, C, G, F/C, UTIL, Bench, IR)
      if (/^(PG|SG|SF|PF|C|G|F\/C|UTIL|Bench|IR)$/i.test(cols[0])) {
        // Save previous player if we have one
        if (currentPlayer) {
          players.push({
            slot: currentSlot,
            player: currentPlayer,
            team: currentTeam,
            position: currentPosition,
            opponent: currentOpponent
          });
        }
        
        // Start new player
        currentSlot = cols[0];
        currentPlayer = '';
        currentTeam = '';
        currentPosition = '';
        currentOpponent = '';
        continue;
      }

      // Look for player name (appears on its own line or repeated - ESPN doubles names)
      if (currentSlot && !currentPlayer) {
        for (const col of cols) {
          const trimmed = col.trim();
          if (trimmed.length > 5 && 
              !/^(MOVE|PM|AM|--|DTD|O|STARTERS|Bench|IR)$/i.test(trimmed) &&
              !/^\d/.test(trimmed) && 
              !trimmed.includes(':') &&
              /^[A-Za-z\s\.'-]+$/.test(trimmed)) {
            // Check if name is doubled (e.g., "Jamal MurrayJamal Murray")
            const halfLen = Math.floor(trimmed.length / 2);
            const firstHalf = trimmed.substring(0, halfLen);
            const secondHalf = trimmed.substring(halfLen);
            if (firstHalf === secondHalf) {
              currentPlayer = firstHalf;
            } else {
              currentPlayer = trimmed;
            }
            break;
          }
        }
      }

      // Look for team code (2-4 letters, case insensitive)
      if (currentSlot && !currentTeam) {
        for (const col of cols) {
          const trimmed = col.trim();
          if (/^[A-Za-z]{2,4}$/.test(trimmed) && !/^(MOVE|DTD|SLOT|OPP|MIN|PTS|REB|AST|STL|BLK)$/i.test(trimmed)) {
            currentTeam = trimmed.toUpperCase();
            break;
          }
        }
      }

      // Look for position (PG, SG, SF, PF, C or combinations with commas)
      if (currentSlot && !currentPosition) {
        for (const col of cols) {
          const trimmed = col.trim();
          if (/^(PG|SG|SF|PF|C)(,\s*(PG|SG|SF|PF|C))*$/.test(trimmed)) {
            currentPosition = trimmed;
            break;
          }
        }
      }

      // Look for opponent (@ prefix or another team code after we have our team)
      if (currentSlot && currentTeam && !currentOpponent) {
        for (const col of cols) {
          const trimmed = col.trim();
          if (trimmed.startsWith('@')) {
            currentOpponent = trimmed;
            break;
          } else if (/^[A-Z]{2,4}$/.test(trimmed) && trimmed !== currentTeam && trimmed !== 'MOVE') {
            currentOpponent = trimmed;
            break;
          }
        }
      }
    }

    // Don't forget the last player
    if (currentPlayer) {
      players.push({
        slot: currentSlot,
        player: currentPlayer,
        team: currentTeam,
        position: currentPosition,
        opponent: currentOpponent
      });
    }

    console.log(`Found ${players.length} players:`, players.map(p => p.player));

    // Parse stats section - handle ESPN "Last 15" copy format where each stat value is on its own line
    const statsLines = statsSection
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Collect only numeric-ish tokens that represent stats values
    const statTokens: string[] = [];
    for (const line of statsLines) {
      // Skip obvious non-stat lines
      if (/^(STATS|Research|MIN|FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-)$/i.test(line)) {
        continue;
      }

      // Tokens we care about: numbers (including those starting with "."), "--" placeholders, or fractions
      if (/^[-+]?\d*\.?\d+$/.test(line) || line === "--" || /\d+\.\d+\/\d+\.\d+/.test(line)) {
        statTokens.push(line);
      }
    }

    console.log("Collected stat tokens", { count: statTokens.length });

    // ESPN stats table has 15 columns: MIN, FGM/FGA, FG%, FTM/FTA, FT%, 3PM, REB, AST, STL, BLK, TO, PTS, PR15, %ROST, +/-
    const COLUMNS_PER_PLAYER = 15;
    const statsData: number[][] = [];

    const expectedRows = Math.floor(statTokens.length / COLUMNS_PER_PLAYER);

    for (let row = 0; row < expectedRows; row++) {
      const base = row * COLUMNS_PER_PLAYER;
      const slice = statTokens.slice(base, base + COLUMNS_PER_PLAYER);

      const numericSlice = slice.map((token) => {
        // We ignore made/attempt lines like "9.7/18.4" and just return 0 for them
        if (/^--$/.test(token) || /\d+\.\d+\/\d+\.\d+/.test(token)) {
          return 0;
        }
        const val = parseFloat(token.replace(/^[+]/, ""));
        return isNaN(val) ? 0 : val;
      });

      statsData.push(numericSlice);
    }

    console.log(`Built ${statsData.length} stat rows from tokens`);

    // Match players with stats by index
    const result: PlayerStats[] = [];
    const maxLen = Math.min(players.length, statsData.length);

    for (let i = 0; i < maxLen; i++) {
      const playerInfo = players[i];
      const stats = statsData[i];

      result.push({
        slot: playerInfo.slot,
        player: playerInfo.player,
        team: playerInfo.team,
        position: playerInfo.position,
        opponent: playerInfo.opponent,
        minutes: stats[0] || 0,
        fgPct: stats[2] || 0,
        ftPct: stats[4] || 0,
        threepm: stats[5] || 0,
        rebounds: stats[6] || 0,
        assists: stats[7] || 0,
        steals: stats[8] || 0,
        blocks: stats[9] || 0,
        turnovers: stats[10] || 0,
        points: stats[11] || 0,
      });
    }

    console.log(`Returning ${result.length} complete player records`);
    return result;
   };

  const handleParse = () => {
    if (!rawData.trim()) {
      toast({
        title: "No data",
        description: "Please paste your ESPN data first",
        variant: "destructive",
      });
      return;
    }

    try {
      const parsedData = parseESPNData(rawData);
      
      if (parsedData.length === 0) {
        toast({
          title: "No players found",
          description: "Could not parse any player data. Make sure you copied the full table from ESPN.",
          variant: "destructive",
        });
        return;
      }

      onDataParsed(parsedData);
      toast({
        title: "Success!",
        description: `Loaded ${parsedData.length} players`,
      });
    } catch (error) {
      toast({
        title: "Parse error",
        description: "Could not parse the data. Please check the format.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="gradient-card shadow-card p-6 border-border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-lg bg-primary/10">
          <FileSpreadsheet className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-display font-bold">Import ESPN Data</h2>
          <p className="text-sm text-muted-foreground">
            Copy and paste your player stats from ESPN Fantasy
          </p>
        </div>
      </div>

      <Textarea
        placeholder="Paste your complete ESPN roster here - include both the player names section and the stats section below it..."
        value={rawData}
        onChange={(e) => setRawData(e.target.value)}
        className="min-h-[200px] font-mono text-sm mb-4 bg-muted/50"
      />

      <Button 
        onClick={handleParse}
        className="w-full gradient-primary shadow-glow font-display font-bold text-lg"
      >
        <Upload className="w-5 h-5 mr-2" />
        Load Players
      </Button>

      <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
        <h3 className="text-sm font-semibold mb-2">How to copy from ESPN:</h3>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Go to your ESPN Fantasy Basketball team roster page</li>
          <li>Click and drag to select your entire roster table</li>
          <li>Make sure to include both the player names AND the stats section below</li>
          <li>Copy (Ctrl+C or Cmd+C) and paste here</li>
          <li>Click "Load Players" to analyze</li>
        </ol>
      </div>
    </Card>
  );
};
