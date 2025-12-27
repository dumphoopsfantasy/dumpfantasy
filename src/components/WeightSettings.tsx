import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Save, Settings, Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CRIS_WEIGHTS } from "@/lib/crisUtils";
import { EffectiveWeightsResult } from "@/lib/dynamicWeights";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  effectiveWeightsResult?: EffectiveWeightsResult;
}

export function WeightSettings({ weights, onWeightsChange, effectiveWeightsResult }: WeightSettingsProps) {
  const [localWeights, setLocalWeights] = useState<CustomWeights>(weights);
  const [hasChanges, setHasChanges] = useState(false);

  const dynamicActive = effectiveWeightsResult?.isActive ?? false;

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

  const getMultiplierIcon = (multiplier: number) => {
    if (multiplier > 1.05) return <TrendingUp className="w-3 h-3 text-stat-positive" />;
    if (multiplier < 0.95) return <TrendingDown className="w-3 h-3 text-stat-negative" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const formatMultiplier = (multiplier: number) => {
    if (multiplier > 1) return `+${((multiplier - 1) * 100).toFixed(0)}%`;
    if (multiplier < 1) return `${((multiplier - 1) * 100).toFixed(0)}%`;
    return "0%";
  };

  return (
    <Card className="gradient-card border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <h3 className="font-display font-bold">wCRI Base Weights</h3>
          {!isDefault && (
            <Badge variant="secondary" className="text-[10px]">Custom</Badge>
          )}
          {dynamicActive && (
            <Badge variant="outline" className="text-[10px] gap-1 border-primary/50 bg-primary/10">
              <Zap className="w-3 h-3 text-primary" />
              Dynamic
            </Badge>
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

      <TooltipProvider>
        <div className="grid grid-cols-3 gap-4">
          {(Object.keys(CATEGORY_LABELS) as Array<keyof CustomWeights>).map((key) => {
            const detail = effectiveWeightsResult?.details[key];
            const multiplier = detail?.needMultiplier ?? 1;
            const effectiveWeight = detail?.effectiveWeight ?? localWeights[key];
            const hasMultiplier = dynamicActive && Math.abs(multiplier - 1) > 0.02;

            return (
              <div key={key} className="space-y-1.5">
                {/* Category label and value */}
                <div className="flex items-center justify-between">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm font-medium cursor-default">
                        {CATEGORY_LABELS[key]}
                        {hasMultiplier && (
                          <span className="ml-1">
                            {multiplier > 1 ? (
                              <TrendingUp className="w-3 h-3 text-stat-positive inline" />
                            ) : (
                              <TrendingDown className="w-3 h-3 text-stat-negative inline" />
                            )}
                          </span>
                        )}
                      </span>
                    </TooltipTrigger>
                    {dynamicActive && detail?.reason && (
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-xs font-medium">{detail.reason}</p>
                        {detail.modeInput && (
                          <p className="text-xs text-muted-foreground mt-1">{detail.modeInput}</p>
                        )}
                        {hasMultiplier && (
                          <p className="text-xs mt-1">
                            Multiplier: {formatMultiplier(multiplier)} → Effective: {effectiveWeight.toFixed(2)}
                          </p>
                        )}
                      </TooltipContent>
                    )}
                  </Tooltip>
                  {hasMultiplier ? (
                    <span className="text-sm font-mono">
                      <span className="text-muted-foreground">{localWeights[key].toFixed(2)}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="text-primary font-semibold">{effectiveWeight.toFixed(2)}</span>
                    </span>
                  ) : (
                    <span className="text-sm font-mono text-primary">{localWeights[key].toFixed(2)}</span>
                  )}
                </div>

                {/* Slider - clean, no overlays */}
                <Slider
                  value={[localWeights[key]]}
                  onValueChange={([value]) => handleWeightChange(key, value)}
                  min={0}
                  max={1.5}
                  step={0.05}
                  className="w-full"
                />

                {/* Default value centered below */}
                <div className="text-center text-[10px] text-muted-foreground">
                  Default: {DEFAULT_WEIGHTS[key]}
                </div>
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </Card>
  );
}

export { DEFAULT_WEIGHTS };
