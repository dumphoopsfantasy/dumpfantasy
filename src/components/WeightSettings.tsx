import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Save, Settings } from "lucide-react";
import { CRIS_WEIGHTS } from "@/lib/crisUtils";

export interface CustomWeights {
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

const DEFAULT_WEIGHTS: CustomWeights = { ...CRIS_WEIGHTS };

const CATEGORY_LABELS: Record<keyof CustomWeights, string> = {
  fgPct: "FG%",
  ftPct: "FT%",
  threepm: "3PM",
  rebounds: "REB",
  assists: "AST",
  steals: "STL",
  blocks: "BLK",
  turnovers: "TO",
  points: "PTS",
};

interface WeightSettingsProps {
  weights: CustomWeights;
  onWeightsChange: (weights: CustomWeights) => void;
}

export function WeightSettings({ weights, onWeightsChange }: WeightSettingsProps) {
  const [localWeights, setLocalWeights] = useState<CustomWeights>(weights);
  const [hasChanges, setHasChanges] = useState(false);

  const handleWeightChange = (key: keyof CustomWeights, value: number) => {
    const newWeights = { ...localWeights, [key]: value };
    setLocalWeights(newWeights);
    setHasChanges(true);
  };

  const handleSave = () => {
    onWeightsChange(localWeights);
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalWeights(DEFAULT_WEIGHTS);
    onWeightsChange(DEFAULT_WEIGHTS);
    setHasChanges(false);
  };

  const isDefault = Object.keys(DEFAULT_WEIGHTS).every(
    (key) => localWeights[key as keyof CustomWeights] === DEFAULT_WEIGHTS[key as keyof CustomWeights]
  );

  return (
    <Card className="gradient-card border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold">wCRI Weight Settings</h3>
          {!isDefault && (
            <Badge variant="secondary" className="text-[10px]">Custom</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isDefault}
            className="text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset to Default
          </Button>
          {hasChanges && (
            <Button
              size="sm"
              onClick={handleSave}
              className="text-xs"
            >
              <Save className="w-3 h-3 mr-1" />
              Apply
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Adjust the importance of each category in wCRI calculations. Higher weight = more impact on score.
      </p>

      <div className="grid md:grid-cols-3 gap-4">
        {(Object.keys(CATEGORY_LABELS) as Array<keyof CustomWeights>).map((key) => (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{CATEGORY_LABELS[key]}</span>
              <span className="text-sm font-mono text-primary">{localWeights[key].toFixed(2)}</span>
            </div>
            <Slider
              value={[localWeights[key]]}
              onValueChange={([value]) => handleWeightChange(key, value)}
              min={0}
              max={1.5}
              step={0.05}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0</span>
              <span className="text-primary/50">Default: {DEFAULT_WEIGHTS[key]}</span>
              <span>1.5</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export { DEFAULT_WEIGHTS };
