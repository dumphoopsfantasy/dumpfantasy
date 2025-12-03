import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CrisToggleProps {
  useCris: boolean;
  onChange: (useCris: boolean) => void;
}

export const CrisToggle = ({ useCris, onChange }: CrisToggleProps) => {
  return (
    <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded-lg">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "font-display font-bold text-xs px-3",
          useCris && "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        onClick={() => onChange(true)}
      >
        CRIS
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "font-display font-bold text-xs px-3",
          !useCris && "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        onClick={() => onChange(false)}
      >
        wCRIS
      </Button>
    </div>
  );
};
