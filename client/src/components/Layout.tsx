import { useState, useCallback, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import type { MatchUpdatePayload, WalletTopUpPayload } from "@shared/types";
import { useAuthStore } from "../store/authStore";
import { useMatchStore } from "../store/matchStore";
import { useBetStore, type Bet } from "../store/betStore";
import { useLeaderboardStore } from "../store/leaderboardStore";
import { api } from "../services/api";
import { formatCurrency } from "../utils/format";
import { useSocket, useSocketEvent } from "../hooks/useSocket";
import BottomNav from "./BottomNav";

export default function Layout() {
  const { user, logout, updateUser, token } = useAuthStore();
  const navigate = useNavigate();
  const [topUpSnack, setTopUpSnack] = useState<number | null>(null);
  const [insuranceRefundSnack, setInsuranceRefundSnack] = useState<number | null>(null);
  const [soloWinSnack, setSoloWinSnack] = useState<number | null>(null);
  const [soloByeSnack, setSoloByeSnack] = useState<number | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const setMatches = useMatchStore((s) => s.setMatches);
  const applyMatchUpdateFromSocket = useMatchStore((s) => s.applyMatchUpdateFromSocket);
  const setBets = useBetStore((s) => s.setBets);
  const setLeaderboard = useLeaderboardStore((s) => s.setEntries);

  // Prefetch all core data on login so tabs render instantly
  useEffect(() => {
    if (!token) return;
    api.matches.getAll().then((d) => setMatches(d as any[])).catch(() => {});
    api.bets.getMy().then((d) => setBets(d as Bet[])).catch(() => {});
    api.leaderboard.getTop().then((d) => setLeaderboard(d as any[])).catch(() => {});
  }, [token, setMatches, setBets, setLeaderboard]);

  // Refetch user (balance, etc.) when tab becomes visible so multi-tab and relogin stay in sync
  useEffect(() => {
    if (!token) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      api.auth.me().then((me) => updateUser({
        balance: me.balance,
        prizePoolContribution: me.prizePoolContribution,
        consecutiveMissedMatches: me.consecutiveMissedMatches,
      })).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [token, updateUser]);

  useSocket(); // keep socket connected when logged in so we receive walletTopUp + betSettled
  const onWalletTopUp = useCallback((data: WalletTopUpPayload) => {
      updateUser({ balance: data.newBalance, prizePoolContribution: data.newPrizePoolContribution });
      setTopUpSnack(data.amount);
      setTimeout(() => setTopUpSnack(null), 6000);
    },
    [updateUser]
  );
  useSocketEvent("walletTopUp", onWalletTopUp);

  const onBetSettled = useCallback(
    (data: { userId: string; result: string; payout: number; insuredRefund?: number; soloBonus?: number; soloByeRefund?: number }) => {
      if (data.userId !== user?.id) return;
      updateUser({ balance: (user.balance ?? 0) + data.payout });
      if (data.insuredRefund != null) {
        setInsuranceRefundSnack(data.insuredRefund);
        setTimeout(() => setInsuranceRefundSnack(null), 6000);
      }
      if (data.soloBonus != null) {
        setSoloWinSnack(data.soloBonus);
        setTimeout(() => setSoloWinSnack(null), 6000);
      }
      if (data.soloByeRefund != null) {
        setSoloByeSnack(data.soloByeRefund);
        setTimeout(() => setSoloByeSnack(null), 6000);
      }
    },
    [user?.id, user?.balance, updateUser]
  );
  useSocketEvent("betSettled", onBetSettled);

  const onMatchUpdate = useCallback(
    (data: MatchUpdatePayload) => {
      applyMatchUpdateFromSocket(data);
    },
    [applyMatchUpdateFromSocket]
  );
  useSocketEvent("matchUpdate", onMatchUpdate);

  function handleLogout() {
    setShowLogoutConfirm(true);
  }

  function confirmLogout() {
    setShowLogoutConfirm(false);
    logout();
    navigate("/login");
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-950">
      {topUpSnack != null && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-green-500/90 text-gray-900 font-semibold text-sm shadow-lg animate-pulse flex items-center gap-2">
          Wallet topped up: +{formatCurrency(topUpSnack)}
          <button type="button" onClick={() => setTopUpSnack(null)} className="opacity-80 hover:opacity-100">×</button>
        </div>
      )}
      {insuranceRefundSnack != null && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-amber-500/90 text-gray-900 font-semibold text-sm shadow-lg animate-pulse flex items-center gap-2">
          🛡 Insurance refund: +{formatCurrency(insuranceRefundSnack)}
          <button type="button" onClick={() => setInsuranceRefundSnack(null)} className="opacity-80 hover:opacity-100">×</button>
        </div>
      )}
      {soloWinSnack != null && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-green-500/90 text-gray-900 font-semibold text-sm shadow-lg animate-pulse flex items-center gap-2">
          🎯 Solo win bonus: +{formatCurrency(soloWinSnack)}
          <button type="button" onClick={() => setSoloWinSnack(null)} className="opacity-80 hover:opacity-100">×</button>
        </div>
      )}
      {soloByeSnack != null && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-blue-500/90 text-gray-900 font-semibold text-sm shadow-lg animate-pulse flex items-center gap-2">
          Bye refund (solo): +{formatCurrency(soloByeSnack)}
          <button type="button" onClick={() => setSoloByeSnack(null)} className="opacity-80 hover:opacity-100">×</button>
        </div>
      )}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mx-4 max-w-xs w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white text-center">Logout?</h3>
            <p className="text-sm text-gray-400 text-center mt-2">Are you sure you want to logout? You'll need to sign in again to place bets.</p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors border border-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex-shrink-0 z-50 border-b border-gray-800 bg-gray-900/90 backdrop-blur-sm">
        <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
          <span className="text-sm font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
            PEERBet
          </span>
          <div className="flex items-center gap-3">
            {user && (
              <button
                onClick={() => navigate("/stats")}
                className="text-sm text-primary-400 font-semibold truncate max-w-[100px] hover:text-primary-300 transition-colors"
                title={`${user.username} — View profile`}
              >
                {user.username}
              </button>
            )}
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">Balance:</span>
            <span className="text-sm font-semibold text-green-400">
              {user?.balance != null ? formatCurrency(user.balance, 2) : formatCurrency(0, 2)}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden max-w-lg mx-auto w-full px-4 py-4 flex flex-col">
        <div className="flex-1 min-h-0 flex flex-col overflow-auto">
          <Outlet />
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
