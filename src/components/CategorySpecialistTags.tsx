/**
 * Category Specialist Tags Component
 * Renders compact tags showing player strengths.
 */

import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildCategoryTags } from "@/lib/playerSpecialistTags";

interface CategorySpecialistTagsProps {
  stats: {
    points?: number;
    threepm?: number;
    rebounds?: number;
    assists?: number;
    steals?: number;
    blocks?: number;
    turnovers?: number;
    fgPct?: number;
    ftPct?: number;
    fga?: number;
    fta?: number;
    positions?: string[];
  };
  className?: string;
}

// Color map for different tag types
const TAG_COLORS: Record<string, string> = {
  "Scoring": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "3s": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Reb": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Ast": "bg-green-500/15 text-green-400 border-green-500/30",
  "Stocks": "bg-red-500/15 text-red-400 border-red-500/30",
  "Low TO": "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "FG%": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "FT%": "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

export const CategorySpecialistTags = memo(function CategorySpecialistTags({
  stats,
  className,
}: CategorySpecialistTagsProps) {
  const tags = useMemo(() => buildCategoryTags(stats), [stats]);

  if (tags.length === 0) return null;

  return (
    <div className={cn("flex gap-0.5 flex-wrap", className)}>
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className={cn(
            "text-[8px] px-1 py-0 font-medium",
            TAG_COLORS[tag] || "bg-muted/30 text-muted-foreground border-muted-foreground/30"
          )}
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
});
