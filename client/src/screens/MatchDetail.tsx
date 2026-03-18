import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useMatchStore, type Match, type MatchSummary as MatchSummaryType } from "../store/matchStore";
import { useAuthStore } from "../store/authStore";
import { useBetStore, type Bet } from "../store/betStore";
import { useSocket, useSocketEvent } from "../hooks/useSocket";
import { api } from "../services/api";
import {
  ADMIN_USERNAME,
  MIN_STAKE,
  MAX_STAKE,
  INSURANCE_COST,
  INSURANCE_REFUND_PERCENT,
  TOSS_DEFAULT_MINUTES_BEFORE_MATCH,
} from "@shared/constants";
import PlayerBettingBoard from "../components/PlayerBettingBoard";
import { formatCurrency, formatNumber } from "../utils/format";

const STAKE_STEP = 10;

/** Format ISO date for datetime-local input (YYYY-MM-DDTHH:mm). */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

/** Stake must be a whole number (no decimals). */
function toIntegerStake(value: string): string {
  if (value === "" || value === "-") return value;
  const n = Math.floor(Number(value));
  if (Number.isNaN(n) || n < 0) return "";
  return String(n);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Bet lock countdown: days, hours, minutes, seconds (e.g. 11d 9h 37m 14s). */
function formatBetLockCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const remainderAfterDays = totalSeconds % 86400;
  const hours = Math.floor(remainderAfterDays / 3600);
  const remainderAfterHours = remainderAfterDays % 3600;
  const minutes = Math.floor(remainderAfterHours / 60);
  const seconds = remainderAfterHours % 60;
  const parts: string[] = [];
  if (days >= 1) parts.push(`${days}d`);
  if (hours >= 1 || days >= 1) parts.push(`${hours}h`);
  if (minutes >= 1 || hours >= 1 || days >= 1) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

/** Local type for summary (matches store MatchSummaryType) */
interface MatchSummary {
  matchId: string;
  totalPool: number;
  momentum: { homePercent: number; awayPercent: number };
  recentBets: { id: string; username: string; teamShortName: string; amount: number; createdAt: string }[];
  settlementResults?: { userId: string; username: string; side: string; stake: number; poolGained: number; winningStreakAfter?: number; streakBonus?: number }[];
}

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { selectedMatch, setSelectedMatch, getMatchDetailCache, setMatchDetailCache } = useMatchStore();
  const { user, setBalance, updateUser } = useAuthStore();
  const { addBet } = useBetStore();

  const [stake, setStake] = useState(Math.max(MIN_STAKE, 300));
  const [stakeInputValue, setStakeInputValue] = useState(String(Math.max(MIN_STAKE, 300)));
  const [stakeAnimating, setStakeAnimating] = useState(false);
  const [stakeCollapsed, setStakeCollapsed] = useState(true);
  const stakeInputFocusedRef = useRef(false);
  const lastBoardAmountRef = useRef<number | null>(null);
  const lastPlacedStakeRef = useRef<number | null>(null);
  const lastPlacedStakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set on user action (+/- or blur) so sync/clamp don't overwrite before API completes. */
  function setStakeProtected(value: number, timeoutMs = 800) {
    lastPlacedStakeRef.current = value;
    if (lastPlacedStakeTimeoutRef.current) clearTimeout(lastPlacedStakeTimeoutRef.current);
    lastPlacedStakeTimeoutRef.current = setTimeout(() => {
      lastPlacedStakeRef.current = null;
      lastPlacedStakeTimeoutRef.current = null;
    }, timeoutMs);
  }
  const [insured, setInsured] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [upsetMessage, setUpsetMessage] = useState<string | null>(null);
  const [recentRemovals, setRecentRemovals] = useState<{ id: string; username: string; amount: number; teamShortName: string; at: number }[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [tossTimeInput, setTossTimeInput] = useState("");
  const [timesSaving, setTimesSaving] = useState(false);
  const [timesError, setTimesError] = useState<string | null>(null);
  const [rebalanceLoading, setRebalanceLoading] = useState(false);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [board, setBoard] = useState<{
    homeTeam: { id: string; shortName: string; name: string };
    awayTeam: { id: string; shortName: string; name: string };
    onHome: { userId: string; username: string; amount: number; insured?: boolean }[];
    onAway: { userId: string; username: string; amount: number; insured?: boolean }[];
    undecided: { userId: string; username: string }[];
  } | null>(null);

  const socket = useSocket();

  const fetchSummary = useCallback(() => {
    if (id) return api.matches.getSummary(id).then(setSummary);
    return Promise.resolve();
  }, [id]);

  const fetchBoard = useCallback(() => {
    if (id) return api.matches.getBoard(id).then(setBoard);
    return Promise.resolve();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const cached = getMatchDetailCache(id);
    if (cached) {
      setSelectedMatch(cached.match);
      setSummary(cached.summary as MatchSummary);
      setBoard(cached.board);
    }
    setRecentRemovals([]);
    Promise.all([
      api.matches.getById(id),
      api.matches.getSummary(id),
      api.matches.getBoard(id),
    ]).then(([match, summaryData, boardData]) => {
      const matchData = match as Match;
      const summaryDataTyped = summaryData as MatchSummary;
      setSelectedMatch(matchData);
      setSummary(summaryDataTyped);
      setBoard(boardData);
      setMatchDetailCache(id, { match: matchData, summary: summaryDataTyped as MatchSummaryType, board: boardData });
    });
    api.auth.me().then((me) => updateUser({ balance: me.balance, prizePoolContribution: me.prizePoolContribution, consecutiveMissedMatches: me.consecutiveMissedMatches }));
    socket.emit("joinMatch", id);
    return () => {
      socket.emit("leaveMatch", id!);
    };
  }, [id, setSelectedMatch, setMatchDetailCache, getMatchDetailCache, socket, updateUser]);

  // Countdown to when betting closes (toss time, or 30 min before match if no explicit toss)
  useEffect(() => {
    if (!selectedMatch || selectedMatch.status !== "UPCOMING") return;
    const startMs = new Date(selectedMatch.startTime).getTime();
    const closesAt = selectedMatch.tossTime
      ? new Date(selectedMatch.tossTime).getTime()
      : startMs - TOSS_DEFAULT_MINUTES_BEFORE_MATCH * 60 * 1000;
    const end = closesAt;
    const tick = () => setCountdown(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [selectedMatch]);

  // When countdown hits 0, refetch so server runs lock rebalance (last 2 by leaderboard → other side).
  // Poll for a short period so we catch rebalance even with clock skew or cache.
  const hasRefetchedAtZeroRef = useRef(false);
  useEffect(() => {
    if (id) hasRefetchedAtZeroRef.current = false;
  }, [id]);
  useEffect(() => {
    if (!id || countdown !== 0 || hasRefetchedAtZeroRef.current) return;
    hasRefetchedAtZeroRef.current = true;
    const run = () => {
      fetchSummary().then(() => {});
      fetchBoard().then(() => {});
    };
    run();
    const intervals = [2000, 5000, 8000, 12000];
    const timers = intervals.map((ms) => setTimeout(run, ms));
    return () => timers.forEach(clearTimeout);
  }, [countdown, id, fetchSummary, fetchBoard]);

  // Sync admin toss time input when match loads
  useEffect(() => {
    if (!selectedMatch) return;
    setTossTimeInput(toDatetimeLocal(selectedMatch.tossTime ?? null));
  }, [selectedMatch?.id, selectedMatch?.tossTime]);

  // Persist match detail to cache whenever we have full data (so revisiting shows it)
  useEffect(() => {
    if (!id || !selectedMatch || !summary || !board) return;
    setMatchDetailCache(id, {
      match: selectedMatch,
      summary: summary as MatchSummaryType,
      board,
    });
  }, [id, selectedMatch, summary, board, setMatchDetailCache]);

  // Sync stake from board when server data changes (not when user is typing)
  // Skip overwriting if we just placed a stake and board hasn't caught up yet (prevents flicker)
  useEffect(() => {
    if (!board || !user || placing || stakeInputFocusedRef.current) return;
    const amount =
      board.onHome.find((p) => p.userId === user.id)?.amount ??
      board.onAway.find((p) => p.userId === user.id)?.amount;
    const justPlaced = lastPlacedStakeRef.current;
    if (justPlaced !== null) {
      if (amount === justPlaced) {
        lastBoardAmountRef.current = amount;
        lastPlacedStakeRef.current = null;
        if (lastPlacedStakeTimeoutRef.current) {
          clearTimeout(lastPlacedStakeTimeoutRef.current);
          lastPlacedStakeTimeoutRef.current = null;
        }
      }
      return;
    }
    if (amount != null && amount !== lastBoardAmountRef.current) {
      lastBoardAmountRef.current = amount;
      setStake(amount);
      setStakeInputValue(String(amount));
    } else if (amount == null) {
      lastBoardAmountRef.current = null;
    }
  }, [board?.onHome, board?.onAway, user?.id, placing]);

  useEffect(() => {
    return () => {
      if (lastPlacedStakeTimeoutRef.current) clearTimeout(lastPlacedStakeTimeoutRef.current);
    };
  }, []);

  // When stake is updated from outside the input (e.g. +/- or clamp), keep input display in sync
  // Skip while user's value is protected (prevents flicker from overwriting with stale stake)
  useEffect(() => {
    if (lastPlacedStakeRef.current !== null || stakeInputFocusedRef.current) return;
    setStakeInputValue(String(stake));
  }, [stake]);

  // Trigger brief transition when stake value changes (masks flicker from sync/async)
  const isInitialStakeRef = useRef(true);
  useEffect(() => {
    if (isInitialStakeRef.current) {
      isInitialStakeRef.current = false;
      return;
    }
    setStakeAnimating(true);
    const t = setTimeout(() => setStakeAnimating(false), 250);
    return () => clearTimeout(t);
  }, [stake]);

  // When pool, balance, or cap changes, clamp stake to valid range
  // Present pool = pool excluding our bet (rule based on current state)
  const totalPoolForEffect = summary?.totalPool ?? 0;
  const myBetForEffect =
    board && user
      ? board.onHome.find((p) => p.userId === user.id)?.amount ?? board.onAway.find((p) => p.userId === user.id)?.amount ?? 0
      : 0;
  const presentPoolForEffect = totalPoolForEffect - myBetForEffect;
  const halfPoolForEffect = presentPoolForEffect > 0 ? Math.floor(presentPoolForEffect / 2) : MAX_STAKE;
  const maxFromPoolForEffect = Math.max(MIN_STAKE, Math.min(halfPoolForEffect, MAX_STAKE));
  const availableForEffect = (user?.balance ?? 0) + myBetForEffect;
  const maxStakeForEffect = Math.min(maxFromPoolForEffect, Math.max(0, availableForEffect - (insured ? INSURANCE_COST : 0)));
  useEffect(() => {
    if (lastPlacedStakeRef.current !== null) return;
    setStake((s) => Math.floor(Math.min(Math.max(MIN_STAKE, s), maxStakeForEffect)));
  }, [maxStakeForEffect]);

  const handleMatchUpdate = useCallback(() => {
    if (id) {
      api.matches.getById(id).then((data) => setSelectedMatch(data as Match));
      fetchSummary();
    }
  }, [id, setSelectedMatch, fetchSummary]);

  useSocketEvent("matchUpdate", () => {
    if (id) {
      api.matches.getById(id).then((data) => setSelectedMatch(data as Match));
      fetchSummary();
      fetchBoard();
      api.auth.me().then((me) => updateUser({ balance: me.balance, prizePoolContribution: me.prizePoolContribution, consecutiveMissedMatches: me.consecutiveMissedMatches }));
    }
  });
  useSocketEvent("betPlaced", () => {
    fetchSummary();
    fetchBoard();
  });

  useSocketEvent("upsetAlert", (data) => {
    if (data.matchId === id) setUpsetMessage(data.message || "Underdog won!");
  });

  useSocketEvent("betRemoved", (data) => {
    if (data.matchId !== id) return;
    setRecentRemovals((prev) => [
      { id: `${data.userId}-${Date.now()}`, username: data.username, amount: data.amount, teamShortName: data.teamShortName, at: Date.now() },
      ...prev.slice(0, 19),
    ]);
    fetchSummary();
    fetchBoard();
  });

  async function handlePlaceBetFromDrop(teamId: string, amount: number) {
    if (!user || !id) return;
    setError(null);
    setSuccess(null);

    // Balance before placing/editing any bet on this match (add back current match stake + insurance)
    const balanceBeforeThisMatch =
      (user.balance ?? 0) + myBetAmount + (myBetInsured ? INSURANCE_COST : 0);
    const totalRequired = amount + (insured ? INSURANCE_COST : 0);
    if (totalRequired > balanceBeforeThisMatch) {
      setError(`You cannot stake more than your balance when you entered this match. Balance: ${formatCurrency(balanceBeforeThisMatch)}.`);
      return;
    }

    const pool = summary?.totalPool ?? 0;
    const myBetAmt =
      board && user
        ? board.onHome.find((p) => p.userId === user.id)?.amount ?? board.onAway.find((p) => p.userId === user.id)?.amount ?? 0
        : 0;
    const presentPoolVal = Number(pool) - myBetAmt;
    const halfPoolVal = presentPoolVal > 0 ? Math.floor(presentPoolVal / 2) : MAX_STAKE;
    const maxFromPool = Math.max(MIN_STAKE, Math.min(halfPoolVal, MAX_STAKE));
    const available = balanceBeforeThisMatch;
    const effectiveMaxStake = Math.min(maxFromPool, Math.max(0, available - (insured ? INSURANCE_COST : 0)));

    if (amount < MIN_STAKE) {
      setError(`Minimum stake is ${formatCurrency(MIN_STAKE)}`);
      return;
    }
    if (amount > MAX_STAKE) {
      setError(`Maximum stake is ${formatCurrency(MAX_STAKE)}`);
      return;
    }
    if (amount > effectiveMaxStake) {
      setError(`Stake too high. Max is ${formatCurrency(effectiveMaxStake)} (half of pool / balance cap).`);
      return;
    }

    setPlacing(true);
    try {
      const bet = await api.bets.place(id, teamId, amount, insured);
      addBet(bet as Bet);
      const teamName = selectedMatch?.homeTeam.id === teamId ? selectedMatch.homeTeam.shortName : selectedMatch?.awayTeam.shortName;
      setSuccess(`Bet ${formatCurrency(amount)} on ${teamName}`);
      setStakeProtected(amount, 2000);
      const me = await api.auth.me();
      updateUser({ balance: me.balance, prizePoolContribution: me.prizePoolContribution, consecutiveMissedMatches: me.consecutiveMissedMatches });
      await Promise.all([fetchSummary(), fetchBoard()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bet");
    } finally {
      setPlacing(false);
    }
  }

  async function handleSaveTimes(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setTimesSaving(true);
    setTimesError(null);
    try {
      // Only update toss time (match time stays as set elsewhere). Send ISO so server stores correct instant.
      await api.matches.updateTimes(id, {
        tossTime: tossTimeInput ? new Date(tossTimeInput).toISOString() : null,
      });
      const data = await api.matches.getById(id);
      setSelectedMatch(data as Match);
    } catch (err) {
      setTimesError(err instanceof Error ? err.message : "Failed to update times");
    } finally {
      setTimesSaving(false);
    }
  }

  async function handleForceRebalance() {
    if (!id) return;
    setRebalanceLoading(true);
    setRebalanceError(null);
    try {
      await api.matches.forceRebalance(id);
      setSuccess("Lock rebalance run; one player moved to the other side.");
      await Promise.all([fetchSummary(), fetchBoard()]);
      const data = await api.matches.getById(id);
      setSelectedMatch(data as Match);
    } catch (err) {
      setRebalanceError(err instanceof Error ? err.message : "Force rebalance failed");
    } finally {
      setRebalanceLoading(false);
    }
  }

  async function handleSettle(winnerTeamId: string) {
    if (!id) return;
    setSettling(true);
    setError(null);
    setSuccess(null);
    try {
      await api.matches.settle(id, winnerTeamId);
      setSuccess("Match settled");
      const data = await api.matches.getById(id);
      setSelectedMatch(data as Match);
      fetchSummary();
      fetchBoard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to settle match");
    } finally {
      setSettling(false);
    }
  }

  async function handleCancelBetFromDrop() {
    if (!user || !id) return;
    setPlacing(true);
    setError(null);
    setSuccess(null);
    try {
      const cancelled = await api.bets.cancel(id) as { amount: number; insured?: boolean } | null;
      if (cancelled) {
        const refund = cancelled.amount + (cancelled.insured ? INSURANCE_COST : 0);
        setBalance(user.balance + refund);
        setSuccess("Bet cancelled");
      }
      fetchSummary();
      fetchBoard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel bet");
    } finally {
      setPlacing(false);
    }
  }

  // Derived from board/user only — must be before early return so hook order is stable
  const myBetAmount =
    board && user
      ? board.onHome.find((p) => p.userId === user.id)?.amount ??
        board.onAway.find((p) => p.userId === user.id)?.amount ??
        0
      : 0;
  const myBetInsured =
    board && user
      ? board.onHome.find((p) => p.userId === user.id)?.insured ?? board.onAway.find((p) => p.userId === user.id)?.insured ?? false
      : false;
  /** Balance before placing/editing any bet on this match (state when they entered the match). */
  const balanceAtMatchEntry =
    (user?.balance ?? 0) + myBetAmount + (myBetInsured ? INSURANCE_COST : 0);
  useEffect(() => {
    if (board && user && myBetAmount > 0) setInsured(myBetInsured);
  }, [board, user?.id, myBetAmount, myBetInsured]);

  if (!selectedMatch) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-500">Loading match...</p>
      </div>
    );
  }

  const home = selectedMatch.homeTeam;
  const away = selectedMatch.awayTeam;
  const isUpcoming = selectedMatch.status === "UPCOMING";
  const bettingOpen = isUpcoming && countdown > 0;
  const isAdmin = user?.username === ADMIN_USERNAME;
  const canSettle = !selectedMatch.winner && (isUpcoming || selectedMatch.status === "LIVE");
  const totalPool = summary?.totalPool ?? 0;
  const totalPoolNum = Number(totalPool);
  const presentPool = totalPoolNum - myBetAmount;
  const participantCount = board ? board.onHome.length + board.onAway.length : 0;
  const halfPoolNum = presentPool > 0 ? Math.floor(presentPool / 2) : MAX_STAKE;
  const maxStakeFromPool = Math.max(MIN_STAKE, Math.min(halfPoolNum, MAX_STAKE));
  const availableBalance = (user?.balance ?? 0) + myBetAmount;
  const maxStakeFromBalance = Math.max(0, availableBalance - (insured ? INSURANCE_COST : 0));
  const maxStake = Math.min(maxStakeFromPool, maxStakeFromBalance);
  const momentumHome = summary?.momentum?.homePercent ?? 50;
  const momentumAway = summary?.momentum?.awayPercent ?? 50;
  const recentBets = summary?.recentBets ?? [];

  const settlementResults = summary?.settlementResults ?? [];
  const isUserUndecided =
    !!user && (board?.undecided?.some((p) => p.userId === user.id) ?? false);
  const consecutiveMissed = user?.consecutiveMissedMatches ?? 0;
  const userBetTeamId =
    board && user
      ? board.onHome.some((p) => p.userId === user.id)
        ? board.homeTeam.id
        : board.onAway.some((p) => p.userId === user.id)
          ? board.awayTeam.id
          : null
      : null;
  const myBetTeamName =
    board && user && userBetTeamId
      ? userBetTeamId === home?.id
        ? home?.shortName
        : away?.shortName
      : null;

  return (
    <div className={bettingOpen ? "pb-80" : "pb-32"}>
      {/* TOP BAR: Match | Timer | Pool | Notifications */}
      <header className="sticky top-0 z-40 grid grid-cols-4 gap-2 items-center border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm px-3 py-2">
        <div className="truncate text-sm font-semibold" title={`${home.shortName} vs ${away.shortName}`}>
          {home.shortName} vs {away.shortName}
        </div>
        <div className="text-center text-xs text-gray-400" title={selectedMatch.tossTime ? "Betting closes at toss" : "Betting closes 30 min before match"}>
          {isUpcoming ? "Toss in " + formatBetLockCountdown(countdown) : "—"}
        </div>
        <div className="text-center text-xs font-medium text-green-400" title="Total stakes on this match from all players">
          {formatCurrency(totalPool)}
        </div>
        <div className="flex justify-end">
          <span className="text-gray-500 text-xs" aria-label="Notifications" title="Notifications">🔔</span>
        </div>
      </header>

      {/* Lock warning: last 2 (or 1 if only 2 playing) by leaderboard will be auto-assigned to the other side */}
      {bettingOpen && countdown > 0 && countdown <= 60 && (
        <div className="px-3 pt-2">
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 max-w-xl">
            <p className="text-xs font-medium text-amber-400">
              ⏱ When betting locks, the last 2 participants (by overall leaderboard rank) will be auto-assigned to the other side to balance the match.
            </p>
            <p className="text-xs text-gray-300 mt-1">
              {participantCount === 2
                ? "With only 2 players, the one with the lower leaderboard rank will be moved."
                : participantCount === 1
                  ? "Only one player has bet — solo participant rules apply (see below)."
                  : "Get your pick in before the countdown hits zero."}
            </p>
          </div>
        </div>
      )}

      {/* Solo participant: one player only — win bonus + bye refund */}
      {bettingOpen && participantCount === 1 && (
        <div className="px-3 pt-2">
          <div className="rounded-xl border border-gray-600 bg-gray-800/50 p-3 max-w-xl">
            <p className="text-xs font-medium text-gray-400">
              Only one player has bet on this match. No auto-assign.
            </p>
            <p className="text-xs text-gray-300 mt-1">
              If you win: you get your stake back plus a bonus equal to double your stake. If you lose: you get 50% of your stake back (bye — no full penalty) and it doesn’t count as a loss on the leaderboard.
            </p>
          </div>
        </div>
      )}

      {/* Top right: no-bet warning (below match title / countdown / pool) */}
      {isUserUndecided && user && (
        <div className="flex justify-end px-3 pt-2">
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 max-w-sm">
            <p className="text-xs font-medium text-amber-400">
              You haven&apos;t placed a bet on this match.
            </p>
            <p className="text-xs text-gray-300 mt-1">
              {consecutiveMissed === 0
                ? "Missing matches reduces your balance (from 2nd miss: −💰 50 per missed match). Balance can go to 0; top up via admin to play again."
                : `You've missed ${consecutiveMissed} match${consecutiveMissed === 1 ? "" : "es"}. Miss ${consecutiveMissed === 1 ? "one more" : "another"} and your balance will drop (can go to 0). Top up to play.`}
            </p>
          </div>
        </div>
      )}

      {/* MAIN: Left (Momentum) | Center (Board) | Right (Leaderboard + History) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 py-4">
        {/* LEFT: Momentum Card */}
        <aside className="lg:col-span-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4" title="Share of total stake on each team (not odds)">
            <h3 className="text-xs font-semibold text-gray-400 mb-2">Momentum</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{home.shortName} <span className="font-medium text-gray-300">{momentumHome}%</span></span>
                <span>{away.shortName} <span className="font-medium text-gray-300">{momentumAway}%</span></span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
                <div className="bg-primary-500 h-full transition-all" style={{ width: `${momentumHome}%` }} title={`${home.shortName} ${momentumHome}%`} />
                <div className="bg-accent-500/80 h-full" style={{ width: `${momentumAway}%` }} title={`${away.shortName} ${momentumAway}%`} />
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER: Player names betting board (drag your name to a side) */}
        <section className="lg:col-span-6">
          {board ? (
            <PlayerBettingBoard
              board={board}
              currentUserId={user?.id ?? null}
              stake={stake}
              onPlaceBet={handlePlaceBetFromDrop}
              onCancelBet={handleCancelBetFromDrop}
              placing={placing}
              isUpcoming={isUpcoming}
              bettingOpen={bettingOpen}
              canAffordBet={maxStake >= MIN_STAKE}
              winnerTeamId={selectedMatch.winner?.id ?? null}
            />
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 min-h-[120px] flex items-center justify-center text-gray-500 text-sm">
              Loading board...
            </div>
          )}
        </section>

        {/* RIGHT: Match results (when settled) + History Feed */}
        <aside className="lg:col-span-3 space-y-4">
          {settlementResults.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <h3 className="text-xs font-semibold text-gray-400 px-3 py-2 border-b border-gray-800">
                Match results
              </h3>
              <p className="px-3 py-1 text-[10px] text-gray-500 border-b border-gray-800">
                Profit = pool share + underdog bonus (1.3× if you backed the underdog) + streak bonus (2nd–5th consecutive win).
              </p>
              <div className="divide-y divide-gray-800">
                <div className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_3.5rem_5rem_2.5rem_5rem] gap-x-4 gap-y-0 text-xs text-gray-500 items-center">
                  <span>Player</span>
                  <span className="text-right" title="Team they bet on">Side</span>
                  <span className="text-right" title="Pool share + underdog bonus + streak bonus minus stake">Profit</span>
                  <span className="text-right" title="Wins in a row after this match">Streak</span>
                  <span className="text-right" title="Bonus paid for 2nd–5th consecutive win">Streak bonus</span>
                </div>
                {settlementResults.map((r) => (
                  <div key={r.userId} className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_3.5rem_5rem_2.5rem_5rem] gap-x-4 gap-y-0 items-center text-xs">
                    <span className="min-w-0 truncate">
                      <strong className={r.userId === user?.id ? "text-primary-400" : ""}>{r.username}</strong>
                      {r.userId === user?.id && " (you)"}
                    </span>
                    <span className="text-right text-gray-400">{r.side}</span>
                    <span className={`text-right font-medium tabular-nums ${r.poolGained >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {r.poolGained >= 0 ? "+" : ""}{formatCurrency(r.poolGained, 2)}
                    </span>
                    <span className="text-right text-gray-400 tabular-nums">{r.winningStreakAfter != null ? r.winningStreakAfter : "—"}</span>
                    <span className="text-right text-amber-400 tabular-nums">{r.streakBonus != null && r.streakBonus > 0 ? "+" + formatCurrency(r.streakBonus, 0) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col h-52">
            <h3 className="text-xs font-semibold text-gray-400 px-3 py-2 border-b border-gray-800 shrink-0" title="Recent bets and bet removals for this match">History Feed</h3>
            <div className="divide-y divide-gray-800 min-h-0 flex-1 overflow-y-auto">
              {recentBets.length === 0 && recentRemovals.length === 0 ? (
                <p className="px-3 py-4 text-gray-500 text-xs">No activity yet</p>
              ) : (
                [
                  ...recentBets.map((b) => ({ type: "bet" as const, id: b.id, username: b.username, amount: b.amount, teamShortName: b.teamShortName, at: new Date(b.createdAt).getTime() })),
                  ...recentRemovals.map((r) => ({ type: "remove" as const, id: r.id, username: r.username, amount: r.amount, teamShortName: r.teamShortName, at: r.at })),
                ]
                  .sort((a, b) => b.at - a.at)
                  .slice(0, 20)
                  .map((entry) => {
                    const isMe = entry.username === user?.username;
                    return entry.type === "bet" ? (
                      <div key={entry.id} className="px-3 py-1.5 text-xs">
                        <span className={`font-medium ${isMe ? "text-primary-400" : ""}`}>{entry.username}</span> bet {formatCurrency(entry.amount)} on {entry.teamShortName}
                      </div>
                    ) : (
                      <div key={entry.id} className="px-3 py-1.5 text-xs text-gray-400">
                        <span className={`font-medium ${isMe ? "text-primary-400" : ""}`}>{entry.username}</span> removed {formatCurrency(entry.amount)} bet
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Admin: Set toss time (betting closes at toss) */}
      {isAdmin && selectedMatch && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-3">
          <p className="text-xs font-medium text-amber-400 mb-2">Admin — Toss time</p>
          <p className="text-xs text-gray-400 mb-2">Betting closes at this time. Leave empty to use 30 min before match start. To test lock rebalance (e.g. everyone on same side), set toss to a time already in the past.</p>
          <form onSubmit={handleSaveTimes} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1" title="When betting closes; empty = 30 min before match">Toss time</label>
              <input
                type="datetime-local"
                value={tossTimeInput}
                onChange={(e) => setTossTimeInput(e.target.value)}
                className="w-full max-w-xs bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            {timesError && <p className="text-xs text-red-400">{timesError}</p>}
            <button type="submit" disabled={timesSaving} className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-600/80 text-white hover:bg-amber-500 disabled:opacity-50">
              {timesSaving ? "Saving…" : "Save"}
            </button>
          </form>
          <div className="mt-3 pt-3 border-t border-amber-500/30">
            <p className="text-xs text-gray-400 mb-2">If everyone bet on the same side, run lock rebalance to move one (or two) to the other side.</p>
            <button
              type="button"
              onClick={handleForceRebalance}
              disabled={rebalanceLoading}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-600/80 text-white hover:bg-gray-500 disabled:opacity-50"
              title="Move 1–2 players (worst leaderboard rank) to the other side when everyone bet on the same team"
            >
              {rebalanceLoading ? "Running…" : "Run lock rebalance now"}
            </button>
            {rebalanceError && <p className="text-xs text-red-400 mt-1">{rebalanceError}</p>}
          </div>
        </div>
      )}

      {/* Admin: Set match result — only visible to Prem18 */}
      {isAdmin && canSettle && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-3">
          <p className="text-xs font-medium text-amber-400 mb-2">Admin — Set result</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSettle(home.id)}
              disabled={settling}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600/80 text-white hover:bg-amber-500 disabled:opacity-50"
              title="Settle match as home team winning; pays out winners and updates leaderboard"
            >
              {home.shortName} won
            </button>
            <button
              type="button"
              onClick={() => handleSettle(away.id)}
              disabled={settling}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600/80 text-white hover:bg-amber-500 disabled:opacity-50"
              title="Settle match as away team winning; pays out winners and updates leaderboard"
            >
              {away.shortName} won
            </button>
          </div>
          {settling && <p className="text-xs text-amber-400 mt-1">Settling…</p>}
        </div>
      )}

      {/* Upset alert toast */}
      {upsetMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-amber-500/90 text-gray-900 font-semibold text-sm shadow-lg animate-pulse">
          🏆 {upsetMessage}
          <button type="button" onClick={() => setUpsetMessage(null)} className="ml-2 opacity-80">×</button>
        </div>
      )}

      {/* BOTTOM: Bet Controls — only until toss time; disabled when countdown 0 */}
      {bettingOpen && (
        <div className="fixed left-0 right-0 bottom-14 z-40 px-4 pb-2 pt-3 bg-gray-900/95 border-t border-gray-800">
          <div className="max-w-lg mx-auto space-y-3">
            {maxStake < MIN_STAKE && user && (
              <p className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1.5 border border-amber-500/30">
                You cannot stake more than your balance when you entered this match. Balance: {formatCurrency(balanceAtMatchEntry)}. Top up to place a bet.
              </p>
            )}
            {user && maxStake >= MIN_STAKE && stake >= maxStakeFromBalance && maxStakeFromBalance >= MIN_STAKE && (
              <p className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1.5 border border-amber-500/30">
                You’re staking your full balance. You’ll need an admin top-up to bet on the next match.
              </p>
            )}
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setStakeCollapsed((c) => !c)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-700/50 transition-colors"
                aria-expanded={!stakeCollapsed}
              >
                <span className="text-sm font-medium" title="Amount you put on your chosen team">Stake</span>
                <span className="text-xs text-gray-400" title="Betting locks at toss">
                  Lock in {formatBetLockCountdown(countdown)}
                </span>
                <span className="text-gray-500 text-sm" aria-hidden>{stakeCollapsed ? "▼" : "▲"}</span>
              </button>
              {!stakeCollapsed && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-700">
                  {myBetAmount > 0 && myBetTeamName && (
                    <p className="text-xs text-gray-300">
                      Your bet: <span className="font-medium text-white">{formatCurrency(myBetAmount)}</span> on {myBetTeamName}
                      {myBetInsured && <span className="text-amber-400 ml-1">🛡 Insured</span>}
                    </p>
                  )}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0" />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={placing || maxStake < MIN_STAKE}
                        onClick={() => {
                          const current = parseInt(stakeInputValue, 10) || stake;
                          const newStake = Math.max(MIN_STAKE, Math.min(current - STAKE_STEP, maxStake));
                          setStake(newStake);
                          setStakeInputValue(String(newStake));
                          setStakeProtected(newStake);
                          if (user && id && userBetTeamId && bettingOpen) {
                            handlePlaceBetFromDrop(userBetTeamId, newStake);
                          }
                        }}
                        className="w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-bold disabled:opacity-50"
                      >
                        -10
                      </button>
                      <span className={stakeAnimating ? "stake-value-transition inline-block" : "inline-block"}>
                        <input
                          type="number"
                          min={MIN_STAKE}
                          max={maxStake}
                          step={1}
                          value={stakeInputValue}
                          disabled={maxStake < MIN_STAKE}
                          onFocus={() => { stakeInputFocusedRef.current = true; }}
                        onBlur={() => {
                          stakeInputFocusedRef.current = false;
                          const n = Math.floor(Number(stakeInputValue));
                          const clamped = Number.isNaN(n) || n < MIN_STAKE
                            ? MIN_STAKE
                            : Math.min(n, maxStake);
                          const finalStake = Math.floor(clamped);
                          setStake(finalStake);
                          setStakeInputValue(String(finalStake));
                          setStakeProtected(finalStake);
                          if (user && id && userBetTeamId && bettingOpen && !placing) {
                            handlePlaceBetFromDrop(userBetTeamId, finalStake);
                          }
                        }}
                          onChange={(e) => setStakeInputValue(toIntegerStake(e.target.value))}
                          className="w-16 text-center font-bold bg-gray-800 border border-gray-600 rounded-lg px-1 py-1.5 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          aria-label="Stake amount"
                        />
                      </span>
                      <button
                        type="button"
                        disabled={placing || maxStake < MIN_STAKE}
                        onClick={() => {
                          const current = parseInt(stakeInputValue, 10) || stake;
                          const newStake = Math.min(current + STAKE_STEP, maxStake);
                          setStake(newStake);
                          setStakeInputValue(String(newStake));
                          setStakeProtected(newStake);
                          if (user && id && userBetTeamId && bettingOpen) {
                            handlePlaceBetFromDrop(userBetTeamId, newStake);
                          }
                        }}
                        className="w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-bold disabled:opacity-50"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                  {participantCount >= 1 && (
                    <>
                      <p className="text-xs text-gray-500" title="Max is the lower of: half of current pool (excluding your bet) or your available balance">
                        Min {formatCurrency(MIN_STAKE)} · Max {formatCurrency(maxStake)} (half of pool, capped by balance)
                      </p>
                      {totalPool > 0 && (
                        <p className="text-xs text-amber-400/95 bg-amber-500/10 rounded-lg px-2 py-1.5 border border-amber-500/30">
                          Max stake is half of the present pool ({formatCurrency(presentPool)} → {formatCurrency(halfPoolNum)}) or your balance. Your max: {formatCurrency(maxStake)}.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer" title="Cost is deducted when you place the bet; if your side loses you get 50% of your stake back">
              <input
                type="checkbox"
                checked={insured}
                onChange={(e) => setInsured(e.target.checked)}
                className="rounded border-gray-600"
              />
              <span>Insurance: {formatCurrency(INSURANCE_COST)} — get {INSURANCE_REFUND_PERCENT}% stake back if you lose</span>
            </label>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            {success && <p className="text-green-400 text-sm text-center">{success}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
