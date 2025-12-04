import { useState } from "react";
import { getNBATeamLogo } from "@/lib/teamLogos";
import { cn } from "@/lib/utils";

interface NBATeamLogoProps {
  teamCode: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  xs: "w-4 h-4",
  sm: "w-6 h-6",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

export const NBATeamLogo = ({ teamCode, size = "md", className }: NBATeamLogoProps) => {
  const [error, setError] = useState(false);
  const logoUrl = getNBATeamLogo(teamCode);

  if (error || logoUrl === '/placeholder.svg') {
    return (
      <div
        className={cn(
          "rounded bg-muted flex items-center justify-center font-display font-bold text-xs text-muted-foreground",
          sizeClasses[size],
          className
        )}
      >
        {teamCode.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={teamCode}
      onError={() => setError(true)}
      className={cn(sizeClasses[size], "object-contain", className)}
    />
  );
};
