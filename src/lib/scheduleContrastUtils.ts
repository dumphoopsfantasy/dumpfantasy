/**
 * Schedule Contrast Utilities
 * Ensures readable text colors on schedule UI elements regardless of theme.
 */

/**
 * Parse a CSS color string to RGB values
 */
function parseColor(color: string): { r: number; g: number; b: number } | null {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  
  // Handle rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }
  
  // Handle hsl (approximate conversion)
  const hslMatch = color.match(/hsla?\((\d+),\s*([\d.]+)%,\s*([\d.]+)%/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }
  
  return null;
}

/**
 * Calculate relative luminance (WCAG formula)
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 */
function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ContrastMode = "normal" | "highContrast";

export interface ReadableTextStyle {
  textColor: string;
  textShadow?: string;
  overlayBg?: string;
  fontWeight?: string;
}

/**
 * Get readable text color and optional overlay for a background color
 */
export function getReadableTextColor(
  bgColor: string,
  mode: ContrastMode = "normal"
): ReadableTextStyle {
  const rgb = parseColor(bgColor);
  
  if (!rgb) {
    // Fallback for unparseable colors
    return {
      textColor: "hsl(var(--foreground))",
    };
  }
  
  const bgLuminance = getLuminance(rgb.r, rgb.g, rgb.b);
  const whiteLuminance = 1;
  const blackLuminance = 0;
  
  const whiteContrast = getContrastRatio(bgLuminance, whiteLuminance);
  const blackContrast = getContrastRatio(bgLuminance, blackLuminance);
  
  const minContrast = mode === "highContrast" ? 7 : 4.5;
  
  // Prefer white text on dark backgrounds, black on light
  const useWhite = whiteContrast >= blackContrast;
  const bestContrast = Math.max(whiteContrast, blackContrast);
  
  const result: ReadableTextStyle = {
    textColor: useWhite ? "#FFFFFF" : "#000000",
  };
  
  // Add enhancements if contrast is insufficient
  if (bestContrast < minContrast) {
    if (mode === "highContrast") {
      // Add overlay and shadow for high contrast mode
      result.overlayBg = useWhite ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)";
      result.textShadow = useWhite 
        ? "0 1px 2px rgba(0,0,0,0.5)" 
        : "0 1px 2px rgba(255,255,255,0.5)";
      result.fontWeight = "600";
    } else {
      // Normal mode: just add subtle shadow
      result.textShadow = useWhite 
        ? "0 1px 2px rgba(0,0,0,0.3)" 
        : "0 1px 2px rgba(255,255,255,0.3)";
    }
  }
  
  return result;
}

/**
 * Check if current theme needs contrast enhancement for schedule UI
 */
export function shouldEnhanceContrast(primaryColor: string): boolean {
  const rgb = parseColor(primaryColor);
  if (!rgb) return false;
  
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  
  // Colors in the "problematic" luminance range (not very dark, not very light)
  // These are hardest to read against
  return luminance > 0.15 && luminance < 0.7;
}
