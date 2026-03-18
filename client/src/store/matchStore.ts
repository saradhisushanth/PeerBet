import { create } from "zustand";

export interface TeamInfo {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string | null;
}

export interface Match {
  id: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  winner?: TeamInfo | null;
  venue: string;
  startTime: string;
  tossTime?: string | null; // Betting closes at toss; if null, closes at startTime
  status: "UPCOMING" | "LIVE" | "COMPLETED" | "CANCELLED";
}

export interface MatchSummary {
  matchId: string;
  totalPool: number;
  momentum: { homePercent: number; awayPercent: number };
  recentBets: { id: string; username: string; teamShortName: string; amount: number; createdAt: string }[];
  settlementResults?: { userId: string; username: string; side: string; stake: number; poolGained: number; winningStreakAfter?: number; streakBonus?: number }[];
}

export interface MatchBoard {
  homeTeam: { id: string; shortName: string; name: string };
  awayTeam: { id: string; shortName: string; name: string };
  onHome: { userId: string; username: string; amount: number }[];
  onAway: { userId: string; username: string; amount: number }[];
  undecided: { userId: string; username: string }[];
}

export interface MatchDetailCacheEntry {
  match: Match;
  summary: MatchSummary;
  board: MatchBoard;
}

interface MatchState {
  matches: Match[];
  selectedMatch: Match | null;
  /** Per-match cache so revisiting a match (e.g. completed) shows last-known state immediately */
  matchDetailCache: Record<string, MatchDetailCacheEntry>;
  loading: boolean;
  error: string | null;
  setMatches: (matches: Match[]) => void;
  setSelectedMatch: (match: Match | null) => void;
  setMatchDetailCache: (matchId: string, entry: MatchDetailCacheEntry) => void;
  getMatchDetailCache: (matchId: string) => MatchDetailCacheEntry | undefined;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useMatchStore = create<MatchState>((set, get) => ({
  matches: [],
  selectedMatch: null,
  matchDetailCache: {},
  loading: false,
  error: null,
  setMatches: (matches) => set({ matches }),
  setSelectedMatch: (match) => set({ selectedMatch: match }),
  setMatchDetailCache: (matchId, entry) =>
    set((state) => ({
      matchDetailCache: { ...state.matchDetailCache, [matchId]: entry },
    })),
  getMatchDetailCache: (matchId) => get().matchDetailCache[matchId],
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
