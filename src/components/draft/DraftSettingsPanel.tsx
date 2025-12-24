import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Play, RotateCcw } from 'lucide-react';
import { DraftSettings } from '@/types/draft';

interface DraftSettingsPanelProps {
  settings: DraftSettings;
  onUpdateSettings: (settings: Partial<DraftSettings>) => void;
  draftStarted: boolean;
  onStartDraft: () => void;
  onResetDraft: () => void;
  playerCount: number;
}

export function DraftSettingsPanel({
  settings,
  onUpdateSettings,
  draftStarted,
  onStartDraft,
  onResetDraft,
  playerCount,
}: DraftSettingsPanelProps) {
  return (
    <Card className="gradient-card shadow-card p-4 border-border">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-display font-bold">Draft Settings</h3>
          <p className="text-xs text-muted-foreground">
            Configure your draft format
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Format</Label>
          <Select
            value={settings.format}
            onValueChange={(v) => onUpdateSettings({ format: v as 'snake' | 'linear' })}
            disabled={draftStarted}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="snake">Snake</SelectItem>
              <SelectItem value="linear">Linear</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Teams</Label>
          <Select
            value={settings.teams.toString()}
            onValueChange={(v) => onUpdateSettings({ teams: parseInt(v, 10) })}
            disabled={draftStarted}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[8, 10, 12, 14, 16].map(n => (
                <SelectItem key={n} value={n.toString()}>{n} teams</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">My Pick Slot</Label>
          <Select
            value={settings.myPickSlot.toString()}
            onValueChange={(v) => onUpdateSettings({ myPickSlot: parseInt(v, 10) })}
            disabled={draftStarted}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: settings.teams }, (_, i) => i + 1).map(n => (
                <SelectItem key={n} value={n.toString()}>Pick #{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Rounds</Label>
          <Input
            type="number"
            value={settings.rounds}
            onChange={(e) => onUpdateSettings({ rounds: parseInt(e.target.value, 10) || 15 })}
            min={1}
            max={20}
            disabled={draftStarted}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex gap-2">
        {!draftStarted ? (
          <Button
            onClick={onStartDraft}
            disabled={playerCount === 0}
            className="flex-1 gradient-primary shadow-glow font-display font-semibold"
            size="sm"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Draft
          </Button>
        ) : (
          <Button
            onClick={onResetDraft}
            variant="outline"
            className="flex-1 font-display font-semibold"
            size="sm"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Draft
          </Button>
        )}
      </div>

      {playerCount === 0 && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          Import player rankings first
        </p>
      )}
    </Card>
  );
}
