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

// Known NBA team codes
const NBA_TEAMS = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'];

export const DataUpload = ({ onDataParsed }: DataUploadProps) => {
  const [rawData, setRawData] = useState("");
  const { toast } = useToast();

  const parseESPNData = (data: string): PlayerStats[] => {
    console.log('Starting to parse ESPN data...');
    const lines = data.split('\n').map(l => l.trim()).filter(l => l);
    
    const result: PlayerStats[] = [];
    
    // Find player rows by looking for slot patterns followed by player data
    const slotPatterns = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F/C', 'UTIL', 'Bench', 'IR'];
    
    // Parse the entire text to find player blocks
    // Each player appears as: [Slot] [PlayerNamePlayerName] [Team] [Positions] [Status?] [Opponent?]
    // Followed by stats in the STATS section
    
    // Strategy: Find all player names (doubled like "Cade CunninghamCade Cunningham")
    const playerPattern = /([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+)\1/g;
    const playerMatches: { name: string; index: number }[] = [];
    
    let match;
    while ((match = playerPattern.exec(data)) !== null) {
      playerMatches.push({ name: match[1].trim(), index: match.index });
    }
    
    console.log(`Found ${playerMatches.length} players via doubled name pattern`);
    
    // If that didn't work, try line-by-line approach
    if (playerMatches.length === 0) {
      // Look for lines that contain player names with team codes
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check if line starts with a slot type
        const slotMatch = slotPatterns.find(s => line.startsWith(s + '\t') || line === s);
        if (slotMatch) {
          // Look ahead for player info
          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const nextLine = lines[j];
            // Check for team code
            if (NBA_TEAMS.some(t => nextLine.includes(t))) {
              // Found a line with team, look for player name before it
              const nameLine = lines[j - 1] || '';
              if (nameLine && !slotPatterns.includes(nameLine) && nameLine.length > 3) {
                playerMatches.push({ name: nameLine.replace(/\s+/g, ' ').trim(), index: i });
              }
              break;
            }
          }
        }
      }
    }

    // Extract player info with slot, team, position, status
    interface PlayerInfo {
      slot: string;
      name: string;
      team: string;
      position: string;
      status?: string;
      opponent?: string;
    }
    
    const playerInfos: PlayerInfo[] = [];
    
    // Parse based on ESPN page structure - look for patterns in text
    // The pattern is: Slot -> PlayerName (doubled) -> Team -> Positions -> Status -> MOVE -> Opponent
    
    let currentSlot = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for slot
      if (slotPatterns.includes(line)) {
        currentSlot = line;
        continue;
      }
      
      // Check for doubled player name
      const doubleNameMatch = line.match(/^([A-Z][a-zA-Z'-]+(?:\s+[A-Za-z'-]+)+)\1$/);
      if (doubleNameMatch) {
        const playerName = doubleNameMatch[1].trim();
        
        // Look ahead for team, position, status
        let team = '';
        let position = '';
        let status = '';
        let opponent = '';
        
        for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
          const nextLine = lines[j];
          
          // Team code (2-4 uppercase letters)
          if (!team && NBA_TEAMS.includes(nextLine.toUpperCase())) {
            team = nextLine.toUpperCase();
            continue;
          }
          
          // Position pattern
          if (!position && /^(PG|SG|SF|PF|C)(,\s*(PG|SG|SF|PF|C))*$/i.test(nextLine)) {
            position = nextLine.toUpperCase();
            continue;
          }
          
          // Status
          if (!status && ['DTD', 'O', 'SUSP', 'INJ'].includes(nextLine.toUpperCase())) {
            status = nextLine.toUpperCase();
            continue;
          }
          
          // Opponent (starts with @ or is a team code we haven't seen)
          if (!opponent && team && (nextLine.startsWith('@') || (NBA_TEAMS.includes(nextLine.replace('@', '').toUpperCase()) && nextLine.toUpperCase() !== team))) {
            opponent = nextLine;
            continue;
          }
          
          // Stop if we hit MOVE or another slot or STATS
          if (nextLine === 'MOVE' || slotPatterns.includes(nextLine) || nextLine === 'STATS') {
            break;
          }
        }
        
        playerInfos.push({
          slot: currentSlot || 'Bench',
          name: playerName,
          team,
          position,
          status: status || undefined,
          opponent: opponent || undefined
        });
      }
    }

    console.log(`Parsed ${playerInfos.length} player infos`);

    // Parse stats section
    const statsIdx = data.indexOf('STATS');
    if (statsIdx === -1) {
      console.log('No STATS section found');
      return playerInfos.map(p => ({
        slot: p.slot,
        player: p.name,
        team: p.team,
        position: p.position,
        opponent: p.opponent || '',
        status: p.status,
        minutes: 0, fgPct: 0, ftPct: 0, threepm: 0,
        rebounds: 0, assists: 0, steals: 0, blocks: 0,
        turnovers: 0, points: 0
      }));
    }

    // Get stats section and parse numbers
    const statsSection = data.substring(statsIdx);
    const statsLines = statsSection.split('\n').map(l => l.trim()).filter(l => l);
    
    // Collect numeric values (skip headers like MIN, FG%, etc.)
    const statTokens: string[] = [];
    const skipPatterns = /^(STATS|Research|MIN|FGM\/FGA|FG%|FTM\/FTA|FT%|3PM|REB|AST|STL|BLK|TO|PTS|PR15|%ROST|\+\/-)$/i;
    
    for (const line of statsLines) {
      if (skipPatterns.test(line)) continue;
      
      // Accept numbers (including those starting with .), "--", or fractions
      if (/^[-+]?\d*\.?\d+$/.test(line) || line === '--' || /^\d+\.?\d*\/\d+\.?\d*$/.test(line)) {
        statTokens.push(line);
      }
    }

    console.log(`Collected ${statTokens.length} stat tokens`);

    // ESPN has 15 columns per player
    const COLUMNS_PER_PLAYER = 15;
    const statsData: number[][] = [];
    const numRows = Math.floor(statTokens.length / COLUMNS_PER_PLAYER);

    for (let row = 0; row < numRows; row++) {
      const base = row * COLUMNS_PER_PLAYER;
      const slice = statTokens.slice(base, base + COLUMNS_PER_PLAYER);
      
      const numericSlice = slice.map(token => {
        if (token === '--' || /\//.test(token)) return 0;
        const val = parseFloat(token.replace(/^\+/, ''));
        return isNaN(val) ? 0 : val;
      });
      
      statsData.push(numericSlice);
    }

    console.log(`Built ${statsData.length} stat rows`);

    // Match players with stats
    const maxLen = Math.min(playerInfos.length, statsData.length);
    
    for (let i = 0; i < maxLen; i++) {
      const p = playerInfos[i];
      const stats = statsData[i];
      
      result.push({
        slot: p.slot,
        player: p.name,
        team: p.team,
        position: p.position,
        opponent: p.opponent || '',
        status: p.status,
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

    // Add remaining players without stats
    for (let i = maxLen; i < playerInfos.length; i++) {
      const p = playerInfos[i];
      result.push({
        slot: p.slot,
        player: p.name,
        team: p.team,
        position: p.position,
        opponent: p.opponent || '',
        status: p.status,
        minutes: 0, fgPct: 0, ftPct: 0, threepm: 0,
        rebounds: 0, assists: 0, steals: 0, blocks: 0,
        turnovers: 0, points: 0
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
          description: "Could not parse any player data. Make sure you copied the full page from ESPN.",
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
      console.error('Parse error:', error);
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
        className="w-full gradient-primary shadow-glow font-display font-bold text-lg"
      >
        <Upload className="w-5 h-5 mr-2" />
        Load Players
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
