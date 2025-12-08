import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NBATeamLogo } from "@/components/NBATeamLogo";

interface GameScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
}

interface UpcomingGame {
  homeTeam: string;
  awayTeam: string;
  time: string;
}

// Mock data - in production this would come from an API
const yesterdayScores: GameScore[] = [
  { homeTeam: "LAL", awayTeam: "BOS", homeScore: 108, awayScore: 117, status: "Final" },
  { homeTeam: "MIA", awayTeam: "PHI", homeScore: 102, awayScore: 98, status: "Final" },
  { homeTeam: "GSW", awayTeam: "PHX", homeScore: 121, awayScore: 116, status: "Final" },
  { homeTeam: "NYK", awayTeam: "BKN", homeScore: 112, awayScore: 104, status: "Final" },
];

const tonightGames: UpcomingGame[] = [
  { homeTeam: "DAL", awayTeam: "HOU", time: "7:30 PM" },
  { homeTeam: "MIN", awayTeam: "LAC", time: "8:00 PM" },
  { homeTeam: "DEN", awayTeam: "MEM", time: "9:00 PM" },
  { homeTeam: "SAC", awayTeam: "POR", time: "10:00 PM" },
];

export function NBAScoresSidebar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Toggle Button - Always visible */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-20 rounded-l-none border-l-0 bg-card hover:bg-secondary px-1.5 py-6"
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </Button>

      {/* Sidebar Panel */}
      <div
        className={`fixed left-0 top-0 h-full z-10 bg-card border-r border-border shadow-elevated transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: "280px" }}
      >
        <div className="h-full overflow-y-auto pt-16 pb-6 px-4">
          {/* Yesterday's Scores */}
          <div className="mb-6">
            <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
              Yesterday's Scores
            </h3>
            <div className="space-y-2">
              {yesterdayScores.map((game, idx) => (
                <div key={idx} className="bg-secondary/50 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <NBATeamLogo teamCode={game.awayTeam} size="xs" />
                      <span className="text-sm font-medium">{game.awayTeam}</span>
                    </div>
                    <span className={`text-sm font-bold ${game.awayScore > game.homeScore ? "text-foreground" : "text-muted-foreground"}`}>
                      {game.awayScore}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <NBATeamLogo teamCode={game.homeTeam} size="xs" />
                      <span className="text-sm font-medium">{game.homeTeam}</span>
                    </div>
                    <span className={`text-sm font-bold ${game.homeScore > game.awayScore ? "text-foreground" : "text-muted-foreground"}`}>
                      {game.homeScore}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground text-center mt-1.5 pt-1.5 border-t border-border">
                    {game.status}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tonight's Matchups */}
          <div>
            <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
              Tonight's Games
            </h3>
            <div className="space-y-2">
              {tonightGames.map((game, idx) => (
                <div key={idx} className="bg-secondary/50 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <NBATeamLogo teamCode={game.awayTeam} size="xs" />
                      <span className="text-sm font-medium">{game.awayTeam}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">@</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <NBATeamLogo teamCode={game.homeTeam} size="xs" />
                      <span className="text-sm font-medium">{game.homeTeam}</span>
                    </div>
                  </div>
                  <div className="text-xs text-primary text-center mt-1.5 pt-1.5 border-t border-border font-medium">
                    {game.time}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Note about data */}
          <p className="text-xs text-muted-foreground text-center mt-6 px-2">
            Scores update daily. Check ESPN for live updates.
          </p>
        </div>
      </div>
    </>
  );
}
