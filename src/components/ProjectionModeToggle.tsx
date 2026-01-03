/**
 * Projection Mode Toggle Component
 * 
 * Allows switching between:
 * - Strength (Per-40): Normalized projection ignoring schedule
 * - Week Outcome (Schedule-aware): Projects based on actual games
 */

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart3, CalendarCheck } from "lucide-react";

export type ProjectionMode = 'strength' | 'schedule';

interface ProjectionModeToggleProps {
  mode: ProjectionMode;
  onModeChange: (mode: ProjectionMode) => void;
  disabled?: boolean;
}

export function ProjectionModeToggle({ mode, onModeChange, disabled }: ProjectionModeToggleProps) {
  return (
    <TooltipProvider>
      <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onModeChange('strength')}
              disabled={disabled}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                mode === 'strength'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Strength (Per-40)</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium">Normalized Strength Comparison</p>
            <p className="text-xs text-muted-foreground mt-1">
              Compares team quality by projecting stats over 40 games. Ignores actual schedule and lineup decisions. 
              Best for evaluating raw team strength.
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onModeChange('schedule')}
              disabled={disabled}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                mode === 'schedule'
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>Week Outcome</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium">Schedule-Aware Projection</p>
            <p className="text-xs text-muted-foreground mt-1">
              Projects actual week totals based on NBA schedule, lineup slot constraints, and injury status. 
              Accounts for benched players and empty slots.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
