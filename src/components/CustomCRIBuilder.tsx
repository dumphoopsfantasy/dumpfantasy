import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Category definitions
const CATEGORIES = [
  { key: "points", label: "PTS" },
  { key: "threepm", label: "3PM" },
  { key: "rebounds", label: "REB" },
  { key: "assists", label: "AST" },
  { key: "steals", label: "STL" },
  { key: "blocks", label: "BLK" },
  { key: "fgPct", label: "FG%" },
  { key: "ftPct", label: "FT%" },
  { key: "turnovers", label: "TO" },
] as const;

export type CategoryKey = typeof CATEGORIES[number]["key"];

export interface CustomCRIConfig {
  selectedCategories: CategoryKey[];
  invertTO: boolean;
}

const STORAGE_KEY_CATS = "dumphoops.customCri.selectedCats";
const STORAGE_KEY_INVERT = "dumphoops.customCri.invertTO";

// Load from localStorage
function loadConfig(): CustomCRIConfig {
  try {
    const savedCats = localStorage.getItem(STORAGE_KEY_CATS);
    const savedInvert = localStorage.getItem(STORAGE_KEY_INVERT);
    return {
      selectedCategories: savedCats ? JSON.parse(savedCats) : [],
      invertTO: savedInvert !== null ? JSON.parse(savedInvert) : true,
    };
  } catch {
    return { selectedCategories: [], invertTO: true };
  }
}

// Save to localStorage
function saveConfig(config: CustomCRIConfig) {
  try {
    localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(config.selectedCategories));
    localStorage.setItem(STORAGE_KEY_INVERT, JSON.stringify(config.invertTO));
  } catch {
    // Ignore storage errors
  }
}

interface CustomCRIBuilderProps {
  onConfigChange: (config: CustomCRIConfig | null) => void;
}

export function CustomCRIBuilder({ onConfigChange }: CustomCRIBuilderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<CustomCRIConfig>(loadConfig);

  // On mount, notify parent if there are saved selections
  useEffect(() => {
    if (config.selectedCategories.length > 0) {
      onConfigChange(config);
    }
  }, []);

  const isActive = config.selectedCategories.length > 0;

  const toggleCategory = (key: CategoryKey) => {
    setConfig((prev) => {
      const isSelected = prev.selectedCategories.includes(key);
      const newCats = isSelected
        ? prev.selectedCategories.filter((k) => k !== key)
        : [...prev.selectedCategories, key];
      return { ...prev, selectedCategories: newCats };
    });
  };

  const handleApply = () => {
    saveConfig(config);
    if (config.selectedCategories.length > 0) {
      onConfigChange(config);
    } else {
      onConfigChange(null);
    }
  };

  const handleClear = () => {
    const cleared = { selectedCategories: [], invertTO: true };
    setConfig(cleared);
    saveConfig(cleared);
    onConfigChange(null);
  };

  const handleInvertToggle = (checked: boolean) => {
    setConfig((prev) => ({ ...prev, invertTO: checked }));
  };

  // Get label for active categories
  const activeLabels = useMemo(() => {
    return config.selectedCategories
      .map((key) => CATEGORIES.find((c) => c.key === key)?.label)
      .filter(Boolean)
      .join(", ");
  }, [config.selectedCategories]);

  return (
    <Card className="gradient-card border-border p-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-display font-bold text-sm">Custom CRI Builder</span>
              {isActive && (
                <Badge variant="secondary" className="text-[10px] bg-primary/20">
                  Active
                </Badge>
              )}
            </div>
            <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4 space-y-4">
          {/* Category chips */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Select categories to rank (My Roster only)
            </p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const isSelected = config.selectedCategories.includes(cat.key);
                const isTO = cat.key === "turnovers";
                return (
                  <Button
                    key={cat.key}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleCategory(cat.key)}
                    className={cn(
                      "text-xs h-7 px-3",
                      isSelected && "bg-primary text-primary-foreground",
                      isTO && !isSelected && "border-stat-negative/50 text-stat-negative"
                    )}
                  >
                    {cat.label}
                    {isTO && config.invertTO && (
                      <span className="ml-1 text-[9px] opacity-70">↓</span>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Toggle for TO inversion */}
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm">Invert TO (lower is better)</span>
            </div>
            <Switch
              checked={config.invertTO}
              onCheckedChange={handleInvertToggle}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={!isActive}
              className="text-xs"
            >
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={config.selectedCategories.length === 0}
              className="text-xs gradient-primary"
            >
              Apply to My Roster
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Active indicator outside collapsible */}
      {isActive && !isOpen && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground">
            <span className="text-primary font-medium">Custom Rank active:</span>{" "}
            {activeLabels} <span className="opacity-60">(My Roster only)</span>
          </p>
        </div>
      )}
    </Card>
  );
}

// Utility function to compute custom ranks for roster
export function computeCustomRanks(
  roster: Array<{ id: string; [key: string]: any }>,
  config: CustomCRIConfig
): Record<string, { customRank: number; customScore: number }> {
  if (config.selectedCategories.length === 0) {
    return {};
  }

  const N = roster.length;
  if (N === 0) return {};

  // For each selected category, compute ranks within roster
  const categoryRankPoints: Record<string, Record<string, number>> = {};

  config.selectedCategories.forEach((catKey) => {
    categoryRankPoints[catKey] = {};

    // Sort players by this category
    const sorted = [...roster].sort((a, b) => {
      const valA = a[catKey] as number | undefined;
      const valB = b[catKey] as number | undefined;

      // Handle undefined/null as worst
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      // For TO with invert ON: lower is better
      if (catKey === "turnovers" && config.invertTO) {
        return valA - valB; // Lower first
      }
      // For all others: higher is better
      return valB - valA;
    });

    // Assign rank points: best gets N, worst gets 1
    sorted.forEach((player, idx) => {
      categoryRankPoints[catKey][player.id] = N - idx;
    });
  });

  // Compute total score for each player
  const scores: Record<string, number> = {};
  roster.forEach((player) => {
    let score = 0;
    config.selectedCategories.forEach((catKey) => {
      score += categoryRankPoints[catKey][player.id] || 0;
    });
    scores[player.id] = score;
  });

  // Rank by score (higher = better)
  const sortedByScore = [...roster].sort((a, b) => {
    const diff = scores[b.id] - scores[a.id];
    if (diff !== 0) return diff;
    // Tie-breaker: alphabetical by name or id
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

  const result: Record<string, { customRank: number; customScore: number }> = {};
  sortedByScore.forEach((player, idx) => {
    result[player.id] = {
      customRank: idx + 1,
      customScore: scores[player.id],
    };
  });

  return result;
}