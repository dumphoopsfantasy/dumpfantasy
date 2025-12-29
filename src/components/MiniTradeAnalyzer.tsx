import { useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { NBATeamLogo } from "@/components/NBATeamLogo";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { CATEGORIES, CRIS_WEIGHTS, calculateCRISForAll } from "@/lib/crisUtils";
import { cn } from "@/lib/utils";
import { X, ArrowRight, ArrowLeft, Plus, RotateCcw, Users, Scale, Trophy, TrendingUp, TrendingDown } from "lucide-react";

interface MiniTradeAnalyzerProps {
  selectedPlayers: Player[];
  onRemoveFromSelection: (playerId: string) => void;
  onClearSelection: () => void;
  leagueTeams: LeagueTeam[];
  currentRoster: Player[];
}

interface TradeSide {
  players: Player[];
}

export const MiniTradeAnalyzer = ({
  selectedPlayers,
  onRemoveFromSelection,
  onClearSelection,
  leagueTeams,
  currentRoster,
}: MiniTradeAnalyzerProps) => {
  const [sideA, setSideA] = useState<TradeSide>({ players: [] });
  const [sideB, setSideB] = useState<TradeSide>({ players: [] });
  const [teamImpactMode, setTeamImpactMode] = useState(false);
  const [selectedTeamA, setSelectedTeamA] = useState<string>("");
  const [selectedTeamB, setSelectedTeamB] = useState<string>("");

  // Drag state
  const [draggedPlayer, setDraggedPlayer] = useState<Player | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, player: Player) => {
    setDraggedPlayer(player);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", player.id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedPlayer(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDropOnSide = useCallback((side: "A" | "B") => (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedPlayer) return;
    
    const setSide = side === "A" ? setSideA : setSideB;
    const otherSetSide = side === "A" ? setSideB : setSideA;
    
    // Remove from other side if present
    otherSetSide(prev => ({
      players: prev.players.filter(p => p.id !== draggedPlayer.id)
    }));
    
    // Add to this side if not already there
    setSide(prev => {
      if (prev.players.some(p => p.id === draggedPlayer.id)) return prev;
      return { players: [...prev.players, draggedPlayer] };
    });
    
    setDraggedPlayer(null);
  }, [draggedPlayer]);

  const addToSide = useCallback((player: Player, side: "A" | "B") => {
    const setSide = side === "A" ? setSideA : setSideB;
    const otherSetSide = side === "A" ? setSideB : setSideA;
    
    // Remove from other side if present
    otherSetSide(prev => ({
      players: prev.players.filter(p => p.id !== player.id)
    }));
    
    setSide(prev => {
      if (prev.players.some(p => p.id === player.id)) return prev;
      return { players: [...prev.players, player] };
    });
  }, []);

  const removeFromSide = useCallback((playerId: string, side: "A" | "B") => {
    const setSide = side === "A" ? setSideA : setSideB;
    setSide(prev => ({
      players: prev.players.filter(p => p.id !== playerId)
    }));
  }, []);

  const handleReset = useCallback(() => {
    setSideA({ players: [] });
    setSideB({ players: [] });
    onClearSelection();
  }, [onClearSelection]);

  // Calculate aggregated stats for a side
  const calcSideStats = useMemo(() => (players: Player[]) => {
    if (players.length === 0) {
      return {
        fgPct: 0, ftPct: 0, threepm: 0, rebounds: 0, assists: 0,
        steals: 0, blocks: 0, turnovers: 0, points: 0,
        totalWcri: 0, avgWcri: 0
      };
    }

    let totalFGM = 0, totalFGA = 0, totalFTM = 0, totalFTA = 0;
    let threepm = 0, rebounds = 0, assists = 0, steals = 0, blocks = 0, turnovers = 0, points = 0;

    players.forEach(p => {
      totalFGM += p.fgm || 0;
      totalFGA += p.fga || 0;
      totalFTM += p.ftm || 0;
      totalFTA += p.fta || 0;
      threepm += p.threepm || 0;
      rebounds += p.rebounds || 0;
      assists += p.assists || 0;
      steals += p.steals || 0;
      blocks += p.blocks || 0;
      turnovers += p.turnovers || 0;
      points += p.points || 0;
    });

    const fgPct = totalFGA > 0 ? totalFGM / totalFGA : 0;
    const ftPct = totalFTA > 0 ? totalFTM / totalFTA : 0;

    // Calculate wCRI for each player and sum
    const playersWithCri = calculateCRISForAll(players);
    const totalWcri = playersWithCri.reduce((sum, p) => sum + p.wCri, 0);
    const avgWcri = players.length > 0 ? totalWcri / players.length : 0;

    return { fgPct, ftPct, threepm, rebounds, assists, steals, blocks, turnovers, points, totalWcri, avgWcri };
  }, []);

  const sideAStats = useMemo(() => calcSideStats(sideA.players), [calcSideStats, sideA.players]);
  const sideBStats = useMemo(() => calcSideStats(sideB.players), [calcSideStats, sideB.players]);

  // Determine category winners
  const categoryComparisons = useMemo(() => {
    return CATEGORIES.map(cat => {
      const key = cat.key as keyof typeof sideAStats;
      const aVal = sideAStats[key] as number;
      const bVal = sideBStats[key] as number;
      const isLowerBetter = cat.key === 'turnovers';
      
      let winner: 'A' | 'B' | 'tie' = 'tie';
      if (isLowerBetter) {
        if (aVal < bVal) winner = 'A';
        else if (bVal < aVal) winner = 'B';
      } else {
        if (aVal > bVal) winner = 'A';
        else if (bVal > aVal) winner = 'B';
      }
      
      return { ...cat, aVal, bVal, winner };
    });
  }, [sideAStats, sideBStats]);

  const winsA = categoryComparisons.filter(c => c.winner === 'A').length;
  const winsB = categoryComparisons.filter(c => c.winner === 'B').length;
  const ties = categoryComparisons.filter(c => c.winner === 'tie').length;

  const overallWinner = useMemo(() => {
    if (sideA.players.length === 0 || sideB.players.length === 0) return null;
    if (sideAStats.totalWcri > sideBStats.totalWcri) return 'A';
    if (sideBStats.totalWcri > sideAStats.totalWcri) return 'B';
    return 'tie';
  }, [sideA.players.length, sideB.players.length, sideAStats.totalWcri, sideBStats.totalWcri]);

  const formatValue = (val: number, format: string) => {
    if (format === 'pct') return val > 0 ? `.${(val * 1000).toFixed(0).padStart(3, '0')}` : '.000';
    return val.toFixed(1);
  };

  const hasPlayers = sideA.players.length > 0 || sideB.players.length > 0;

  return (
    <div className="space-y-4">
      {/* Selected Players Tray */}
      {selectedPlayers.length > 0 && (
        <Card className="p-3 bg-secondary/20 border-primary/30">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Selected Players ({selectedPlayers.length})
            </h4>
            <Button variant="ghost" size="sm" onClick={onClearSelection} className="h-7 text-xs">
              Clear All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedPlayers.map(player => {
              const inSideA = sideA.players.some(p => p.id === player.id);
              const inSideB = sideB.players.some(p => p.id === player.id);
              const assigned = inSideA || inSideB;
              
              return (
                <div
                  key={player.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, player)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg border cursor-grab active:cursor-grabbing transition-all",
                    assigned 
                      ? inSideA 
                        ? "bg-blue-500/20 border-blue-500/50" 
                        : "bg-orange-500/20 border-orange-500/50"
                      : "bg-muted/50 border-border hover:border-primary/50"
                  )}
                >
                  <PlayerPhoto name={player.name} size="xs" />
                  <span className="text-xs font-medium">{player.name.split(' ').pop()}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">{player.nbaTeam}</Badge>
                  {assigned && (
                    <Badge variant="secondary" className={cn("text-[9px] px-1 py-0", inSideA ? "bg-blue-500/30" : "bg-orange-500/30")}>
                      {inSideA ? 'A' : 'B'}
                    </Badge>
                  )}
                  <div className="flex gap-0.5 ml-1">
                    <button
                      onClick={() => addToSide(player, 'A')}
                      className="p-0.5 rounded hover:bg-blue-500/20 transition-colors"
                      title="Add to Side A"
                    >
                      <Plus className="w-3 h-3 text-blue-400" />
                    </button>
                    <button
                      onClick={() => addToSide(player, 'B')}
                      className="p-0.5 rounded hover:bg-orange-500/20 transition-colors"
                      title="Add to Side B"
                    >
                      <Plus className="w-3 h-3 text-orange-400" />
                    </button>
                    <button
                      onClick={() => onRemoveFromSelection(player.id)}
                      className="p-0.5 rounded hover:bg-destructive/20 transition-colors"
                      title="Remove from selection"
                    >
                      <X className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Trade Sides Comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Side A */}
        <Card 
          className={cn(
            "p-4 transition-all border-2",
            draggedPlayer ? "border-blue-500/50 bg-blue-500/5" : "border-border"
          )}
          onDragOver={handleDragOver}
          onDrop={handleDropOnSide('A')}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-blue-400 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold">A</div>
              Side A
              {overallWinner === 'A' && <Trophy className="w-4 h-4 text-yellow-500" />}
            </h4>
            {teamImpactMode && (
              <Select value={selectedTeamA} onValueChange={setSelectedTeamA}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {leagueTeams.map((team, idx) => (
                    <SelectItem key={team.name + idx} value={team.name}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          
          {sideA.players.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm border-2 border-dashed border-blue-500/30 rounded-lg">
              Drag players here or click <Plus className="w-3 h-3 inline text-blue-400" /> on a player
            </div>
          ) : (
            <div className="space-y-2">
              {sideA.players.map(player => (
                <div key={player.id} className="flex items-center justify-between p-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <div className="flex items-center gap-2">
                    <PlayerPhoto name={player.name} size="sm" />
                    <div>
                      <p className="text-sm font-medium">{player.name}</p>
                      <p className="text-xs text-muted-foreground">{player.nbaTeam} • {player.positions.join('/')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      wCRI: {((player as any).wCri || 0).toFixed(1)}
                    </Badge>
                    <button
                      onClick={() => removeFromSide(player.id, 'A')}
                      className="p-1 rounded hover:bg-destructive/20 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-blue-500/30">
                <p className="text-xs text-muted-foreground">Total wCRI: <span className="font-bold text-blue-400">{sideAStats.totalWcri.toFixed(1)}</span></p>
              </div>
            </div>
          )}
        </Card>

        {/* Side B */}
        <Card 
          className={cn(
            "p-4 transition-all border-2",
            draggedPlayer ? "border-orange-500/50 bg-orange-500/5" : "border-border"
          )}
          onDragOver={handleDragOver}
          onDrop={handleDropOnSide('B')}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-orange-400 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold">B</div>
              Side B
              {overallWinner === 'B' && <Trophy className="w-4 h-4 text-yellow-500" />}
            </h4>
            {teamImpactMode && (
              <Select value={selectedTeamB} onValueChange={setSelectedTeamB}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {leagueTeams.map((team, idx) => (
                    <SelectItem key={team.name + idx} value={team.name}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          
          {sideB.players.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm border-2 border-dashed border-orange-500/30 rounded-lg">
              Drag players here or click <Plus className="w-3 h-3 inline text-orange-400" /> on a player
            </div>
          ) : (
            <div className="space-y-2">
              {sideB.players.map(player => (
                <div key={player.id} className="flex items-center justify-between p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <div className="flex items-center gap-2">
                    <PlayerPhoto name={player.name} size="sm" />
                    <div>
                      <p className="text-sm font-medium">{player.name}</p>
                      <p className="text-xs text-muted-foreground">{player.nbaTeam} • {player.positions.join('/')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      wCRI: {((player as any).wCri || 0).toFixed(1)}
                    </Badge>
                    <button
                      onClick={() => removeFromSide(player.id, 'B')}
                      className="p-1 rounded hover:bg-destructive/20 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-orange-500/30">
                <p className="text-xs text-muted-foreground">Total wCRI: <span className="font-bold text-orange-400">{sideBStats.totalWcri.toFixed(1)}</span></p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Comparison Results */}
      {hasPlayers && (
        <Card className="p-4 bg-secondary/10">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              Package Comparison
            </h4>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="team-impact"
                  checked={teamImpactMode}
                  onCheckedChange={setTeamImpactMode}
                  disabled={leagueTeams.length === 0}
                />
                <Label htmlFor="team-impact" className="text-xs">Team Impact</Label>
              </div>
              <Button variant="outline" size="sm" onClick={handleReset} className="h-7 gap-1">
                <RotateCcw className="w-3 h-3" />
                Reset
              </Button>
            </div>
          </div>

          {/* Overall Winner */}
          {overallWinner && (
            <div className={cn(
              "mb-4 p-3 rounded-lg text-center",
              overallWinner === 'A' ? "bg-blue-500/20 border border-blue-500/50" :
              overallWinner === 'B' ? "bg-orange-500/20 border border-orange-500/50" :
              "bg-muted/30 border border-border"
            )}>
              <p className="text-sm font-medium">
                {overallWinner === 'tie' ? (
                  "Even Trade (by wCRI)"
                ) : (
                  <>
                    <span className={overallWinner === 'A' ? "text-blue-400" : "text-orange-400"}>
                      Side {overallWinner}
                    </span> wins by wCRI ({Math.abs(sideAStats.totalWcri - sideBStats.totalWcri).toFixed(1)} difference)
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Categories: Side A wins {winsA}, Side B wins {winsB}{ties > 0 ? `, ${ties} tied` : ''}
              </p>
            </div>
          )}

          {/* Category Bars */}
          <div className="space-y-2">
            {categoryComparisons.map(cat => {
              const total = cat.aVal + cat.bVal;
              const aPct = total > 0 ? (cat.aVal / total) * 100 : 50;
              const bPct = total > 0 ? (cat.bVal / total) * 100 : 50;
              
              return (
                <div key={cat.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-medium", cat.winner === 'A' ? "text-blue-400" : "text-muted-foreground")}>
                      {formatValue(cat.aVal, cat.format)}
                    </span>
                    <span className="font-semibold">{cat.label}</span>
                    <span className={cn("font-medium", cat.winner === 'B' ? "text-orange-400" : "text-muted-foreground")}>
                      {formatValue(cat.bVal, cat.format)}
                    </span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-muted/30">
                    <div 
                      className={cn(
                        "transition-all",
                        cat.winner === 'A' ? "bg-blue-500" : "bg-blue-500/40"
                      )}
                      style={{ width: `${aPct}%` }}
                    />
                    <div 
                      className={cn(
                        "transition-all",
                        cat.winner === 'B' ? "bg-orange-500" : "bg-orange-500/40"
                      )}
                      style={{ width: `${bPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Team Impact Mode Info */}
          {teamImpactMode && leagueTeams.length === 0 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center">
              <p className="text-xs text-amber-400">
                Import league standings to enable Team Impact mode
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
