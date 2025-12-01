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
    const lines = data.trim().split('\n');
    const players: PlayerStats[] = [];

    // Find where player names start and stats start
    let playerSection: Array<{slot: string, player: string, team: string, position: string, opponent: string}> = [];
    let inStatsSection = false;
    let statsIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split('\t');

      // Check if we're in the stats section
      if (line.includes('MIN') && line.includes('FG%') && line.includes('PTS')) {
        inStatsSection = true;
        continue;
      }

      // Parse player info section
      if (!inStatsSection && cols.length >= 4) {
        const slot = cols[0]?.trim();
        
        // Skip header and empty rows
        if (!slot || slot === 'SLOT' || slot === 'STARTERS' || slot === 'Bench' || slot === 'IR') {
          continue;
        }

        // Find the player name (it's usually repeated in the data)
        let playerName = '';
        let team = '';
        let position = '';
        let opponent = '';

        for (let j = 0; j < cols.length; j++) {
          const col = cols[j]?.trim();
          
          // Player name appears multiple times, grab the first clean one
          if (!playerName && col && col.length > 3 && 
              !['MOVE', 'PM', 'AM', '--', 'DTD', 'O'].includes(col) &&
              !/^\d/.test(col) && !col.includes(':')) {
            // Check if it's a repeated name pattern
            const words = col.split(' ');
            if (words.length >= 2) {
              playerName = col;
            }
          }

          // Team is usually 2-4 letter code
          if (!team && col && col.length >= 2 && col.length <= 4 && 
              col === col.toUpperCase() && /^[A-Z]+$/.test(col) &&
              col !== 'MOVE') {
            team = col;
          }

          // Position comes after team (PG, SG, SF, PF, C or combinations)
          if (team && !position && col && 
              /^(PG|SG|SF|PF|C)(,\s*(PG|SG|SF|PF|C))*$/.test(col)) {
            position = col;
          }

          // Opponent starts with @ or is a team code
          if (col && (col.startsWith('@') || (col.length >= 2 && col.length <= 4 && col !== team && col !== 'MOVE'))) {
            if (!opponent && col !== '--' && !/\d/.test(col) && !col.includes(':')) {
              opponent = col;
            }
          }
        }

        if (playerName) {
          playerSection.push({ slot, player: playerName, team, position, opponent });
        }
      }

      // Parse stats section
      if (inStatsSection && cols.length >= 12) {
        // Stats should be numeric
        const minutes = parseFloat(cols[0]);
        
        if (!isNaN(minutes) && minutes > 0) {
          const fgPct = parseFloat(cols[2]) || 0;
          const ftPct = parseFloat(cols[4]) || 0;
          const threepm = parseFloat(cols[5]) || 0;
          const rebounds = parseFloat(cols[6]) || 0;
          const assists = parseFloat(cols[7]) || 0;
          const steals = parseFloat(cols[8]) || 0;
          const blocks = parseFloat(cols[9]) || 0;
          const turnovers = parseFloat(cols[10]) || 0;
          const points = parseFloat(cols[11]) || 0;

          // Match with player from player section
          if (statsIndex < playerSection.length) {
            const playerInfo = playerSection[statsIndex];
            players.push({
              ...playerInfo,
              minutes,
              fgPct,
              ftPct,
              threepm,
              rebounds,
              assists,
              steals,
              blocks,
              turnovers,
              points,
            });
            statsIndex++;
          }
        }
      }
    }

    return players;
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
