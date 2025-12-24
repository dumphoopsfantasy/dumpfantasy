import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  X,
  TrendingUp,
  TrendingDown,
  User,
  Users,
  AlertCircle,
} from 'lucide-react';
import { DraftPlayer, StatView, PlayerStats } from '@/types/draft';
import { cn } from '@/lib/utils';

interface DraftRankingsTableProps {
  players: DraftPlayer[];
  onMarkDrafted: (playerName: string, draftedBy: 'me' | 'other') => void;
  onUndoDraft: (playerName: string) => void;
  draftStarted: boolean;
  showDrafted?: boolean;
}

type SortColumn = 'crisRank' | 'adpRank' | 'lastYearRank' | 'deltaCRI' | 'deltaWCRI' | 'playerName' | 'pts' | 'reb' | 'ast';
type SortDirection = 'asc' | 'desc';

export function DraftRankingsTable({
  players,
  onMarkDrafted,
  onUndoDraft,
  draftStarted,
  showDrafted = false,
}: DraftRankingsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('deltaCRI');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [statView, setStatView] = useState<StatView>('projections');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      // Default to desc for value/stats columns, asc for ranks
      setSortDirection(['deltaCRI', 'deltaWCRI', 'pts', 'reb', 'ast'].includes(column) ? 'desc' : 'asc');
    }
  };

  const getPlayerStats = (player: DraftPlayer): PlayerStats | null => {
    return statView === 'projections' ? player.crisStats : player.lastYearStats;
  };

  const filteredAndSortedPlayers = useMemo(() => {
    let result = players.filter(p => showDrafted ? p.drafted : !p.drafted);
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.playerName.toLowerCase().includes(query) ||
        p.team?.toLowerCase().includes(query) ||
        p.position?.toLowerCase().includes(query)
      );
    }
    
    // Sort
    result.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      
      switch (sortColumn) {
        case 'crisRank':
          aVal = a.crisRank ?? 999;
          bVal = b.crisRank ?? 999;
          break;
        case 'adpRank':
          aVal = a.adpRank ?? 999;
          bVal = b.adpRank ?? 999;
          break;
        case 'lastYearRank':
          aVal = a.lastYearRank ?? 999;
          bVal = b.lastYearRank ?? 999;
          break;
        case 'deltaCRI':
          aVal = a.deltaCRI ?? -999;
          bVal = b.deltaCRI ?? -999;
          break;
        case 'deltaWCRI':
          aVal = a.deltaWCRI ?? -999;
          bVal = b.deltaWCRI ?? -999;
          break;
        case 'playerName':
          aVal = a.playerName;
          bVal = b.playerName;
          break;
        case 'pts':
          aVal = getPlayerStats(a)?.pts ?? 0;
          bVal = getPlayerStats(b)?.pts ?? 0;
          break;
        case 'reb':
          aVal = getPlayerStats(a)?.reb ?? 0;
          bVal = getPlayerStats(b)?.reb ?? 0;
          break;
        case 'ast':
          aVal = getPlayerStats(a)?.ast ?? 0;
          bVal = getPlayerStats(b)?.ast ?? 0;
          break;
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortDirection === 'asc' 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number);
    });
    
    return result;
  }, [players, showDrafted, searchQuery, sortColumn, sortDirection, statView]);

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3 h-3 ml-1" /> 
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const formatStat = (val: number | undefined) => {
    if (val === undefined) return null;
    return val.toFixed(1);
  };

  const formatPct = (val: number | undefined) => {
    if (val === undefined) return null;
    return (val * 100).toFixed(0) + '%';
  };

  // Check if any player has stats for the current view
  const hasStatsForView = useMemo(() => {
    return players.some(p => {
      const stats = getPlayerStats(p);
      return stats && (stats.pts !== undefined || stats.reb !== undefined);
    });
  }, [players, statView]);

  return (
    <Card className="gradient-card shadow-card border-border overflow-hidden">
      {/* Header & Filters */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg">
            {showDrafted ? 'Drafted Players' : 'Available Players'}
          </h3>
          <Badge variant="outline" className="font-mono">
            {filteredAndSortedPlayers.length} players
          </Badge>
        </div>
        
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          
          {/* Stat View Toggle */}
          <div className="flex gap-1 bg-muted/50 rounded-md p-0.5">
            <Button
              variant={statView === 'projections' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatView('projections')}
              className="h-7 text-xs px-2"
            >
              Projections
            </Button>
            <Button
              variant={statView === 'lastYear' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setStatView('lastYear')}
              className="h-7 text-xs px-2"
            >
              Last Year
            </Button>
          </div>
        </div>
      </div>

      {/* Stats missing hint */}
      {!hasStatsForView && players.length > 0 && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-xs text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            Stats not found for {statView === 'projections' ? 'projections' : 'last year'}. 
            Make sure you imported the correct ESPN table (not just names/ranks).
          </span>
        </div>
      )}

      {/* Table - No inner scroll, flows naturally */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 min-w-[160px]"
                onClick={() => handleSort('playerName')}
              >
                <div className="flex items-center">
                  Player <SortIcon column="playerName" />
                </div>
              </TableHead>
              <TableHead className="w-20">Team/Pos</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center w-12"
                onClick={() => handleSort('crisRank')}
              >
                <div className="flex items-center justify-center">
                  CRI <SortIcon column="crisRank" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center w-12"
                onClick={() => handleSort('adpRank')}
              >
                <div className="flex items-center justify-center">
                  ADP <SortIcon column="adpRank" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center w-14"
                onClick={() => handleSort('deltaCRI')}
                title="ADP rank minus CRI rank. Positive = undervalued (ADP later than your CRI rank)"
              >
                <div className="flex items-center justify-center">
                  Δ CRI <SortIcon column="deltaCRI" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center w-14"
                onClick={() => handleSort('deltaWCRI')}
                title="ADP rank minus WCRI rank. Positive = undervalued vs weighted build"
              >
                <div className="flex items-center justify-center">
                  Δ WCRI <SortIcon column="deltaWCRI" />
                </div>
              </TableHead>
              {/* Stats columns */}
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center w-10"
                onClick={() => handleSort('pts')}
              >
                <div className="flex items-center justify-center text-xs">
                  PTS <SortIcon column="pts" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center w-10"
                onClick={() => handleSort('reb')}
              >
                <div className="flex items-center justify-center text-xs">
                  REB <SortIcon column="reb" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center w-10"
                onClick={() => handleSort('ast')}
              >
                <div className="flex items-center justify-center text-xs">
                  AST <SortIcon column="ast" />
                </div>
              </TableHead>
              <TableHead className="text-center w-10 text-xs">STL</TableHead>
              <TableHead className="text-center w-10 text-xs">BLK</TableHead>
              <TableHead className="text-center w-10 text-xs">3PM</TableHead>
              <TableHead className="text-center w-10 text-xs">TO</TableHead>
              <TableHead className="text-center w-10 text-xs">FG%</TableHead>
              <TableHead className="text-center w-10 text-xs">FT%</TableHead>
              {draftStarted && <TableHead className="w-24 text-center">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedPlayers.map((player) => {
              const stats = getPlayerStats(player);
              return (
                <TableRow 
                  key={player.playerId}
                  className={cn(
                    player.drafted && 'opacity-50 bg-muted/30'
                  )}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">{player.playerName}</span>
                      {player.status && (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0 w-fit">
                          {player.status}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">
                      {player.team && <span>{player.team}</span>}
                      {player.position && <span className="block">{player.position}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {player.crisRank ?? '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {player.adpRank ?? '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {player.deltaCRI !== null ? (
                      <div className={cn(
                        'flex items-center justify-center gap-0.5 font-mono text-sm',
                        player.deltaCRI > 0 && 'text-emerald-400',
                        player.deltaCRI < 0 && 'text-red-400',
                      )}>
                        {player.deltaCRI > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : player.deltaCRI < 0 ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : null}
                        {player.deltaCRI > 0 ? '+' : ''}{player.deltaCRI}
                      </div>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {player.deltaWCRI !== null ? (
                      <div className={cn(
                        'flex items-center justify-center gap-0.5 font-mono text-sm',
                        player.deltaWCRI > 0 && 'text-emerald-400',
                        player.deltaWCRI < 0 && 'text-red-400',
                      )}>
                        {player.deltaWCRI > 0 ? '+' : ''}{player.deltaWCRI}
                      </div>
                    ) : '—'}
                  </TableCell>
                  {/* Stats from active view */}
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {formatStat(stats?.pts) ?? '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {formatStat(stats?.reb) ?? '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {formatStat(stats?.ast) ?? '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {formatStat(stats?.stl) ?? '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {formatStat(stats?.blk) ?? '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {formatStat(stats?.threes) ?? '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {formatStat(stats?.to) ?? '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {formatPct(stats?.fgPct) ?? '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {formatPct(stats?.ftPct) ?? '—'}
                  </TableCell>
                  {draftStarted && (
                    <TableCell className="text-center">
                      {player.drafted ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onUndoDraft(player.playerName)}
                          className="h-7 text-xs"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Undo
                        </Button>
                      ) : (
                        <div className="flex gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => onMarkDrafted(player.playerName, 'me')}
                            className="h-7 text-xs px-2"
                            title="Draft to my team"
                          >
                            <User className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onMarkDrafted(player.playerName, 'other')}
                            className="h-7 text-xs px-2"
                            title="Drafted by other team"
                          >
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
        
        {filteredAndSortedPlayers.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery 
              ? 'No players match your search' 
              : 'No players available'}
          </div>
        )}
      </div>
    </Card>
  );
}