import React from 'react';
import { Badge } from '@/components/ui/badge';
import { SlateStatus } from '@/lib/slateAwareProjection';
import { formatAsOfTime } from '@/lib/projectionFormatters';
import { Clock, Play, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SlateStatusBadgeProps {
  slateStatus: SlateStatus | null;
  explanation?: string;
  className?: string;
}

export function SlateStatusBadge({ slateStatus, explanation, className }: SlateStatusBadgeProps) {
  if (!slateStatus) {
    return null;
  }
  
  const { notStarted, inProgress, final, totalGames, asOfTime } = slateStatus;
  
  // No games today
  if (totalGames === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Clock className="w-3 h-3" />
        <span>No games today</span>
      </div>
    );
  }
  
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px] flex items-center gap-1">
          <Clock className="w-3 h-3" />
          As of {asOfTime}
        </Badge>
        
        {notStarted > 0 && (
          <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
            <Circle className="w-2.5 h-2.5" />
            {notStarted} not started
          </Badge>
        )}
        
        {inProgress > 0 && (
          <Badge className="text-[10px] flex items-center gap-1 bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
            <Play className="w-2.5 h-2.5" />
            {inProgress} in progress
          </Badge>
        )}
        
        {final > 0 && (
          <Badge variant="outline" className="text-[10px] flex items-center gap-1 border-green-500/30 text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {final} final
          </Badge>
        )}
      </div>
      
      {explanation && (
        <p className="text-[10px] text-muted-foreground mt-1">
          {explanation}
        </p>
      )}
    </div>
  );
}
