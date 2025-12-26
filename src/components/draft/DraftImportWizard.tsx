// Draft Import Wizard - HTML Table Parsing with Guided UI

import { useState, useCallback, ClipboardEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Upload, Check, AlertCircle, ChevronRight, 
  Target, TrendingUp, History, X, FlaskConical
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  ImportState, ImportSegment, SourceType, 
  SOURCE_CONFIGS, SEGMENT_RANGES, getSegmentKey, ParsedPlayer
} from '@/types/draft';
import { parseClipboardData, validateParseResult } from '@/lib/draftParsers';
import { cn } from '@/lib/utils';
import { devError } from '@/lib/devLog';

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

// Sample HTML for testing
const SAMPLE_HTML = `<table>
<thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Pos</th><th>Avg Pick</th></tr></thead>
<tbody>
<tr><td>1</td><td><a href="#">Nikola Jokic</a></td><td>DEN</td><td>C</td><td>1.2</td></tr>
<tr><td>2</td><td><a href="#">Shai Gilgeous-Alexander</a></td><td>OKC</td><td>PG, SG</td><td>2.3</td></tr>
<tr><td>3</td><td><a href="#">Luka Doncic</a></td><td>DAL</td><td>PG, SG</td><td>3.1</td></tr>
<tr><td>4</td><td><a href="#">Giannis Antetokounmpo</a></td><td>MIL</td><td>PF, C</td><td>4.0</td></tr>
<tr><td>5</td><td><a href="#">Victor Wembanyama</a></td><td>SAS</td><td>PF, C</td><td>5.2</td></tr>
<tr><td>6</td><td><a href="#">Anthony Edwards</a></td><td>MIN</td><td>SG, SF</td><td>6.1</td></tr>
<tr><td>7</td><td><a href="#">Jayson Tatum</a></td><td>BOS</td><td>SF, PF</td><td>7.3</td></tr>
<tr><td>8</td><td><a href="#">Kevin Durant</a></td><td>PHX</td><td>SF, PF</td><td>8.0</td></tr>
<tr><td>9</td><td><a href="#">Anthony Davis</a></td><td>LAL</td><td>PF, C</td><td>9.2</td></tr>
<tr><td>10</td><td><a href="#">LeBron James</a></td><td>LAL</td><td>SF, PF</td><td>10.5</td></tr>
<tr><td>11</td><td><a href="#">Tyrese Haliburton</a></td><td>IND</td><td>PG, SG</td><td>11.0</td></tr>
<tr><td>12</td><td><a href="#">Trae Young</a></td><td>ATL</td><td>PG</td><td>12.3</td></tr>
<tr><td>13</td><td><a href="#">Damian Lillard</a></td><td>MIL</td><td>PG</td><td>13.1</td></tr>
<tr><td>14</td><td><a href="#">Devin Booker</a></td><td>PHX</td><td>SG, SF</td><td>14.5</td></tr>
<tr><td>15</td><td><a href="#">Stephen Curry</a></td><td>GSW</td><td>PG, SG</td><td>15.2</td></tr>
<tr><td>16</td><td><a href="#">Joel Embiid</a></td><td>PHI</td><td>C</td><td>16.0</td></tr>
<tr><td>17</td><td><a href="#">Ja Morant</a></td><td>MEM</td><td>PG</td><td>17.3</td></tr>
<tr><td>18</td><td><a href="#">Donovan Mitchell</a></td><td>CLE</td><td>SG</td><td>18.1</td></tr>
<tr><td>19</td><td><a href="#">Kyrie Irving</a></td><td>DAL</td><td>PG, SG</td><td>19.0</td></tr>
<tr><td>20</td><td><a href="#">De'Aaron Fox</a></td><td>SAC</td><td>PG</td><td>20.2</td></tr>
<tr><td>21</td><td><a href="#">Kawhi Leonard</a></td><td>LAC</td><td>SF, PF</td><td>21.5</td></tr>
<tr><td>22</td><td><a href="#">Paul George</a></td><td>PHI</td><td>SF, PF</td><td>22.1</td></tr>
<tr><td>23</td><td><a href="#">Jimmy Butler</a></td><td>MIA</td><td>SF, PF</td><td>23.0</td></tr>
<tr><td>24</td><td><a href="#">Bam Adebayo</a></td><td>MIA</td><td>C</td><td>24.3</td></tr>
<tr><td>25</td><td><a href="#">Scottie Barnes</a></td><td>TOR</td><td>SF, PF</td><td>25.0</td></tr>
</tbody>
</table>`;

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
  const [lastHtml, setLastHtml] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
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

  // Handle paste - capture both HTML and text
  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    
    setLastHtml(html || null);
    setRawInput(text);
    setParseError(null);
    
    // Store raw in segment
    if (activeKey) {
      onUpdateSegmentRaw(activeKey, text);
    }
  }, [activeKey, onUpdateSegmentRaw]);

  const handleImport = useCallback(() => {
    if (!activeKey) {
      toast({ title: 'No segment selected', variant: 'destructive' });
      return;
    }

    if (!rawInput.trim() && !lastHtml) {
      toast({ title: 'No data', description: 'Please paste ESPN data first', variant: 'destructive' });
      return;
    }

    setIsParsing(true);
    setParseError(null);
    
    try {
      const [sourceType, segmentIndexStr] = activeKey.split('_') as [SourceType, string];
      const segmentIndex = parseInt(segmentIndexStr, 10);
      const rankOffset = SEGMENT_RANGES[segmentIndex].range[0] - 1;
      
      const result = parseClipboardData(lastHtml, rawInput, sourceType, rankOffset);
      
      // Validate result
      const validation = validateParseResult(result);
      if (!validation.valid) {
        setParseError(validation.error || 'Invalid data');
        toast({ 
          title: 'Import failed', 
          description: validation.error, 
          variant: 'destructive' 
        });
        setIsParsing(false);
        return;
      }

      const segment = onImportSegment(activeKey, result.players, sourceType);
      
      toast({
        title: 'Imported successfully!',
        description: `${result.players.length} players (${segment.matchedCount} matched, ${segment.newCount} new, ${result.stats.duplicatesRemoved} dupes removed)`,
      });

      // Auto-advance to next segment
      const currentIndex = allSegments.findIndex(s => s.key === activeKey);
      if (currentIndex < allSegments.length - 1) {
        const nextKey = allSegments[currentIndex + 1].key;
        onSetActiveSegment(nextKey);
        setRawInput('');
        setLastHtml(null);
      }
    } catch (error) {
      devError('Parse error:', error);
      setParseError('Could not parse the data. Try copying the table again.');
      toast({ title: 'Parse error', description: 'Could not parse the data', variant: 'destructive' });
    } finally {
      setIsParsing(false);
    }
  }, [activeKey, rawInput, lastHtml, onImportSegment, onSetActiveSegment, allSegments, toast]);

  const handleSelectSegment = (key: string) => {
    onSetActiveSegment(key);
    const segment = importState.segments[key];
    setRawInput(segment?.raw || '');
    setLastHtml(null);
    setParseError(null);
  };

  const handleClear = () => {
    if (activeKey) {
      setRawInput('');
      setLastHtml(null);
      setParseError(null);
      onClearSegment(activeKey);
    }
  };

  // Load sample data for testing
  const handleLoadSample = useCallback(() => {
    if (!activeKey) {
      toast({ title: 'Select a segment first', variant: 'destructive' });
      return;
    }
    
    setLastHtml(SAMPLE_HTML);
    setRawInput('(Sample HTML data loaded - click Import)');
    setParseError(null);
    
    toast({ title: 'Sample data loaded', description: 'Click Import to test parsing' });
  }, [activeKey, toast]);

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
                      Select ESPN table → Ctrl+A → Ctrl+C → Paste here
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadSample}
                      className="h-7 text-xs gap-1"
                    >
                      <FlaskConical className="w-3 h-3" />
                      Test Data
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClear}
                      className="h-7 text-xs"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 p-3">
                <Textarea
                  placeholder="Paste ESPN table data here (HTML tables are parsed automatically)..."
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  onPaste={handlePaste}
                  className={cn(
                    "h-full font-mono text-xs resize-none",
                    parseError && "border-destructive"
                  )}
                />
              </div>
              
              {parseError && (
                <div className="px-3 py-2 bg-destructive/10 border-t border-destructive/30">
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {parseError}
                  </p>
                </div>
              )}
              
              <div className="p-3 border-t border-border bg-muted/30 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {lastHtml ? (
                    <span className="text-emerald-500">✓ HTML table detected</span>
                  ) : rawInput.trim() ? (
                    <span>{rawInput.trim().split('\n').filter(l => l.trim()).length} lines (text mode)</span>
                  ) : (
                    <span>Waiting for paste...</span>
                  )}
                </div>
                <Button
                  onClick={handleImport}
                  disabled={isParsing || (!rawInput.trim() && !lastHtml)}
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

      {/* Stats Summary */}
      <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          <strong>Imported:</strong>{' '}
          Projections: {sourceCounts.projections} | 
          ADP: {sourceCounts.adp} | 
          Last Year: {sourceCounts.lastYear}
        </div>
        <div className="text-xs text-muted-foreground">
          <strong>Tip:</strong> Copy directly from ESPN tables. HTML tables parse best.
        </div>
      </div>
    </Card>
  );
}
