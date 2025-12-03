import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import { CRIS_WEIGHTS } from "@/lib/crisUtils";

export const CrisExplanation = () => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Info className="w-4 h-4" />
          <span>What is CRI / wCRI?</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2 p-4 bg-secondary/20 border-border text-sm space-y-3">
          <div>
            <p className="font-semibold text-primary">CRI = Category Ranking Index (Score)</p>
            <p className="text-muted-foreground">
              Higher CRI = stronger overall category performance.
            </p>
          </div>
          <div>
            <p className="font-semibold">How it's calculated:</p>
            <ol className="list-decimal list-inside text-muted-foreground space-y-1">
              <li>Rank each player/team in each of the 9 categories (rank 1 = best)</li>
              <li>Invert ranks: inverted = (N + 1) - rank</li>
              <li>CRI = sum of all inverted ranks (the point total)</li>
            </ol>
            <p className="text-muted-foreground mt-2">
              <strong>CRIS</strong> = CRI Standing (the rank position by CRI)
            </p>
          </div>
          <div>
            <p className="font-semibold text-primary">wCRI = Weighted CRI</p>
            <p className="text-muted-foreground mb-2">
              Applies category weights to emphasize more important stats:
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {Object.entries(CRIS_WEIGHTS).map(([cat, weight]) => (
                <div key={cat} className="flex justify-between bg-muted/30 rounded px-2 py-1">
                  <span>{cat.toUpperCase().replace('PCT', '%').replace('THREEPM', '3PM')}</span>
                  <span className="font-bold text-primary">{weight}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
};
