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

    for (const line of lines) {
      const cols = line.split('\t');
      if (cols.length < 14) continue;

      // Skip header rows
      if (cols[0]?.toLowerCase().includes('slot') || cols[0]?.toLowerCase().includes('player')) {
        continue;
      }

      try {
        const player: PlayerStats = {
          slot: cols[0]?.trim() || '',
          player: cols[1]?.trim() || '',
          team: cols[2]?.split(/[,\/]/)[0]?.trim() || '',
          position: cols[2]?.split(/[,\/]/).slice(1).join(',').trim() || '',
          opponent: cols[3]?.trim() || '',
          minutes: parseFloat(cols[4]) || 0,
          fgPct: parseFloat(cols[5]) || 0,
          ftPct: parseFloat(cols[6]) || 0,
          threepm: parseFloat(cols[7]) || 0,
          rebounds: parseFloat(cols[8]) || 0,
          assists: parseFloat(cols[9]) || 0,
          steals: parseFloat(cols[10]) || 0,
          blocks: parseFloat(cols[11]) || 0,
          turnovers: parseFloat(cols[12]) || 0,
          points: parseFloat(cols[13]) || 0,
        };

        if (player.player && player.player.length > 1) {
          players.push(player);
        }
      } catch (error) {
        console.warn('Error parsing line:', line);
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
        placeholder="Paste your ESPN data here (including headers)&#10;Example: SLOT  PLAYER  TEAM/POS  OPP  MIN  FG%  FT%  3PM  REB  AST  STL  BLK  TO  PTS"
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
          <li>Go to your ESPN Fantasy Basketball team page</li>
          <li>Select and copy the entire player table</li>
          <li>Paste it into the text area above</li>
          <li>Click "Load Players" to analyze your team</li>
        </ol>
      </div>
    </Card>
  );
};
