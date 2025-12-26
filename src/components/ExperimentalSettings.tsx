import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FlaskConical, ChevronDown, Zap, RotateCcw, Info } from "lucide-react";
import { DynamicWeightsSettings, DynamicMode, IntensityLevel } from "@/hooks/useDynamicWeights";

interface ExperimentalSettingsProps {
  settings: DynamicWeightsSettings;
  onEnabledChange: (enabled: boolean) => void;
  onModeChange: (mode: DynamicMode) => void;
  onIntensityChange: (intensity: IntensityLevel) => void;
  onSmoothingChange: (enabled: boolean) => void;
  onPuntDetectionChange: (enabled: boolean) => void;
  onResetSmoothing: () => void;
}

const INTENSITY_LABELS: Record<IntensityLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const INTENSITY_DESCRIPTIONS: Record<IntensityLevel, string> = {
  low: "Conservative — multipliers compressed toward 1.0",
  medium: "Balanced — use calculated multipliers as-is",
  high: "Aggressive — multipliers amplified for stronger adjustments",
};

export function ExperimentalSettings({
  settings,
  onEnabledChange,
  onModeChange,
  onIntensityChange,
  onSmoothingChange,
  onPuntDetectionChange,
  onResetSmoothing,
}: ExperimentalSettingsProps) {
  const intensityValue = settings.intensity === "low" ? 0 : settings.intensity === "medium" ? 1 : 2;
  
  const handleIntensitySlider = (value: number[]) => {
    const level: IntensityLevel = value[0] === 0 ? "low" : value[0] === 1 ? "medium" : "high";
    onIntensityChange(level);
  };
  
  return (
    <Card className="gradient-card border-border border-dashed border-2">
      <CardHeader>
        <div className="flex items-center gap-3">
          <FlaskConical className="w-5 h-5 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="font-display">Experimental</CardTitle>
              <Badge variant="outline" className="text-[10px]">Beta</Badge>
            </div>
            <CardDescription>Advanced features in testing</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dynamic wCRI Toggle */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <Label htmlFor="dynamic-wcri">Dynamic wCRI</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Automatically adjust category weights based on matchup outlook or standings
              </p>
            </div>
            <Switch
              id="dynamic-wcri"
              checked={settings.enabled}
              onCheckedChange={onEnabledChange}
            />
          </div>
          
          {/* Expanded settings when enabled */}
          {settings.enabled && (
            <div className="pl-6 border-l-2 border-primary/20 space-y-4">
              {/* Mode Selection */}
              <div className="space-y-2">
                <Label className="text-sm">Mode</Label>
                <Select value={settings.mode} onValueChange={(v) => onModeChange(v as DynamicMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="matchup">
                      <div className="flex flex-col items-start">
                        <span>Matchup Mode</span>
                        <span className="text-[10px] text-muted-foreground">Optimize to win this week's matchup</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="standings">
                      <div className="flex flex-col items-start">
                        <span>Standings Mode</span>
                        <span className="text-[10px] text-muted-foreground">Optimize for season standings points</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Intensity Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Intensity</Label>
                  <span className="text-xs font-medium text-primary">{INTENSITY_LABELS[settings.intensity]}</span>
                </div>
                <Slider
                  value={[intensityValue]}
                  onValueChange={handleIntensitySlider}
                  min={0}
                  max={2}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Low</span>
                  <span>Medium</span>
                  <span>High</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {INTENSITY_DESCRIPTIONS[settings.intensity]}
                </p>
              </div>
              
              {/* Smoothing Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="smoothing" className="text-sm">Smoothing</Label>
                  <p className="text-[10px] text-muted-foreground">
                    Dampen day-to-day weight swings (recommended)
                  </p>
                </div>
                <Switch
                  id="smoothing"
                  checked={settings.smoothingEnabled}
                  onCheckedChange={onSmoothingChange}
                />
              </div>
              
              {/* Punt Detection (Standings mode only) */}
              {settings.mode === "standings" && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="punt-detection" className="text-sm">Allow Punt Detection</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Reduce weight on categories you're far behind in
                    </p>
                  </div>
                  <Switch
                    id="punt-detection"
                    checked={settings.allowPuntDetection}
                    onCheckedChange={onPuntDetectionChange}
                  />
                </div>
              )}
              
              {/* Reset Smoothing */}
              <Button
                variant="outline"
                size="sm"
                onClick={onResetSmoothing}
                className="w-full text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset Smoothing History
              </Button>
              
              {/* Info Collapsible */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full text-xs gap-1">
                    <Info className="w-3 h-3" />
                    How does this work?
                    <ChevronDown className="w-3 h-3 ml-auto" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-3 bg-accent/10 rounded-md text-xs space-y-2">
                    <p>
                      <strong>Dynamic wCRI</strong> applies multipliers to your base weights:
                    </p>
                    <code className="block bg-background/50 p-1 rounded text-[10px]">
                      effectiveWeight = baseWeight × needMultiplier
                    </code>
                    <p className="text-muted-foreground">
                      In <strong>Matchup Mode</strong>, categories you're losing get boosted (up to 1.5×),
                      while locked wins get reduced (down to 0.25×).
                    </p>
                    <p className="text-muted-foreground">
                      In <strong>Standings Mode</strong>, categories where you can gain standings points
                      get boosted, while categories where you're already dominant or punting get reduced.
                    </p>
                    <p className="text-muted-foreground">
                      Your base slider weights are preserved — dynamic adjustments layer on top.
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
