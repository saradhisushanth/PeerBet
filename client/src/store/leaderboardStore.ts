import { create } from "zustand";

export interface LeaderboardEntry {
  userId: string;
  user: { id: string; username: string };
  balance: number;
  totalWins: number;
  totalLosses: number;
  profit: number;
  underdogBonus: number;
  /** Deductions for missed matches (not included in profit). Balance = contribution + profit - missedPenalties. */
  missedPenalties?: number;
  rank: number | null;
}

interface LeaderboardState {
  entries: LeaderboardEntry[];
  lastFetched: number | null;
  loading: boolean;
  error: string | null;
  setEntries: (entries: LeaderboardEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useLeaderboardStore = create<LeaderboardState>((set) => ({
  entries: [],
  lastFetched: null,
  loading: false,
  error: null,
  setEntries: (entries) => set({ entries, lastFetched: Date.now() }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
