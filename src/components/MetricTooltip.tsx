/**
 * Metric Tooltip Component
 * Provides hover/tap explanations for confusing metrics.
 */

import { memo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTooltipContent, TooltipDefinition } from "@/lib/tooltipContent";

interface MetricTooltipProps {
  metricKey: string;
  className?: string;
  iconClassName?: string;
  children?: React.ReactNode;
  inline?: boolean;
}

export const MetricTooltip = memo(function MetricTooltip({
  metricKey,
  className,
  iconClassName,
  children,
  inline = false,
}: MetricTooltipProps) {
  const content = getTooltipContent(metricKey);

  if (!content) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={cn(
            "inline-flex items-center gap-1 cursor-help",
            inline && "align-middle",
            className
          )}>
            {children}
            <HelpCircle className={cn(
              "w-3 h-3 text-muted-foreground hover:text-foreground transition-colors",
              iconClassName
            )} />
          </span>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="max-w-[280px] p-3 space-y-1.5"
          sideOffset={5}
        >
          <p className="font-semibold text-sm">{content.title}</p>
          <p className="text-xs text-muted-foreground">{content.description}</p>
          <p className="text-xs text-primary">{content.whyCare}</p>
          {content.formula && (
            <p className="text-[10px] font-mono text-muted-foreground border-t border-border pt-1.5 mt-1.5">
              {content.formula}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

/**
 * Standalone tooltip icon for use in table headers
 */
interface MetricTooltipIconProps {
  metricKey: string;
  className?: string;
}

export const MetricTooltipIcon = memo(function MetricTooltipIcon({
  metricKey,
  className,
}: MetricTooltipIconProps) {
  return (
    <MetricTooltip metricKey={metricKey} iconClassName={className}>
      <span className="sr-only">Info</span>
    </MetricTooltip>
  );
});
