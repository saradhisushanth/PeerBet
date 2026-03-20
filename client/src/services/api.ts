import { useAuthStore } from "../store/authStore";

const BASE_URL = "/api";

/** Default for reads / light requests */
const DEFAULT_TIMEOUT_MS = 28000;
/** Bet mutations can be slower (DB, cold serverless, TLS handshake) */
const BET_MUTATION_TIMEOUT_MS = 70000;
/** Retries after timeout / flaky network / gateway errors (place is idempotent enough: same bet reconciles server-side) */
const BET_MUTATION_RETRIES = 2;
const RETRY_BACKOFF_MS = [900, 2200];

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type RequestConfig = {
  timeoutMs?: number;
  /** Extra attempts after the first failure (only for retryable errors). */
  retries?: number;
};

/** Wallet fields returned with POST /bets/place (avoids a follow-up GET /auth/me). */
export type PlaceBetWalletSnapshot = {
  balance: number;
  prizePoolContribution: number;
  consecutiveMissedMatches: number;
};

/** Raw JSON body for successful HTTP responses (retries, auth, errors). */
async function requestJson(
  endpoint: string,
  options?: RequestInit,
  config?: RequestConfig
): Promise<Record<string, unknown>> {
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = config?.retries ?? 0;
  const maxAttempts = retries + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const canRetry = attempt < maxAttempts - 1;
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${endpoint}`, {
        headers,
        signal: controller.signal,
        ...options,
      });
    } catch (err) {
      clearTimeout(timer);
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const failedFetch = err instanceof TypeError;
      if ((aborted || failedFetch) && canRetry) {
        await sleep(RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]!);
        continue;
      }
      if (aborted) {
        throw new Error("Request timed out. Server may be waking up — try again.");
      }
      throw new Error("Network error. Check your connection.");
    }
    clearTimeout(timer);

    if (!res.ok) {
      if (res.status === 401) {
        useAuthStore.getState().logout();
      }
      if ([502, 503, 504].includes(res.status) && canRetry) {
        await res.text().catch(() => {});
        await sleep(RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]!);
        continue;
      }
      const error = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error((error as { error?: string }).error || `HTTP ${res.status}`);
    }

    return (await res.json()) as Record<string, unknown>;
  }

  throw new Error("Request timed out. Server may be waking up — try again.");
}

async function request<T>(
  endpoint: string,
  options?: RequestInit,
  config?: RequestConfig
): Promise<T> {
  const json = await requestJson(endpoint, options, config);
  return json.data as T;
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
    place: async (
      matchId: string,
      selectedTeamId: string,
      amount: number,
      insured?: boolean
    ): Promise<{ bet: unknown; wallet: PlaceBetWalletSnapshot }> => {
      const json = await requestJson(
        "/bets/place",
        {
          method: "POST",
          body: JSON.stringify({ matchId, selectedTeamId, amount, insured }),
        },
        { timeoutMs: BET_MUTATION_TIMEOUT_MS, retries: BET_MUTATION_RETRIES }
      );
      const wallet = json.wallet as PlaceBetWalletSnapshot | undefined;
      if (
        !wallet ||
        typeof wallet.balance !== "number" ||
        typeof wallet.prizePoolContribution !== "number" ||
        typeof wallet.consecutiveMissedMatches !== "number"
      ) {
        throw new Error("Invalid place response from server");
      }
      return { bet: json.data, wallet };
    },
    cancel: (matchId: string) =>
      request(
        "/bets/cancel",
        {
          method: "POST",
          body: JSON.stringify({ matchId }),
        },
        { timeoutMs: BET_MUTATION_TIMEOUT_MS, retries: BET_MUTATION_RETRIES }
      ),
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
