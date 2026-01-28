import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PlayerStats } from "@/types/player";
import { parseWithTimeout, MAX_INPUT_SIZE } from "@/lib/parseUtils";
import { parseESPNRosterData } from "@/lib/espnRosterParser";
import { devWarn, devError } from "@/lib/devLog";

interface DataUploadProps {
  onDataParsed: (data: PlayerStats[]) => void;
}

export const DataUpload = ({ onDataParsed }: DataUploadProps) => {
  const [rawData, setRawData] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const { toast } = useToast();

  const handleParse = async () => {
    if (!rawData.trim()) {
      toast({
        title: "No data",
        description: "Please paste your ESPN data first",
        variant: "destructive",
      });
      return;
    }

    // Validate input size before parsing
    if (rawData.length > MAX_INPUT_SIZE) {
      toast({
        title: "Input too large",
        description: `Data exceeds maximum size of ${MAX_INPUT_SIZE / 1024}KB. Please copy only the roster section.`,
        variant: "destructive",
      });
      return;
    }

    setIsParsing(true);
    
    try {
      // Parse with timeout protection
      const parsedData = await parseWithTimeout(() => parseESPNRosterData(rawData));
      
      if (parsedData.length === 0) {
        toast({
          title: "No players found",
          description: "Could not parse any player data. Make sure you copied the full page from ESPN.",
          variant: "destructive",
        });
        return;
      }

      // Store the raw blob for "Use My Roster" in Matchup tab
      try {
        localStorage.setItem('dumphoops-roster-raw', rawData);
      } catch (e) {
        devWarn('Could not save raw roster blob:', e);
      }

      onDataParsed(parsedData);
      toast({
        title: "Success!",
        description: `Loaded ${parsedData.length} players`,
      });
    } catch (error) {
      devError('Parse error:', error);
      const errorMessage = error instanceof Error ? error.message : "Could not parse the data. Please check the format.";
      toast({
        title: "Parse error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
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
            Copy the entire ESPN roster page (Ctrl+A) and paste here
          </p>
        </div>
      </div>

      <Textarea
        placeholder="Paste the ENTIRE ESPN roster page here (Ctrl+A to select all, then Ctrl+C to copy)..."
        value={rawData}
        onChange={(e) => setRawData(e.target.value)}
        className="min-h-[200px] font-mono text-sm mb-4 bg-muted/50"
      />

      <Button 
        onClick={handleParse}
        disabled={isParsing}
        className="w-full gradient-primary shadow-glow font-display font-bold text-lg"
      >
        <Upload className="w-5 h-5 mr-2" />
        {isParsing ? "Parsing..." : "Load Players"}
      </Button>

      <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
        <h3 className="text-sm font-semibold mb-2">How to copy from ESPN:</h3>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Go to your ESPN Fantasy Basketball team roster page</li>
          <li>Press Ctrl+A (or Cmd+A) to select the entire page</li>
          <li>Press Ctrl+C (or Cmd+C) to copy</li>
          <li>Paste here and click "Load Players"</li>
        </ol>
      </div>
    </Card>
  );
};
