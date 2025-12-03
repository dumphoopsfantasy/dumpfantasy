import { cn } from "@/lib/utils";

interface StatBadgeProps {
  label: string;
  value: string | number;
  size?: "sm" | "md";
  highlight?: boolean;
  positive?: boolean;
  negative?: boolean;
  className?: string;
}

export const StatBadge = ({
  label,
  value,
  size = "md",
  highlight,
  positive,
  negative,
  className,
}: StatBadgeProps) => {
  const valueColor = positive
    ? "text-stat-positive"
    : negative
    ? "text-stat-negative"
    : highlight
    ? "text-primary"
    : "text-foreground";

  return (
    <div
      className={cn(
        "text-center",
        size === "sm" ? "min-w-[40px]" : "min-w-[50px]",
        className
      )}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </p>
      <p
        className={cn(
          "font-display font-bold",
          size === "sm" ? "text-sm" : "text-base",
          valueColor
        )}
      >
        {value}
      </p>
    </div>
  );
};