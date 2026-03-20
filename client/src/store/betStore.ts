import { create } from "zustand";
import type { TeamInfo } from "./matchStore";

export interface Bet {
  id: string;
  matchId: string;
  selectedTeamId: string;
  selectedTeam: TeamInfo;
  amount: number;
  oddsMultiplier: number;
  insured?: boolean;
  status: "PENDING" | "WON" | "LOST" | "CANCELLED";
  createdAt: string;
  match?: {
    homeTeam: TeamInfo;
    awayTeam: TeamInfo;
    winner?: TeamInfo | null;
    startTime: string;
    status: string;
  };
}

interface BetState {
  bets: Bet[];
  lastFetched: number | null;
  loading: boolean;
  error: string | null;
  setBets: (bets: Bet[]) => void;
  addBet: (bet: Bet) => void;
  updateBetStatus: (betId: string, status: Bet["status"]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useBetStore = create<BetState>((set) => ({
  bets: [],
  lastFetched: null,
  loading: false,
  error: null,
  setBets: (bets) => set({ bets, lastFetched: Date.now() }),
  addBet: (bet) =>
    set((state) => ({
      bets: [bet, ...state.bets.filter((b) => b.matchId !== bet.matchId)],
    })),
  updateBetStatus: (betId, status) =>
    set((state) => ({
      bets: state.bets.map((b) => (b.id === betId ? { ...b, status } : b)),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
