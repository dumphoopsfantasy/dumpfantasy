// Draft Available Players Table - Full height, no inner scroll

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  ArrowUpDown, ArrowUp, ArrowDown, Search, 
  TrendingUp, TrendingDown, User, Users, X, Play, AlertCircle
} from 'lucide-react';
import { UnifiedPlayer, DraftSettings, StatView, getMyPicks } from '@/types/draft';
import { cn } from '@/lib/utils';

interface DraftAvailableTableProps {
  players: UnifiedPlayer[];
  availablePlayers: UnifiedPlayer[];
  draftStarted: boolean;
  currentPick: number;
  settings: DraftSettings;
  onDraftPlayer: (playerId: string, draftedBy: 'me' | number) => void;
  onUndoDraft: (playerId: string) => void;
  onStartDraft: () => void;
}

type SortColumn = 'crisRank' | 'adpRank' | 'lastYearRank' | 'valueVsAdp' | 'valueVsLastYear' | 'name' | 'pts' | 'reb' | 'ast';
type SortDirection = 'asc' | 'desc';

export function DraftAvailableTable({
  players,
  availablePlayers,
  draftStarted,
  currentPick,
  settings,
  onDraftPlayer,
  onUndoDraft,
  onStartDraft,
}: DraftAvailableTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('valueVsAdp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [statView, setStatView] = useState<StatView>('projections');
  const [showDrafted, setShowDrafted] = useState(false);

  const myPicks = useMemo(() => getMyPicks(settings), [settings]);
  const isMyTurn = myPicks.includes(currentPick);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(['valueVsAdp', 'valueVsLastYear', 'pts', 'reb', 'ast'].includes(column) ? 'desc' : 'asc');
    }
  };

  const getStats = (player: UnifiedPlayer) => {
    return statView === 'projections' 
      ? player.sources.projections?.stats 
      : player.sources.lastYear?.stats;
  };

  const filteredAndSorted = useMemo(() => {
    let result = showDrafted ? players : availablePlayers;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.team?.toLowerCase().includes(q) ||
        p.positions.some(pos => pos.toLowerCase().includes(q))
      );
    }
    
    result = [...result].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      
      switch (sortColumn) {
        case 'crisRank': aVal = a.crisRank ?? 999; bVal = b.crisRank ?? 999; break;
        case 'adpRank': aVal = a.adpRank ?? 999; bVal = b.adpRank ?? 999; break;
        case 'lastYearRank': aVal = a.lastYearRank ?? 999; bVal = b.lastYearRank ?? 999; break;
        case 'valueVsAdp': aVal = a.valueVsAdp ?? -999; bVal = b.valueVsAdp ?? -999; break;
        case 'valueVsLastYear': aVal = a.valueVsLastYear ?? -999; bVal = b.valueVsLastYear ?? -999; break;
        case 'name': aVal = a.name; bVal = b.name; break;
        case 'pts': aVal = getStats(a)?.pts ?? 0; bVal = getStats(b)?.pts ?? 0; break;
        case 'reb': aVal = getStats(a)?.reb ?? 0; bVal = getStats(b)?.reb ?? 0; break;
        case 'ast': aVal = getStats(a)?.ast ?? 0; bVal = getStats(b)?.ast ?? 0; break;
      }
      
      if (typeof aVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortDirection === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });
    
    return result;
  }, [players, availablePlayers, showDrafted, searchQuery, sortColumn, sortDirection, statView]);

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const fmt = (v?: number) => v !== undefined ? v.toFixed(1) : '—';
  const fmtPct = (v?: number) => v !== undefined ? `${(v * 100).toFixed(0)}%` : '—';

  const hasStats = players.some(p => {
    const s = getStats(p);
    return s && (s.pts !== undefined || s.reb !== undefined);
  });

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        
        <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
          <Button
            variant={statView === 'projections' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStatView('projections')}
            className="h-7 text-xs"
          >
            Projections
          </Button>
          <Button
            variant={statView === 'lastYear' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStatView('lastYear')}
            className="h-7 text-xs"
          >
            Last Year
          </Button>
        </div>

        <Button
          variant={showDrafted ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowDrafted(!showDrafted)}
          className="h-8 text-xs"
        >
          {showDrafted ? 'Hide Drafted' : 'Show Drafted'}
        </Button>

        {!draftStarted && (
          <Button onClick={onStartDraft} size="sm" className="gap-2">
            <Play className="w-4 h-4" />
            Start Draft
          </Button>
        )}

        <Badge variant="outline" className="font-mono">
          {filteredAndSorted.length} players
        </Badge>
      </div>

      {/* Stats warning */}
      {!hasStats && players.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400">
          <AlertCircle className="w-4 h-4" />
          Stats not available for {statView}. Import the full ESPN stats table (not just names).
        </div>
      )}

      {/* Table - NO inner scroll, flows with page */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="cursor-pointer hover:bg-muted/80 min-w-[160px]" onClick={() => handleSort('name')}>
                <div className="flex items-center">Player <SortIcon column="name" /></div>
              </TableHead>
              <TableHead className="w-20">Team/Pos</TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/80 text-center w-12" onClick={() => handleSort('crisRank')}>
                <div className="flex items-center justify-center">CRI <SortIcon column="crisRank" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/80 text-center w-12" onClick={() => handleSort('adpRank')}>
                <div className="flex items-center justify-center">ADP <SortIcon column="adpRank" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/80 text-center w-16" onClick={() => handleSort('valueVsAdp')} title="ADP minus CRI (positive = undervalued)">
                <div className="flex items-center justify-center">Value <SortIcon column="valueVsAdp" /></div>
              </TableHead>
              <TableHead className="text-center w-10 text-xs">PTS</TableHead>
              <TableHead className="text-center w-10 text-xs">REB</TableHead>
              <TableHead className="text-center w-10 text-xs">AST</TableHead>
              <TableHead className="text-center w-10 text-xs">STL</TableHead>
              <TableHead className="text-center w-10 text-xs">BLK</TableHead>
              <TableHead className="text-center w-10 text-xs">3PM</TableHead>
              <TableHead className="text-center w-10 text-xs">FG%</TableHead>
              <TableHead className="text-center w-10 text-xs">FT%</TableHead>
              {draftStarted && <TableHead className="w-24 text-center">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSorted.map(player => {
              const stats = getStats(player);
              return (
                <TableRow key={player.id} className={cn(player.drafted && 'opacity-50 bg-muted/30')}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">{player.name}</span>
                      {player.status && <Badge variant="destructive" className="text-[10px] px-1 py-0 w-fit">{player.status}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {player.team && <span>{player.team}</span>}
                    {player.positions.length > 0 && <span className="block">{player.positions.join(', ')}</span>}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">{player.crisRank ?? '—'}</TableCell>
                  <TableCell className="text-center font-mono text-sm">{player.adpRank ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    {player.valueVsAdp !== null ? (
                      <div className={cn(
                        'flex items-center justify-center gap-0.5 font-mono text-sm',
                        player.valueVsAdp > 0 && 'text-emerald-400',
                        player.valueVsAdp < 0 && 'text-red-400'
                      )}>
                        {player.valueVsAdp > 0 ? <TrendingUp className="w-3 h-3" /> : player.valueVsAdp < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                        {player.valueVsAdp > 0 ? '+' : ''}{player.valueVsAdp}
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">{fmt(stats?.pts)}</TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">{fmt(stats?.reb)}</TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">{fmt(stats?.ast)}</TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">{fmt(stats?.stl)}</TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">{fmt(stats?.blk)}</TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">{fmt(stats?.threes)}</TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">{fmtPct(stats?.fgPct)}</TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">{fmtPct(stats?.ftPct)}</TableCell>
                  {draftStarted && (
                    <TableCell className="text-center">
                      {player.drafted ? (
                        <Button variant="ghost" size="sm" onClick={() => onUndoDraft(player.id)} className="h-7 text-xs">
                          <X className="w-3 h-3 mr-1" />Undo
                        </Button>
                      ) : (
                        <div className="flex gap-1">
                          <Button variant={isMyTurn ? 'default' : 'outline'} size="sm" onClick={() => onDraftPlayer(player.id, 'me')} className="h-7 text-xs px-2" title="Draft to my team">
                            <User className="w-3 h-3" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => onDraftPlayer(player.id, 1)} className="h-7 text-xs px-2" title="Drafted by other">
                            <Users className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        
        {filteredAndSorted.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery ? 'No players match your search' : 'No players available'}
          </div>
        )}
      </div>
    </div>
  );
}
