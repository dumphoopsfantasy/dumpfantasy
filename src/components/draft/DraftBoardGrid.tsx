import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Check, Star } from 'lucide-react';
import { DraftPlayer, DraftSettings, getMyPicks, TIER_COLORS } from '@/types/draft';
import { cn } from '@/lib/utils';

interface DraftBoardGridProps {
  players: DraftPlayer[];
  settings: DraftSettings;
  currentPick: number;
  draftStarted: boolean;
  onMarkDrafted: (playerName: string, draftedBy?: string) => void;
}

export function DraftBoardGrid({
  players,
  settings,
  currentPick,
  draftStarted,
  onMarkDrafted,
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
    }> = [];

    for (let round = 1; round <= rounds; round++) {
      for (let pickInRound = 1; pickInRound <= teams; pickInRound++) {
        const overallPick = (round - 1) * teams + pickInRound;
        
        // Calculate which team picks at this slot
        let teamSlot: number;
        if (format === 'snake' && round % 2 === 0) {
          // Even rounds are reversed in snake
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
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-lg px-3 py-1">
          Pick #{currentPick}
        </Badge>
      </div>

      {/* Quick Pick Bar */}
      <div className="p-3 border-b border-border bg-muted/30">
        <p className="text-xs text-muted-foreground mb-2">Quick Pick (Top Available):</p>
        <div className="flex gap-1 flex-wrap">
          {availablePlayers.slice(0, 10).map(player => (
            <Button
              key={player.playerName}
              variant="outline"
              size="sm"
              onClick={() => onMarkDrafted(player.playerName)}
              className={cn(
                'h-7 text-xs px-2 gap-1',
                myPicks.includes(currentPick) && 'border-primary'
              )}
            >
              <span className="font-mono text-muted-foreground">
                #{player.crisRank ?? '?'}
              </span>
              {player.playerName.split(' ').pop()}
            </Button>
          ))}
        </div>
      </div>

      {/* Board Grid */}
      <ScrollArea className="h-[400px]">
        <div className="p-4">
          {/* Header Row - Team Numbers */}
          <div className="flex gap-1 mb-2">
            <div className="w-12 shrink-0" /> {/* Round label space */}
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
              {/* Round Label */}
              <div className="w-12 shrink-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                R{roundIdx + 1}
              </div>
              
              {/* Pick Cells */}
              {roundPicks.map(slot => (
                <div
                  key={slot.pick}
                  className={cn(
                    'w-24 shrink-0 h-16 rounded border text-xs p-1 transition-all',
                    slot.pick === currentPick && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                    slot.isMyPick && !slot.player && 'bg-primary/10 border-primary/50',
                    slot.player && TIER_COLORS[slot.player.tier],
                    !slot.player && !slot.isMyPick && 'bg-muted/30 border-border',
                    slot.pick < currentPick && !slot.player && 'opacity-50'
                  )}
                >
                  <div className="text-[10px] text-muted-foreground mb-0.5">
                    #{slot.pick}
                  </div>
                  
                  {slot.player ? (
                    <div className="flex flex-col">
                      <span className="font-semibold truncate text-[11px]">
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
                  isCurrent && 'ring-2 ring-primary ring-offset-1',
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
