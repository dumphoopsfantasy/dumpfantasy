import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Upload, Play, Settings, List } from 'lucide-react';
import { useDraftState } from '@/hooks/useDraftState';
import { DraftImportWizard } from '@/components/draft/DraftImportWizard';
import { DraftSettingsPanel } from '@/components/draft/DraftSettingsPanel';
import { DraftAvailableTable } from '@/components/draft/DraftAvailableTable';
import { DraftBoardGrid } from '@/components/draft/DraftBoardGrid';
import { WizardStep } from '@/types/draft';

export function DraftStrategy() {
  const {
    settings,
    players,
    currentPick,
    draftStarted,
    picks,
    currentStep,
    importState,
    updateSettings,
    setActiveSegment,
    updateSegmentRaw,
    importSegment,
    clearSegment,
    clearSource,
    clearAllData,
    setCurrentStep,
    startDraft,
    resetDraft,
    draftPlayer,
    undoLastPick,
    undoDraft,
    availablePlayers,
    myDraftedPlayers,
    teamCompositions,
    getSourceCounts,
  } = useDraftState();

  const sourceCounts = getSourceCounts();
  const hasData = players.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">Draft Strategy</h2>
          <p className="text-sm text-muted-foreground">
            {currentStep === 'import' && 'Step 1: Import your ESPN data'}
            {currentStep === 'resolve' && 'Step 2: Resolve unmatched players'}
            {currentStep === 'draft' && 'Step 3: Draft day!'}
          </p>
        </div>
        <div className="flex gap-2">
          {hasData && (
            <Badge variant="outline" className="font-mono">
              {players.length} players
            </Badge>
          )}
          {hasData && (
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
      </div>

      {/* Step Navigation */}
      <div className="flex gap-2">
        <Button
          variant={currentStep === 'import' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCurrentStep('import')}
          className="gap-2"
        >
          <Upload className="w-4 h-4" />
          1. Import
          {sourceCounts.projections > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {sourceCounts.projections + sourceCounts.adp + sourceCounts.lastYear}
            </Badge>
          )}
        </Button>
        <Button
          variant={currentStep === 'draft' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setCurrentStep('draft')}
          disabled={!hasData}
          className="gap-2"
        >
          <List className="w-4 h-4" />
          2. Draft
        </Button>
      </div>

      {/* Step Content */}
      {currentStep === 'import' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <DraftImportWizard
              importState={importState}
              onSetActiveSegment={setActiveSegment}
              onUpdateSegmentRaw={updateSegmentRaw}
              onImportSegment={importSegment}
              onClearSegment={clearSegment}
              onClearSource={clearSource}
              sourceCounts={sourceCounts}
            />
          </div>
          <div>
            <DraftSettingsPanel
              settings={settings}
              onUpdateSettings={updateSettings}
              draftStarted={draftStarted}
              onStartDraft={startDraft}
              onResetDraft={resetDraft}
              playerCount={players.length}
            />
          </div>
        </div>
      )}

      {currentStep === 'draft' && hasData && (
        <Tabs defaultValue="table" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="table" className="gap-2">
              <List className="w-4 h-4" />
              Available Players
            </TabsTrigger>
            <TabsTrigger value="board" className="gap-2">
              <Settings className="w-4 h-4" />
              Draft Board
            </TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            <DraftAvailableTable
              players={players}
              availablePlayers={availablePlayers}
              draftStarted={draftStarted}
              currentPick={currentPick}
              settings={settings}
              onDraftPlayer={draftPlayer}
              onUndoDraft={undoDraft}
              onStartDraft={startDraft}
            />
          </TabsContent>

          <TabsContent value="board">
            <DraftBoardGrid
              players={players}
              settings={settings}
              currentPick={currentPick}
              draftStarted={draftStarted}
              picks={picks}
              onDraftPlayer={draftPlayer}
              onUndoLastPick={undoLastPick}
              teamCompositions={teamCompositions}
            />
          </TabsContent>
        </Tabs>
      )}

      {currentStep === 'draft' && !hasData && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            Import player rankings first to start drafting.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentStep('import')}
            className="mt-4"
          >
            Go to Import
          </Button>
        </Card>
      )}
    </div>
  );
}
