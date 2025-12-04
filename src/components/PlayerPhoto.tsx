import { useState, useEffect } from "react";
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

// Generate multiple fallback URLs to try
function getPhotoUrls(name: string, size: 'small' | 'medium'): string[] {
  const urls: string[] = [];
  
  // Primary: NBA.com CDN (via playerUtils)
  const nbaUrl = getPlayerPhotoUrl(name, size);
  if (nbaUrl !== '/placeholder.svg') {
    urls.push(nbaUrl);
  }
  
  // Fallback: Try alternate NBA.com dimensions
  const dimensions = size === 'small' ? '260x190' : '1040x760';
  
  // Generate a slug from the name for alternate lookups
  const nameParts = name.toLowerCase().split(' ');
  if (nameParts.length >= 2) {
    const firstName = nameParts[0].replace(/[^a-z]/g, '');
    const lastName = nameParts[nameParts.length - 1].replace(/[^a-z]/g, '');
    
    // Try stats.nba.com pattern (older format)
    urls.push(`https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/${dimensions}/${firstName}_${lastName}.png`);
  }
  
  return urls;
}

export const PlayerPhoto = ({ name, size = "md", className }: PlayerPhotoProps) => {
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [allFailed, setAllFailed] = useState(false);
  
  const photoSize = size === "sm" ? "small" : "medium";
  const urls = getPhotoUrls(name, photoSize);
  const initials = getPlayerInitials(name);

  // Reset state when name changes
  useEffect(() => {
    setCurrentUrlIndex(0);
    setAllFailed(false);
  }, [name]);

  const handleError = () => {
    if (currentUrlIndex < urls.length - 1) {
      setCurrentUrlIndex(currentUrlIndex + 1);
    } else {
      setAllFailed(true);
    }
  };

  if (allFailed || urls.length === 0) {
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
      src={urls[currentUrlIndex]}
      alt={name}
      onError={handleError}
      className={cn(
        "rounded-full object-cover bg-muted border-2 border-border",
        sizeClasses[size],
        className
      )}
    />
  );
};
