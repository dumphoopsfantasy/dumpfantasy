import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { ChevronDown, Save, RotateCcw, Settings, Sparkles } from "lucide-react";
import { CRIS_WEIGHTS } from "@/lib/crisUtils";
import { cn } from "@/lib/utils";

export interface CustomCRIWeights {
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

export const DEFAULT_CRI_WEIGHTS: CustomCRIWeights = { ...CRIS_WEIGHTS };

// Presets for common punt strategies
const PRESETS: Record<string, { name: string; weights: CustomCRIWeights }> = {
  default: {
    name: "Default",
    weights: DEFAULT_CRI_WEIGHTS,
  },
  puntTO: {
    name: "Punt TO",
    weights: {
      ...DEFAULT_CRI_WEIGHTS,
      turnovers: 0,
    },
  },
  puntFG: {
    name: "Punt FG%",
    weights: {
      ...DEFAULT_CRI_WEIGHTS,
      fgPct: 0,
    },
  },
  puntFT: {
    name: "Punt FT%",
    weights: {
      ...DEFAULT_CRI_WEIGHTS,
      ftPct: 0,
    },
  },
  stocks: {
    name: "Stocks Build",
    weights: {
      ...DEFAULT_CRI_WEIGHTS,
      steals: 1.3,
      blocks: 1.3,
    },
  },
};

const CATEGORY_LABELS: Record<keyof CustomCRIWeights, { label: string; isInverted?: boolean }> = {
  fgPct: { label: "FG%" },
  ftPct: { label: "FT%" },
  threepm: { label: "3PM" },
  rebounds: { label: "REB" },
  assists: { label: "AST" },
  steals: { label: "STL" },
  blocks: { label: "BLK" },
  turnovers: { label: "TO", isInverted: true },
  points: { label: "PTS" },
};

interface CustomCRIBuilderProps {
  weights: CustomCRIWeights;
  onWeightsChange: (weights: CustomCRIWeights) => void;
}

export function CustomCRIBuilder({ weights, onWeightsChange }: CustomCRIBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localWeights, setLocalWeights] = useState<CustomCRIWeights>(weights);
  const [hasChanges, setHasChanges] = useState(false);

  const isDefault = useMemo(() => {
    return Object.keys(DEFAULT_CRI_WEIGHTS).every(
      (key) => localWeights[key as keyof CustomCRIWeights] === DEFAULT_CRI_WEIGHTS[key as keyof CustomCRIWeights]
    );
  }, [localWeights]);

  const activePreset = useMemo(() => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      const matches = Object.keys(preset.weights).every(
        (cat) => localWeights[cat as keyof CustomCRIWeights] === preset.weights[cat as keyof CustomCRIWeights]
      );
      if (matches) return key;
    }
    return null;
  }, [localWeights]);

  const handleWeightChange = (key: keyof CustomCRIWeights, value: number) => {
    const newWeights = { ...localWeights, [key]: Math.round(value * 100) / 100 };
    setLocalWeights(newWeights);
    setHasChanges(true);
  };

  const handlePreset = (presetKey: string) => {
    const preset = PRESETS[presetKey];
    if (preset) {
      setLocalWeights(preset.weights);
      setHasChanges(true);
    }
  };

  const handleSave = () => {
    onWeightsChange(localWeights);
    setHasChanges(false);
  };

  const handleReset = () => {
    setLocalWeights(DEFAULT_CRI_WEIGHTS);
    onWeightsChange(DEFAULT_CRI_WEIGHTS);
    setHasChanges(false);
  };

  const handleNormalize = () => {
    const total = Object.values(localWeights).reduce((sum, w) => sum + w, 0);
    if (total === 0) return;
    
    const normalized: CustomCRIWeights = {} as CustomCRIWeights;
    for (const key of Object.keys(localWeights) as Array<keyof CustomCRIWeights>) {
      normalized[key] = Math.round((localWeights[key] / total) * 9 * 100) / 100;
    }
    setLocalWeights(normalized);
    setHasChanges(true);
  };

  return (
    <Card className="gradient-card border-border p-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" />
              <span className="font-display font-bold text-sm">Custom CRI Builder</span>
              {!isDefault && (
                <Badge variant="secondary" className="text-[10px]">Custom</Badge>
              )}
            </div>
            <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Customize category weights for CRI/wCRI calculations. Higher weight = more importance in rankings.
            <span className="text-stat-negative ml-1">(TO is inverted: lower TO = better)</span>
          </p>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <Button
                key={key}
                variant={activePreset === key ? "default" : "outline"}
                size="sm"
                onClick={() => handlePreset(key)}
                className="text-xs"
              >
                <Sparkles className="w-3 h-3 mr-1" />
                {preset.name}
              </Button>
            ))}
          </div>

          {/* Weight Sliders */}
          <div className="grid md:grid-cols-3 gap-4">
            {(Object.keys(CATEGORY_LABELS) as Array<keyof CustomCRIWeights>).map((key) => {
              const cat = CATEGORY_LABELS[key];
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-sm font-medium",
                      cat.isInverted && "text-stat-negative"
                    )}>
                      {cat.label}
                      {cat.isInverted && <span className="text-[10px] ml-1">(inverted)</span>}
                    </span>
                    <Input
                      type="number"
                      value={localWeights[key]}
                      onChange={(e) => handleWeightChange(key, parseFloat(e.target.value) || 0)}
                      className="w-16 h-7 text-xs text-right font-mono"
                      min={0}
                      max={2}
                      step={0.05}
                    />
                  </div>
                  <Slider
                    value={[localWeights[key]]}
                    onValueChange={([value]) => handleWeightChange(key, value)}
                    min={0}
                    max={1.5}
                    step={0.05}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>0 (ignore)</span>
                    <span className="text-primary/60">Default: {DEFAULT_CRI_WEIGHTS[key]}</span>
                    <span>1.5+</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNormalize}
                className="text-xs"
              >
                Normalize Weights
              </Button>
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
            </div>
            {hasChanges && (
              <Button
                size="sm"
                onClick={handleSave}
                className="text-xs gradient-primary"
              >
                <Save className="w-3 h-3 mr-1" />
                Apply Changes
              </Button>
            )}
          </div>

          {/* Guardrail Notice */}
          <div className="p-2 bg-muted/30 rounded-lg text-[10px] text-muted-foreground">
            <strong>Note:</strong> Your top 6 CRI players are protected from drop recommendations regardless of custom weights.
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
