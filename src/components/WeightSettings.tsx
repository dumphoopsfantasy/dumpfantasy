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
          <h3 className="font-display font-bold">wCRI Weights</h3>
          {!isDefault && (
            <Badge variant="secondary" className="text-[10px]">Custom</Badge>
          )}
          {dynamicActive && (
            <Badge variant="outline" className="text-[10px] gap-1 border-primary/50 bg-primary/10">
              <Zap className="w-3 h-3 text-primary" />
              Dynamic Active
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
            Reset
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
        {dynamicActive 
          ? "Sliders set base weights. Dynamic mode applies multipliers based on your matchup/standings data."
          : "Adjust the importance of each category in wCRI calculations. Higher weight = more impact on score."
        }
      </p>

      {/* Header row when dynamic is active */}
      {dynamicActive && (
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 mb-3 px-1 text-[10px] text-muted-foreground font-medium">
          <span>Category</span>
          <span className="w-14 text-center">Base</span>
          <span className="w-14 text-center">Mult</span>
          <span className="w-14 text-center">Effective</span>
        </div>
      )}

      <TooltipProvider>
        <div className="space-y-4">
          {(Object.keys(CATEGORY_LABELS) as Array<keyof CustomWeights>).map((key) => {
            const detail = effectiveWeightsResult?.details[key];
            const multiplier = detail?.needMultiplier ?? 1;
            const effectiveWeight = detail?.effectiveWeight ?? localWeights[key];

            return (
              <div key={key} className="space-y-2">
                {/* Category header with values */}
                <div className={`flex items-center ${dynamicActive ? 'grid grid-cols-[1fr_auto_auto_auto] gap-2' : 'justify-between'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{CATEGORY_LABELS[key]}</span>
                    {dynamicActive && detail?.reason && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                            {detail.reason}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">{detail.modeInput}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  
                  {dynamicActive ? (
                    <>
                      <span className="w-14 text-center text-sm font-mono text-muted-foreground">
                        {localWeights[key].toFixed(2)}
                      </span>
                      <div className="w-14 flex items-center justify-center gap-1">
                        {getMultiplierIcon(multiplier)}
                        <span className={`text-xs font-mono ${
                          multiplier > 1.05 ? 'text-stat-positive' : 
                          multiplier < 0.95 ? 'text-stat-negative' : 
                          'text-muted-foreground'
                        }`}>
                          {formatMultiplier(multiplier)}
                        </span>
                      </div>
                      <span className="w-14 text-center text-sm font-mono text-primary font-semibold">
                        {effectiveWeight.toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-mono text-primary">{localWeights[key].toFixed(2)}</span>
                  )}
                </div>

                {/* Slider */}
                <div className="relative">
                  <Slider
                    value={[localWeights[key]]}
                    onValueChange={([value]) => handleWeightChange(key, value)}
                    min={0}
                    max={1.5}
                    step={0.05}
                    className="w-full"
                  />
                  {/* Effective weight marker when dynamic is active */}
                  {dynamicActive && Math.abs(effectiveWeight - localWeights[key]) > 0.02 && (
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-primary/60 rounded-full pointer-events-none"
                      style={{ 
                        left: `${Math.min(100, Math.max(0, (effectiveWeight / 1.5) * 100))}%`,
                        marginLeft: '-2px'
                      }}
                    />
                  )}
                </div>

                {/* Footer with range indicators */}
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0</span>
                  <span className="text-primary/50">Default: {DEFAULT_WEIGHTS[key]}</span>
                  <span>1.5</span>
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
