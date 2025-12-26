import { useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { 
  ArrowRight, ArrowLeftRight, Upload, RefreshCw, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, Users, Target, AlertTriangle,
  Check, X, Scale, Zap, Settings2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  parseESPNTeamPage, calcCRI, calcTradeResult, findTargets, validatePlayer,
  PlayerStats, PlayerScores, TradeScenario, TradeResult, ScoreMode, DEFAULT_WEIGHTS
} from "@/lib/tradeUtils";
import { formatPct, CATEGORIES } from "@/lib/crisUtils";
import { usePersistedState } from "@/hooks/usePersistedState";
import { PlayerPhoto } from "@/components/PlayerPhoto";

interface TradeAnalyzerProps {
  freeAgents?: PlayerScores[];
  globalWeights?: typeof DEFAULT_WEIGHTS;
  roster?: Array<{ slot: string; slotType: string; player: any }>;
}

export function TradeAnalyzer({ freeAgents = [], globalWeights, roster = [] }: TradeAnalyzerProps) {
  const { toast } = useToast();
  
  // Score mode toggle
  const [scoreMode, setScoreMode] = usePersistedState<ScoreMode>("trade-score-mode", "wCRI");
  
  // Weights
  const [weights, setWeights] = usePersistedState("trade-weights", globalWeights || DEFAULT_WEIGHTS);
  const [showWeights, setShowWeights] = useState(false);
  
  // Team data
  const [yourTeamRaw, setYourTeamRaw] = useState("");
  const [opponentTeamRaw, setOpponentTeamRaw] = useState("");
  const [yourRoster, setYourRoster] = useState<PlayerScores[]>([]);
  const [opponentRoster, setOpponentRoster] = useState<PlayerScores[]>([]);
  
  // Trade selections
  const [giving, setGiving] = useState<Set<string>>(new Set());
  const [getting, setGetting] = useState<Set<string>>(new Set());
  
  // Trade options
  const [includeReplacement, setIncludeReplacement] = useState(true);
  const [assumeDrops, setAssumeDrops] = useState(true);
  const [selectedReplacements, setSelectedReplacements] = useState<Set<string>>(new Set());
  const [selectedDrops, setSelectedDrops] = useState<Set<string>>(new Set());
  const [replacementSource, setReplacementSource] = useState<'roster' | 'freeagent'>('roster');
  
  // Target finder
  const [targetCategory, setTargetCategory] = useState<string>("");
  const [avoidCategory, setAvoidCategory] = useState<string>("");
  
  // Panels
  const [showTargetFinder, setShowTargetFinder] = useState(false);
  
  // Convert roster to PlayerScores format for "Add My Roster" feature
  const handleAddMyRoster = useCallback(() => {
    if (roster.length === 0) {
      toast({ title: "No roster data", description: "Import your roster in the Roster tab first", variant: "destructive" });
      return;
    }
    
    // Convert roster slots to PlayerStats format
    const playerStats = roster.map(slot => ({
      name: slot.player.name,
      team: slot.player.nbaTeam || '',
      positions: slot.player.positions || [],
      status: slot.player.status,
      minutes: slot.player.minutes || 0,
      fgm: slot.player.fgm || 0,
      fga: slot.player.fga || 0,
      fgPct: slot.player.fgPct || 0,
      ftm: slot.player.ftm || 0,
      fta: slot.player.fta || 0,
      ftPct: slot.player.ftPct || 0,
      threepm: slot.player.threepm || 0,
      rebounds: slot.player.rebounds || 0,
      assists: slot.player.assists || 0,
      steals: slot.player.steals || 0,
      blocks: slot.player.blocks || 0,
      turnovers: slot.player.turnovers || 0,
      points: slot.player.points || 0,
      rostPct: undefined,
    }));
    
    const scored = calcCRI(playerStats);
    setYourRoster(scored);
    toast({ title: `Loaded ${scored.length} players`, description: "Your Team loaded from Roster tab" });
  }, [roster, toast]);
  
  // Parse teams
  const handleParseYourTeam = useCallback(() => {
    try {
      const players = parseESPNTeamPage(yourTeamRaw);
      if (players.length === 0) {
        toast({ title: "No players found", description: "Check your paste format", variant: "destructive" });
        return;
      }
      
      // Validate
      players.forEach(p => {
        const { valid, errors } = validatePlayer(p);
        if (!valid) console.warn(`Player ${p.name} validation:`, errors);
      });
      
      const scored = calcCRI(players);
      setYourRoster(scored);
      toast({ title: `Parsed ${scored.length} players`, description: "Your Team loaded" });
    } catch (e) {
      toast({ title: "Parse error", description: String(e), variant: "destructive" });
    }
  }, [yourTeamRaw, toast]);
  
  const handleParseOpponent = useCallback(() => {
    try {
      const players = parseESPNTeamPage(opponentTeamRaw);
      if (players.length === 0) {
        toast({ title: "No players found", description: "Check your paste format", variant: "destructive" });
        return;
      }
      
      const scored = calcCRI(players);
      setOpponentRoster(scored);
      toast({ title: `Parsed ${scored.length} players`, description: "Opponent Team loaded" });
    } catch (e) {
      toast({ title: "Parse error", description: String(e), variant: "destructive" });
    }
  }, [opponentTeamRaw, toast]);
  
  // Toggle selections
  const toggleGiving = (name: string) => {
    setGiving(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  
  const toggleGetting = (name: string) => {
    setGetting(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  
  const toggleReplacement = (name: string) => {
    setSelectedReplacements(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  
  const toggleDrop = (name: string) => {
    setSelectedDrops(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  
  // Build trade scenario
  const scenario = useMemo((): TradeScenario | null => {
    if (giving.size === 0 || getting.size === 0) return null;
    
    const givingPlayers = yourRoster.filter(p => giving.has(p.name));
    const gettingPlayers = opponentRoster.filter(p => getting.has(p.name));
    
    // Replacements
    let replacements: PlayerScores[] = [];
    if (includeReplacement) {
      if (selectedReplacements.size > 0) {
        if (replacementSource === 'roster') {
          replacements = yourRoster.filter(p => selectedReplacements.has(p.name));
        } else {
          replacements = freeAgents.filter(p => selectedReplacements.has(p.name));
        }
      } else if (replacementSource === 'freeagent' && freeAgents.length > 0) {
        // Auto-pick best FA by score mode
        const sorted = [...freeAgents].sort((a, b) => 
          scoreMode === 'CRI' ? b.cri - a.cri : b.wCri - a.wCri
        );
        const needed = Math.max(0, gettingPlayers.length - givingPlayers.length);
        replacements = sorted.slice(0, needed);
      }
    }
    
    // Drops
    let drops: PlayerScores[] = [];
    if (assumeDrops && gettingPlayers.length > givingPlayers.length) {
      if (selectedDrops.size > 0) {
        drops = yourRoster.filter(p => selectedDrops.has(p.name) && !giving.has(p.name));
      } else {
        // Auto-drop lowest score mode players
        const notTraded = yourRoster.filter(p => !giving.has(p.name));
        const sorted = [...notTraded].sort((a, b) => 
          scoreMode === 'CRI' ? a.cri - b.cri : a.wCri - b.wCri
        );
        const needToDrop = gettingPlayers.length - givingPlayers.length;
        drops = sorted.slice(0, needToDrop);
      }
    }
    
    return {
      giving: givingPlayers,
      getting: gettingPlayers,
      replacements,
      drops,
      includeReplacement,
      assumeDrops,
    };
  }, [giving, getting, yourRoster, opponentRoster, includeReplacement, assumeDrops, selectedReplacements, selectedDrops, replacementSource, freeAgents, scoreMode]);
  
  // Calculate trade result
  const tradeResult = useMemo((): TradeResult | null => {
    if (!scenario) return null;
    return calcTradeResult(scenario, yourRoster, weights, scoreMode);
  }, [scenario, yourRoster, weights, scoreMode]);
  
  // Target finder results
  const targetResults = useMemo(() => {
    if (!targetCategory) return [];
    const candidates = opponentRoster.length > 0 ? opponentRoster : freeAgents;
    return findTargets(candidates, targetCategory, avoidCategory || null, scoreMode, 8);
  }, [targetCategory, avoidCategory, opponentRoster, freeAgents, scoreMode]);
  
  // Clear trade
  const clearTrade = () => {
    setGiving(new Set());
    setGetting(new Set());
    setSelectedReplacements(new Set());
    setSelectedDrops(new Set());
  };
  
  // Helper to get score display
  const getScore = (p: PlayerScores) => scoreMode === 'CRI' ? p.cri : p.wCri;
  const getRank = (p: PlayerScores) => scoreMode === 'CRI' ? p.criRank : p.wCriRank;
  
  // Player row component
  const PlayerRow = ({ 
    player, 
    selected, 
    onToggle, 
    showBothScores = false,
    compact = false 
  }: { 
    player: PlayerScores; 
    selected: boolean; 
    onToggle: () => void;
    showBothScores?: boolean;
    compact?: boolean;
  }) => (
    <div 
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all",
        selected ? "bg-primary/20 border border-primary" : "bg-card/50 border border-border hover:bg-card",
        compact && "py-1"
      )}
      onClick={onToggle}
    >
      <Checkbox checked={selected} className="pointer-events-none" />
      <PlayerPhoto name={player.name} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{player.name}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{player.team}</span>
          <span>{player.positions.join('/')}</span>
          {player.status && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {player.status}
            </Badge>
          )}
        </div>
      </div>
      <div className="text-right">
        {showBothScores ? (
          <div className="flex gap-2 text-xs">
            <div className={cn(scoreMode === 'CRI' && "text-primary font-bold")}>
              <span className="text-muted-foreground">CRI:</span> {player.cri.toFixed(1)}
            </div>
            <div className={cn(scoreMode === 'wCRI' && "text-primary font-bold")}>
              <span className="text-muted-foreground">wCRI:</span> {player.wCri.toFixed(1)}
            </div>
          </div>
        ) : (
          <div className="font-mono text-sm font-bold">
            {getScore(player).toFixed(1)}
          </div>
        )}
        {player.valueGap !== undefined && (
          <div className={cn(
            "text-[10px]",
            player.valueGap > 5 ? "text-stat-positive" : player.valueGap < -5 ? "text-stat-negative" : "text-muted-foreground"
          )}>
            {player.valueGap > 0 ? "Buy Low" : player.valueGap < -5 ? "Sell High" : "Fair"}
          </div>
        )}
      </div>
    </div>
  );
  
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header with Score Mode Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-primary" />
            Trade Analyzer
          </h2>
          <p className="text-sm text-muted-foreground">Import teams, select players, analyze trade impact</p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Score Mode Toggle */}
          <div className="flex items-center gap-2 bg-card/50 rounded-lg p-2 border border-border">
            <span className="text-xs text-muted-foreground font-display">Score Mode:</span>
            <div className="flex">
              <Button
                variant={scoreMode === 'CRI' ? "default" : "outline"}
                size="sm"
                onClick={() => setScoreMode('CRI')}
                className="rounded-r-none font-display text-xs"
              >
                CRI
              </Button>
              <Button
                variant={scoreMode === 'wCRI' ? "default" : "outline"}
                size="sm"
                onClick={() => setScoreMode('wCRI')}
                className="rounded-l-none font-display text-xs"
              >
                wCRI
              </Button>
            </div>
          </div>
          
          {/* Weights Settings */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowWeights(!showWeights)}
            className="font-display"
          >
            <Settings2 className="w-4 h-4 mr-1" />
            Weights
          </Button>
        </div>
      </div>
      
      {/* Weights Panel */}
      {showWeights && (
        <Card className="p-4">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            wCRI Weights
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
            {CATEGORIES.map(cat => (
              <div key={cat.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{cat.label}</Label>
                  <span className="text-xs font-mono">{(weights[cat.key as keyof typeof weights] || 1).toFixed(2)}</span>
                </div>
                <Slider
                  value={[weights[cat.key as keyof typeof weights] || 1]}
                  onValueChange={([v]) => setWeights({ ...weights, [cat.key]: v })}
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-full"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            TO is inverted (lower is better). Higher weight = more important.
          </p>
        </Card>
      )}
      
      {/* Import Panels */}
      {(yourRoster.length === 0 || opponentRoster.length === 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Your Team Import */}
          <Card className="p-4">
            <h3 className="font-display font-semibold mb-2 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Your Team
            </h3>
            {yourRoster.length > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{yourRoster.length} players loaded</span>
                <Button variant="ghost" size="sm" onClick={() => setYourRoster([])}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Reset
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {roster.length > 0 && (
                  <Button onClick={handleAddMyRoster} variant="outline" className="w-full">
                    <Users className="w-4 h-4 mr-2" /> Add My Roster
                  </Button>
                )}
                <div className="relative">
                  {roster.length > 0 && (
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                  )}
                  {roster.length > 0 && (
                    <div className="relative flex justify-center">
                      <span className="bg-card px-2 text-xs text-muted-foreground">or paste ESPN data</span>
                    </div>
                  )}
                </div>
                <Textarea
                  value={yourTeamRaw}
                  onChange={(e) => setYourTeamRaw(e.target.value)}
                  placeholder="Paste your ESPN team page here..."
                  className="min-h-[120px] font-mono text-xs"
                />
                <Button onClick={handleParseYourTeam} className="w-full">
                  <Upload className="w-4 h-4 mr-2" /> Import Your Team
                </Button>
              </div>
            )}
          </Card>
          
          {/* Opponent Team Import */}
          <Card className="p-4">
            <h3 className="font-display font-semibold mb-2 flex items-center gap-2">
              <Users className="w-4 h-4 text-stat-negative" />
              Opponent Team
            </h3>
            {opponentRoster.length > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{opponentRoster.length} players loaded</span>
                <Button variant="ghost" size="sm" onClick={() => setOpponentRoster([])}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Reset
                </Button>
              </div>
            ) : (
              <>
                <Textarea
                  value={opponentTeamRaw}
                  onChange={(e) => setOpponentTeamRaw(e.target.value)}
                  placeholder="Paste opponent's ESPN team page here..."
                  className="min-h-[150px] font-mono text-xs"
                />
                <Button onClick={handleParseOpponent} className="mt-2 w-full">
                  <Upload className="w-4 h-4 mr-2" /> Import Opponent
                </Button>
              </>
            )}
          </Card>
        </div>
      )}
      
      {/* Trade Builder - Only show when both teams loaded */}
      {yourRoster.length > 0 && opponentRoster.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Your Team Panel */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Your Team ({yourRoster.length})
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setYourRoster([])}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="mb-2">
              <Badge variant="outline" className="text-primary">
                You Give: {giving.size}
              </Badge>
            </div>
            
            <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
              {yourRoster
                .sort((a, b) => getScore(b) - getScore(a))
                .map(player => (
                  <PlayerRow
                    key={player.name}
                    player={player}
                    selected={giving.has(player.name)}
                    onToggle={() => toggleGiving(player.name)}
                    showBothScores
                    compact
                  />
                ))}
            </div>
          </Card>
          
          {/* Trade Arrow & Options */}
          <Card className="p-4 flex flex-col">
            <h3 className="font-display font-semibold mb-3 text-center">Trade Builder</h3>
            
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-primary">{giving.size} player{giving.size !== 1 ? 's' : ''}</Badge>
                <ArrowRight className="w-6 h-6" />
                <Badge className="bg-stat-positive">{getting.size} player{getting.size !== 1 ? 's' : ''}</Badge>
              </div>
              
              {scenario && (
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Net players:</div>
                  <div className={cn(
                    "text-lg font-bold",
                    scenario.getting.length > scenario.giving.length && "text-stat-positive",
                    scenario.getting.length < scenario.giving.length && "text-stat-negative"
                  )}>
                    {scenario.getting.length - scenario.giving.length >= 0 ? '+' : ''}{scenario.getting.length - scenario.giving.length}
                  </div>
                </div>
              )}
            </div>
            
            {/* Options */}
            <div className="space-y-3 mt-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Include Replacement</Label>
                <Switch checked={includeReplacement} onCheckedChange={setIncludeReplacement} />
              </div>
              
              {includeReplacement && (
                <div className="pl-4 space-y-2">
                  <Select value={replacementSource} onValueChange={(v: 'roster' | 'freeagent') => setReplacementSource(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="roster">From Roster/Bench</SelectItem>
                      <SelectItem value="freeagent">Best Free Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <Label className="text-xs">Assume Drops</Label>
                <Switch checked={assumeDrops} onCheckedChange={setAssumeDrops} />
              </div>
              
              {assumeDrops && scenario && scenario.drops.length > 0 && (
                <div className="pl-4">
                  <div className="text-xs text-muted-foreground mb-1">
                    Auto-dropping lowest {scoreMode}:
                  </div>
                  {scenario.drops.map(d => (
                    <Badge key={d.name} variant="outline" className="mr-1 text-xs">
                      {d.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearTrade}
              className="mt-4"
              disabled={giving.size === 0 && getting.size === 0}
            >
              <X className="w-4 h-4 mr-1" /> Clear Trade
            </Button>
          </Card>
          
          {/* Opponent Team Panel */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-stat-negative" />
                Opponent ({opponentRoster.length})
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setOpponentRoster([])}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="mb-2">
              <Badge variant="outline" className="text-stat-positive">
                You Get: {getting.size}
              </Badge>
            </div>
            
            <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
              {opponentRoster
                .sort((a, b) => getScore(b) - getScore(a))
                .map(player => (
                  <PlayerRow
                    key={player.name}
                    player={player}
                    selected={getting.has(player.name)}
                    onToggle={() => toggleGetting(player.name)}
                    showBothScores
                    compact
                  />
                ))}
            </div>
          </Card>
        </div>
      )}
      
      {/* Trade Results */}
      {tradeResult && (
        <Card className="p-4">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Trade Analysis
          </h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: Scores & Fairness */}
            <div className="space-y-4">
              {/* Net Score Change */}
              <div className="flex items-center gap-4">
                <div className="flex-1 p-3 rounded-lg bg-card border">
                  <div className="text-xs text-muted-foreground mb-1">Trade-Only Impact</div>
                  <div className="flex gap-4">
                    <div className={cn(scoreMode === 'CRI' && "text-primary")}>
                      <span className="text-xs">ΔCRI:</span>
                      <span className={cn(
                        "ml-1 font-bold",
                        tradeResult.tradeOnly.deltaCRI > 0 && "text-stat-positive",
                        tradeResult.tradeOnly.deltaCRI < 0 && "text-stat-negative"
                      )}>
                        {tradeResult.tradeOnly.deltaCRI >= 0 ? '+' : ''}{tradeResult.tradeOnly.deltaCRI.toFixed(1)}
                      </span>
                    </div>
                    <div className={cn(scoreMode === 'wCRI' && "text-primary")}>
                      <span className="text-xs">ΔwCRI:</span>
                      <span className={cn(
                        "ml-1 font-bold",
                        tradeResult.tradeOnly.deltaWCRI > 0 && "text-stat-positive",
                        tradeResult.tradeOnly.deltaWCRI < 0 && "text-stat-negative"
                      )}>
                        {tradeResult.tradeOnly.deltaWCRI >= 0 ? '+' : ''}{tradeResult.tradeOnly.deltaWCRI.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 p-3 rounded-lg bg-primary/10 border border-primary">
                  <div className="text-xs text-muted-foreground mb-1">Real Impact</div>
                  <div className="flex gap-4">
                    <div className={cn(scoreMode === 'CRI' && "text-primary font-bold")}>
                      <span className="text-xs">ΔCRI:</span>
                      <span className={cn(
                        "ml-1 font-bold",
                        tradeResult.realImpact.deltaCRI > 0 && "text-stat-positive",
                        tradeResult.realImpact.deltaCRI < 0 && "text-stat-negative"
                      )}>
                        {tradeResult.realImpact.deltaCRI >= 0 ? '+' : ''}{tradeResult.realImpact.deltaCRI.toFixed(1)}
                      </span>
                    </div>
                    <div className={cn(scoreMode === 'wCRI' && "text-primary font-bold")}>
                      <span className="text-xs">ΔwCRI:</span>
                      <span className={cn(
                        "ml-1 font-bold",
                        tradeResult.realImpact.deltaWCRI > 0 && "text-stat-positive",
                        tradeResult.realImpact.deltaWCRI < 0 && "text-stat-negative"
                      )}>
                        {tradeResult.realImpact.deltaWCRI >= 0 ? '+' : ''}{tradeResult.realImpact.deltaWCRI.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Fairness */}
              <div className="p-3 rounded-lg bg-card border">
                <div className="text-xs text-muted-foreground mb-2">Fairness View</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs">You</div>
                    <div className={cn(
                      "font-bold",
                      tradeResult.yourNetCRI > 0 && "text-stat-positive",
                      tradeResult.yourNetCRI < 0 && "text-stat-negative"
                    )}>
                      {tradeResult.yourNetCRI >= 0 ? '+' : ''}{(scoreMode === 'CRI' ? tradeResult.yourNetCRI : tradeResult.yourNetWCRI).toFixed(1)} {scoreMode}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs">Them</div>
                    <div className={cn(
                      "font-bold",
                      tradeResult.theirNetCRI > 0 && "text-stat-positive",
                      tradeResult.theirNetCRI < 0 && "text-stat-negative"
                    )}>
                      {tradeResult.theirNetCRI >= 0 ? '+' : ''}{(scoreMode === 'CRI' ? tradeResult.theirNetCRI : tradeResult.theirNetWCRI).toFixed(1)} {scoreMode}
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <Badge className={cn(
                    tradeResult.fairnessLabel === 'win-win' && "bg-stat-positive",
                    tradeResult.fairnessLabel === 'you-win' && "bg-primary",
                    tradeResult.fairnessLabel === 'they-win' && "bg-stat-negative",
                    tradeResult.fairnessLabel === 'even' && "bg-muted"
                  )}>
                    {tradeResult.fairnessLabel === 'win-win' && '🤝 Win-Win'}
                    {tradeResult.fairnessLabel === 'you-win' && '✓ You Win'}
                    {tradeResult.fairnessLabel === 'they-win' && '✗ They Win'}
                    {tradeResult.fairnessLabel === 'even' && '≈ Even Trade'}
                  </Badge>
                </div>
              </div>
              
              {/* Verdict */}
              <div className="p-3 rounded-lg bg-card border">
                <div className="text-sm font-medium">{tradeResult.verdict}</div>
                <div className="text-xs text-muted-foreground mt-1">{tradeResult.fitAnalysis}</div>
              </div>
            </div>
            
            {/* Right: Category Deltas */}
            <div>
              <div className="text-xs text-muted-foreground mb-2">Category Changes (Real Impact)</div>
              <div className="grid grid-cols-3 gap-2">
                {tradeResult.realImpact.categoryDeltas.map(cat => {
                  const isTO = cat.key === 'turnovers';
                  const isPct = cat.key.includes('Pct');
                  const delta = cat.deltaPerGame;
                  const isPositive = isTO ? delta < 0 : delta > 0;
                  const isNegative = isTO ? delta > 0 : delta < 0;
                  
                  return (
                    <div key={cat.key} className="p-2 rounded-lg bg-card border text-center">
                      <div className="text-xs text-muted-foreground">{cat.label}</div>
                      <div className={cn(
                        "font-bold text-sm",
                        isPositive && "text-stat-positive",
                        isNegative && "text-stat-negative"
                      )}>
                        {delta >= 0 ? '+' : ''}
                        {isPct ? (delta * 100).toFixed(1) + '%' : delta.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {isPct ? '' : `×40: ${cat.deltaPer40 >= 0 ? '+' : ''}${cat.deltaPer40.toFixed(0)}`}
                      </div>
                      <div className="text-[10px]">
                        <span className={cn(
                          scoreMode === 'wCRI' ? "text-primary" : "text-muted-foreground"
                        )}>
                          w: {cat.weightedContribution >= 0 ? '+' : ''}{cat.weightedContribution.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}
      
      {/* Target Finder - Only show when both rosters loaded */}
      {yourRoster.length > 0 && opponentRoster.length > 0 && (
      <Collapsible open={showTargetFinder} onOpenChange={setShowTargetFinder}>
        <Card className="p-4">
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Target Finder
              </h3>
              {showTargetFinder ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="mt-4 space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label className="text-xs">I need...</Label>
                  <Select value={targetCategory} onValueChange={setTargetCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.key} value={cat.label}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Don't hurt...</Label>
                  <Select value={avoidCategory} onValueChange={setAvoidCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat.key} value={cat.label}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {targetResults.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground mb-2">
                    Best targets from {opponentRoster.length > 0 ? 'opponent' : 'free agents'}:
                  </div>
                  {targetResults.map(player => (
                    <PlayerRow
                      key={player.name}
                      player={player}
                      selected={getting.has(player.name)}
                      onToggle={() => toggleGetting(player.name)}
                      showBothScores
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      )}
      
      {/* Value Gap Panel */}
      {(yourRoster.length > 0 || opponentRoster.length > 0) && (
        <Card className="p-4">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            Value Gap (Buy Low / Sell High)
          </h3>
          
          <div className="grid md:grid-cols-2 gap-4">
            {/* Buy Lows */}
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-stat-positive" />
                Buy Low (undervalued by market)
              </div>
              <div className="space-y-1">
                {[...yourRoster, ...opponentRoster]
                  .filter(p => p.valueGap !== undefined && p.valueGap > 5)
                  .sort((a, b) => (b.valueGap || 0) - (a.valueGap || 0))
                  .slice(0, 5)
                  .map(player => (
                    <div key={player.name} className="flex items-center gap-2 p-2 bg-card/50 rounded border text-sm">
                      <PlayerPhoto name={player.name} size="sm" />
                      <div className="flex-1">
                        <div className="font-medium">{player.name}</div>
                        <div className="text-xs text-muted-foreground">{player.team}</div>
                      </div>
                      <Badge variant="outline" className="text-stat-positive">
                        Gap: +{player.valueGap}
                      </Badge>
                    </div>
                  ))}
                {[...yourRoster, ...opponentRoster].filter(p => p.valueGap !== undefined && p.valueGap > 5).length === 0 && (
                  <div className="text-sm text-muted-foreground">No clear buy-lows found</div>
                )}
              </div>
            </div>
            
            {/* Sell Highs */}
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-stat-negative" />
                Sell High (overvalued by market)
              </div>
              <div className="space-y-1">
                {[...yourRoster, ...opponentRoster]
                  .filter(p => p.valueGap !== undefined && p.valueGap < -5)
                  .sort((a, b) => (a.valueGap || 0) - (b.valueGap || 0))
                  .slice(0, 5)
                  .map(player => (
                    <div key={player.name} className="flex items-center gap-2 p-2 bg-card/50 rounded border text-sm">
                      <PlayerPhoto name={player.name} size="sm" />
                      <div className="flex-1">
                        <div className="font-medium">{player.name}</div>
                        <div className="text-xs text-muted-foreground">{player.team}</div>
                      </div>
                      <Badge variant="outline" className="text-stat-negative">
                        Gap: {player.valueGap}
                      </Badge>
                    </div>
                  ))}
                {[...yourRoster, ...opponentRoster].filter(p => p.valueGap !== undefined && p.valueGap < -5).length === 0 && (
                  <div className="text-sm text-muted-foreground">No clear sell-highs found</div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export default TradeAnalyzer;
