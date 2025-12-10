import { useState, useMemo } from "react";
import { DataUpload } from "@/components/DataUpload";
import { TeamAverages } from "@/components/TeamAverages";
import { PlayerRankings } from "@/components/PlayerRankings";
import { LeagueStandings } from "@/components/LeagueStandings";
import { FreeAgents } from "@/pages/FreeAgents";
import { WeeklyPerformance } from "@/pages/WeeklyPerformance";
import { MatchupProjection } from "@/pages/MatchupProjection";
import { RosterTable } from "@/components/roster/RosterTable";
import { NBAScoresSidebar } from "@/components/NBAScoresSidebar";
import { PlayerDetailSheet } from "@/components/roster/PlayerDetailSheet";
import { PlayerStats } from "@/types/player";
import { Player, RosterSlot } from "@/types/fantasy";
import { LeagueTeam } from "@/types/league";
import { Button } from "@/components/ui/button";
import { BarChart3, RefreshCw, Users, TrendingUp, Calendar, Swords, Trophy, Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CRIS_WEIGHTS } from "@/lib/crisUtils";

// Weekly matchup types
interface MatchupStats {
  fgPct: number;
  ftPct: number;
  threepm: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  points: number;
}

interface WeeklyMatchup {
  team1: { abbr: string; name: string; record: string; weekRecord: string; stats: MatchupStats };
  team2: { abbr: string; name: string; record: string; weekRecord: string; stats: MatchupStats };
}

interface MatchupProjectionData {
  myTeam: { name: string; record: string; standing: string; owner?: string; lastMatchup?: string; stats: MatchupStats };
  opponent: { name: string; record: string; standing: string; owner?: string; lastMatchup?: string; stats: MatchupStats };
}

// CRI categories
const CRI_CATEGORIES = [
  { key: "fgPct", lowerBetter: false },
  { key: "ftPct", lowerBetter: false },
  { key: "threepm", lowerBetter: false },
  { key: "rebounds", lowerBetter: false },
  { key: "assists", lowerBetter: false },
  { key: "steals", lowerBetter: false },
  { key: "blocks", lowerBetter: false },
  { key: "turnovers", lowerBetter: true },
  { key: "points", lowerBetter: false },
] as const;

const Index = () => {
  // Roster state
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  
  // CRI/wCRI toggle
  const [useCris, setUseCris] = useState(true);
  const [sortColumn, setSortColumn] = useState<string>("cri");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // Roster filter
  const [rosterFilter, setRosterFilter] = useState<"all" | "starters" | "bench" | "ir">("all");
  
  // Pin IR to bottom toggle
  const [pinIRToBottom, setPinIRToBottom] = useState(true);
  
  // Free agents state (persisted)
  const [freeAgents, setFreeAgents] = useState<Player[]>([]);
  
  // Weekly state (persisted)
  const [weeklyMatchups, setWeeklyMatchups] = useState<WeeklyMatchup[]>([]);
  const [weeklyTitle, setWeeklyTitle] = useState("");
  
  // Standings state (persisted)
  const [leagueTeams, setLeagueTeams] = useState<LeagueTeam[]>([]);
  
  // Matchup projection state (persisted)
  const [matchupData, setMatchupData] = useState<MatchupProjectionData | null>(null);

  // Player detail sheet state
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerSheetOpen, setPlayerSheetOpen] = useState(false);

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(player);
    setPlayerSheetOpen(true);
  };

  const handleDataParsed = (data: PlayerStats[]) => {
    setPlayers(data);
  };

  const handleReset = () => {
    setPlayers([]);
  };

  // Convert PlayerStats to RosterSlot format and calculate CRI/wCRI
  const { rosterWithCRI, categoryRanks, activePlayerCount } = useMemo(() => {
    // First, convert all players to RosterSlot format
    const allSlots: (RosterSlot & { player: Player & { cri?: number; wCri?: number; criRank?: number; wCriRank?: number } })[] = players.map((p) => {
      const slot = p.slot || "Bench";
      const slotLower = slot.toLowerCase();
      // IR slots explicitly contain "ir" or "il"
      const isIR = slotLower.includes("ir") || slotLower === "il";
      // Bench is only when slot is exactly "bench"
      const isBench = slotLower === "bench";
      // Everything else (PG, SG, SF, PF, C, G, F/C, UTIL) is a starter
      const isStarter = !isIR && !isBench;
      
      return {
        slot,
        slotType: isIR ? "ir" : isStarter ? "starter" : "bench",
        player: {
          id: p.player,
          name: p.player,
          nbaTeam: p.team,
          positions: p.position.split(",").map((pos) => pos.trim()),
          opponent: p.opponent,
          status: p.status as Player["status"],
          minutes: p.minutes,
          fgm: 0,
          fga: 0,
          fgPct: p.fgPct,
          ftm: 0,
          fta: 0,
          ftPct: p.ftPct,
          threepm: p.threepm,
          rebounds: p.rebounds,
          assists: p.assists,
          steals: p.steals,
          blocks: p.blocks,
          turnovers: p.turnovers,
          points: p.points,
        },
      };
    });

    // Define active players: Starter/Bench with valid stats (minutes > 0)
    const activePlayers = allSlots.filter(
      (s) => s.slotType !== "ir" && s.player.minutes > 0
    );
    const N = activePlayers.length;

    if (N === 0) return { rosterWithCRI: allSlots, categoryRanks: {}, activePlayerCount: 0 };

    // Calculate category scores AND ranks for active players
    const categoryScores: Record<string, Record<string, number>> = {};
    const catRanks: Record<string, Record<string, number>> = {};
    
    CRI_CATEGORIES.forEach((cat) => {
      const key = cat.key as keyof Player;
      // Sort active players
      const sorted = [...activePlayers].sort((a, b) => {
        const aVal = a.player[key] as number;
        const bVal = b.player[key] as number;
        return cat.lowerBetter ? aVal - bVal : bVal - aVal;
      });
      
      // Assign scores: best gets N, worst gets 1
      // Assign ranks: best gets 1, worst gets N
      categoryScores[cat.key] = {};
      catRanks[cat.key] = {};
      sorted.forEach((slot, index) => {
        categoryScores[cat.key][slot.player.id] = N - index;
        catRanks[cat.key][slot.player.id] = index + 1;
      });
    });

    // Calculate CRI and wCRI for active players
    const activeCRI: { id: string; cri: number; wCri: number }[] = activePlayers.map((slot) => {
      let cri = 0;
      let wCri = 0;
      
      CRI_CATEGORIES.forEach((cat) => {
        const score = categoryScores[cat.key][slot.player.id] || 0;
        cri += score;
        wCri += score * CRIS_WEIGHTS[cat.key as keyof typeof CRIS_WEIGHTS];
      });
      
      return { id: slot.player.id, cri, wCri };
    });

    // Sort for ranking
    const criSorted = [...activeCRI].sort((a, b) => b.cri - a.cri);
    const wCriSorted = [...activeCRI].sort((a, b) => b.wCri - a.wCri);

    // Assign ranks
    const criRanks: Record<string, number> = {};
    const wCriRanks: Record<string, number> = {};
    criSorted.forEach((p, i) => (criRanks[p.id] = i + 1));
    wCriSorted.forEach((p, i) => (wCriRanks[p.id] = i + 1));

    // Map scores back to all slots
    const finalSlots = allSlots.map((slot) => {
      const criData = activeCRI.find((p) => p.id === slot.player.id);
      if (criData) {
        return {
          ...slot,
          player: {
            ...slot.player,
            cri: criData.cri,
            wCri: criData.wCri,
            criRank: criRanks[slot.player.id],
            wCriRank: wCriRanks[slot.player.id],
          },
        };
      }
      // IR players with stats - calculate their scores relative to active pool
      if (slot.player.minutes > 0) {
        let cri = 0;
        let wCri = 0;
        CRI_CATEGORIES.forEach((cat) => {
          const key = cat.key as keyof Player;
          const val = slot.player[key] as number;
          // Count how many active players this IR player beats
          let score = 1;
          activePlayers.forEach((ap) => {
            const apVal = ap.player[key] as number;
            if (cat.lowerBetter ? val < apVal : val > apVal) score++;
          });
          cri += Math.min(score, N);
          wCri += Math.min(score, N) * CRIS_WEIGHTS[cat.key as keyof typeof CRIS_WEIGHTS];
        });
        return {
          ...slot,
          player: { ...slot.player, cri, wCri },
        };
      }
      return slot;
    });

    return { rosterWithCRI: finalSlots, categoryRanks: catRanks, activePlayerCount: N };
  }, [players]);

  // Apply filter and sort
  const filteredRoster = useMemo(() => {
    let filtered = rosterWithCRI;
    if (rosterFilter === "starters") {
      filtered = rosterWithCRI.filter((s) => s.slotType === "starter");
    } else if (rosterFilter === "bench") {
      filtered = rosterWithCRI.filter((s) => s.slotType === "bench");
    } else if (rosterFilter === "ir") {
      filtered = rosterWithCRI.filter((s) => s.slotType === "ir");
    }

    // Sort with optional IR pinning
    const sorted = [...filtered].sort((a, b) => {
      // If pinIRToBottom is enabled and we're not filtering to IR only, pin IR players to bottom
      if (pinIRToBottom && rosterFilter !== "ir") {
        if (a.slotType === "ir" && b.slotType !== "ir") return 1;
        if (a.slotType !== "ir" && b.slotType === "ir") return -1;
      }
      
      const aPlayer = a.player;
      const bPlayer = b.player;
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortColumn) {
        case "cri":
          aVal = aPlayer.cri ?? 0;
          bVal = bPlayer.cri ?? 0;
          break;
        case "wCri":
          aVal = aPlayer.wCri ?? 0;
          bVal = bPlayer.wCri ?? 0;
          break;
        case "player":
          aVal = aPlayer.name;
          bVal = bPlayer.name;
          break;
        case "min":
          aVal = aPlayer.minutes;
          bVal = bPlayer.minutes;
          break;
        case "fgPct":
          aVal = aPlayer.fgPct;
          bVal = bPlayer.fgPct;
          break;
        case "ftPct":
          aVal = aPlayer.ftPct;
          bVal = bPlayer.ftPct;
          break;
        case "threepm":
          aVal = aPlayer.threepm;
          bVal = bPlayer.threepm;
          break;
        case "rebounds":
          aVal = aPlayer.rebounds;
          bVal = bPlayer.rebounds;
          break;
        case "assists":
          aVal = aPlayer.assists;
          bVal = bPlayer.assists;
          break;
        case "steals":
          aVal = aPlayer.steals;
          bVal = bPlayer.steals;
          break;
        case "blocks":
          aVal = aPlayer.blocks;
          bVal = bPlayer.blocks;
          break;
        case "turnovers":
          aVal = aPlayer.turnovers;
          bVal = bPlayer.turnovers;
          break;
        case "points":
          aVal = aPlayer.points;
          bVal = bPlayer.points;
          break;
        default:
          aVal = aPlayer.cri ?? 0;
          bVal = bPlayer.cri ?? 0;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    
    return sorted;
  }, [rosterWithCRI, rosterFilter, sortColumn, sortDirection, pinIRToBottom]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const handleCrisToggle = (useCriMode: boolean) => {
    setUseCris(useCriMode);
    setSortColumn(useCriMode ? "cri" : "wCri");
    setSortDirection("desc");
  };

  const starters = rosterWithCRI.filter((s) => s.slotType === "starter");
  const bench = rosterWithCRI.filter((s) => s.slotType === "bench");
  const ir = rosterWithCRI.filter((s) => s.slotType === "ir");

  return (
    <div className="min-h-screen bg-background">
      {/* NBA Scores Sidebar */}
      <NBAScoresSidebar />
      
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg gradient-primary shadow-glow">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-display font-bold">
                  <span className="text-primary">Dump</span>Hoops Analytics
                </h1>
              </div>
            </div>
            {players.length > 0 && (
              <Button onClick={handleReset} variant="outline" size="sm" className="font-display font-semibold">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="roster" className="w-full">
          <TabsList className="grid w-full max-w-3xl mx-auto grid-cols-5 bg-card mb-6">
            <TabsTrigger value="roster" className="font-display font-semibold text-xs md:text-sm">
              <Users className="w-4 h-4 mr-1 hidden md:inline" />
              Roster
            </TabsTrigger>
            <TabsTrigger value="freeagents" className="font-display font-semibold text-xs md:text-sm">
              <TrendingUp className="w-4 h-4 mr-1 hidden md:inline" />
              Free Agents
            </TabsTrigger>
            <TabsTrigger value="league" className="font-display font-semibold text-xs md:text-sm">
              <Trophy className="w-4 h-4 mr-1 hidden md:inline" />
              Standings
            </TabsTrigger>
            <TabsTrigger value="matchup" className="font-display font-semibold text-xs md:text-sm">
              <Swords className="w-4 h-4 mr-1 hidden md:inline" />
              Matchup
            </TabsTrigger>
            <TabsTrigger value="weekly" className="font-display font-semibold text-xs md:text-sm">
              <Calendar className="w-4 h-4 mr-1 hidden md:inline" />
              Weekly
            </TabsTrigger>
          </TabsList>

          <TabsContent value="roster">
            {players.length === 0 ? (
              <div className="max-w-3xl mx-auto">
                <DataUpload onDataParsed={handleDataParsed} />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Stat Window Reminder */}
                <div className="flex items-center gap-2 bg-card/50 rounded-lg p-3 border border-border">
                  <Info className="w-4 h-4 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Stats shown match the view you selected on ESPN (Last 7, Last 15, Last 30, or Season averages)
                  </p>
                </div>
                
                <TeamAverages players={players} />
                <PlayerRankings players={players} />

                {/* Roster Controls */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-card/50 rounded-lg p-3 border border-border">
                  {/* Filter Tabs */}
                  <div className="flex gap-2">
                    <Button
                      variant={rosterFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRosterFilter("all")}
                      className="font-display text-xs"
                    >
                      All ({rosterWithCRI.length})
                    </Button>
                    <Button
                      variant={rosterFilter === "starters" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRosterFilter("starters")}
                      className="font-display text-xs"
                    >
                      Starters ({starters.length})
                    </Button>
                    <Button
                      variant={rosterFilter === "bench" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRosterFilter("bench")}
                      className="font-display text-xs"
                    >
                      Bench ({bench.length})
                    </Button>
                    <Button
                      variant={rosterFilter === "ir" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRosterFilter("ir")}
                      className="font-display text-xs"
                    >
                      IR ({ir.length})
                    </Button>
                  </div>

                  {/* CRI/wCRI Toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-display">Ranking:</span>
                    <div className="flex">
                      <Button
                        variant={useCris ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleCrisToggle(true)}
                        className="rounded-r-none font-display text-xs"
                      >
                        CRI
                      </Button>
                      <Button
                        variant={!useCris ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleCrisToggle(false)}
                        className="rounded-l-none font-display text-xs"
                      >
                        wCRI
                      </Button>
                    </div>
                    {/* Pin IR Toggle - subtle */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPinIRToBottom(!pinIRToBottom)}
                      className="font-display text-xs text-muted-foreground ml-2"
                      title={pinIRToBottom ? "IR players pinned to bottom" : "IR players sorted normally"}
                    >
                      {pinIRToBottom ? "IR↓" : "IR"}
                    </Button>
                  </div>
                  
                </div>

                {/* Roster Table */}
                <RosterTable
                  roster={filteredRoster}
                  useCris={useCris}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  onPlayerClick={handlePlayerClick}
                  categoryRanks={categoryRanks}
                  activePlayerCount={activePlayerCount}
                />
              </div>
            )}
            
            {/* Player Detail Sheet */}
            <PlayerDetailSheet
              player={selectedPlayer}
              open={playerSheetOpen}
              onOpenChange={setPlayerSheetOpen}
            />
          </TabsContent>

          <TabsContent value="freeagents">
            <FreeAgents 
              persistedPlayers={freeAgents} 
              onPlayersChange={setFreeAgents}
              currentRoster={rosterWithCRI.map(slot => slot.player)}
            />
          </TabsContent>

          <TabsContent value="league">
            <div className="max-w-5xl mx-auto">
              <LeagueStandings 
                persistedTeams={leagueTeams}
                onTeamsChange={setLeagueTeams}
              />
            </div>
          </TabsContent>

          <TabsContent value="matchup">
            <MatchupProjection 
              persistedMatchup={matchupData}
              onMatchupChange={setMatchupData}
            />
          </TabsContent>

          <TabsContent value="weekly">
            <WeeklyPerformance 
              persistedMatchups={weeklyMatchups}
              persistedTitle={weeklyTitle}
              onMatchupsChange={setWeeklyMatchups}
              onTitleChange={setWeeklyTitle}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;