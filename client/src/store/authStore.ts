import { create } from "zustand";

interface AuthUser {
  id: string;
  username: string;
  email: string;
  balance: number;
  prizePoolContribution?: number;
  consecutiveMissedMatches?: number;
  currentStreak?: number;
  maxStreak?: number;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  /** Transient UI offset for header balance (e.g. insurance preview on match detail). Not persisted. */
  balanceDisplayOffset: number;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setBalance: (balance: number) => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  setBalanceDisplayOffset: (delta: number) => void;
}

function loadPersistedState(): { token: string | null; user: AuthUser | null } {
  try {
    const token = localStorage.getItem("auth_token");
    const raw = localStorage.getItem("auth_user");
    const user = raw ? (JSON.parse(raw) as AuthUser) : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

const persisted = loadPersistedState();

/** Sync auth state from localStorage only when another tab updated the *same* user (balance, etc.). Never apply a different user so each tab can stay on its own user; never apply when we're logged out so we don't overwrite with another tab's user. */
function subscribeToStorageSync() {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (e) => {
    if (e.key !== "auth_user" || e.newValue == null) return;
    try {
      const user = JSON.parse(e.newValue) as AuthUser;
      const current = useAuthStore.getState().user;
      if (!current || current.id !== user.id) return; // same user only: don't overwrite other tabs or logged-out state
      const token = localStorage.getItem("auth_token");
      useAuthStore.setState({ user, token: token || useAuthStore.getState().token });
    } catch {
      // ignore parse errors
    }
  });
}

export const useAuthStore = create<AuthState>((set) => ({
  user: persisted.user,
  token: persisted.token,
  balanceDisplayOffset: 0,

  login: (token, user) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(user));
    set({ token, user, balanceDisplayOffset: 0 });
  },

  logout: () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    set({ token: null, user: null, balanceDisplayOffset: 0 });
  },

  setBalance: (balance) =>
    set((state) => {
      if (!state.user) return state;
      const updated = { ...state.user, balance };
      localStorage.setItem("auth_user", JSON.stringify(updated));
      return { user: updated };
    }),

  updateUser: (updates) =>
    set((state) => {
      if (!state.user) return state;
      const updated = { ...state.user, ...updates };
      localStorage.setItem("auth_user", JSON.stringify(updated));
      return { user: updated };
    }),

  setBalanceDisplayOffset: (delta) => set({ balanceDisplayOffset: delta }),
}));

subscribeToStorageSync();
