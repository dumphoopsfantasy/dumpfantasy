import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Check, Star, Undo2, User, Users } from 'lucide-react';
import { DraftPlayer, DraftSettings, getMyPicks, TIER_COLORS, PickHistoryEntry } from '@/types/draft';
import { cn } from '@/lib/utils';

interface DraftBoardGridProps {
  players: DraftPlayer[];
  settings: DraftSettings;
  currentPick: number;
  draftStarted: boolean;
  pickHistory: PickHistoryEntry[];
  onMarkDrafted: (playerName: string, draftedBy: 'me' | 'other') => void;
  onUndoLastPick: () => void;
}

export function DraftBoardGrid({
  players,
  settings,
  currentPick,
  draftStarted,
  pickHistory,
  onMarkDrafted,
  onUndoLastPick,
}: DraftBoardGridProps) {
  const { teams, rounds, format, myPickSlot } = settings;
  const totalPicks = teams * rounds;
  const myPicks = useMemo(() => getMyPicks(settings), [settings]);

  // Create pick slots with drafted player info
  const pickSlots = useMemo(() => {
    const slots: Array<{
      pick: number;
      round: number;
      pickInRound: number;
      team: number;
      isMyPick: boolean;
      player: DraftPlayer | null;
      draftedBy: 'me' | 'other' | null;
    }> = [];

    for (let round = 1; round <= rounds; round++) {
      for (let pickInRound = 1; pickInRound <= teams; pickInRound++) {
        const overallPick = (round - 1) * teams + pickInRound;
        
        // Calculate which team picks at this slot
        let teamSlot: number;
        if (format === 'snake' && round % 2 === 0) {
          teamSlot = teams - pickInRound + 1;
        } else {
          teamSlot = pickInRound;
        }
        
        const isMyPick = teamSlot === myPickSlot;
        const draftedPlayer = players.find(p => p.draftedAt === overallPick);
        
        slots.push({
          pick: overallPick,
          round,
          pickInRound,
          team: teamSlot,
          isMyPick,
          player: draftedPlayer || null,
          draftedBy: draftedPlayer?.draftedBy || null,
        });
      }
    }

    return slots;
  }, [players, rounds, teams, format, myPickSlot]);

  // Group by rounds for display
  const roundGroups = useMemo(() => {
    const groups: typeof pickSlots[] = [];
    for (let r = 1; r <= rounds; r++) {
      groups.push(pickSlots.filter(s => s.round === r));
    }
    return groups;
  }, [pickSlots, rounds]);

  // Available players for quick pick
  const availablePlayers = useMemo(() => 
    players
      .filter(p => !p.drafted)
      .sort((a, b) => (a.crisRank ?? 999) - (b.crisRank ?? 999))
      .slice(0, 20),
    [players]
  );

  const isMyTurn = myPicks.includes(currentPick);

  if (!draftStarted) {
    return (
      <Card className="gradient-card shadow-card p-6 border-border">
        <div className="text-center text-muted-foreground">
          <h3 className="font-display font-bold text-lg mb-2">Draft Board</h3>
          <p className="text-sm">Start the draft to see the board</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="gradient-card shadow-card border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-display font-bold text-lg">Draft Board</h3>
          <p className="text-xs text-muted-foreground">
            Pick #{currentPick} of {totalPicks} • {format.charAt(0).toUpperCase() + format.slice(1)} format
            {isMyTurn && <span className="text-primary ml-2 font-semibold">• Your turn!</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onUndoLastPick}
            disabled={pickHistory.length === 0}
            className="h-8 text-xs gap-1"
          >
            <Undo2 className="w-3 h-3" />
            Undo
          </Button>
          <Badge variant="outline" className="font-mono text-lg px-3 py-1">
            Pick #{currentPick}
          </Badge>
        </div>
      </div>

      {/* Quick Pick Bar */}
      <div className="p-3 border-b border-border bg-muted/30">
        <p className="text-xs text-muted-foreground mb-2">
          Quick Pick (Top Available) — 
          <span className="ml-1"><User className="w-3 h-3 inline" /> = Mine</span>
          <span className="ml-2"><Users className="w-3 h-3 inline" /> = Other</span>
        </p>
        <div className="flex gap-1 flex-wrap">
          {availablePlayers.slice(0, 10).map(player => (
            <div key={player.playerId} className="flex gap-0.5">
              <Button
                variant={isMyTurn ? 'default' : 'outline'}
                size="sm"
                onClick={() => onMarkDrafted(player.playerName, 'me')}
                className="h-7 text-xs px-2 gap-1 rounded-r-none"
                title="Draft to my team"
              >
                <span className="font-mono text-muted-foreground">
                  #{player.crisRank ?? '?'}
                </span>
                {player.playerName.split(' ').pop()}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onMarkDrafted(player.playerName, 'other')}
                className="h-7 text-xs px-1.5 rounded-l-none border-l-0"
                title="Drafted by other team"
              >
                <Users className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Board Grid */}
      <ScrollArea className="h-[400px]">
        <div className="p-4">
          {/* Header Row - Team Numbers */}
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

          {/* Round Rows */}
          {roundGroups.map((roundPicks, roundIdx) => (
            <div key={roundIdx} className="flex gap-1 mb-1">
              <div className="w-12 shrink-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                R{roundIdx + 1}
              </div>
              
              {roundPicks.map(slot => (
                <div
                  key={slot.pick}
                  className={cn(
                    'w-24 shrink-0 h-16 rounded border text-xs p-1 transition-all',
                    slot.pick === currentPick && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                    slot.isMyPick && !slot.player && 'bg-primary/10 border-primary/50',
                    slot.player && slot.draftedBy === 'me' && 'bg-emerald-500/20 border-emerald-500/50',
                    slot.player && slot.draftedBy === 'other' && 'bg-muted/50 border-border',
                    !slot.player && !slot.isMyPick && 'bg-muted/30 border-border',
                    slot.pick < currentPick && !slot.player && 'opacity-50'
                  )}
                >
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[10px] text-muted-foreground">#{slot.pick}</span>
                    {slot.draftedBy === 'me' && (
                      <User className="w-2.5 h-2.5 text-emerald-400" />
                    )}
                  </div>
                  
                  {slot.player ? (
                    <div className="flex flex-col">
                      <span className={cn(
                        'font-semibold truncate text-[11px]',
                        slot.draftedBy === 'me' && 'text-emerald-200'
                      )}>
                        {slot.player.playerName.split(' ').slice(-1)[0]}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {slot.player.team || ''} {slot.player.position?.split(',')[0] || ''}
                      </span>
                    </div>
                  ) : (
                    slot.isMyPick && (
                      <div className="text-[10px] text-primary/70">
                        Your pick
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* My Picks Summary */}
      <div className="p-3 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground mb-2">My Picks:</p>
        <div className="flex gap-1 flex-wrap">
          {myPicks.map(pick => {
            const slot = pickSlots.find(s => s.pick === pick);
            const isPast = pick < currentPick;
            const isCurrent = pick === currentPick;
            
            return (
              <Badge
                key={pick}
                variant={slot?.player ? 'default' : isCurrent ? 'default' : 'outline'}
                className={cn(
                  'text-xs font-mono',
                  slot?.player && 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50',
                  isCurrent && !slot?.player && 'ring-2 ring-primary ring-offset-1',
                  isPast && !slot?.player && 'opacity-50'
                )}
              >
                R{Math.ceil(pick / teams)}#{pick}
                {slot?.player && (
                  <span className="ml-1">
                    <Check className="w-3 h-3 inline" />
                  </span>
                )}
              </Badge>
            );
          })}
        </div>
      </div>
    </Card>
  );
}