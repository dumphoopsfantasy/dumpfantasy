import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, FileSpreadsheet, TrendingUp, History, Target, 
  Check, ChevronDown, ChevronUp, AlertCircle 
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ParsedRankingPlayer } from '@/types/draft';
import { parseRankingData, ParsedPlayer } from '@/lib/draftParsers';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface PasteBox {
  id: string;
  label: string;
  range: [number, number];
}

interface SourceConfig {
  id: 'cris' | 'adp' | 'lastYear';
  label: string;
  helpText: string;
  icon: typeof Target;
  pasteBoxes: PasteBox[];
}

const SOURCES: SourceConfig[] = [
  {
    id: 'cris',
    label: 'CRIS Projections',
    helpText: 'Paste ESPN projections (50 at a time). Import 1–200 via 4 boxes.',
    icon: Target,
    pasteBoxes: [
      { id: 'cris_1_50', label: 'Players 1–50', range: [1, 50] },
      { id: 'cris_51_100', label: 'Players 51–100', range: [51, 100] },
      { id: 'cris_101_150', label: 'Players 101–150', range: [101, 150] },
      { id: 'cris_151_200', label: 'Players 151–200', range: [151, 200] },
    ],
  },
  {
    id: 'adp',
    label: 'ADP Trends',
    helpText: 'Paste ESPN Live Draft Trends table. Import 1–200 via 4 boxes.',
    icon: TrendingUp,
    pasteBoxes: [
      { id: 'adp_1_50', label: 'Players 1–50', range: [1, 50] },
      { id: 'adp_51_100', label: 'Players 51–100', range: [51, 100] },
      { id: 'adp_101_150', label: 'Players 101–150', range: [101, 150] },
      { id: 'adp_151_200', label: 'Players 151–200', range: [151, 200] },
    ],
  },
  {
    id: 'lastYear',
    label: 'Last Year',
    helpText: 'Paste ESPN season totals/averages table rows. Import 1–200 via 4 boxes.',
    icon: History,
    pasteBoxes: [
      { id: 'ly_1_50', label: 'Players 1–50', range: [1, 50] },
      { id: 'ly_51_100', label: 'Players 51–100', range: [51, 100] },
      { id: 'ly_101_150', label: 'Players 101–150', range: [101, 150] },
      { id: 'ly_151_200', label: 'Players 151–200', range: [151, 200] },
    ],
  },
];

interface SegmentState {
  raw: string;
  parsedCount: number;
  errors: string[];
}

interface DraftDataInputProps {
  onImportCris: (data: ParsedRankingPlayer[]) => void;
  onImportAdp: (data: ParsedRankingPlayer[]) => void;
  onImportLastYear: (data: ParsedRankingPlayer[]) => void;
  playerCount: { cris: number; adp: number; lastYear: number };
}

export function DraftDataInput({ 
  onImportCris, 
  onImportAdp, 
  onImportLastYear,
  playerCount 
}: DraftDataInputProps) {
  const [activeTab, setActiveTab] = useState<'cris' | 'adp' | 'lastYear'>('cris');
  const [expandedBoxes, setExpandedBoxes] = useState<Record<string, boolean>>({});
  const [segments, setSegments] = useState<Record<string, SegmentState>>({});
  const [isParsing, setIsParsing] = useState(false);
  const { toast } = useToast();

  const getSegmentState = (boxId: string): SegmentState => {
    return segments[boxId] || { raw: '', parsedCount: 0, errors: [] };
  };

  const updateSegment = (boxId: string, updates: Partial<SegmentState>) => {
    setSegments(prev => ({
      ...prev,
      [boxId]: { ...getSegmentState(boxId), ...updates },
    }));
  };

  const toggleBox = (boxId: string) => {
    setExpandedBoxes(prev => ({
      ...prev,
      [boxId]: !prev[boxId],
    }));
  };

  const convertToRankingPlayer = (parsed: ParsedPlayer): ParsedRankingPlayer => ({
    rank: parsed.rank,
    playerName: parsed.playerName,
    team: parsed.team,
    position: parsed.position,
    status: parsed.status,
    stats: parsed.stats,
    avgPick: parsed.avgPick,
    rostPct: parsed.rostPct,
  });

  const handleImportSegment = useCallback((
    sourceId: 'cris' | 'adp' | 'lastYear',
    boxId: string,
    rankOffset: number
  ) => {
    const segment = getSegmentState(boxId);
    if (!segment.raw.trim()) {
      toast({
        title: 'No data',
        description: 'Please paste your ranking data first',
        variant: 'destructive',
      });
      return;
    }

    setIsParsing(true);

    try {
      const result = parseRankingData(segment.raw, sourceId, rankOffset);
      
      if (result.players.length === 0) {
        updateSegment(boxId, { 
          parsedCount: 0, 
          errors: ['No players found. Check your data format.'] 
        });
        toast({
          title: 'No players found',
          description: 'Could not parse any player rankings. Check your data format.',
          variant: 'destructive',
        });
        setIsParsing(false);
        return;
      }

      const converted = result.players.map(convertToRankingPlayer);
      updateSegment(boxId, { 
        parsedCount: converted.length, 
        errors: result.errors 
      });

      // Import based on source
      if (sourceId === 'cris') {
        onImportCris(converted);
      } else if (sourceId === 'adp') {
        onImportAdp(converted);
      } else {
        onImportLastYear(converted);
      }

      toast({
        title: 'Success!',
        description: `Imported ${converted.length} players`,
      });
    } catch (error) {
      console.error('Parse error:', error);
      updateSegment(boxId, { 
        parsedCount: 0, 
        errors: ['Parse error. Check the console for details.'] 
      });
      toast({
        title: 'Parse error',
        description: 'Could not parse the data. Please check the format.',
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
    }
  }, [segments, onImportCris, onImportAdp, onImportLastYear, toast]);

  const handleImportAll = useCallback((source: SourceConfig) => {
    setIsParsing(true);
    let totalImported = 0;
    const allPlayers: ParsedRankingPlayer[] = [];

    try {
      for (const box of source.pasteBoxes) {
        const segment = getSegmentState(box.id);
        if (!segment.raw.trim()) continue;

        const rankOffset = box.range[0] - 1;
        const result = parseRankingData(segment.raw, source.id, rankOffset);
        
        if (result.players.length > 0) {
          const converted = result.players.map(convertToRankingPlayer);
          allPlayers.push(...converted);
          updateSegment(box.id, { 
            parsedCount: converted.length, 
            errors: result.errors 
          });
          totalImported += converted.length;
        }
      }

      if (allPlayers.length === 0) {
        toast({
          title: 'No data',
          description: 'Please paste data in at least one box',
          variant: 'destructive',
        });
        setIsParsing(false);
        return;
      }

      // Import all at once
      if (source.id === 'cris') {
        onImportCris(allPlayers);
      } else if (source.id === 'adp') {
        onImportAdp(allPlayers);
      } else {
        onImportLastYear(allPlayers);
      }

      toast({
        title: 'Success!',
        description: `Imported ${totalImported} players from ${source.label}`,
      });
    } catch (error) {
      console.error('Import all error:', error);
      toast({
        title: 'Import error',
        description: 'Some data could not be parsed.',
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
    }
  }, [segments, onImportCris, onImportAdp, onImportLastYear, toast]);

  const getSourceCount = (sourceId: 'cris' | 'adp' | 'lastYear'): number => {
    return playerCount[sourceId];
  };

  return (
    <Card className="gradient-card shadow-card p-4 border-border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold">Import Rankings</h3>
          <p className="text-xs text-muted-foreground">
            Paste ESPN data in 50-player segments (4 boxes per source)
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid grid-cols-3 mb-4">
          {SOURCES.map(source => (
            <TabsTrigger key={source.id} value={source.id} className="text-xs gap-1">
              <source.icon className="w-3 h-3" />
              <span className="hidden sm:inline">{source.label}</span>
              {getSourceCount(source.id) > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  <Check className="w-2 h-2 mr-0.5" />
                  {getSourceCount(source.id)}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {SOURCES.map(source => (
          <TabsContent key={source.id} value={source.id}>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{source.helpText}</p>
              
              {/* Paste boxes */}
              <div className="space-y-2">
                {source.pasteBoxes.map((box) => {
                  const segment = getSegmentState(box.id);
                  const isExpanded = expandedBoxes[box.id] ?? false;
                  const hasData = segment.raw.trim().length > 0;
                  const hasErrors = segment.errors.length > 0;
                  
                  return (
                    <Collapsible 
                      key={box.id} 
                      open={isExpanded} 
                      onOpenChange={() => toggleBox(box.id)}
                    >
                      <div className="border border-border rounded-lg overflow-hidden">
                        <CollapsibleTrigger asChild>
                          <button className="w-full flex items-center justify-between p-2 hover:bg-muted/50 transition-colors text-left">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{box.label}</span>
                              {segment.parsedCount > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  <Check className="w-2 h-2 mr-0.5" />
                                  {segment.parsedCount}
                                </Badge>
                              )}
                              {hasErrors && segment.parsedCount === 0 && (
                                <AlertCircle className="w-3 h-3 text-destructive" />
                              )}
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </CollapsibleTrigger>
                        
                        <CollapsibleContent>
                          <div className="p-2 pt-0 space-y-2">
                            <Textarea
                              placeholder={`Paste players ${box.range[0]}–${box.range[1]} here...`}
                              value={segment.raw}
                              onChange={(e) => updateSegment(box.id, { raw: e.target.value })}
                              className="min-h-[100px] font-mono text-xs bg-muted/50"
                            />
                            
                            {hasErrors && (
                              <div className="text-xs text-destructive">
                                {segment.errors.map((err, i) => (
                                  <p key={i}>{err}</p>
                                ))}
                              </div>
                            )}
                            
                            <Button
                              onClick={() => handleImportSegment(
                                source.id, 
                                box.id, 
                                box.range[0] - 1
                              )}
                              disabled={isParsing || !hasData}
                              size="sm"
                              variant="outline"
                              className="w-full text-xs"
                            >
                              <Upload className="w-3 h-3 mr-1" />
                              Import {box.label}
                            </Button>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>

              {/* Import All Button */}
              <Button
                onClick={() => handleImportAll(source)}
                disabled={isParsing}
                size="sm"
                className="w-full gradient-primary shadow-glow font-display font-semibold"
              >
                <Upload className="w-4 h-4 mr-2" />
                {isParsing ? 'Parsing...' : `Import All ${source.label}`}
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border text-xs">
        <h4 className="font-semibold mb-1">ESPN Data Tips:</h4>
        <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Copy directly from ESPN tables (Ctrl/Cmd+A then Ctrl/Cmd+C)</li>
          <li>Each box accepts 50 players — matches ESPN's page size</li>
          <li>Noise lines (ads, footers) are automatically filtered</li>
        </ul>
      </div>
    </Card>
  );
}
