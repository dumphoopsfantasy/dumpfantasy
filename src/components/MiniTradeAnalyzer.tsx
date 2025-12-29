import { useState, useMemo, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { Player } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { CATEGORIES, CRIS_WEIGHTS } from "@/lib/crisUtils";
import { cn } from "@/lib/utils";
import { X, RotateCcw, Scale, Trophy, HelpCircle, CheckCircle, Circle, ArrowRight, AlertTriangle, Info } from "lucide-react";

// Winner mode types
type WinnerMode = 'categories' | 'cri' | 'wcri';

interface MiniTradeAnalyzerProps {
  selectedPlayers: Player[];
  onRemoveFromSelection: (playerId: string) => void;
  onClearSelection: () => void;
  leagueTeams: LeagueTeam[];
  currentRoster: Player[];
  customWeights?: typeof CRIS_WEIGHTS;
}

interface TradeSide {
  players: Player[];
}

interface CategoryComparison {
  key: string;
  label: string;
  format: string;
  aVal: number;
  bVal: number;
  aIsValid: boolean;
  bIsValid: boolean;
  winner: 'A' | 'B' | 'tie';
  delta: number;
  isClose: boolean;
  // For percentages
  aAttempts?: number;
  bAttempts?: number;
  aMade?: number;
  bMade?: number;
}

interface TradeResults {
  categoryWins: { A: number; B: number; T: number };
  perCategory: CategoryComparison[];
  valueCRI: { A: number; B: number; delta: number; winner: 'A' | 'B' | 'tie' };
  valueWCRI: { A: number; B: number; delta: number; winner: 'A' | 'B' | 'tie' };
  categoryWinner: 'A' | 'B' | 'tie';
  criWinner: 'A' | 'B' | 'tie';
  wcriWinner: 'A' | 'B' | 'tie';
  hasMismatch: boolean;
  mismatchExplanation: {
    reason: string;
    categoryWinsList: { side: 'A' | 'B'; cats: string[] };
    bigMarginWins: { cat: string; side: 'A' | 'B'; delta: string }[];
  } | null;
  categoryConfidence: { level: 'low' | 'medium' | 'high'; pct: number };
  valueConfidence: { level: 'low' | 'medium' | 'high'; pct: number; mode: 'cri' | 'wcri' };
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

// Winner Mode Toggle
const WinnerModeToggle = ({ 
  mode, 
  onChange 
}: { 
  mode: WinnerMode; 
  onChange: (mode: WinnerMode) => void;
}) => {
  const modes: { value: WinnerMode; label: string; tooltip: string }[] = [
    { value: 'categories', label: 'Categories (H2H)', tooltip: 'Winner based on who wins more categories (ESPN default)' },
    { value: 'cri', label: 'Value (CRI)', tooltip: 'Winner based on Combined Rating Index total' },
    { value: 'wcri', label: 'Value (wCRI)', tooltip: 'Winner based on Weighted CRI using your category weights' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/30 border border-border">
      {modes.map(m => (
        <TooltipProvider key={m.value}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onChange(m.value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  mode === m.value 
                    ? "bg-primary text-primary-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {m.label}
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-[200px]">{m.tooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
  customWeights,
}: MiniTradeAnalyzerProps) => {
  const [sideA, setSideA] = useState<TradeSide>({ players: [] });
  const [sideB, setSideB] = useState<TradeSide>({ players: [] });
  const [teamImpactMode, setTeamImpactMode] = useState(false);
  const [selectedTeamA, setSelectedTeamA] = useState<string>("");
  const [selectedTeamB, setSelectedTeamB] = useState<string>("");
  const [showHelp, setShowHelp] = useState(false);
  
  // Winner mode with localStorage persistence
  const [winnerMode, setWinnerMode] = useState<WinnerMode>(() => {
    try {
      const stored = localStorage.getItem('dumphoops-trade-winner-mode');
      if (stored && ['categories', 'cri', 'wcri'].includes(stored)) {
        return stored as WinnerMode;
      }
    } catch {}
    return 'categories';
  });
  
  // Use league weights checkbox (only show if weights exist)
  const [useLeagueWeights, setUseLeagueWeights] = useState(true);
  const hasCustomWeights = Boolean(customWeights);

  // Persist winner mode
  useEffect(() => {
    try {
      localStorage.setItem('dumphoops-trade-winner-mode', winnerMode);
    } catch {}
  }, [winnerMode]);

  // Drag state
  const [draggedPlayer, setDraggedPlayer] = useState<Player | null>(null);

  // Calculate current step
  const currentStep = useMemo(() => {
    if (sideA.players.length > 0 && sideB.players.length > 0) return 3;
    if (sideA.players.length > 0 || sideB.players.length > 0 || selectedPlayers.length > 0) return 2;
    return 1;
  }, [sideA.players.length, sideB.players.length, selectedPlayers.length]);

  // Get unassigned players
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
    
    otherSetSide(prev => ({
      players: prev.players.filter(p => p.id !== draggedPlayer.id)
    }));
    
    setSide(prev => {
      if (prev.players.some(p => p.id === draggedPlayer.id)) return prev;
      return { players: [...prev.players, draggedPlayer] };
    });
    
    setDraggedPlayer(null);
  }, [draggedPlayer]);

  const addToSide = useCallback((player: Player, side: "A" | "B") => {
    const setSide = side === "A" ? setSideA : setSideB;
    const otherSetSide = side === "A" ? setSideB : setSideA;
    
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
        fgPct: null, ftPct: null, threepm: 0, rebounds: 0, assists: 0,
        steals: 0, blocks: 0, turnovers: 0, points: 0,
        fgAttempts: 0, ftAttempts: 0, fgMade: 0, ftMade: 0
      };
    }

    let totalFGM = 0, totalFGA = 0, totalFTM = 0, totalFTA = 0;
    let threepm = 0, rebounds = 0, assists = 0, steals = 0, blocks = 0, turnovers = 0, points = 0;

    players.forEach(p => {
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

    const fgPct = totalFGA > 0 ? totalFGM / totalFGA : null;
    const ftPct = totalFTA > 0 ? totalFTM / totalFTA : null;

    return { 
      fgPct, ftPct, threepm, rebounds, assists, steals, blocks, turnovers, points,
      fgAttempts: totalFGA, ftAttempts: totalFTA, fgMade: totalFGM, ftMade: totalFTM
    };
  }, []);

  const sideAStats = useMemo(() => calcSideStats(sideA.players), [calcSideStats, sideA.players]);
  const sideBStats = useMemo(() => calcSideStats(sideB.players), [calcSideStats, sideB.players]);

  // Compute full trade results
  const tradeResults: TradeResults | null = useMemo(() => {
    if (sideA.players.length === 0 || sideB.players.length === 0) return null;

    // Category comparisons
    const perCategory: CategoryComparison[] = CATEGORIES.map(cat => {
      const key = cat.key as keyof typeof sideAStats;
      const aVal = sideAStats[key] as number | null;
      const bVal = sideBStats[key] as number | null;
      const isLowerBetter = cat.key === 'turnovers';
      
      const aNum = aVal ?? 0;
      const bNum = bVal ?? 0;
      const aIsValid = aVal !== null;
      const bIsValid = bVal !== null;
      
      let winner: 'A' | 'B' | 'tie' = 'tie';
      let delta = 0;
      
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
      
      const avg = (Math.abs(aNum) + Math.abs(bNum)) / 2;
      const isClose = avg > 0 && Math.abs(delta) / avg < 0.15;
      
      // Add attempts for percentage categories
      let aAttempts: number | undefined;
      let bAttempts: number | undefined;
      let aMade: number | undefined;
      let bMade: number | undefined;
      
      if (cat.key === 'fgPct') {
        aAttempts = sideAStats.fgAttempts;
        bAttempts = sideBStats.fgAttempts;
        aMade = sideAStats.fgMade;
        bMade = sideBStats.fgMade;
      } else if (cat.key === 'ftPct') {
        aAttempts = sideAStats.ftAttempts;
        bAttempts = sideBStats.ftAttempts;
        aMade = sideAStats.ftMade;
        bMade = sideBStats.ftMade;
      }
      
      return { 
        ...cat, 
        aVal: aNum, 
        bVal: bNum, 
        aIsValid, 
        bIsValid, 
        winner, 
        delta, 
        isClose,
        aAttempts,
        bAttempts,
        aMade,
        bMade
      };
    });

    const winsA = perCategory.filter(c => c.winner === 'A').length;
    const winsB = perCategory.filter(c => c.winner === 'B').length;
    const ties = perCategory.filter(c => c.winner === 'tie').length;
    
    const categoryWinner: 'A' | 'B' | 'tie' = winsA > winsB ? 'A' : winsB > winsA ? 'B' : 'tie';

    // CRI totals
    const sideACRI = sideA.players.reduce((sum, p) => sum + (p.cri || 0), 0);
    const sideBCRI = sideB.players.reduce((sum, p) => sum + (p.cri || 0), 0);
    const criDelta = sideACRI - sideBCRI;
    const criWinner: 'A' | 'B' | 'tie' = criDelta > 0 ? 'A' : criDelta < 0 ? 'B' : 'tie';

    // wCRI totals
    const sideAwCRI = sideA.players.reduce((sum, p) => sum + (p.wCri || 0), 0);
    const sideBwCRI = sideB.players.reduce((sum, p) => sum + (p.wCri || 0), 0);
    const wcriDelta = sideAwCRI - sideBwCRI;
    const wcriWinner: 'A' | 'B' | 'tie' = wcriDelta > 0 ? 'A' : wcriDelta < 0 ? 'B' : 'tie';

    // Check for mismatch
    const hasMismatch = categoryWinner !== 'tie' && criWinner !== 'tie' && categoryWinner !== criWinner;

    // Build mismatch explanation
    let mismatchExplanation: TradeResults['mismatchExplanation'] = null;
    if (hasMismatch) {
      const catWinnerSide = categoryWinner;
      const valueWinnerSide = criWinner;
      
      const catWinsList = perCategory.filter(c => c.winner === catWinnerSide).map(c => c.label);
      
      // Find big margin wins (top 2 by absolute delta)
      const bigMargins = perCategory
        .filter(c => c.winner !== 'tie')
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3)
        .map(c => ({
          cat: c.label,
          side: c.winner as 'A' | 'B',
          delta: c.format === 'pct' 
            ? `${(c.delta * 100).toFixed(1)}%`
            : c.delta > 0 ? `+${c.delta.toFixed(1)}` : c.delta.toFixed(1)
        }));

      mismatchExplanation = {
        reason: `Categories count 1 each. Side ${catWinnerSide} wins more categories${catWinnerSide !== valueWinnerSide ? ` by small margins, while Side ${valueWinnerSide} wins fewer categories by larger margins` : ''}.`,
        categoryWinsList: { side: catWinnerSide, cats: catWinsList },
        bigMarginWins: bigMargins
      };
    }

    // Category confidence: based on coin-flip categories and margin
    const coinFlipCats = perCategory.filter(c => c.isClose && c.winner !== 'tie').length;
    const catMargin = Math.abs(winsA - winsB);
    let categoryConfidencePct: number;
    let categoryConfidenceLevel: 'low' | 'medium' | 'high';
    
    if (catMargin >= 4) {
      categoryConfidencePct = 85 + Math.min(catMargin, 5) * 3;
      categoryConfidenceLevel = 'high';
    } else if (catMargin >= 2) {
      categoryConfidencePct = 65 + catMargin * 5;
      categoryConfidenceLevel = 'medium';
    } else {
      categoryConfidencePct = 50 + coinFlipCats * -3 + catMargin * 10;
      categoryConfidenceLevel = 'low';
    }
    categoryConfidencePct = Math.max(50, Math.min(99, categoryConfidencePct));

    // Value confidence: based on % gap between sides
    const totalCRI = sideACRI + sideBCRI;
    const criGapPct = totalCRI > 0 ? (Math.abs(criDelta) / totalCRI) * 100 : 0;
    let valueConfidencePct: number;
    let valueConfidenceLevel: 'low' | 'medium' | 'high';
    
    if (criGapPct > 8) {
      valueConfidencePct = 80 + Math.min(criGapPct, 20);
      valueConfidenceLevel = 'high';
    } else if (criGapPct > 3) {
      valueConfidencePct = 60 + criGapPct * 2;
      valueConfidenceLevel = 'medium';
    } else {
      valueConfidencePct = 50 + criGapPct * 3;
      valueConfidenceLevel = 'low';
    }
    valueConfidencePct = Math.max(50, Math.min(99, Math.round(valueConfidencePct)));

    return {
      categoryWins: { A: winsA, B: winsB, T: ties },
      perCategory,
      valueCRI: { A: sideACRI, B: sideBCRI, delta: criDelta, winner: criWinner },
      valueWCRI: { A: sideAwCRI, B: sideBwCRI, delta: wcriDelta, winner: wcriWinner },
      categoryWinner,
      criWinner,
      wcriWinner,
      hasMismatch,
      mismatchExplanation,
      categoryConfidence: { level: categoryConfidenceLevel, pct: Math.round(categoryConfidencePct) },
      valueConfidence: { level: valueConfidenceLevel, pct: valueConfidencePct, mode: 'cri' }
    };
  }, [sideA.players, sideB.players, sideAStats, sideBStats]);

  // Get primary winner based on mode
  const getPrimaryWinner = useMemo(() => {
    if (!tradeResults) return null;
    switch (winnerMode) {
      case 'categories': return tradeResults.categoryWinner;
      case 'cri': return tradeResults.criWinner;
      case 'wcri': return tradeResults.wcriWinner;
    }
  }, [tradeResults, winnerMode]);

  const formatValue = (val: number | null, format: string, isValid?: boolean) => {
    if (val === null || isValid === false) return '—';
    if (format === 'pct') {
      return val > 0 ? `${(val * 100).toFixed(1)}%` : '0.0%';
    }
    return val.toFixed(1);
  };

  const formatPctWithAttempts = (val: number | null, made: number | undefined, attempts: number | undefined) => {
    if (!attempts || attempts === 0) return '—';
    const pctStr = val !== null && val > 0 ? `${(val * 100).toFixed(1)}%` : '0.0%';
    return `${pctStr} (${Math.round(made || 0)}/${Math.round(attempts)})`;
  };

  const hasPlayers = sideA.players.length > 0 || sideB.players.length > 0;
  const hasComparison = sideA.players.length > 0 && sideB.players.length > 0;

  const getConfidenceBadgeClass = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'high': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-muted/20 text-muted-foreground border-muted-foreground/50';
    }
  };

  return (
    <Card className="gradient-card border-primary/30 p-4">
      {/* Winner Mode Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Trade Analyzer</h3>
        </div>
        <WinnerModeToggle mode={winnerMode} onChange={setWinnerMode} />
      </div>

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

          {/* Side A & B */}
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
                {getPrimaryWinner === 'A' && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
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
                <div className="space-y-1">
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
                  {tradeResults && (
                    <div className="text-[10px] text-blue-300 mt-1 flex gap-3">
                      <span>CRI: <span className="font-bold">{tradeResults.valueCRI.A.toFixed(1)}</span></span>
                      <span>wCRI: <span className="font-bold">{tradeResults.valueWCRI.A.toFixed(1)}</span></span>
                    </div>
                  )}
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
                {getPrimaryWinner === 'B' && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
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
                <div className="space-y-1">
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
                  {tradeResults && (
                    <div className="text-[10px] text-orange-300 mt-1 flex gap-3">
                      <span>CRI: <span className="font-bold">{tradeResults.valueCRI.B.toFixed(1)}</span></span>
                      <span>wCRI: <span className="font-bold">{tradeResults.valueWCRI.B.toFixed(1)}</span></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
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
              {teamImpactMode && leagueTeams.length === 0 && (
                <span className="text-[10px] text-amber-400">Import standings first</span>
              )}
            </div>
            
            {hasCustomWeights && winnerMode !== 'categories' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="use-weights"
                  checked={useLeagueWeights}
                  onCheckedChange={(checked) => setUseLeagueWeights(!!checked)}
                />
                <Label htmlFor="use-weights" className="text-xs cursor-pointer">
                  Use my league category weights
                </Label>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Results */}
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              Results
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHelp(!showHelp)}
              className="h-6 text-[10px] gap-1"
            >
              <HelpCircle className="w-3 h-3" />
              {showHelp ? 'Hide' : 'Help'}
            </Button>
          </div>

          {showHelp && (
            <div className="p-2 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
              <p><strong>Categories (H2H):</strong> Who wins more of the 9 categories — ESPN default.</p>
              <p><strong>Value (CRI/wCRI):</strong> Total player value based on all-around stats.</p>
              <p>These can disagree when one side wins many close categories vs fewer blowout wins.</p>
            </div>
          )}

          {!hasComparison ? (
            <div className="flex items-center justify-center h-[200px] text-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
              <div>
                <Scale className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Add players to both sides to compare</p>
              </div>
            </div>
          ) : tradeResults && (
            <>
              {/* Primary Result based on mode */}
              <div className={cn(
                "p-3 rounded-lg",
                getPrimaryWinner === 'A' ? "bg-blue-500/20 border border-blue-500/50" :
                getPrimaryWinner === 'B' ? "bg-orange-500/20 border border-orange-500/50" :
                "bg-muted/30 border border-border"
              )}>
                {/* Category Result */}
                <div className="space-y-2">
                  <div className={cn(
                    "flex items-center justify-between",
                    winnerMode === 'categories' ? "text-foreground" : "text-muted-foreground"
                  )}>
                    <span className="text-xs font-medium">Category Result:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">
                        <span className={tradeResults.categoryWinner === 'A' ? "text-blue-400" : ""}>
                          {tradeResults.categoryWins.A}
                        </span>
                        <span className="mx-1">–</span>
                        <span className={tradeResults.categoryWinner === 'B' ? "text-orange-400" : ""}>
                          {tradeResults.categoryWins.B}
                        </span>
                        <span className="mx-1">–</span>
                        <span>{tradeResults.categoryWins.T}</span>
                      </span>
                      {winnerMode === 'categories' && tradeResults.categoryWinner !== 'tie' && (
                        <Badge className={cn(
                          "text-xs",
                          getConfidenceBadgeClass(tradeResults.categoryConfidence.level)
                        )}>
                          {tradeResults.categoryConfidence.pct}%
                        </Badge>
                      )}
                      {tradeResults.categoryWinner !== 'tie' && (
                        <span className={cn(
                          "text-xs",
                          tradeResults.categoryWinner === 'A' ? "text-blue-400" : "text-orange-400"
                        )}>
                          Side {tradeResults.categoryWinner} favored
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Value Result */}
                  <div className={cn(
                    "flex items-center justify-between",
                    winnerMode !== 'categories' ? "text-foreground" : "text-muted-foreground"
                  )}>
                    <span className="text-xs font-medium">Value Result:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">
                        {winnerMode === 'wcri' ? (
                          <>wCRI: {tradeResults.valueWCRI.delta > 0 ? '+' : ''}{tradeResults.valueWCRI.delta.toFixed(1)}</>
                        ) : (
                          <>CRI: {tradeResults.valueCRI.delta > 0 ? '+' : ''}{tradeResults.valueCRI.delta.toFixed(1)}</>
                        )}
                      </span>
                      {winnerMode !== 'categories' && (winnerMode === 'cri' ? tradeResults.criWinner : tradeResults.wcriWinner) !== 'tie' && (
                        <Badge className={cn(
                          "text-xs",
                          getConfidenceBadgeClass(tradeResults.valueConfidence.level)
                        )}>
                          {tradeResults.valueConfidence.pct}%
                        </Badge>
                      )}
                      {(winnerMode === 'cri' ? tradeResults.criWinner : tradeResults.wcriWinner) !== 'tie' && (
                        <span className={cn(
                          "text-xs",
                          (winnerMode === 'cri' ? tradeResults.criWinner : tradeResults.wcriWinner) === 'A' 
                            ? "text-blue-400" 
                            : "text-orange-400"
                        )}>
                          Side {winnerMode === 'cri' ? tradeResults.criWinner : tradeResults.wcriWinner} edge
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Primary Winner Badge */}
                  <div className="pt-2 border-t border-border/50 mt-2">
                    {getPrimaryWinner === 'tie' ? (
                      <div className="text-center text-sm font-medium text-muted-foreground">
                        Even Trade
                      </div>
                    ) : (
                      <div className="text-center">
                        <Badge 
                          variant="outline"
                          className={cn(
                            "text-sm font-bold px-4 py-1",
                            getPrimaryWinner === 'A' 
                              ? "border-blue-500 text-blue-400 bg-blue-500/10" 
                              : "border-orange-500 text-orange-400 bg-orange-500/10"
                          )}
                        >
                          Side {getPrimaryWinner} wins ({winnerMode === 'categories' ? 'H2H' : winnerMode.toUpperCase()})
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Mismatch Explanation */}
              {tradeResults.hasMismatch && tradeResults.mismatchExplanation && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-xs space-y-1.5">
                      <p className="font-medium text-amber-400">Why do Category & Value disagree?</p>
                      <p className="text-muted-foreground">{tradeResults.mismatchExplanation.reason}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <div className="text-muted-foreground">
                          <span className="font-medium">Side {tradeResults.mismatchExplanation.categoryWinsList.side} cat wins:</span>{' '}
                          {tradeResults.mismatchExplanation.categoryWinsList.cats.join(', ')}
                        </div>
                      </div>
                      {tradeResults.mismatchExplanation.bigMarginWins.length > 0 && (
                        <div className="text-muted-foreground">
                          <span className="font-medium">Big margins:</span>{' '}
                          {tradeResults.mismatchExplanation.bigMarginWins.map((w, i) => (
                            <span key={w.cat}>
                              {i > 0 && ', '}
                              <span className={w.side === 'A' ? 'text-blue-400' : 'text-orange-400'}>
                                {w.cat} ({w.delta})
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Category Breakdown */}
              <div className="space-y-1.5">
                {tradeResults.perCategory.map(cat => {
                  const total = (cat.aVal || 0) + (cat.bVal || 0);
                  const aPct = total > 0 ? ((cat.aVal || 0) / total) * 100 : 50;
                  
                  // Format values
                  let aDisplay: string;
                  let bDisplay: string;
                  
                  if (cat.key === 'fgPct') {
                    aDisplay = formatPctWithAttempts(cat.aIsValid ? cat.aVal : null, cat.aMade, cat.aAttempts);
                    bDisplay = formatPctWithAttempts(cat.bIsValid ? cat.bVal : null, cat.bMade, cat.bAttempts);
                  } else if (cat.key === 'ftPct') {
                    aDisplay = formatPctWithAttempts(cat.aIsValid ? cat.aVal : null, cat.aMade, cat.aAttempts);
                    bDisplay = formatPctWithAttempts(cat.bIsValid ? cat.bVal : null, cat.bMade, cat.bAttempts);
                  } else {
                    aDisplay = formatValue(cat.aVal, cat.format);
                    bDisplay = formatValue(cat.bVal, cat.format);
                  }
                  
                  // Format delta for display
                  const deltaDisplay = cat.winner !== 'tie' 
                    ? cat.format === 'pct' 
                      ? `${cat.winner} ${cat.delta > 0 ? '+' : ''}${(cat.delta * 100).toFixed(1)}%`
                      : `${cat.winner} ${cat.delta > 0 ? '+' : ''}${cat.delta.toFixed(1)}`
                    : '';
                  
                  return (
                    <div key={cat.key} className="flex items-center gap-2 text-xs">
                      {/* Side A value */}
                      <span className={cn(
                        "w-20 text-right font-mono text-[11px]",
                        cat.winner === 'A' ? "text-blue-400 font-semibold" : "text-muted-foreground"
                      )}>
                        {aDisplay}
                      </span>
                      
                      {/* Bar */}
                      <div className="flex-1 flex h-4 rounded-full overflow-hidden bg-muted/30">
                        <div 
                          className={cn(
                            "transition-all",
                            cat.winner === 'A' ? "bg-blue-500" : "bg-blue-500/30"
                          )}
                          style={{ width: `${aPct}%` }}
                        />
                        <div 
                          className={cn(
                            "transition-all",
                            cat.winner === 'B' ? "bg-orange-500" : "bg-orange-500/30"
                          )}
                          style={{ width: `${100 - aPct}%` }}
                        />
                      </div>
                      
                      {/* Side B value */}
                      <span className={cn(
                        "w-20 font-mono text-[11px]",
                        cat.winner === 'B' ? "text-orange-400 font-semibold" : "text-muted-foreground"
                      )}>
                        {bDisplay}
                      </span>
                      
                      {/* Category label + delta + winner chip */}
                      <div className="w-24 flex items-center gap-1">
                        <span className="font-medium">{cat.label}</span>
                        {deltaDisplay && (
                          <span className={cn(
                            "text-[9px]",
                            cat.winner === 'A' ? "text-blue-400" : "text-orange-400"
                          )}>
                            ({deltaDisplay})
                          </span>
                        )}
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "h-4 px-1 text-[9px] font-bold ml-auto",
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
