// Theme utility functions for accessible color handling

/**
 * Get relative luminance of an HSL color
 * @param h Hue (0-360)
 * @param s Saturation (0-100)
 * @param l Lightness (0-100)
 */
export function getLuminance(h: number, s: number, l: number): number {
  // Convert HSL to RGB
  const sNorm = s / 100;
  const lNorm = l / 100;
  
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lNorm - c / 2;
  
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  
  r = (r + m);
  g = (g + m);
  b = (b + m);
  
  // Calculate relative luminance (sRGB)
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Returns 'light' or 'dark' text color based on background luminance
 */
export function getReadableTextColor(h: number, s: number, l: number): 'light' | 'dark' {
  const luminance = getLuminance(h, s, l);
  return luminance > 0.4 ? 'dark' : 'light';
}

/**
 * Create safe accent variants for UI elements
 */
export function createAccentVariants(h: number, s: number, l: number) {
  return {
    // Soft background: low alpha for subtle tinting
    softBg: `${h} ${Math.min(s, 60)}% ${l}% / 0.12`,
    // Medium alpha for borders
    border: `${h} ${Math.min(s, 60)}% ${l}% / 0.35`,
    // Hover state: slightly more visible
    hover: `${h} ${Math.min(s, 60)}% ${l}% / 0.18`,
    // Selected state: more prominent but still readable
    selected: `${h} ${Math.min(s, 50)}% ${l}% / 0.25`,
    // For pills/badges: capped alpha to ensure readability
    pillBg: `${h} ${Math.min(s, 70)}% ${l}% / 0.22`,
    // Full color for icons, small accents
    solid: `${h} ${s}% ${l}%`,
  };
}

/**
 * Parse HSL string "h s% l%" to components
 */
export function parseHSL(hslString: string): { h: number; s: number; l: number } | null {
  const match = hslString.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!match) return null;
  return {
    h: parseInt(match[1]),
    s: parseInt(match[2]),
    l: parseInt(match[3]),
  };
}
