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
  Check, 
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { DraftPlayer, TIER_COLORS } from '@/types/draft';
import { cn } from '@/lib/utils';

interface DraftRankingsTableProps {
  players: DraftPlayer[];
  onMarkDrafted: (playerName: string, draftedBy?: string) => void;
  onUndoDraft: (playerName: string) => void;
  draftStarted: boolean;
  showDrafted?: boolean;
}

type SortColumn = 'crisRank' | 'adpRank' | 'lastYearRank' | 'valueDelta' | 'tier' | 'playerName';
type SortDirection = 'asc' | 'desc';

export function DraftRankingsTable({
  players,
  onMarkDrafted,
  onUndoDraft,
  draftStarted,
  showDrafted = false,
}: DraftRankingsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('crisRank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<number | null>(null);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
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
    
    // Tier filter
    if (tierFilter !== null) {
      result = result.filter(p => p.tier === tierFilter);
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
        case 'valueDelta':
          aVal = a.valueDelta ?? 0;
          bVal = b.valueDelta ?? 0;
          break;
        case 'tier':
          aVal = a.tier;
          bVal = b.tier;
          break;
        case 'playerName':
          aVal = a.playerName;
          bVal = b.playerName;
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
  }, [players, showDrafted, searchQuery, tierFilter, sortColumn, sortDirection]);

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3 h-3 ml-1" /> 
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const tierCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    players.filter(p => !p.drafted).forEach(p => {
      counts[p.tier] = (counts[p.tier] || 0) + 1;
    });
    return counts;
  }, [players]);

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
        
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          
          <div className="flex gap-1">
            <Button
              variant={tierFilter === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTierFilter(null)}
              className="h-8 text-xs px-2"
            >
              All
            </Button>
            {[1, 2, 3, 4, 5, 6].map(tier => (
              <Button
                key={tier}
                variant={tierFilter === tier ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTierFilter(tier === tierFilter ? null : tier)}
                className="h-8 text-xs px-2"
              >
                T{tier}
                {tierCounts[tier] ? ` (${tierCounts[tier]})` : ''}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('playerName')}
              >
                <div className="flex items-center">
                  Player <SortIcon column="playerName" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center"
                onClick={() => handleSort('tier')}
              >
                <div className="flex items-center justify-center">
                  Tier <SortIcon column="tier" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center"
                onClick={() => handleSort('crisRank')}
              >
                <div className="flex items-center justify-center">
                  CRIS <SortIcon column="crisRank" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center"
                onClick={() => handleSort('adpRank')}
              >
                <div className="flex items-center justify-center">
                  ADP <SortIcon column="adpRank" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center"
                onClick={() => handleSort('lastYearRank')}
              >
                <div className="flex items-center justify-center">
                  Last Yr <SortIcon column="lastYearRank" />
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50 text-center"
                onClick={() => handleSort('valueDelta')}
              >
                <div className="flex items-center justify-center">
                  Value <SortIcon column="valueDelta" />
                </div>
              </TableHead>
              {draftStarted && <TableHead className="w-20 text-center">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedPlayers.map((player, idx) => (
              <TableRow 
                key={player.playerName}
                className={cn(
                  player.drafted && 'opacity-50 bg-muted/30'
                )}
              >
                <TableCell className="text-xs text-muted-foreground font-mono">
                  {idx + 1}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm">{player.playerName}</span>
                    <div className="flex gap-1 text-xs text-muted-foreground">
                      {player.team && <span>{player.team}</span>}
                      {player.position && <span>• {player.position}</span>}
                      {player.status && (
                        <Badge variant="destructive" className="text-[10px] px-1 py-0">
                          {player.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge 
                    variant="outline" 
                    className={cn('text-xs', TIER_COLORS[player.tier])}
                  >
                    T{player.tier}
                  </Badge>
                </TableCell>
                <TableCell className="text-center font-mono text-sm">
                  {player.crisRank ?? '—'}
                </TableCell>
                <TableCell className="text-center font-mono text-sm">
                  {player.adpRank ?? '—'}
                </TableCell>
                <TableCell className="text-center font-mono text-sm">
                  {player.lastYearRank ?? '—'}
                </TableCell>
                <TableCell className="text-center">
                  {player.valueDelta !== null && (
                    <div className={cn(
                      'flex items-center justify-center gap-0.5 font-mono text-sm',
                      player.valueDelta > 0 && 'text-emerald-400',
                      player.valueDelta < 0 && 'text-red-400',
                    )}>
                      {player.valueDelta > 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : player.valueDelta < 0 ? (
                        <TrendingDown className="w-3 h-3" />
                      ) : null}
                      {player.valueDelta > 0 ? '+' : ''}{player.valueDelta}
                    </div>
                  )}
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onMarkDrafted(player.playerName)}
                        className="h-7 text-xs"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Draft
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        {filteredAndSortedPlayers.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery || tierFilter !== null 
              ? 'No players match your filters' 
              : 'No players available'}
          </div>
        )}
      </div>
    </Card>
  );
}
