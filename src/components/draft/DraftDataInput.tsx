import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, TrendingUp, History, Target, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ParsedRankingPlayer } from '@/types/draft';

interface DraftDataInputProps {
  onImportCris: (data: ParsedRankingPlayer[]) => void;
  onImportAdp: (data: ParsedRankingPlayer[]) => void;
  onImportLastYear: (data: ParsedRankingPlayer[]) => void;
  playerCount: { cris: number; adp: number; lastYear: number };
}

// Known NBA team codes
const NBA_TEAMS = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NO', 'NYK', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'SA', 'TOR', 'UTA', 'UTAH', 'WAS', 'WSH'];

// Known positions
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'];

// Known statuses
const STATUSES = ['O', 'DTD', 'IR', 'SUSP', 'GTD', 'INJ'];

export function DraftDataInput({ 
  onImportCris, 
  onImportAdp, 
  onImportLastYear,
  playerCount 
}: DraftDataInputProps) {
  const [activeTab, setActiveTab] = useState('cris');
  const [crisData, setCrisData] = useState('');
  const [adpData, setAdpData] = useState('');
  const [lastYearData, setLastYearData] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const { toast } = useToast();

  // Parse multi-column paste data
  const parseRankingData = (data: string): ParsedRankingPlayer[] => {
    const lines = data.split('\n').map(l => l.trim()).filter(l => l);
    const result: ParsedRankingPlayer[] = [];
    
    for (const line of lines) {
      // Split by tabs or multiple spaces
      const parts = line.split(/\t|\s{2,}/).map(p => p.trim()).filter(p => p);
      
      if (parts.length === 0) continue;
      
      // Try to find rank (first number)
      let rank: number | null = null;
      let playerName = '';
      let team: string | null = null;
      let position: string | null = null;
      let status: string | null = null;
      
      for (const part of parts) {
        // Check if it's a rank number
        const numMatch = part.match(/^(\d+)\.?$/);
        if (numMatch && rank === null) {
          rank = parseInt(numMatch[1], 10);
          continue;
        }
        
        // Check if it's a team code
        const upperPart = part.toUpperCase();
        if (NBA_TEAMS.includes(upperPart) && team === null) {
          team = upperPart;
          continue;
        }
        
        // Check if it's a position
        const posMatch = part.toUpperCase().match(/^(PG|SG|SF|PF|C|G|F)(,?\s*(PG|SG|SF|PF|C|G|F))*$/);
        if (posMatch && position === null) {
          position = part.toUpperCase();
          continue;
        }
        
        // Check if it's a status
        if (STATUSES.includes(upperPart) && status === null) {
          status = upperPart;
          continue;
        }
        
        // Otherwise it might be a player name
        // Filter out column headers and non-name content
        if (!part.match(/^(Rank|Player|Team|Pos|Status|ADP|CRIS|wCRI|Last|Year|#|\d+\.\d+)$/i)) {
          if (playerName === '') {
            playerName = part;
          } else {
            // Could be a multi-word name
            playerName += ' ' + part;
          }
        }
      }
      
      // Clean up player name
      playerName = playerName
        .replace(/\s+/g, ' ')
        .replace(/^\d+\s*\.?\s*/, '') // Remove leading rank if attached
        .trim();
      
      // Validate we have minimum data
      if (playerName && playerName.length > 2 && rank !== null) {
        result.push({
          rank,
          playerName,
          team,
          position,
          status,
        });
      }
    }
    
    return result;
  };

  const handleImport = (type: 'cris' | 'adp' | 'lastYear') => {
    const data = type === 'cris' ? crisData : type === 'adp' ? adpData : lastYearData;
    
    if (!data.trim()) {
      toast({
        title: 'No data',
        description: 'Please paste your ranking data first',
        variant: 'destructive',
      });
      return;
    }

    setIsParsing(true);

    try {
      const parsed = parseRankingData(data);
      
      if (parsed.length === 0) {
        toast({
          title: 'No players found',
          description: 'Could not parse any player rankings. Check your data format.',
          variant: 'destructive',
        });
        setIsParsing(false);
        return;
      }

      if (type === 'cris') {
        onImportCris(parsed);
      } else if (type === 'adp') {
        onImportAdp(parsed);
      } else {
        onImportLastYear(parsed);
      }

      toast({
        title: 'Success!',
        description: `Imported ${parsed.length} players`,
      });
    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: 'Parse error',
        description: 'Could not parse the data. Please check the format.',
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const tabs = [
    { 
      id: 'cris', 
      label: 'CRIS Projections', 
      icon: Target, 
      count: playerCount.cris,
      data: crisData,
      setData: setCrisData,
      onImport: () => handleImport('cris'),
      description: 'Paste CRIS/wCRI rankings (Rank, Player, Team, Pos)',
    },
    { 
      id: 'adp', 
      label: 'ADP Trends', 
      icon: TrendingUp, 
      count: playerCount.adp,
      data: adpData,
      setData: setAdpData,
      onImport: () => handleImport('adp'),
      description: 'Paste ADP rankings from your platform',
    },
    { 
      id: 'lastYear', 
      label: 'Last Year', 
      icon: History, 
      count: playerCount.lastYear,
      data: lastYearData,
      setData: setLastYearData,
      onImport: () => handleImport('lastYear'),
      description: 'Paste last season final rankings',
    },
  ];

  return (
    <Card className="gradient-card shadow-card p-4 border-border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold">Import Rankings</h3>
          <p className="text-xs text-muted-foreground">
            Paste ranking data from spreadsheets or websites
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 mb-4">
          {tabs.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1">
              <tab.icon className="w-3 h-3" />
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.count > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  <Check className="w-2 h-2 mr-0.5" />
                  {tab.count}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(tab => (
          <TabsContent key={tab.id} value={tab.id}>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{tab.description}</p>
              
              <Textarea
                placeholder="Paste data here (columns: Rank, Player Name, Team, Position, Status)..."
                value={tab.data}
                onChange={(e) => tab.setData(e.target.value)}
                className="min-h-[120px] font-mono text-xs bg-muted/50"
              />

              <Button
                onClick={tab.onImport}
                disabled={isParsing}
                size="sm"
                className="w-full gradient-primary shadow-glow font-display font-semibold"
              >
                <Upload className="w-4 h-4 mr-2" />
                {isParsing ? 'Parsing...' : 'Import Data'}
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border text-xs">
        <h4 className="font-semibold mb-1">Supported formats:</h4>
        <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Tab-separated columns from spreadsheets</li>
          <li>Space-separated data from websites</li>
          <li>Format: Rank, Player Name, Team (optional), Position (optional)</li>
        </ul>
      </div>
    </Card>
  );
}
