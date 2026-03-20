import { useAuthStore } from "../store/authStore";

const BASE_URL = "/api";

const REQUEST_TIMEOUT_MS = 15000;

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      headers,
      signal: controller.signal,
      ...options,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Server may be waking up — try again.");
    }
    throw new Error("Network error. Check your connection.");
  }
  clearTimeout(timer);

  if (!res.ok) {
    if (res.status === 401) {
      useAuthStore.getState().logout();
    }
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    balance: number;
    prizePoolContribution?: number;
    consecutiveMissedMatches?: number;
  };
}

export const api = {
  auth: {
    register: (username: string, email: string, password: string) =>
      request<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      }),
    login: (email: string, password: string) =>
      request<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    me: () =>
      request<{
        id: string;
        username: string;
        email: string;
        balance: number;
        prizePoolContribution?: number;
        consecutiveMissedMatches?: number;
        currentStreak?: number;
        maxStreak?: number;
      }>("/auth/me"),
  },
  users: {
    getAll: () =>
      request<{ id: string; username: string }[]>("/users"),
  },
  matches: {
    getAll: () => request("/matches"),
    getById: (id: string) => request(`/matches/${id}`),
    getBoard: (id: string) =>
      request<{
        homeTeam: { id: string; shortName: string; name: string };
        awayTeam: { id: string; shortName: string; name: string };
        onHome: { userId: string; username: string; amount: number; insured: boolean }[];
        onAway: { userId: string; username: string; amount: number; insured: boolean }[];
        undecided: { userId: string; username: string }[];
      }>(`/matches/${id}/board`),
    getSummary: (id: string) =>
      request<{
        matchId: string;
        totalPool: number;
        momentum: { homePercent: number; awayPercent: number };
        recentBets: { id: string; username: string; teamShortName: string; amount: number; createdAt: string }[];
        settlementResults?: { userId: string; username: string; side: string; stake: number; poolGained: number; winningStreakAfter?: number; streakBonus?: number }[];
      }>(`/matches/${id}/summary`),
    updateTimes: (matchId: string, data: { startTime?: string; tossTime?: string | null }) =>
      request(`/matches/${matchId}/times`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    forceRebalance: (matchId: string) =>
      request<{ rebalanced: boolean }>(`/matches/${matchId}/force-rebalance`, { method: "POST" }),
    settle: (matchId: string, winnerTeamId: string) =>
      request(`/matches/${matchId}/settle`, {
        method: "POST",
        body: JSON.stringify({ winnerTeamId }),
      }),
  },
  bets: {
    place: (matchId: string, selectedTeamId: string, amount: number, insured?: boolean) =>
      request("/bets/place", {
        method: "POST",
        body: JSON.stringify({ matchId, selectedTeamId, amount, insured }),
      }),
    cancel: (matchId: string) =>
      request("/bets/cancel", {
        method: "POST",
        body: JSON.stringify({ matchId }),
      }),
    getMy: () => request("/bets/my"),
  },
  leaderboard: {
    getTop: (limit = 50) => request(`/leaderboard?limit=${limit}`),
  },
  tournament: {
    getDetails: () =>
      request<{
        totalPrizePool: number;
        prizeDistribution: { rank: number; percent: number; amount: number }[];
        houseCutPercent: number;
        houseCutAmount: number;
        balanceSheet: { userId: string; username: string; balance: number; prizePoolContribution: number }[];
        transactions: { id: string; userId: string; username: string; amount: number; approvedBy: string | null; createdAt: string }[];
        rules: string[];
      }>("/tournament/details"),
    walletTopUp: (userId: string, amount: number) =>
      request("/tournament/admin/wallet-top-up", {
        method: "POST",
        body: JSON.stringify({ userId, amount }),
      }),
  },
};
