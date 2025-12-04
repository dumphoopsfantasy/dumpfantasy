import { cn } from "@/lib/utils";

interface StatBadgeProps {
  label: string;
  value: string | number;
  size?: "xs" | "sm" | "md";
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
        size === "xs" ? "min-w-[32px]" : size === "sm" ? "min-w-[40px]" : "min-w-[50px]",
        className
      )}
    >
      <p className={cn(
        "uppercase tracking-wider text-muted-foreground font-medium",
        size === "xs" ? "text-[8px]" : "text-[10px]"
      )}>
        {label}
      </p>
      <p
        className={cn(
          "font-display font-bold",
          size === "xs" ? "text-xs" : size === "sm" ? "text-sm" : "text-base",
          valueColor
        )}
      >
        {value}
      </p>
    </div>
  );
};