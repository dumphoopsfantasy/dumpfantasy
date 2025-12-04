import { useState, useMemo } from "react";
import { RosterSlot, Player } from "@/types/fantasy";
import { RosterPlayerCard } from "@/components/roster/RosterPlayerCard";
import { PlayerDetailSheet } from "@/components/roster/PlayerDetailSheet";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatStat } from "@/lib/playerUtils";
import { CrisToggle } from "@/components/CrisToggle";
import { CrisExplanation } from "@/components/CrisExplanation";
import { calculateCRISForAll, formatPct } from "@/lib/crisUtils";
import { sampleRoster } from "@/data/sampleData";
import { cn } from "@/lib/utils";

export const YourTeam = () => {
  const [roster] = useState<RosterSlot[]>(sampleRoster);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [sortBy, setSortBy] = useState<string>("slot");
  const [useCris, setUseCris] = useState(true);

  // Get all players from roster
  const allPlayers = roster.map(r => r.player);
  const activePlayers = allPlayers.filter(p => p.minutes > 0);

  // Calculate CRI/wCRI for active players
  const playersWithCRI = useMemo(() => {
    if (activePlayers.length === 0) return [];
    return calculateCRISForAll(activePlayers.map(p => ({
      fgPct: p.fgPct,
      ftPct: p.ftPct,
      threepm: p.threepm,
      rebounds: p.rebounds,
      assists: p.assists,
      steals: p.steals,
      blocks: p.blocks,
      turnovers: p.turnovers,
      points: p.points,
    })));
  }, [activePlayers]);

  // Create CRI ranks
  const criRanks = useMemo(() => {
    const criSorted = [...playersWithCRI].map((p, idx) => ({ idx, cri: p.cri, wCri: p.wCri }));
    criSorted.sort((a, b) => b.cri - a.cri);
    const wCriSorted = [...criSorted].sort((a, b) => b.wCri - a.wCri);
    
    const ranks = new Map<number, { criRank: number; wCriRank: number; cri: number; wCri: number }>();
    criSorted.forEach((item, rank) => {
      ranks.set(item.idx, { 
        criRank: rank + 1, 
        wCriRank: 0, 
        cri: item.cri, 
        wCri: item.wCri 
      });
    });
    wCriSorted.forEach((item, rank) => {
      const existing = ranks.get(item.idx);
      if (existing) existing.wCriRank = rank + 1;
    });
    return ranks;
  }, [playersWithCRI]);

  // Enhance roster players with CRI data
  const enhancedRoster = useMemo(() => {
    let activeIdx = 0;
    return roster.map(slot => {
      const player = slot.player;
      if (player.minutes > 0) {
        const criData = criRanks.get(activeIdx);
        activeIdx++;
        if (criData) {
          return {
            ...slot,
            player: {
              ...player,
              cri: useCris ? criData.cri : criData.wCri,
              criRank: useCris ? criData.criRank : criData.wCriRank,
            }
          };
        }
      }
      return slot;
    });
  }, [roster, criRanks, useCris]);

  // Count by slot type
  const startersCount = roster.filter(r => r.slotType === "starter").length;
  const benchCount = roster.filter(r => r.slotType === "bench").length;
  const irCount = roster.filter(r => r.slotType === "ir").length;
  const playingTodayCount = roster.filter(r => r.player.opponent).length;

  // Team totals (averages)
  const teamTotals = useMemo(() => {
    const count = activePlayers.length || 1;
    return {
      pts: activePlayers.reduce((sum, p) => sum + p.points, 0) / count,
      reb: activePlayers.reduce((sum, p) => sum + p.rebounds, 0) / count,
      ast: activePlayers.reduce((sum, p) => sum + p.assists, 0) / count,
      threepm: activePlayers.reduce((sum, p) => sum + p.threepm, 0) / count,
      stl: activePlayers.reduce((sum, p) => sum + p.steals, 0) / count,
      blk: activePlayers.reduce((sum, p) => sum + p.blocks, 0) / count,
      to: activePlayers.reduce((sum, p) => sum + p.turnovers, 0) / count,
      fgPct: activePlayers.reduce((sum, p) => sum + p.fgPct, 0) / count,
      ftPct: activePlayers.reduce((sum, p) => sum + p.ftPct, 0) / count,
    };
  }, [activePlayers]);

  // Weekly projections (x40 for counting stats)
  const weeklyProjections = useMemo(() => ({
    pts: teamTotals.pts * 40,
    reb: teamTotals.reb * 40,
    ast: teamTotals.ast * 40,
    threepm: teamTotals.threepm * 40,
    stl: teamTotals.stl * 40,
    blk: teamTotals.blk * 40,
    to: teamTotals.to * 40,
    fgPct: teamTotals.fgPct, // Percentages stay the same
    ftPct: teamTotals.ftPct,
  }), [teamTotals]);

  const sortedRoster = useMemo(() => {
    if (sortBy === "slot") return enhancedRoster;
    
    return [...enhancedRoster].sort((a, b) => {
      const playerA = a.player;
      const playerB = b.player;
      
      switch (sortBy) {
        case "points": return playerB.points - playerA.points;
        case "rebounds": return playerB.rebounds - playerA.rebounds;
        case "assists": return playerB.assists - playerA.assists;
        case "cris": return (playerB.cri || 0) - (playerA.cri || 0);
        default: return 0;
      }
    });
  }, [enhancedRoster, sortBy]);

  const scoreLabel = useCris ? 'CRI' : 'wCRI';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Team Summary Card */}
      <Card className="gradient-card border-border p-6">
        <div className="mb-4">
          <h2 className="font-display font-bold text-lg">TEAM AVERAGES</h2>
          <p className="text-xs text-muted-foreground">Per-game averages from active roster ({activePlayers.length} players)</p>
        </div>
        
        <div className="grid grid-cols-3 md:grid-cols-9 gap-4 mb-6">
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">FG%</p>
            <p className="font-display font-bold text-xl">{formatPct(teamTotals.fgPct)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">FT%</p>
            <p className="font-display font-bold text-xl">{formatPct(teamTotals.ftPct)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">3PM</p>
            <p className="font-display font-bold text-xl">{teamTotals.threepm.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">REB</p>
            <p className="font-display font-bold text-xl">{teamTotals.reb.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">AST</p>
            <p className="font-display font-bold text-xl">{teamTotals.ast.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">STL</p>
            <p className="font-display font-bold text-xl">{teamTotals.stl.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">BLK</p>
            <p className="font-display font-bold text-xl">{teamTotals.blk.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">TO</p>
            <p className="font-display font-bold text-xl text-stat-negative">{teamTotals.to.toFixed(1)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase">PTS</p>
            <p className="font-display font-bold text-xl text-primary">{teamTotals.pts.toFixed(1)}</p>
          </div>
        </div>

        {/* Weekly Projections */}
        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground mb-3">WEEKLY PROJECTIONS (×40 for counting stats)</p>
          <div className="grid grid-cols-3 md:grid-cols-9 gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">FG%</p>
              <p className="font-display font-semibold text-sm">{formatPct(weeklyProjections.fgPct)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">FT%</p>
              <p className="font-display font-semibold text-sm">{formatPct(weeklyProjections.ftPct)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">3PM</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.threepm.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">REB</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.reb.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">AST</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.ast.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">STL</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.stl.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">BLK</p>
              <p className="font-display font-semibold text-sm">{weeklyProjections.blk.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">TO</p>
              <p className="font-display font-semibold text-sm text-stat-negative">{weeklyProjections.to.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">PTS</p>
              <p className="font-display font-semibold text-sm text-primary">{weeklyProjections.pts.toFixed(0)}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Roster Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="font-display font-bold text-xl">My Roster</h2>
          <Badge variant="outline" className="text-xs">{roster.length} players</Badge>
          <Badge variant="secondary" className="text-xs">Active: {startersCount}</Badge>
          <Badge variant="secondary" className="text-xs">Bench: {benchCount}</Badge>
          {irCount > 0 && <Badge variant="destructive" className="text-xs">IR: {irCount}</Badge>}
          {playingTodayCount > 0 && (
            <Badge className="text-xs bg-primary/20 text-primary border-primary/50">
              Playing Today: {playingTodayCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <CrisToggle useCris={useCris} onChange={setUseCris} />
          <CrisExplanation />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slot">Slot Order</SelectItem>
              <SelectItem value="points">Points</SelectItem>
              <SelectItem value="rebounds">Rebounds</SelectItem>
              <SelectItem value="assists">Assists</SelectItem>
              <SelectItem value="cris">{scoreLabel}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* All Players List */}
      <div className="space-y-2">
        {sortedRoster.map((slot) => (
          <RosterPlayerCard
            key={slot.player.id}
            player={slot.player}
            slot={slot.slot}
            slotType={slot.slotType}
            onClick={() => setSelectedPlayer(slot.player)}
            useCris={useCris}
          />
        ))}
      </div>

      <PlayerDetailSheet
        player={selectedPlayer}
        open={!!selectedPlayer}
        onOpenChange={(open) => !open && setSelectedPlayer(null)}
      />
    </div>
  );
};
