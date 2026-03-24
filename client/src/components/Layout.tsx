import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom";
import type { MatchUpdatePayload, WalletTopUpPayload } from "@shared/types";
import { useAuthStore } from "../store/authStore";
import { useMatchStore } from "../store/matchStore";
import { useBetStore, type Bet } from "../store/betStore";
import { useLeaderboardStore } from "../store/leaderboardStore";
import { api } from "../services/api";
import { formatCurrency } from "../utils/format";
import { useSocket, useSocketEvent } from "../hooks/useSocket";
import BottomNav from "./BottomNav";
import MatchesPanel from "./MatchesPanel";
import ProfilePanel from "./ProfilePanel";

const desktopTabs = [
  { to: "/", label: "Board" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/tournament", label: "Tournament" },
  { to: "/history", label: "History" },
  { to: "/stats", label: "Profile" },
] as const;

export type LayoutOutletContext = {
  setDesktopMatchSidebar: (node: ReactNode | null) => void;
};

export default function Layout() {
  const { user, logout, updateUser, token, balanceDisplayOffset } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [desktopMatchSidebar, setDesktopMatchSidebar] = useState<ReactNode>(null);
  const isMatchDetailPath = location.pathname.startsWith("/matches/");
  const [topUpSnack, setTopUpSnack] = useState<number | null>(null);
  const [insuranceRefundSnack, setInsuranceRefundSnack] = useState<number | null>(null);
  const [soloWinSnack, setSoloWinSnack] = useState<number | null>(null);
  const [soloByeSnack, setSoloByeSnack] = useState<number | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : false
  );
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const setMatches = useMatchStore((s) => s.setMatches);
  const applyMatchUpdateFromSocket = useMatchStore((s) => s.applyMatchUpdateFromSocket);
  const setBets = useBetStore((s) => s.setBets);
  const setLeaderboard = useLeaderboardStore((s) => s.setEntries);

  // Prefetch all core data on login
  useEffect(() => {
    if (!token) return;
    api.matches.getAll().then((d) => setMatches(d as any[])).catch(() => {});
    api.bets.getMy().then((d) => setBets(d as Bet[])).catch(() => {});
    api.leaderboard.getTop().then((d) => setLeaderboard(d as any[])).catch(() => {});
  }, [token, setMatches, setBets, setLeaderboard]);

  useEffect(() => {
    const onResize = () => setIsDesktopViewport(window.innerWidth >= 1024);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!isMatchDetailPath) setDesktopMatchSidebar(null);
  }, [isMatchDetailPath]);

  const layoutOutletContext = useMemo<LayoutOutletContext>(
    () => ({ setDesktopMatchSidebar }),
    []
  );

  // Refetch user when tab becomes visible
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

  useSocket();

  const onWalletTopUp = useCallback((data: WalletTopUpPayload) => {
    updateUser({ balance: data.newBalance, prizePoolContribution: data.newPrizePoolContribution });
    setTopUpSnack(data.amount);
    setTimeout(() => setTopUpSnack(null), 6000);
  }, [updateUser]);
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

  const mobileSwipeRoutes = desktopTabs.map((tab) => tab.to);
  const showAppBackNav = location.pathname !== "/";

  function handleAppBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

  // Swipe handling for mobile: move across primary routes instead of hidden side panels.
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStart - touchEnd;
    const diffY = (touchStartY ?? touchEndY) - touchEndY;
    const threshold = 50;
    const target = e.target as HTMLElement | null;

    if (target?.closest("[data-prevent-route-swipe='true']")) {
      setTouchStart(null);
      setTouchStartY(null);
      return;
    }

    if (Math.abs(diff) < threshold || Math.abs(diff) <= Math.abs(diffY)) {
      setTouchStart(null);
      setTouchStartY(null);
      return;
    }

    const currentIndex = mobileSwipeRoutes.indexOf(location.pathname as typeof mobileSwipeRoutes[number]);
    if (currentIndex === -1) {
      setTouchStart(null);
      return;
    }

    if (diff > 0 && currentIndex < mobileSwipeRoutes.length - 1) {
      navigate(mobileSwipeRoutes[currentIndex + 1]);
    } else if (diff < 0 && currentIndex > 0) {
      navigate(mobileSwipeRoutes[currentIndex - 1]);
    }

    setTouchStart(null);
    setTouchStartY(null);
  };

  function handleLogout() {
    setShowLogoutConfirm(true);
  }

  function confirmLogout() {
    setShowLogoutConfirm(false);
    logout();
    navigate("/login");
  }

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col overflow-hidden bg-slate-100 text-slate-900">
      {/* Header — fixed on mobile so it stays pinned to the visual viewport while inner content scrolls */}
      <header
        className={`z-50 border-b border-slate-200 bg-white ${
          isDesktopViewport
            ? "relative flex-shrink-0"
            : "fixed top-0 left-0 right-0 shrink-0 pt-[env(safe-area-inset-top,0px)] [transform:translateZ(0)]"
        }`}
      >
        <div className="px-4 h-12 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {showAppBackNav && (
              <button
                type="button"
                onClick={handleAppBack}
                className="shrink-0 inline-flex items-center justify-center gap-1 h-8 pl-2 pr-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors text-xs font-semibold"
                aria-label="Go back"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span className="hidden sm:inline">Back</span>
              </button>
            )}
            <div className="h-8 w-8 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
              <img
                src="/brand-logo.png"
                alt="PeerBet"
                className="h-6 w-6 object-contain"
              />
            </div>
            <nav className="hidden lg:flex items-center gap-1" aria-label="Desktop navigation">
              {desktopTabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.to === "/"}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      isActive
                        ? "bg-rose-600 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <button
                onClick={() => navigate("/stats")}
                className="text-sm text-rose-700 font-semibold truncate max-w-[100px] hover:text-rose-600 transition-colors"
                title={`${user.username} — View profile`}
              >
                {user.username}
              </button>
            )}
            <span className="text-xs text-slate-300">·</span>
            <span className="text-xs text-slate-500">Balance:</span>
            <span
              className={`text-sm font-semibold tabular-nums ${balanceDisplayOffset !== 0 ? "text-amber-700" : "text-emerald-600"}`}
              title={balanceDisplayOffset !== 0 ? "Includes insurance preview for this match" : undefined}
            >
              {formatCurrency((user?.balance ?? 0) + balanceDisplayOffset, 2)}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-500/10 transition-colors"
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

      {!isDesktopViewport && (
        <div
          className="shrink-0 w-full pointer-events-none"
          style={{ height: "calc(3rem + env(safe-area-inset-top, 0px))" }}
          aria-hidden
        />
      )}

      {/* Desktop/tablet layout */}
      {isDesktopViewport && (
      <div className="lg:grid lg:grid-cols-[270px_1fr_280px] xl:grid-cols-[320px_1fr_300px] flex-1 min-h-0 overflow-hidden gap-3 xl:gap-4 p-3 xl:p-4">
        {/* Left: Matches Panel */}
        <div className="min-h-0 rounded-xl border border-slate-100 bg-white overflow-hidden shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <MatchesPanel />
        </div>

        {/* Center: Main Content */}
        <div className="min-h-0 rounded-xl border border-slate-100 bg-white overflow-auto shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          <Outlet context={layoutOutletContext} />
        </div>

        {/* Right: Match results on match detail, else Account / Profile */}
        <div className="min-h-0 rounded-xl border border-slate-100 bg-white overflow-hidden shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
          {isMatchDetailPath ? (
            <div className="h-full min-h-0 overflow-auto overscroll-y-contain">
              {desktopMatchSidebar ?? (
                <p className="text-xs text-slate-500 text-center px-4 py-10">Loading match…</p>
              )}
            </div>
          ) : (
            <ProfilePanel />
          )}
        </div>
      </div>
      )}

      {/* Mobile/Tablet routed view */}
      {!isDesktopViewport && (
      <div
        /* overflow-clip: clip without creating an extra scrollport — overflow-hidden breaks position:sticky (e.g. leaderboard columns) in WebKit */
        className="flex-1 min-h-0 overflow-clip relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* pt-0: no gap above route content; sticky headers (e.g. Board) sit flush under app bar */}
          <div className="h-full min-h-0 overflow-auto overscroll-y-contain px-4 pb-4 pt-0 [-webkit-overflow-scrolling:touch]">
          {/*
            h-full: Matches uses h-full + an inner overflow-auto virtualizer; parent must have definite height.
            Taller pages overflow this box; scroll height still grows on this overflow-auto wrapper.
          */}
          <div className="h-full rounded-xl border border-slate-200 bg-white shadow-sm max-lg:rounded-t-none max-lg:rounded-b-2xl">
            <Outlet context={layoutOutletContext} />
          </div>
        </div>
      </div>
      )}

      {/* Bottom Navigation */}
      {!isDesktopViewport && <BottomNav />}

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold">Confirm logout?</h3>
            <p className="text-slate-500 text-sm mt-2">You will be signed out of your account.</p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors text-white"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snackbars */}
      {topUpSnack && (
        <div className="fixed bottom-20 left-4 right-4 bg-green-600 text-white rounded-lg px-4 py-2 text-sm">
          +₹{topUpSnack} added to balance
        </div>
      )}
      {insuranceRefundSnack && (
        <div className="fixed bottom-20 left-4 right-4 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm">
          ₹{insuranceRefundSnack} insurance refund
        </div>
      )}
      {soloWinSnack && (
        <div className="fixed bottom-20 left-4 right-4 bg-yellow-600 text-white rounded-lg px-4 py-2 text-sm">
          ₹{soloWinSnack} solo bonus
        </div>
      )}
      {soloByeSnack && (
        <div className="fixed bottom-20 left-4 right-4 bg-purple-600 text-white rounded-lg px-4 py-2 text-sm">
          ₹{soloByeSnack} solo bye refund
        </div>
      )}
    </div>
  );
}
