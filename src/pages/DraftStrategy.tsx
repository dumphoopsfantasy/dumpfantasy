import { useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Trash2, Table, Grid3X3 } from 'lucide-react';
import { useDraftState } from '@/hooks/useDraftState';
import { DraftDataInput } from '@/components/draft/DraftDataInput';
import { DraftSettingsPanel } from '@/components/draft/DraftSettingsPanel';
import { DraftRankingsTable } from '@/components/draft/DraftRankingsTable';
import { DraftBoardGrid } from '@/components/draft/DraftBoardGrid';

export function DraftStrategy() {
  const {
    settings,
    players,
    currentPick,
    draftStarted,
    pickHistory,
    updateSettings,
    importCrisRankings,
    importAdpRankings,
    importLastYearRankings,
    clearAllData,
    startDraft,
    resetDraft,
    markDrafted,
    undoLastPick,
    undoDraft,
    advancePick,
  } = useDraftState();

  const playerCount = useMemo(() => ({
    cris: players.filter(p => p.crisRank !== null).length,
    adp: players.filter(p => p.adpRank !== null).length,
    lastYear: players.filter(p => p.lastYearRank !== null).length,
  }), [players]);

  const handleMarkDrafted = (playerName: string, draftedBy: 'me' | 'other') => {
    markDrafted(playerName, draftedBy);
    advancePick();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Draft Strategy</h2>
          <p className="text-sm text-muted-foreground">
            Import rankings, plan your draft, and track picks
          </p>
        </div>
        {players.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={clearAllData}
            className="font-display"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        )}
      </div>

      {/* Setup Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DraftDataInput
          onImportCris={importCrisRankings}
          onImportAdp={importAdpRankings}
          onImportLastYear={importLastYearRankings}
          playerCount={playerCount}
        />
        <DraftSettingsPanel
          settings={settings}
          onUpdateSettings={updateSettings}
          draftStarted={draftStarted}
          onStartDraft={startDraft}
          onResetDraft={resetDraft}
          playerCount={players.length}
        />
      </div>

      {/* Main Content */}
      {players.length > 0 && (
        <Tabs defaultValue="table" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="table" className="gap-2">
              <Table className="w-4 h-4" />
              Rankings Table
            </TabsTrigger>
            <TabsTrigger value="board" className="gap-2">
              <Grid3X3 className="w-4 h-4" />
              Draft Board
            </TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            <DraftRankingsTable
              players={players}
              onMarkDrafted={handleMarkDrafted}
              onUndoDraft={undoDraft}
              draftStarted={draftStarted}
            />
          </TabsContent>

          <TabsContent value="board">
            <DraftBoardGrid
              players={players}
              settings={settings}
              currentPick={currentPick}
              draftStarted={draftStarted}
              pickHistory={pickHistory}
              onMarkDrafted={handleMarkDrafted}
              onUndoLastPick={undoLastPick}
            />
          </TabsContent>
        </Tabs>
      )}

      {players.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-display">Import player rankings to get started</p>
          <p className="text-sm mt-1">Paste CRIS projections, ADP trends, or last year's results</p>
        </div>
      )}
    </div>
  );
}