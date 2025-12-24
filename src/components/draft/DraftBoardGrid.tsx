// Draft Board Grid - Snake draft visualization with team tracking

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Check, Star, Undo2, User, Users, Search } from 'lucide-react';
import { UnifiedPlayer, DraftSettings, PickEntry, TeamComposition, getMyPicks } from '@/types/draft';
import { cn } from '@/lib/utils';

interface DraftBoardGridProps {
  players: UnifiedPlayer[];
  settings: DraftSettings;
  currentPick: number;
  draftStarted: boolean;
  picks: PickEntry[];
  onDraftPlayer: (playerId: string, draftedBy: 'me' | number) => void;
  onUndoLastPick: () => void;
  teamCompositions: TeamComposition[];
}

export function DraftBoardGrid({
  players,
  settings,
  currentPick,
  draftStarted,
  picks,
  onDraftPlayer,
  onUndoLastPick,
  teamCompositions,
}: DraftBoardGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { teams, rounds, format, myPickSlot } = settings;
  const totalPicks = teams * rounds;
  const myPicks = useMemo(() => getMyPicks(settings), [settings]);
  const isMyTurn = myPicks.includes(currentPick);

  // Create pick slots
  const pickSlots = useMemo(() => {
    const slots: Array<{
      pick: number;
      round: number;
      team: number;
      isMyPick: boolean;
      player: UnifiedPlayer | null;
      draftedBy: 'me' | number | null;
    }> = [];

    for (let round = 1; round <= rounds; round++) {
      for (let pickInRound = 1; pickInRound <= teams; pickInRound++) {
        const overallPick = (round - 1) * teams + pickInRound;
        let teamSlot = format === 'snake' && round % 2 === 0 
          ? teams - pickInRound + 1 
          : pickInRound;
        
        const draftedPlayer = players.find(p => p.draftedAt === overallPick);
        
        slots.push({
          pick: overallPick,
          round,
          team: teamSlot,
          isMyPick: teamSlot === myPickSlot,
          player: draftedPlayer || null,
          draftedBy: draftedPlayer?.draftedBy || null,
        });
      }
    }
    return slots;
  }, [players, rounds, teams, format, myPickSlot]);

  const roundGroups = useMemo(() => {
    const groups: typeof pickSlots[] = [];
    for (let r = 1; r <= rounds; r++) {
      groups.push(pickSlots.filter(s => s.round === r));
    }
    return groups;
  }, [pickSlots, rounds]);

  // Quick pick search
  const filteredPlayers = useMemo(() => {
    const available = players.filter(p => !p.drafted);
    if (!searchQuery.trim()) {
      return available.sort((a, b) => (a.crisRank ?? 999) - (b.crisRank ?? 999)).slice(0, 15);
    }
    const q = searchQuery.toLowerCase();
    return available.filter(p => p.name.toLowerCase().includes(q)).slice(0, 10);
  }, [players, searchQuery]);

  if (!draftStarted) {
    return (
      <Card className="gradient-card shadow-card p-6 border-border text-center">
        <h3 className="font-display font-bold text-lg mb-2">Draft Board</h3>
        <p className="text-sm text-muted-foreground">Start the draft to see the board</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-lg">Draft Board</h3>
          <p className="text-xs text-muted-foreground">
            Pick #{currentPick} of {totalPicks} • {format} format
            {isMyTurn && <span className="text-primary ml-2 font-semibold">• Your turn!</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onUndoLastPick} disabled={picks.length === 0} className="h-8 text-xs gap-1">
            <Undo2 className="w-3 h-3" />Undo
          </Button>
          <Badge variant="outline" className="font-mono text-lg px-3 py-1">#{currentPick}</Badge>
        </div>
      </div>

      {/* Quick Draft Search */}
      <Card className="p-3 gradient-card">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search to draft..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-sm flex-1"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {filteredPlayers.map(player => (
            <div key={player.id} className="flex gap-0.5">
              <Button
                variant={isMyTurn ? 'default' : 'outline'}
                size="sm"
                onClick={() => onDraftPlayer(player.id, 'me')}
                className="h-7 text-xs px-2 gap-1 rounded-r-none"
              >
                <span className="font-mono text-muted-foreground">#{player.crisRank ?? '?'}</span>
                {player.name.split(' ').pop()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDraftPlayer(player.id, 1)}
                className="h-7 text-xs px-1.5 rounded-l-none border-l-0"
              >
                <Users className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Board Grid */}
      <Card className="gradient-card overflow-hidden">
        <ScrollArea className="h-[350px]">
          <div className="p-4">
            {/* Header */}
            <div className="flex gap-1 mb-2">
              <div className="w-12 shrink-0" />
              {Array.from({ length: teams }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-24 shrink-0 text-center text-xs font-semibold py-1 rounded',
                    i + 1 === myPickSlot && 'bg-primary/20 text-primary'
                  )}
                >
                  Team {i + 1}
                  {i + 1 === myPickSlot && <Star className="w-3 h-3 inline ml-1" />}
                </div>
              ))}
            </div>

            {/* Rounds */}
            {roundGroups.map((roundPicks, roundIdx) => (
              <div key={roundIdx} className="flex gap-1 mb-1">
                <div className="w-12 shrink-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                  R{roundIdx + 1}
                </div>
                {roundPicks.map(slot => (
                  <div
                    key={slot.pick}
                    className={cn(
                      'w-24 shrink-0 h-14 rounded border text-xs p-1 transition-all',
                      slot.pick === currentPick && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                      slot.isMyPick && !slot.player && 'bg-primary/10 border-primary/50',
                      slot.player && slot.draftedBy === 'me' && 'bg-emerald-500/20 border-emerald-500/50',
                      slot.player && slot.draftedBy !== 'me' && 'bg-muted/50 border-border',
                      !slot.player && !slot.isMyPick && 'bg-muted/30 border-border'
                    )}
                  >
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-[10px] text-muted-foreground">#{slot.pick}</span>
                      {slot.draftedBy === 'me' && <User className="w-2.5 h-2.5 text-emerald-400" />}
                    </div>
                    {slot.player ? (
                      <div className="flex flex-col">
                        <span className={cn('font-semibold truncate text-[11px]', slot.draftedBy === 'me' && 'text-emerald-200')}>
                          {slot.player.name.split(' ').slice(-1)[0]}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {slot.player.team} {slot.player.positions[0] || ''}
                        </span>
                      </div>
                    ) : slot.isMyPick ? (
                      <div className="text-[10px] text-primary/70">Your pick</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Card>

      {/* Team Leaderboard */}
      <Card className="p-3 gradient-card">
        <h4 className="font-semibold text-sm mb-2">Team Strength (by avg CRI)</h4>
        <div className="flex gap-2 flex-wrap">
          {teamCompositions.slice(0, 5).map(tc => (
            <Badge
              key={tc.teamIndex}
              variant={tc.teamIndex === myPickSlot ? 'default' : 'outline'}
              className="font-mono"
            >
              T{tc.teamIndex}: {tc.avgCRI > 0 ? tc.avgCRI.toFixed(0) : '—'} ({tc.playerIds.length}p)
            </Badge>
          ))}
        </div>
      </Card>
    </div>
  );
}
