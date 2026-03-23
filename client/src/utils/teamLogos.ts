const TEAM_LOGOS: Record<string, string> = {
  CSK: "/teams/CSK.png",
  DC: "/teams/DC.png",
  GT: "/teams/GT.png",
  KKR: "/teams/KKR.png",
  LSG: "/teams/LSG.png",
  MI: "/teams/MI.png",
  PBKS: "/teams/PBKS.png",
  RCB: "/teams/RCB.png",
  RR: "/teams/RR.png",
  SRH: "/teams/SRH.png",
};

const TEAM_ALIASES: Record<string, keyof typeof TEAM_LOGOS> = {
  "CHENNAI SUPER KINGS": "CSK",
  "DELHI CAPITALS": "DC",
  "GUJARAT TITANS": "GT",
  "KOLKATA KNIGHT RIDERS": "KKR",
  "LUCKNOW SUPER GIANTS": "LSG",
  "MUMBAI INDIANS": "MI",
  "PUNJAB KINGS": "PBKS",
  "PUNJAB KINGS XI": "PBKS",
  "ROYAL CHALLENGERS BENGALURU": "RCB",
  "ROYAL CHALLENGERS BANGALORE": "RCB",
  "RAJASTHAN ROYALS": "RR",
  "SUNRISERS HYDERABAD": "SRH",
};

const TEAM_LOGO_VISUAL_SCALE: Record<string, number> = {
  CSK: 1.0,
  DC: 1.0,
  GT: 1.02,
  KKR: 1.08,
  LSG: 1.16,
  MI: 1.08,
  PBKS: 1.04,
  RCB: 1.1,
  RR: 1.28,
  SRH: 1.08,
};

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function resolveTeamShortName(shortName?: string | null, teamName?: string | null): string {
  const normalizedShort = normalizeKey(shortName);
  if (normalizedShort && TEAM_LOGOS[normalizedShort]) return normalizedShort;

  const normalizedName = normalizeKey(teamName);
  if (normalizedName && TEAM_ALIASES[normalizedName]) return TEAM_ALIASES[normalizedName];

  return normalizedShort || normalizedName;
}

export function getTeamLogo(shortName?: string | null, teamName?: string | null): string | null {
  const resolved = resolveTeamShortName(shortName, teamName);
  return TEAM_LOGOS[resolved] ?? null;
}

export function getTeamLogoVisualScale(shortName?: string | null, teamName?: string | null): number {
  const resolved = resolveTeamShortName(shortName, teamName);
  return TEAM_LOGO_VISUAL_SCALE[resolved] ?? 1;
}

/** Unique static logo URLs under `/public/teams/` — safe to warm cache early. */
export const ALL_TEAM_LOGO_URLS: readonly string[] = Object.freeze([...new Set(Object.values(TEAM_LOGOS))]);

let prefetchStarted = false;

/**
 * Start loading all team PNGs during idle time so list/detail views hit HTTP cache.
 * Call once from app bootstrap (e.g. main.tsx).
 */
export function prefetchAllTeamLogos(): void {
  if (typeof window === "undefined" || prefetchStarted) return;
  prefetchStarted = true;

  const run = () => {
    for (const href of ALL_TEAM_LOGO_URLS) {
      const img = new Image();
      img.decoding = "async";
      img.src = href;
    }
  };

  // After current stack — warms HTTP cache before user opens match list/detail.
  queueMicrotask(run);
}
