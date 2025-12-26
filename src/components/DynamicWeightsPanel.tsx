import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Zap, Info, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useState } from "react";
import { EffectiveWeightsResult, CATEGORY_LABELS, DynamicMode } from "@/lib/dynamicWeights";

interface DynamicWeightsPanelProps {
  result: EffectiveWeightsResult;
  compact?: boolean;
  className?: string;
}

export function DynamicWeightsPanel({ result, compact = false, className }: DynamicWeightsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!result.isActive) {
    return null;
  }
  
  const categoryKeys = Object.keys(result.details);
  
  if (compact) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("text-xs gap-1 h-6 px-2", className)}
          >
            <Zap className="w-3 h-3 text-primary" />
            <span>Dynamic weights active</span>
            {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 p-2 bg-accent/20 rounded-md">
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <span className="font-semibold">Cat</span>
              <span className="font-semibold text-right">Base</span>
              <span className="font-semibold text-right">Eff</span>
              {categoryKeys.map((key) => {
                const detail = result.details[key];
                const mult = detail.needMultiplier;
                return (
                  <div key={key} className="contents">
                    <span>{CATEGORY_LABELS[key] || key}</span>
                    <span className="text-right text-muted-foreground">{detail.baseWeight.toFixed(2)}</span>
                    <span className={cn(
                      "text-right font-mono",
                      mult > 1.1 ? "text-stat-positive" : mult < 0.9 ? "text-stat-negative" : ""
                    )}>
                      {detail.effectiveWeight.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }
  
  return (
    <Card className={cn("gradient-card border-border p-4", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-primary" />
        <h4 className="font-display font-bold text-sm">Dynamic Weights Active</h4>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {result.mode === "matchup" ? "Matchup Mode" : "Standings Mode"}
        </Badge>
      </div>
      
      <p className="text-xs text-muted-foreground mb-3">
        Weights adjusted based on {result.mode === "matchup" ? "current matchup outlook" : "league standings"}.
      </p>
      
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 font-semibold">Category</th>
              <th className="text-right py-1.5 font-semibold">Base</th>
              <th className="text-right py-1.5 font-semibold">×</th>
              <th className="text-right py-1.5 font-semibold">Effective</th>
              <th className="text-left py-1.5 pl-3 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            {categoryKeys.map((key) => {
              const detail = result.details[key];
              const mult = detail.needMultiplier;
              const trend = mult > 1.05 ? "up" : mult < 0.95 ? "down" : "neutral";
              
              return (
                <tr key={key} className="border-b border-border/50 hover:bg-accent/10">
                  <td className="py-1.5 font-medium">{CATEGORY_LABELS[key] || key}</td>
                  <td className="text-right py-1.5 font-mono text-muted-foreground">
                    {detail.baseWeight.toFixed(2)}
                  </td>
                  <td className="text-right py-1.5">
                    <span className={cn(
                      "font-mono inline-flex items-center gap-0.5",
                      trend === "up" && "text-stat-positive",
                      trend === "down" && "text-stat-negative",
                    )}>
                      {trend === "up" && <TrendingUp className="w-3 h-3" />}
                      {trend === "down" && <TrendingDown className="w-3 h-3" />}
                      {trend === "neutral" && <Minus className="w-3 h-3 text-muted-foreground" />}
                      {mult.toFixed(2)}
                    </span>
                  </td>
                  <td className={cn(
                    "text-right py-1.5 font-mono font-semibold",
                    trend === "up" && "text-stat-positive",
                    trend === "down" && "text-stat-negative",
                  )}>
                    {detail.effectiveWeight.toFixed(2)}
                  </td>
                  <td className="py-1.5 pl-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground">{detail.reason}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Mode Input Details */}
      <Collapsible className="mt-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full text-xs gap-1">
            <Info className="w-3 h-3" />
            View calculation details
            <ChevronDown className="w-3 h-3 ml-auto" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-1 text-[10px] bg-accent/10 p-2 rounded-md">
            {categoryKeys.map((key) => {
              const detail = result.details[key];
              return (
                <div key={key} className="flex justify-between gap-2">
                  <span className="font-medium">{CATEGORY_LABELS[key] || key}:</span>
                  <span className="text-muted-foreground truncate">{detail.modeInput}</span>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Compact inline indicator for use in headers
export function DynamicWeightsIndicator({ 
  isActive, 
  mode,
  onClick 
}: { 
  isActive: boolean; 
  mode: DynamicMode;
  onClick?: () => void;
}) {
  if (!isActive) return null;
  
  return (
    <Badge 
      variant="secondary" 
      className="text-[10px] gap-1 cursor-pointer hover:bg-accent"
      onClick={onClick}
    >
      <Zap className="w-3 h-3 text-primary" />
      Dynamic {mode === "matchup" ? "Matchup" : "Standings"}
    </Badge>
  );
}
