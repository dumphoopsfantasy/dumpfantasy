// Draft Import Wizard - Guided 12-segment importer

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Upload, Check, AlertCircle, ChevronRight, 
  Target, TrendingUp, History, Trash2, X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  ImportState, ImportSegment, SourceType, 
  SOURCE_CONFIGS, SEGMENT_RANGES, getSegmentKey, ParsedPlayer
} from '@/types/draft';
import { parseRankingData } from '@/lib/draftParsers';
import { cn } from '@/lib/utils';

interface DraftImportWizardProps {
  importState: ImportState;
  onSetActiveSegment: (key: string | null) => void;
  onUpdateSegmentRaw: (key: string, raw: string) => void;
  onImportSegment: (key: string, parsed: ParsedPlayer[], sourceType: SourceType) => ImportSegment;
  onClearSegment: (key: string) => void;
  onClearSource: (sourceType: SourceType) => void;
  sourceCounts: { projections: number; adp: number; lastYear: number };
}

const SOURCE_ICONS = {
  projections: Target,
  adp: TrendingUp,
  lastYear: History,
};

export function DraftImportWizard({
  importState,
  onSetActiveSegment,
  onUpdateSegmentRaw,
  onImportSegment,
  onClearSegment,
  onClearSource,
  sourceCounts,
}: DraftImportWizardProps) {
  const [rawInput, setRawInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const { toast } = useToast();

  const activeKey = importState.activeSegmentKey;
  const activeSegment = activeKey ? importState.segments[activeKey] : null;

  // Build the list of all 12 segments
  const allSegments: Array<{
    key: string;
    sourceType: SourceType;
    sourceLabel: string;
    segmentIndex: number;
    segmentLabel: string;
    status: 'empty' | 'parsed' | 'error';
    parsedCount: number;
  }> = [];

  for (const source of SOURCE_CONFIGS) {
    for (let i = 0; i < SEGMENT_RANGES.length; i++) {
      const key = getSegmentKey(source.id, i);
      const segment = importState.segments[key];
      allSegments.push({
        key,
        sourceType: source.id,
        sourceLabel: source.label,
        segmentIndex: i,
        segmentLabel: SEGMENT_RANGES[i].label,
        status: segment?.status || 'empty',
        parsedCount: segment?.parsedCount || 0,
      });
    }
  }

  const handleImport = useCallback(() => {
    if (!activeKey || !rawInput.trim()) {
      toast({ title: 'No data', description: 'Please paste your data first', variant: 'destructive' });
      return;
    }

    setIsParsing(true);
    
    try {
      const [sourceType, segmentIndexStr] = activeKey.split('_') as [SourceType, string];
      const segmentIndex = parseInt(segmentIndexStr, 10);
      const rankOffset = SEGMENT_RANGES[segmentIndex].range[0] - 1;
      
      const result = parseRankingData(rawInput, sourceType, rankOffset);
      
      if (result.players.length === 0) {
        toast({ 
          title: 'No players found', 
          description: 'Could not parse any players. Check your data format.', 
          variant: 'destructive' 
        });
        setIsParsing(false);
        return;
      }

      const segment = onImportSegment(activeKey, result.players, sourceType);
      
      toast({
        title: 'Success!',
        description: `Imported ${result.players.length} players (${segment.matchedCount} matched, ${segment.newCount} new)`,
      });

      // Auto-advance to next segment
      const currentIndex = allSegments.findIndex(s => s.key === activeKey);
      if (currentIndex < allSegments.length - 1) {
        const nextKey = allSegments[currentIndex + 1].key;
        onSetActiveSegment(nextKey);
        setRawInput('');
      }
    } catch (error) {
      console.error('Parse error:', error);
      toast({ title: 'Parse error', description: 'Could not parse the data', variant: 'destructive' });
    } finally {
      setIsParsing(false);
    }
  }, [activeKey, rawInput, onImportSegment, onSetActiveSegment, allSegments, toast]);

  const handleSelectSegment = (key: string) => {
    onSetActiveSegment(key);
    const segment = importState.segments[key];
    setRawInput(segment?.raw || '');
  };

  return (
    <Card className="gradient-card shadow-card border-border overflow-hidden">
      <div className="flex h-[500px]">
        {/* Left: Segment List */}
        <div className="w-64 border-r border-border bg-muted/30">
          <div className="p-3 border-b border-border">
            <h3 className="font-display font-bold text-sm">Import Progress</h3>
            <p className="text-xs text-muted-foreground">12 segments (3 sources × 4 ranges)</p>
          </div>
          <ScrollArea className="h-[calc(500px-52px)]">
            <div className="p-2 space-y-1">
              {SOURCE_CONFIGS.map(source => {
                const Icon = SOURCE_ICONS[source.id];
                const sourceSegments = allSegments.filter(s => s.sourceType === source.id);
                const parsedCount = sourceSegments.filter(s => s.status === 'parsed').length;
                
                return (
                  <div key={source.id} className="space-y-0.5">
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Icon className="w-3 h-3" />
                        {source.label}
                      </div>
                      {parsedCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1 h-4">
                          {parsedCount}/4
                        </Badge>
                      )}
                    </div>
                    {sourceSegments.map(seg => (
                      <button
                        key={seg.key}
                        onClick={() => handleSelectSegment(seg.key)}
                        className={cn(
                          'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors',
                          activeKey === seg.key 
                            ? 'bg-primary text-primary-foreground' 
                            : 'hover:bg-muted/50',
                          seg.status === 'parsed' && activeKey !== seg.key && 'text-emerald-400',
                          seg.status === 'error' && 'text-destructive'
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {seg.status === 'parsed' && <Check className="w-3 h-3" />}
                          {seg.status === 'error' && <AlertCircle className="w-3 h-3" />}
                          {seg.segmentLabel}
                        </span>
                        {seg.parsedCount > 0 && (
                          <span className="font-mono text-[10px]">{seg.parsedCount}</span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Paste Area */}
        <div className="flex-1 flex flex-col">
          {activeKey ? (
            <>
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-sm">
                      {allSegments.find(s => s.key === activeKey)?.sourceLabel} — {' '}
                      {allSegments.find(s => s.key === activeKey)?.segmentLabel}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Paste ESPN data (Ctrl+A then Ctrl+C from ESPN table)
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setRawInput(''); onClearSegment(activeKey); }}
                    className="h-7 text-xs"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 p-3">
                <Textarea
                  placeholder="Paste ESPN table data here..."
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  className="h-full font-mono text-xs resize-none"
                />
              </div>
              
              <div className="p-3 border-t border-border bg-muted/30 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {rawInput.trim().split('\n').filter(l => l.trim()).length} lines
                </div>
                <Button
                  onClick={handleImport}
                  disabled={isParsing || !rawInput.trim()}
                  size="sm"
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {isParsing ? 'Parsing...' : 'Import Segment'}
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Select a segment from the left to start importing</p>
            </div>
          )}
        </div>
      </div>

      {/* Tips */}
      <div className="p-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
        <strong>Tips:</strong> Copy directly from ESPN tables. Noise lines are filtered automatically. 
        Each segment handles 50 players.
      </div>
    </Card>
  );
}
