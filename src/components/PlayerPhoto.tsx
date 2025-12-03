import { useState } from "react";
import { getPlayerPhotoUrl, getPlayerInitials } from "@/lib/playerUtils";
import { cn } from "@/lib/utils";

interface PlayerPhotoProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "w-10 h-10 text-xs",
  md: "w-14 h-14 text-sm",
  lg: "w-20 h-20 text-base",
  xl: "w-32 h-32 text-xl",
};

export const PlayerPhoto = ({ name, size = "md", className }: PlayerPhotoProps) => {
  const [imageError, setImageError] = useState(false);
  const photoUrl = getPlayerPhotoUrl(name, size === "sm" ? "small" : "medium");
  const initials = getPlayerInitials(name);

  if (imageError || photoUrl === '/placeholder.svg') {
    return (
      <div
        className={cn(
          "rounded-full bg-gradient-to-br from-secondary to-muted flex items-center justify-center font-display font-bold text-muted-foreground border-2 border-border",
          sizeClasses[size],
          className
        )}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={name}
      onError={() => setImageError(true)}
      className={cn(
        "rounded-full object-cover bg-muted border-2 border-border",
        sizeClasses[size],
        className
      )}
    />
  );
};