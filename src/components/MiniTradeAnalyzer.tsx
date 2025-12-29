import { useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { CATEGORIES } from "@/lib/crisUtils";
import { cn } from "@/lib/utils";
import { X, RotateCcw, Scale, Trophy, HelpCircle, CheckCircle, Circle, ArrowRight } from "lucide-react";

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

// Stepper component
const Stepper = ({ currentStep }: { currentStep: number }) => {
  const steps = [
    { num: 1, label: "Pick players" },
    { num: 2, label: "Assign sides" },
    { num: 3, label: "Review impact" },
  ];
  
  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      {steps.map((step, idx) => (
        <div key={step.num} className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all",
            currentStep >= step.num 
              ? "bg-primary/20 text-primary" 
              : "bg-muted/30 text-muted-foreground"
          )}>
            {currentStep > step.num ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <Circle className={cn("w-3.5 h-3.5", currentStep === step.num && "fill-primary")} />
            )}
            <span>{step.label}</span>
          </div>
          {idx < steps.length - 1 && (
            <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
          )}
        </div>
      ))}
    </div>
  );
};

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
  const [showHelp, setShowHelp] = useState(false);

  // Drag state
  const [draggedPlayer, setDraggedPlayer] = useState<Player | null>(null);

  // Calculate current step
  const currentStep = useMemo(() => {
    if (sideA.players.length > 0 && sideB.players.length > 0) return 3;
    if (sideA.players.length > 0 || sideB.players.length > 0 || selectedPlayers.length > 0) return 2;
    return 1;
  }, [sideA.players.length, sideB.players.length, selectedPlayers.length]);

  // Get unassigned players (selected but not in A or B)
  const unassignedPlayers = useMemo(() => {
    return selectedPlayers.filter(p => 
      !sideA.players.some(sp => sp.id === p.id) && 
      !sideB.players.some(sp => sp.id === p.id)
    );
  }, [selectedPlayers, sideA.players, sideB.players]);

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

  // Calculate aggregated stats for a side - also track attempts for FG%/FT%
  const calcSideStats = useMemo(() => (players: Player[]) => {
    if (players.length === 0) {
      return {
        fgPct: null, ftPct: null, threepm: 0, rebounds: 0, assists: 0,
        steals: 0, blocks: 0, turnovers: 0, points: 0,
        fgAttempts: 0, ftAttempts: 0, fgMade: 0, ftMade: 0
      };
    }

    let totalFGM = 0, totalFGA = 0, totalFTM = 0, totalFTA = 0;
    let threepm = 0, rebounds = 0, assists = 0, steals = 0, blocks = 0, turnovers = 0, points = 0;

    players.forEach(p => {
      // Use raw made/attempts if available, otherwise estimate from percentage
      const fgm = p.fgm ?? (p.fgPct && p.fga ? p.fgPct * p.fga : 0);
      const fga = p.fga ?? 0;
      const ftm = p.ftm ?? (p.ftPct && p.fta ? p.ftPct * p.fta : 0);
      const fta = p.fta ?? 0;
      
      totalFGM += fgm;
      totalFGA += fga;
      totalFTM += ftm;
      totalFTA += fta;
      threepm += p.threepm || 0;
      rebounds += p.rebounds || 0;
      assists += p.assists || 0;
      steals += p.steals || 0;
      blocks += p.blocks || 0;
      turnovers += p.turnovers || 0;
      points += p.points || 0;
    });

    // Always calculate percentage if we have any attempts (no threshold)
    const fgPct = totalFGA > 0 ? totalFGM / totalFGA : null;
    const ftPct = totalFTA > 0 ? totalFTM / totalFTA : null;

    return { 
      fgPct, ftPct, threepm, rebounds, assists, steals, blocks, turnovers, points,
      fgAttempts: totalFGA, ftAttempts: totalFTA, fgMade: totalFGM, ftMade: totalFTM
    };
  }, []);

  const sideAStats = useMemo(() => calcSideStats(sideA.players), [calcSideStats, sideA.players]);
  const sideBStats = useMemo(() => calcSideStats(sideB.players), [calcSideStats, sideB.players]);

  // Determine category winners with deltas
  const categoryComparisons = useMemo(() => {
    return CATEGORIES.map(cat => {
      const key = cat.key as keyof typeof sideAStats;
      const aVal = sideAStats[key] as number | null;
      const bVal = sideBStats[key] as number | null;
      const isLowerBetter = cat.key === 'turnovers';
      
      // Handle null values for percentages
      const aNum = aVal ?? 0;
      const bNum = bVal ?? 0;
      const aIsValid = aVal !== null;
      const bIsValid = bVal !== null;
      
      let winner: 'A' | 'B' | 'tie' = 'tie';
      let delta = 0;
      
      // Only compare if BOTH sides have valid data; otherwise treat as neutral tie
      if (aIsValid && bIsValid) {
        delta = aNum - bNum;
        if (isLowerBetter) {
          if (aNum < bNum) winner = 'A';
          else if (bNum < aNum) winner = 'B';
        } else {
          if (aNum > bNum) winner = 'A';
          else if (bNum > aNum) winner = 'B';
        }
      }
      // If either side lacks data (FG%/FT% with no attempts), it's a tie (neutral)
      
      // Determine if it's a "close" category (delta within 10% of average)
      const avg = (Math.abs(aNum) + Math.abs(bNum)) / 2;
      const isClose = avg > 0 && Math.abs(delta) / avg < 0.15;
      
      return { ...cat, aVal: aNum, bVal: bNum, aIsValid, bIsValid, winner, delta, isClose };
    });
  }, [sideAStats, sideBStats]);

  const winsA = categoryComparisons.filter(c => c.winner === 'A').length;
  const winsB = categoryComparisons.filter(c => c.winner === 'B').length;
  const ties = categoryComparisons.filter(c => c.winner === 'tie').length;

  const overallWinner = useMemo(() => {
    if (sideA.players.length === 0 || sideB.players.length === 0) return null;
    if (winsA > winsB) return 'A';
    if (winsB > winsA) return 'B';
    return 'tie';
  }, [sideA.players.length, sideB.players.length, winsA, winsB]);

  // Get close/coin-flip categories and big swings
  const closeCats = categoryComparisons.filter(c => c.isClose && c.winner !== 'tie').map(c => c.label);
  const bigSwings = categoryComparisons
    .filter(c => !c.isClose && c.winner !== 'tie')
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2)
    .map(c => ({
      label: c.label,
      delta: c.format === 'pct' 
        ? ((c.aVal - c.bVal) * 100).toFixed(1) + '%'
        : (c.aVal - c.bVal).toFixed(1),
      favors: c.winner
    }));

  const formatValue = (val: number | null, format: string, isValid?: boolean) => {
    if (val === null || isValid === false) return '—';
    if (format === 'pct') {
      // Display as percentage (e.g., 47.4%)
      return val > 0 ? `${(val * 100).toFixed(1)}%` : '0.0%';
    }
    return val.toFixed(1);
  };

  const formatPctWithAttempts = (val: number | null, made: number, attempts: number) => {
    if (attempts === 0) return '—';
    const pctStr = val !== null && val > 0 ? `${(val * 100).toFixed(1)}%` : '0.0%';
    return `${pctStr} (${Math.round(made)}/${Math.round(attempts)})`;
  };

  const hasPlayers = sideA.players.length > 0 || sideB.players.length > 0;
  const hasComparison = sideA.players.length > 0 && sideB.players.length > 0;

  return (
    <Card className="gradient-card border-primary/30 p-4">
      {/* Stepper */}
      <Stepper currentStep={currentStep} />
      
      {/* 2-Panel Layout */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* LEFT PANEL: Selection & Assignment */}
        <div className="space-y-4">
          {/* Unassigned Players Bucket */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-muted-foreground">
                Unassigned ({unassignedPlayers.length})
              </h4>
              {(selectedPlayers.length > 0 || hasPlayers) && (
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-6 text-xs gap-1">
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </Button>
              )}
            </div>
            
            {unassignedPlayers.length === 0 && selectedPlayers.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground border border-dashed border-muted-foreground/30 rounded-lg">
                Select players from the table below to start
              </div>
            ) : unassignedPlayers.length === 0 ? (
              <div className="p-2 text-center text-xs text-muted-foreground/60">
                All selected players assigned
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {unassignedPlayers.map(player => (
                  <div
                    key={player.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, player)}
                    onDragEnd={handleDragEnd}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border border-border cursor-grab active:cursor-grabbing text-xs"
                  >
                    <span className="font-medium truncate max-w-[80px]">{player.name.split(' ').pop()}</span>
                    <div className="flex gap-0.5">
                      <button
                        onClick={() => addToSide(player, 'A')}
                        className="px-1.5 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 font-bold text-[10px]"
                      >
                        A
                      </button>
                      <button
                        onClick={() => addToSide(player, 'B')}
                        className="px-1.5 py-0.5 rounded bg-orange-500/20 hover:bg-orange-500/40 text-orange-400 font-bold text-[10px]"
                      >
                        B
                      </button>
                      <button
                        onClick={() => onRemoveFromSelection(player.id)}
                        className="px-1 py-0.5 rounded hover:bg-destructive/20 text-muted-foreground"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Side A & B - Stacked Compact */}
          <div className="space-y-3">
            {/* Side A */}
            <div 
              className={cn(
                "p-3 rounded-lg border-2 transition-all",
                draggedPlayer ? "border-blue-500/50 bg-blue-500/5" : "border-blue-500/20 bg-blue-500/5"
              )}
              onDragOver={handleDragOver}
              onDrop={handleDropOnSide('A')}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-400">A</div>
                <span className="text-xs font-semibold text-blue-400">Side A</span>
                {overallWinner === 'A' && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
                {teamImpactMode && (
                  <Select value={selectedTeamA} onValueChange={setSelectedTeamA}>
                    <SelectTrigger className="w-[100px] h-6 text-[10px] ml-auto">
                      <SelectValue placeholder="Team" />
                    </SelectTrigger>
                    <SelectContent>
                      {leagueTeams.map((team, idx) => (
                        <SelectItem key={team.name + idx} value={team.name} className="text-xs">{team.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              {sideA.players.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground text-xs border border-dashed border-blue-500/30 rounded-md">
                  Drag here or click A on a player
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {sideA.players.map(player => (
                    <div key={player.id} className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/20 border border-blue-500/40 text-xs">
                      <span className="font-medium">{player.name.split(' ').pop()}</span>
                      <span className="text-[10px] text-blue-300">{player.positions[0]}</span>
                      <button
                        onClick={() => removeFromSide(player.id, 'A')}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Side B */}
            <div 
              className={cn(
                "p-3 rounded-lg border-2 transition-all",
                draggedPlayer ? "border-orange-500/50 bg-orange-500/5" : "border-orange-500/20 bg-orange-500/5"
              )}
              onDragOver={handleDragOver}
              onDrop={handleDropOnSide('B')}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-orange-500/30 flex items-center justify-center text-[10px] font-bold text-orange-400">B</div>
                <span className="text-xs font-semibold text-orange-400">Side B</span>
                {overallWinner === 'B' && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
                {teamImpactMode && (
                  <Select value={selectedTeamB} onValueChange={setSelectedTeamB}>
                    <SelectTrigger className="w-[100px] h-6 text-[10px] ml-auto">
                      <SelectValue placeholder="Team" />
                    </SelectTrigger>
                    <SelectContent>
                      {leagueTeams.map((team, idx) => (
                        <SelectItem key={team.name + idx} value={team.name} className="text-xs">{team.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              {sideB.players.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground text-xs border border-dashed border-orange-500/30 rounded-md">
                  Drag here or click B on a player
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {sideB.players.map(player => (
                    <div key={player.id} className="flex items-center gap-1 px-2 py-1 rounded-md bg-orange-500/20 border border-orange-500/40 text-xs">
                      <span className="font-medium">{player.name.split(' ').pop()}</span>
                      <span className="text-[10px] text-orange-300">{player.positions[0]}</span>
                      <button
                        onClick={() => removeFromSide(player.id, 'B')}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Team Impact Toggle */}
          <div className="flex items-center gap-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Switch
                id="team-impact"
                checked={teamImpactMode}
                onCheckedChange={setTeamImpactMode}
                disabled={leagueTeams.length === 0}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="team-impact" className="text-xs cursor-pointer flex items-center gap-1">
                      Apply to team totals
                      <HelpCircle className="w-3 h-3 text-muted-foreground" />
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-xs">
                    Compares (Team + Side A) vs (Team + Side B) instead of just the packages
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {teamImpactMode && leagueTeams.length === 0 && (
              <span className="text-[10px] text-amber-400">Import standings first</span>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Results */}
        <div className="space-y-3">
          {/* Header with Help Toggle */}
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              {teamImpactMode && selectedTeamA ? `Team Impact (${selectedTeamA})` : 'Comparison'}
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHelp(!showHelp)}
              className="h-6 text-[10px] gap-1"
            >
              <HelpCircle className="w-3 h-3" />
              {showHelp ? 'Hide' : 'What is this?'}
            </Button>
          </div>

          {/* Help Explanation */}
          {showHelp && (
            <div className="p-2 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground">
              Bars show each side's projected category totals. Winner per category determines the W-L-T score.
            </div>
          )}

          {!hasComparison ? (
            <div className="flex items-center justify-center h-[200px] text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
              <div>
                <Scale className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Add players to both sides to compare</p>
              </div>
            </div>
          ) : (
            <>
              {/* Overall Winner Summary */}
              <div className={cn(
                "p-3 rounded-lg text-center",
                overallWinner === 'A' ? "bg-blue-500/20 border border-blue-500/50" :
                overallWinner === 'B' ? "bg-orange-500/20 border border-orange-500/50" :
                "bg-muted/30 border border-border"
              )}>
                <p className="text-xl font-bold">
                  <span className="text-blue-400">{winsA}</span>
                  <span className="text-muted-foreground mx-1">–</span>
                  <span className="text-orange-400">{winsB}</span>
                  <span className="text-muted-foreground mx-1">–</span>
                  <span className="text-muted-foreground">{ties}</span>
                </p>
                <p className="text-sm font-medium mt-0.5">
                  {overallWinner === 'tie' 
                    ? "Even Trade" 
                    : `Side ${overallWinner} is favored ${winsA}-${winsB}-${ties}`
                  }
                  <span className="text-muted-foreground text-xs ml-1">(W-L-T)</span>
                </p>
                
                {/* Insights */}
                <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  {closeCats.length > 0 && (
                    <p>Coin flips: {closeCats.join(', ')}</p>
                  )}
                  {bigSwings.length > 0 && (
                    <p>
                      Big swings: {bigSwings.map(s => 
                        `${s.label} (${s.favors === 'A' ? '+' : ''}${s.delta})`
                      ).join(', ')}
                    </p>
                  )}
                </div>
              </div>

              {/* Category Breakdown with W/L/T badges */}
              <div className="space-y-1.5">
                {categoryComparisons.map(cat => {
                  const total = (cat.aVal || 0) + (cat.bVal || 0);
                  const aPct = total > 0 ? ((cat.aVal || 0) / total) * 100 : 50;
                  
                  // Format values - use correct made/attempts for each percentage
                  let aDisplay: string;
                  let bDisplay: string;
                  
                  if (cat.key === 'fgPct') {
                    aDisplay = formatPctWithAttempts(cat.aIsValid ? cat.aVal : null, sideAStats.fgMade, sideAStats.fgAttempts);
                    bDisplay = formatPctWithAttempts(cat.bIsValid ? cat.bVal : null, sideBStats.fgMade, sideBStats.fgAttempts);
                  } else if (cat.key === 'ftPct') {
                    aDisplay = formatPctWithAttempts(cat.aIsValid ? cat.aVal : null, sideAStats.ftMade, sideAStats.ftAttempts);
                    bDisplay = formatPctWithAttempts(cat.bIsValid ? cat.bVal : null, sideBStats.ftMade, sideBStats.ftAttempts);
                  } else {
                    aDisplay = formatValue(cat.aVal, cat.format);
                    bDisplay = formatValue(cat.bVal, cat.format);
                  }
                  
                  return (
                    <div key={cat.key} className="flex items-center gap-2 text-xs">
                      {/* Side A value */}
                      <span className={cn(
                        "w-16 text-right font-mono",
                        cat.winner === 'A' ? "text-blue-400 font-semibold" : "text-muted-foreground"
                      )}>
                        {aDisplay}
                      </span>
                      
                      {/* Bar */}
                      <div className="flex-1 flex h-4 rounded-full overflow-hidden bg-muted/30">
                        <div 
                          className={cn(
                            "transition-all flex items-center justify-end pr-1",
                            cat.winner === 'A' ? "bg-blue-500" : "bg-blue-500/30"
                          )}
                          style={{ width: `${aPct}%` }}
                        />
                        <div 
                          className={cn(
                            "transition-all flex items-center justify-start pl-1",
                            cat.winner === 'B' ? "bg-orange-500" : "bg-orange-500/30"
                          )}
                          style={{ width: `${100 - aPct}%` }}
                        />
                      </div>
                      
                      {/* Side B value */}
                      <span className={cn(
                        "w-16 font-mono",
                        cat.winner === 'B' ? "text-orange-400 font-semibold" : "text-muted-foreground"
                      )}>
                        {bDisplay}
                      </span>
                      
                      {/* Category label with W/L/T badge */}
                      <div className="w-12 flex items-center gap-1">
                        <span className="font-medium">{cat.label}</span>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "h-4 px-1 text-[9px] font-bold",
                            cat.winner === 'A' && "border-blue-500/50 text-blue-400",
                            cat.winner === 'B' && "border-orange-500/50 text-orange-400",
                            cat.winner === 'tie' && "border-muted-foreground/50 text-muted-foreground"
                          )}
                        >
                          {cat.winner === 'A' ? 'A' : cat.winner === 'B' ? 'B' : 'T'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};
