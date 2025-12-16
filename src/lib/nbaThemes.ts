// NBA Team Theme Presets
export interface NBATheme {
  team: string;
  abbr: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const NBA_THEMES: NBATheme[] = [
  { team: "Default (Basketball Orange)", abbr: "DEF", primary: "#F97316", secondary: "#1E3A5F", accent: "#F97316" },
  { team: "Atlanta Hawks", abbr: "ATL", primary: "#E03A3E", secondary: "#C1D32F", accent: "#26282A" },
  { team: "Boston Celtics", abbr: "BOS", primary: "#007A33", secondary: "#BA9653", accent: "#000000" },
  { team: "Brooklyn Nets", abbr: "BKN", primary: "#000000", secondary: "#FFFFFF", accent: "#75787B" },
  { team: "Charlotte Hornets", abbr: "CHA", primary: "#1D1160", secondary: "#00788C", accent: "#A1A1A4" },
  { team: "Chicago Bulls", abbr: "CHI", primary: "#CE1141", secondary: "#000000", accent: "#FFFFFF" },
  { team: "Cleveland Cavaliers", abbr: "CLE", primary: "#6F263D", secondary: "#FFB81C", accent: "#041E42" },
  { team: "Dallas Mavericks", abbr: "DAL", primary: "#00538C", secondary: "#B8C4CA", accent: "#002B5E" },
  { team: "Denver Nuggets", abbr: "DEN", primary: "#0E2240", secondary: "#FEC524", accent: "#8B2131" },
  { team: "Detroit Pistons", abbr: "DET", primary: "#C8102E", secondary: "#1D42BA", accent: "#BEC0C2" },
  { team: "Golden State Warriors", abbr: "GSW", primary: "#1D428A", secondary: "#FFC72C", accent: "#26282A" },
  { team: "Houston Rockets", abbr: "HOU", primary: "#CE1141", secondary: "#000000", accent: "#C4CED4" },
  { team: "Indiana Pacers", abbr: "IND", primary: "#002D62", secondary: "#FDBB30", accent: "#BEC0C2" },
  { team: "LA Clippers", abbr: "LAC", primary: "#C8102E", secondary: "#1D428A", accent: "#BEC0C2" },
  { team: "Los Angeles Lakers", abbr: "LAL", primary: "#552583", secondary: "#FDB927", accent: "#000000" },
  { team: "Memphis Grizzlies", abbr: "MEM", primary: "#5D76A9", secondary: "#12173F", accent: "#F5B112" },
  { team: "Miami Heat", abbr: "MIA", primary: "#98002E", secondary: "#F9A01B", accent: "#000000" },
  { team: "Milwaukee Bucks", abbr: "MIL", primary: "#00471B", secondary: "#EEE1C6", accent: "#0077C0" },
  { team: "Minnesota Timberwolves", abbr: "MIN", primary: "#0C2340", secondary: "#78BE20", accent: "#236192" },
  { team: "New Orleans Pelicans", abbr: "NOP", primary: "#0C2340", secondary: "#C8102E", accent: "#85714D" },
  { team: "New York Knicks", abbr: "NYK", primary: "#006BB6", secondary: "#F58426", accent: "#BEC0C2" },
  { team: "Oklahoma City Thunder", abbr: "OKC", primary: "#007AC1", secondary: "#EF3B24", accent: "#FDBB30" },
  { team: "Orlando Magic", abbr: "ORL", primary: "#0077C0", secondary: "#C4CED4", accent: "#000000" },
  { team: "Philadelphia 76ers", abbr: "PHI", primary: "#006BB6", secondary: "#ED174C", accent: "#002B5C" },
  { team: "Phoenix Suns", abbr: "PHX", primary: "#1D1160", secondary: "#E56020", accent: "#000000" },
  { team: "Portland Trail Blazers", abbr: "POR", primary: "#E03A3E", secondary: "#000000", accent: "#FFFFFF" },
  { team: "Sacramento Kings", abbr: "SAC", primary: "#5A2D81", secondary: "#63727A", accent: "#000000" },
  { team: "San Antonio Spurs", abbr: "SAS", primary: "#000000", secondary: "#C4CED4", accent: "#FFFFFF" },
  { team: "Toronto Raptors", abbr: "TOR", primary: "#CE1141", secondary: "#000000", accent: "#A1A1A4" },
  { team: "Utah Jazz", abbr: "UTA", primary: "#002B5C", secondary: "#F9A01B", accent: "#00471B" },
  { team: "Washington Wizards", abbr: "WAS", primary: "#002B5C", secondary: "#E31837", accent: "#C4CED4" },
];

// Convert hex to HSL
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 0 };
  
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Apply theme to CSS variables
export function applyTheme(theme: NBATheme): void {
  const primary = hexToHSL(theme.primary);
  const secondary = hexToHSL(theme.secondary);
  const accent = hexToHSL(theme.accent);
  
  const root = document.documentElement;
  
  // Primary color
  root.style.setProperty('--primary', `${primary.h} ${primary.s}% ${primary.l}%`);
  root.style.setProperty('--accent', `${accent.h} ${accent.s}% ${accent.l}%`);
  root.style.setProperty('--ring', `${primary.h} ${primary.s}% ${primary.l}%`);
  
  // Secondary - use for card backgrounds and secondary elements
  root.style.setProperty('--secondary', `${secondary.h} ${Math.min(secondary.s, 33)}% ${Math.max(17, Math.min(secondary.l, 25))}%`);
  
  // Background - derive from secondary with very dark luminosity
  const bgHue = secondary.h;
  const bgSat = Math.min(secondary.s, 50);
  const bgLight = 6; // Keep it dark but tinted
  root.style.setProperty('--background', `${bgHue} ${bgSat}% ${bgLight}%`);
  
  // Card background - slightly lighter than background
  root.style.setProperty('--card', `${bgHue} ${bgSat}% 9%`);
  root.style.setProperty('--popover', `${bgHue} ${bgSat}% 9%`);
  
  // Muted colors based on theme
  root.style.setProperty('--muted', `${bgHue} ${Math.min(bgSat, 33)}% 14%`);
  root.style.setProperty('--border', `${bgHue} ${Math.min(bgSat, 33)}% 17%`);
  root.style.setProperty('--input', `${bgHue} ${Math.min(bgSat, 33)}% 17%`);
  
  // Update gradients
  const primaryDarker = { ...primary, l: Math.max(primary.l - 8, 30) };
  root.style.setProperty('--gradient-primary', 
    `linear-gradient(135deg, hsl(${primary.h} ${primary.s}% ${primary.l}%) 0%, hsl(${primaryDarker.h} ${primaryDarker.s}% ${primaryDarker.l}%) 100%)`
  );
  root.style.setProperty('--gradient-card', 
    `linear-gradient(165deg, hsl(${bgHue} ${bgSat}% 11%) 0%, hsl(${bgHue} ${bgSat}% 7%) 100%)`
  );
  root.style.setProperty('--shadow-glow', `0 0 60px hsl(${primary.h} ${primary.s}% ${primary.l}% / 0.15)`);
}

// Reset to default theme
export function resetTheme(): void {
  const root = document.documentElement;
  
  root.style.setProperty('--primary', '25 95% 53%');
  root.style.setProperty('--accent', '25 95% 53%');
  root.style.setProperty('--ring', '25 95% 53%');
  root.style.setProperty('--secondary', '217 33% 17%');
  root.style.setProperty('--background', '222 47% 6%');
  root.style.setProperty('--card', '222 47% 9%');
  root.style.setProperty('--popover', '222 47% 9%');
  root.style.setProperty('--muted', '217 33% 14%');
  root.style.setProperty('--border', '217 33% 17%');
  root.style.setProperty('--input', '217 33% 17%');
  root.style.setProperty('--gradient-primary', 'linear-gradient(135deg, hsl(25 95% 53%) 0%, hsl(15 90% 45%) 100%)');
  root.style.setProperty('--gradient-card', 'linear-gradient(165deg, hsl(222 47% 11%) 0%, hsl(222 47% 7%) 100%)');
  root.style.setProperty('--shadow-glow', '0 0 60px hsl(25 95% 53% / 0.15)');
}

// Get saved theme
export function getSavedTheme(): NBATheme | null {
  const saved = localStorage.getItem('dumpHoopsTheme');
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

// Save theme
export function saveTheme(theme: NBATheme): void {
  localStorage.setItem('dumpHoopsTheme', JSON.stringify(theme));
}

// Clear saved theme
export function clearSavedTheme(): void {
  localStorage.removeItem('dumpHoopsTheme');
}
