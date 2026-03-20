import { create } from "zustand";
import type { MatchUpdatePayload } from "@shared/types";

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
  settlementResults?: { userId: string; username: string; side: string; stake: number; poolGained: number; basePoolShare?: number; underdogBonus?: number; winningStreakAfter?: number; streakBonus?: number }[];
  settlementMeta?: { totalPool: number; losingPool: number; totalWinningStake: number; underdogSide?: string };
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
  lastFetched: number | null;
  loading: boolean;
  error: string | null;
  setMatches: (matches: Match[]) => void;
  setSelectedMatch: (match: Match | null) => void;
  setMatchDetailCache: (matchId: string, entry: MatchDetailCacheEntry) => void;
  getMatchDetailCache: (matchId: string) => MatchDetailCacheEntry | undefined;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** Merge socket matchUpdate fields into list, selected match, and detail cache */
  applyMatchUpdateFromSocket: (payload: MatchUpdatePayload) => void;
}

export const useMatchStore = create<MatchState>((set, get) => ({
  matches: [],
  selectedMatch: null,
  matchDetailCache: {},
  lastFetched: null,
  loading: false,
  error: null,
  setMatches: (matches) => set({ matches, lastFetched: Date.now() }),
  setSelectedMatch: (match) => set({ selectedMatch: match }),
  setMatchDetailCache: (matchId, entry) =>
    set((state) => ({
      matchDetailCache: { ...state.matchDetailCache, [matchId]: entry },
    })),
  getMatchDetailCache: (matchId) => get().matchDetailCache[matchId],
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  applyMatchUpdateFromSocket: (payload) =>
    set((state) => {
      const { matchId } = payload;
      const patch: Partial<Match> = {};
      if (payload.startTime !== undefined) patch.startTime = payload.startTime;
      if (payload.tossTime !== undefined) patch.tossTime = payload.tossTime;
      if (payload.status !== undefined) patch.status = payload.status as Match["status"];

      if (Object.keys(patch).length === 0) return state;

      const matches = state.matches.some((m) => m.id === matchId)
        ? state.matches.map((m) => (m.id === matchId ? { ...m, ...patch } : m))
        : state.matches;

      const selectedMatch =
        state.selectedMatch?.id === matchId ? { ...state.selectedMatch, ...patch } : state.selectedMatch;

      const cached = state.matchDetailCache[matchId];
      const matchDetailCache = cached
        ? { ...state.matchDetailCache, [matchId]: { ...cached, match: { ...cached.match, ...patch } } }
        : state.matchDetailCache;

      return { matches, selectedMatch, matchDetailCache };
    }),
}));
