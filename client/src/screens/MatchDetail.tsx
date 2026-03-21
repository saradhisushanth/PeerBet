import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useMatchStore, type Match, type MatchSummary as MatchSummaryType } from "../store/matchStore";
import { useAuthStore } from "../store/authStore";
import { useBetStore, type Bet } from "../store/betStore";
import { useSocketEvent } from "../hooks/useSocket";
import { joinMatchRoom, leaveMatchRoom } from "../services/socket";
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
import ProfitBreakdown from "../components/ProfitBreakdown";
import { formatCurrency, formatNumber } from "../utils/format";
import type { BetPlacedPayload, MatchUpdatePayload } from "@shared/types";

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
  settlementResults?: { userId: string; username: string; side: string; stake: number; poolGained: number; basePoolShare?: number; underdogBonus?: number; winningStreakAfter?: number; streakBonus?: number }[];
  settlementMeta?: { totalPool: number; losingPool: number; totalWinningStake: number; underdogSide?: string };
}

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { selectedMatch, setSelectedMatch, getMatchDetailCache, setMatchDetailCache } = useMatchStore();
  const { user, setBalance, updateUser } = useAuthStore();
  const { addBet } = useBetStore();

  const [stake, setStake] = useState(Math.max(MIN_STAKE, 300));
  const [stakeInputValue, setStakeInputValue] = useState(String(Math.max(MIN_STAKE, 300)));
  const [stakeAnimating, setStakeAnimating] = useState(false);
  const [stakeCollapsed, setStakeCollapsed] = useState(false);
  const stakeInputFocusedRef = useRef(false);
  const stakeInputRef = useRef<HTMLInputElement>(null);
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
  const [stakeLocked, setStakeLocked] = useState(false);
  const [stakeWarning, setStakeWarning] = useState<string | null>(null);
  const stakeWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flashStakeWarning(msg: string) {
    setStakeWarning(msg);
    if (stakeWarningTimerRef.current) clearTimeout(stakeWarningTimerRef.current);
    stakeWarningTimerRef.current = setTimeout(() => setStakeWarning(null), 5000);
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

  /** On-board bet = single source of truth for stake when user has already placed (not undecided-only draft). */
  const myBetAmount = useMemo(() => {
    if (!board || !user) return 0;
    return (
      board.onHome.find((p) => p.userId === user.id)?.amount ??
      board.onAway.find((p) => p.userId === user.id)?.amount ??
      0
    );
  }, [board, user?.id]);

  const myBetInsured = useMemo(() => {
    if (!board || !user) return false;
    return (
      board.onHome.find((p) => p.userId === user.id)?.insured ??
      board.onAway.find((p) => p.userId === user.id)?.insured ??
      false
    );
  }, [board, user?.id]);

  /** Drop stale summary/board HTTP responses so an older payload cannot lower totalPool and clamp another user's stake. */
  const matchDetailLoadGenRef = useRef(0);
  const summaryFetchSeqRef = useRef(0);
  const boardFetchSeqRef = useRef(0);

  const fetchSummary = useCallback(() => {
    if (!id) return Promise.resolve();
    const mySeq = ++summaryFetchSeqRef.current;
    return api.matches.getSummary(id).then((data) => {
      if (mySeq !== summaryFetchSeqRef.current) return;
      setSummary(data as MatchSummary);
    });
  }, [id]);

  const fetchBoard = useCallback(() => {
    if (!id) return Promise.resolve();
    const mySeq = ++boardFetchSeqRef.current;
    return api.matches.getBoard(id).then((data) => {
      if (mySeq !== boardFetchSeqRef.current) return;
      setBoard(data);
    });
  }, [id]);

  const debouncedRefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefetch = useCallback(() => {
    if (debouncedRefetchRef.current) clearTimeout(debouncedRefetchRef.current);
    debouncedRefetchRef.current = setTimeout(() => {
      fetchSummary();
      fetchBoard();
    }, 300);
  }, [fetchSummary, fetchBoard]);
  useEffect(() => {
    return () => { if (debouncedRefetchRef.current) clearTimeout(debouncedRefetchRef.current); };
  }, []);

  useEffect(() => {
    if (!id) return;
    const loadGen = ++matchDetailLoadGenRef.current;
    summaryFetchSeqRef.current += 1;
    boardFetchSeqRef.current += 1;
    const sumSnap = summaryFetchSeqRef.current;
    const brdSnap = boardFetchSeqRef.current;

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
      if (loadGen !== matchDetailLoadGenRef.current) return;
      const matchData = match as Match;
      const summaryDataTyped = summaryData as MatchSummary;
      setSelectedMatch(matchData);
      const appliedSum = summaryFetchSeqRef.current === sumSnap;
      const appliedBrd = boardFetchSeqRef.current === brdSnap;
      if (appliedSum) setSummary(summaryDataTyped);
      if (appliedBrd) setBoard(boardData);
      if (appliedSum && appliedBrd) {
        setMatchDetailCache(id, { match: matchData, summary: summaryDataTyped as MatchSummaryType, board: boardData });
      }
    });
    api.auth.me().then((me) => updateUser({ balance: me.balance, prizePoolContribution: me.prizePoolContribution, consecutiveMissedMatches: me.consecutiveMissedMatches }));
    joinMatchRoom(id);
    return () => {
      leaveMatchRoom(id!);
    };
  }, [id, setSelectedMatch, setMatchDetailCache, getMatchDetailCache, updateUser]);

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
    const rawAmount =
      board.onHome.find((p) => p.userId === user.id)?.amount ??
      board.onAway.find((p) => p.userId === user.id)?.amount;
    /** Prefer undecided list so a stale board cannot treat us as "on a team" and overwrite draft stake. */
    const inUndecided = board.undecided.some((p) => p.userId === user.id);
    const amount = inUndecided ? undefined : rawAmount;
    const justPlaced = lastPlacedStakeRef.current;
    if (justPlaced !== null) {
      if (rawAmount === justPlaced && !inUndecided) {
        lastBoardAmountRef.current = rawAmount;
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
      // While editing stake unlocked, don't push server amount into local draft (commit on Lock only).
      if (!(myBetAmount > 0 && !stakeLocked)) {
        setStake(amount);
        setStakeInputValue(String(amount));
      }
    } else if (amount == null) {
      // Board can briefly omit the chip during refetch; don't wipe ref while stake is locked (source for unlock).
      if (!(stakeLocked && stake >= MIN_STAKE)) {
        lastBoardAmountRef.current = null;
      }
    }
  }, [board?.onHome, board?.onAway, board?.undecided, user?.id, placing, myBetAmount, stakeLocked, stake]);

  useEffect(() => {
    return () => {
      if (lastPlacedStakeTimeoutRef.current) clearTimeout(lastPlacedStakeTimeoutRef.current);
      if (stakeWarningTimerRef.current) clearTimeout(stakeWarningTimerRef.current);
    };
  }, []);

  // Sync input display: locked + has bet → show server amount; else show local draft (`stake`).
  useEffect(() => {
    if (lastPlacedStakeRef.current !== null || stakeInputFocusedRef.current) return;
    const hasBet = myBetAmount > 0;
    // While locked, prefer board amount but fall back to stake if board is briefly stale (0).
    const serverStake = hasBet ? myBetAmount : lastBoardAmountRef.current ?? 0;
    const truth =
      stakeLocked && (serverStake > 0 || stake >= MIN_STAKE)
        ? serverStake > 0
          ? serverStake
          : stake
        : stake;
    setStakeInputValue(String(truth));
    if (stakeLocked && hasBet && stake !== myBetAmount) {
      setStake(myBetAmount);
    }
  }, [stake, myBetAmount, stakeLocked]);

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

  /**
   * Do not auto-clamp `stake` when pool/summary changes (e.g. another player bets).
   * Stake is local draft state; max is enforced on +/-, blur, and place. Board sync only
   * updates stake when *this user's* confirmed on-board amount changes.
   */

  const handleMatchUpdate = useCallback(() => {
    if (id) {
      api.matches.getById(id).then((data) => setSelectedMatch(data as Match));
      fetchSummary();
    }
  }, [id, setSelectedMatch, fetchSummary]);

  useSocketEvent("matchUpdate", (data: MatchUpdatePayload) => {
    if (!id || data.matchId !== id) return;
    api.matches.getById(id).then((match) => setSelectedMatch(match as Match));
    debouncedRefetch();
    api.auth.me().then((me) =>
      updateUser({
        balance: me.balance,
        prizePoolContribution: me.prizePoolContribution,
        consecutiveMissedMatches: me.consecutiveMissedMatches,
      })
    );
  });
  useSocketEvent("betPlaced", (data: BetPlacedPayload) => {
    if (!id || data.matchId !== id) return;
    debouncedRefetch();
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
    debouncedRefetch();
  });

  async function handlePlaceBetFromDrop(teamId: string, amount: number): Promise<boolean> {
    if (!user || !id) return false;
    setError(null);
    setSuccess(null);

    // Balance before placing/editing any bet on this match (add back current match stake + insurance)
    const balanceBeforeThisMatch =
      (user.balance ?? 0) + myBetAmount + (myBetInsured ? INSURANCE_COST : 0);
    const totalRequired = amount + (insured ? INSURANCE_COST : 0);
    if (totalRequired > balanceBeforeThisMatch) {
      setError(`You cannot stake more than your balance when you entered this match. Balance: ${formatCurrency(balanceBeforeThisMatch)}.`);
      return false;
    }

    const pool = summary?.totalPool ?? 0;
    const myBetAmt =
      board && user
        ? board.onHome.find((p) => p.userId === user.id)?.amount ?? board.onAway.find((p) => p.userId === user.id)?.amount ?? 0
        : 0;
    const presentPoolVal = Number(pool) - myBetAmt;
    const poolCapVal = presentPoolVal > 0 ? Math.floor(presentPoolVal) : MAX_STAKE;
    const maxFromPool = Math.max(MIN_STAKE, Math.min(poolCapVal, MAX_STAKE));
    const available = balanceBeforeThisMatch;
    const effectiveMaxStake = Math.min(maxFromPool, Math.max(0, available - (insured ? INSURANCE_COST : 0)));

    if (amount < MIN_STAKE) {
      setError(`Minimum stake is ${formatCurrency(MIN_STAKE)}`);
      return false;
    }
    if (amount > MAX_STAKE) {
      setError(`Maximum stake is ${formatCurrency(MAX_STAKE)}`);
      return false;
    }
    if (amount > effectiveMaxStake) {
      setError(`Stake too high. Max is ${formatCurrency(effectiveMaxStake)} (pool / balance cap).`);
      return false;
    }

    // Optimistic update: move chip immediately in local state
    const prevBoard = board;
    if (board && user) {
      const me = { userId: user.id, username: user.username, amount, insured };
      const withoutMe = (list: typeof board.onHome) => list.filter((p) => p.userId !== user.id);
      const isHome = teamId === board.homeTeam.id;
      setBoard({
        ...board,
        onHome: isHome ? [...withoutMe(board.onHome), me] : withoutMe(board.onHome),
        onAway: isHome ? withoutMe(board.onAway) : [...withoutMe(board.onAway), me],
        undecided: board.undecided.filter((p) => p.userId !== user.id),
      });
    }

    setPlacing(true);
    try {
      const { bet, wallet } = await api.bets.place(id, teamId, amount, insured);
      addBet(bet as Bet);
      const teamName = selectedMatch?.homeTeam.id === teamId ? selectedMatch.homeTeam.shortName : selectedMatch?.awayTeam.shortName;
      setSuccess(`Bet ${formatCurrency(amount)} on ${teamName}`);
      setStakeProtected(amount, 2000);
      setStakeLocked(true);
      updateUser({
        balance: wallet.balance,
        prizePoolContribution: wallet.prizePoolContribution,
        consecutiveMissedMatches: wallet.consecutiveMissedMatches,
      });
      // Refresh board + summary in parallel immediately (no debounce) so drag-drop feels snappy.
      void Promise.all([fetchBoard(), fetchSummary()]).catch(() => {});
      return true;
    } catch (err) {
      setBoard(prevBoard);
      setError(err instanceof Error ? err.message : "Failed to place bet");
      return false;
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

    // Preserve the current stake so pool/balance changes from cancellation don't clamp it
    setStakeProtected(stake, 3000);

    // Optimistic update: move chip back to undecided
    const prevBoard = board;
    if (board) {
      const withoutMe = (list: typeof board.onHome) => list.filter((p) => p.userId !== user.id);
      const alreadyUndecided = board.undecided.some((p) => p.userId === user.id);
      setBoard({
        ...board,
        onHome: withoutMe(board.onHome),
        onAway: withoutMe(board.onAway),
        undecided: alreadyUndecided ? board.undecided : [...board.undecided, { userId: user.id, username: user.username }],
      });
    }

    setPlacing(true);
    setError(null);
    setSuccess(null);
    try {
      const cancelled = await api.bets.cancel(id) as { amount: number; insured?: boolean } | null;
      if (cancelled) {
        const refund = cancelled.amount + (cancelled.insured ? INSURANCE_COST : 0);
        setBalance(user.balance + refund);
        setSuccess("Bet cancelled");
        setStakeLocked(false);
      }
      debouncedRefetch();
    } catch (err) {
      setBoard(prevBoard);
      setError(err instanceof Error ? err.message : "Failed to cancel bet");
    } finally {
      setPlacing(false);
    }
  }

  /** Balance before placing/editing any bet on this match (state when they entered the match). */
  const balanceAtMatchEntry =
    (user?.balance ?? 0) + myBetAmount + (myBetInsured ? INSURANCE_COST : 0);
  useEffect(() => {
    if (board && user && myBetAmount > 0) setInsured(myBetInsured);
  }, [board, user?.id, myBetAmount, myBetInsured]);

  if (!selectedMatch) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-slate-500">Loading match...</p>
      </div>
    );
  }

  const home = selectedMatch.homeTeam;
  const away = selectedMatch.awayTeam;

  const teamBarColor: Record<string, string> = {
    RCB: "bg-red-600", SRH: "bg-orange-500", MI: "bg-blue-600",
    CSK: "bg-amber-400", KKR: "bg-purple-600", DC: "bg-indigo-600",
    RR: "bg-rose-500", PBKS: "bg-red-700", GT: "bg-slate-500",
    LSG: "bg-green-600",
  };

  const isUpcoming = selectedMatch.status === "UPCOMING";
  const bettingOpen = isUpcoming && countdown > 0;
  const isAdmin = user?.username === ADMIN_USERNAME;
  const canSettle = !selectedMatch.winner && (isUpcoming || selectedMatch.status === "LIVE");
  const totalPool = summary?.totalPool ?? 0;
  const totalPoolNum = Number(totalPool);
  const presentPool = totalPoolNum - myBetAmount;
  const participantCount = board ? board.onHome.length + board.onAway.length : 0;
  const poolCapNum = presentPool > 0 ? Math.floor(presentPool) : MAX_STAKE;
  const maxStakeFromPool = Math.max(MIN_STAKE, Math.min(poolCapNum, MAX_STAKE));
  const availableBalance = (user?.balance ?? 0) + myBetAmount;
  const maxStakeFromBalance = Math.max(0, availableBalance - (insured ? INSURANCE_COST : 0));
  const maxStake = Math.min(maxStakeFromPool, maxStakeFromBalance);

  function blurStakeInput() {
    stakeInputFocusedRef.current = false;
    stakeInputRef.current?.blur();
  }

  /** Clamp stake input to min/max and sync `stake` (same rules as input blur). */
  function clampStakeInputToState(): number {
    const n = Math.floor(Number(stakeInputValue));
    if (!Number.isNaN(n) && n < MIN_STAKE) {
      flashStakeWarning(`Minimum stake is ${formatCurrency(MIN_STAKE)}. Adjusted to minimum.`);
    } else if (!Number.isNaN(n) && n > maxStake) {
      flashStakeWarning(`Maximum stake is ${formatCurrency(maxStake)} (pool / balance cap). Adjusted to max.`);
    }
    const clamped = Number.isNaN(n) || n < MIN_STAKE ? MIN_STAKE : Math.min(n, maxStake);
    const finalStake = Math.floor(clamped);
    setStake(finalStake);
    setStakeInputValue(String(finalStake));
    setStakeProtected(finalStake);
    return finalStake;
  }

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

  /** Solo rules UI only for the single bettor — not for undecided viewers on the same match. */
  const isSoleBettor = participantCount === 1 && !!userBetTeamId;

  return (
    <div className={bettingOpen ? "pb-80" : "pb-32"}>
      {/* TOP BAR: Match | Timer | Pool | Notifications */}
      <header className="sticky top-0 z-40 grid grid-cols-4 gap-2 items-center border-b border-slate-200 bg-white/95 backdrop-blur-sm px-3 py-2">
        <div className="truncate text-sm font-semibold flex items-center gap-2" title={`${home.shortName} vs ${away.shortName}`}>
          <Link
            to="/"
            className="inline-flex items-center justify-center h-7 px-2 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
            title="Back to fixtures"
          >
            ←
          </Link>
          <span className="truncate">{home.shortName} vs {away.shortName}</span>
        </div>
        <div className="text-center text-xs text-slate-500" title={selectedMatch.tossTime ? "Betting closes at toss" : "Betting closes 30 min before match"}>
          {isUpcoming ? "Toss in " + formatBetLockCountdown(countdown) : "—"}
        </div>
        <div className="text-center text-xs font-medium text-green-400" title="Total stakes on this match from all players">
          {formatCurrency(totalPool)}
        </div>
        <div className="flex justify-end">
          <span className="text-slate-500 text-xs" aria-label="Notifications" title="Notifications">🔔</span>
        </div>
      </header>

      {/* Lock warning: last 2 (or 1 if only 2 playing) by leaderboard will be auto-assigned to the other side */}
      {bettingOpen && countdown > 0 && countdown <= 60 && (
        <div className="px-3 pt-2">
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 max-w-xl">
            <p className="text-xs font-medium text-amber-400">
              ⏱ When betting locks, the last 2 participants (by overall leaderboard rank) will be auto-assigned to the other side to balance the match.
            </p>
            <p className="text-xs text-amber-700/90 mt-1">
              {participantCount === 2
                ? "With only 2 players, the one with the lower leaderboard rank will be moved."
                : participantCount === 1
                  ? isSoleBettor
                    ? "Only one player has bet — solo participant rules apply (see below)."
                    : "One player has bet so far — you can still join before the lock."
                  : "Get your pick in before the countdown hits zero."}
            </p>
          </div>
        </div>
      )}

      {/* Solo participant: one player only — win bonus + bye refund (bettor only) */}
      {bettingOpen && isSoleBettor && (
        <div className="px-3 pt-2">
          <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 max-w-xl">
            <p className="text-xs font-medium text-slate-600">
              Only one player has bet on this match. No auto-assign.
            </p>
            <p className="text-xs text-slate-600 mt-1">
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
            <p className="text-xs text-amber-700/90 mt-1">
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
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm" title="Share of total stake on each team (not odds)">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">Momentum</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span>{home.shortName} <span className="text-slate-600">{momentumHome}%</span></span>
                <span>{away.shortName} <span className="text-slate-600">{momentumAway}%</span></span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                <div className={`${teamBarColor[home.shortName] ?? "bg-primary-500"} h-full transition-all`} style={{ width: `${momentumHome}%` }} title={`${home.shortName} ${momentumHome}%`} />
                <div className={`${teamBarColor[away.shortName] ?? "bg-accent-500"} h-full`} style={{ width: `${momentumAway}%` }} title={`${away.shortName} ${momentumAway}%`} />
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
              onPlaceBet={async (teamId, amount) => {
                await handlePlaceBetFromDrop(teamId, amount);
              }}
              onCancelBet={handleCancelBetFromDrop}
              placing={placing}
              isUpcoming={isUpcoming}
              bettingOpen={bettingOpen}
              canAffordBet={maxStake >= MIN_STAKE}
              winnerTeamId={selectedMatch.winner?.id ?? null}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-4 min-h-[120px] flex items-center justify-center text-slate-500 text-sm shadow-sm">
              Loading board...
            </div>
          )}
        </section>

        {/* RIGHT: Match results (when settled) + History Feed */}
        <aside className="lg:col-span-3 space-y-4">
          {settlementResults.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <h3 className="text-xs font-semibold text-slate-500 px-3 py-2 border-b border-slate-200">
                Match results
              </h3>
              <p className="px-3 py-1 text-[10px] text-slate-500 border-b border-slate-200">
                Profit = pool share + underdog bonus (1.3× if you backed the underdog) + streak bonus (2nd–5th consecutive win).
              </p>
              <div className="divide-y divide-slate-200">
                <div className="px-3 py-2 grid grid-cols-[minmax(0,1fr)_3.5rem_5rem_2.5rem_5rem] gap-x-4 gap-y-0 text-xs text-slate-500 items-center">
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
                    <span className="text-right text-slate-500">{r.side}</span>
                    <span className={`text-right font-medium tabular-nums ${r.poolGained >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {r.poolGained >= 0 ? "+" : ""}{formatCurrency(r.poolGained, 2)}
                    </span>
                    <span className="text-right text-slate-500 tabular-nums">{r.winningStreakAfter != null ? r.winningStreakAfter : "—"}</span>
                    <span className="text-right text-amber-400 tabular-nums">{r.streakBonus != null && r.streakBonus > 0 ? "+" + formatCurrency(r.streakBonus, 0) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Profit breakdown for current user (winners only) */}
          {(() => {
            const myResult = user && settlementResults.find((r) => r.userId === user.id);
            const meta = summary?.settlementMeta;
            if (!myResult || myResult.poolGained <= 0 || !meta) return null;
            const isUnderdog = meta.underdogSide === myResult.side;
            return (
              <ProfitBreakdown
                stake={myResult.stake}
                basePoolShare={myResult.basePoolShare ?? 0}
                underdogBonus={myResult.underdogBonus ?? 0}
                streakBonus={myResult.streakBonus ?? 0}
                totalPool={meta.totalPool}
                losingPool={meta.losingPool}
                totalWinningStake={meta.totalWinningStake}
                underdogSide={meta.underdogSide}
                playerSide={myResult.side}
                isUnderdog={isUnderdog}
              />
            );
          })()}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-52 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 px-3 py-2 border-b border-slate-200 shrink-0" title="Recent bets and bet removals for this match">History Feed</h3>
            <div className="divide-y divide-slate-200 min-h-0 flex-1 overflow-y-auto">
              {recentBets.length === 0 && recentRemovals.length === 0 ? (
                <p className="px-3 py-4 text-slate-500 text-xs">No activity yet</p>
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
                      <div key={entry.id} className="px-3 py-1.5 text-xs text-slate-500">
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
          <p className="text-xs text-slate-500 mb-2">Betting closes at this time. Leave empty to use 30 min before match start. To test lock rebalance (e.g. everyone on same side), set toss to a time already in the past.</p>
          <form onSubmit={handleSaveTimes} className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1" title="When betting closes; empty = 30 min before match">Toss time</label>
              <input
                type="datetime-local"
                value={tossTimeInput}
                onChange={(e) => setTossTimeInput(e.target.value)}
                className="w-full max-w-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            {timesError && <p className="text-xs text-red-400">{timesError}</p>}
            <button type="submit" disabled={timesSaving} className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-600/80 text-white hover:bg-amber-500 disabled:opacity-50">
              {timesSaving ? "Saving…" : "Save"}
            </button>
          </form>
          <div className="mt-3 pt-3 border-t border-amber-500/30">
            <p className="text-xs text-slate-500 mb-2">If everyone bet on the same side, run lock rebalance to move one (or two) to the other side.</p>
            <button
              type="button"
              onClick={handleForceRebalance}
              disabled={rebalanceLoading}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
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
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-amber-500/90 text-slate-900 font-semibold text-sm shadow-lg animate-pulse">
          🏆 {upsetMessage}
          <button type="button" onClick={() => setUpsetMessage(null)} className="ml-2 opacity-80">×</button>
        </div>
      )}

      {/* BOTTOM: Bet Controls — only until toss time; disabled when countdown 0 */}
      {bettingOpen && (
        <div className="fixed left-0 right-0 bottom-14 z-40 px-4 pb-2 pt-3 bg-white/95 border-t border-slate-200 backdrop-blur-sm shadow-[0_-8px_20px_rgba(15,23,42,0.08)]">
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
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setStakeCollapsed((c) => !c)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                aria-expanded={!stakeCollapsed}
              >
                <span className="text-sm font-medium" title="Amount you put on your chosen team">Stake</span>
                <span className="text-xs text-slate-500" title="Betting locks at toss">
                  Lock in {formatBetLockCountdown(countdown)}
                </span>
                <span className="text-slate-500 text-sm" aria-hidden>{stakeCollapsed ? "▼" : "▲"}</span>
              </button>
              {!stakeCollapsed && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-slate-200">
                  {myBetAmount > 0 && myBetTeamName && (
                    <p className="text-xs text-slate-600">
                      Your bet: <span className="font-medium text-slate-900">{formatCurrency(myBetAmount)}</span> on {myBetTeamName}
                      {myBetInsured && <span className="text-amber-400 ml-1">🛡 Insured</span>}
                    </p>
                  )}
                  {stakeWarning && (
                    <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-2 py-1.5 border border-red-500/30 animate-pulse">
                      {stakeWarning}
                    </p>
                  )}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={placing}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={async () => {
                        if (placing) return;
                        if (stakeLocked) {
                          setStakeLocked(false);
                          // `myBetAmount` can be 0 during board refetch; prefer locked `stake`, then last good board ref.
                          const committed =
                            myBetAmount > 0
                              ? myBetAmount
                              : lastBoardAmountRef.current != null && lastBoardAmountRef.current > 0
                                ? lastBoardAmountRef.current
                                : stake;
                          const v = Math.max(MIN_STAKE, Math.floor(Number(committed)));
                          setStake(v);
                          setStakeInputValue(String(v));
                          return;
                        }
                        // Lock: blur field, commit typed value, then lock UI (optimistic before save).
                        blurStakeInput();
                        const finalAmt = clampStakeInputToState();
                        if (userBetTeamId && bettingOpen && myBetAmount > 0) {
                          if (finalAmt !== myBetAmount) {
                            setStakeLocked(true);
                            const ok = await handlePlaceBetFromDrop(userBetTeamId, finalAmt);
                            if (!ok) setStakeLocked(false);
                          } else {
                            setStakeLocked(true);
                          }
                          return;
                        }
                        setStakeLocked(true);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        stakeLocked
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200"
                      }`}
                      title={
                        stakeLocked
                          ? "Unlock to change stake; changes stay local until you lock again."
                          : myBetAmount > 0
                            ? "Save your stake to the server (one request)."
                            : "Lock the counter to prevent accidental changes."
                      }
                    >
                      {stakeLocked ? "🔒 Unlock" : "🔓 Lock Stake"}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={placing || maxStake < MIN_STAKE || stakeLocked}
                        onClick={() => {
                          const current = parseInt(stakeInputValue, 10) || stake;
                          const attempted = current - STAKE_STEP;
                          if (attempted < MIN_STAKE) {
                            flashStakeWarning(`Minimum stake is ${formatCurrency(MIN_STAKE)}. Cannot go lower.`);
                            if (current > MIN_STAKE) {
                              setStake(MIN_STAKE);
                              setStakeInputValue(String(MIN_STAKE));
                              setStakeProtected(MIN_STAKE);
                            }
                            return;
                          }
                          const newStake = Math.max(MIN_STAKE, Math.min(attempted, maxStake));
                          setStake(newStake);
                          setStakeInputValue(String(newStake));
                          setStakeProtected(newStake);
                        }}
                        className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-300 hover:bg-slate-200 text-sm font-bold disabled:opacity-50"
                      >
                        -10
                      </button>
                      <span className={stakeAnimating ? "stake-value-transition inline-block" : "inline-block"}>
                        <input
                          ref={stakeInputRef}
                          type="number"
                          min={MIN_STAKE}
                          max={maxStake}
                          step={1}
                          value={stakeInputValue}
                          disabled={maxStake < MIN_STAKE || stakeLocked}
                          onFocus={() => { stakeInputFocusedRef.current = true; }}
                          onBlur={() => {
                            stakeInputFocusedRef.current = false;
                            clampStakeInputToState();
                          }}
                          onChange={(e) => setStakeInputValue(toIntegerStake(e.target.value))}
                          className={`w-16 text-center font-bold border rounded-lg px-1 py-1.5 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            stakeLocked ? "bg-amber-50 border-amber-300 text-amber-600" : "bg-white border-slate-300 text-slate-800"
                          }`}
                          aria-label="Stake amount"
                        />
                      </span>
                      <button
                        type="button"
                        disabled={placing || maxStake < MIN_STAKE || stakeLocked}
                        onClick={() => {
                          const current = parseInt(stakeInputValue, 10) || stake;
                          const attempted = current + STAKE_STEP;
                          if (attempted > maxStake) {
                            flashStakeWarning(`Maximum stake is ${formatCurrency(maxStake)} (pool / balance cap). Cannot go higher.`);
                            if (current < maxStake) {
                              setStake(maxStake);
                              setStakeInputValue(String(maxStake));
                              setStakeProtected(maxStake);
                            }
                            return;
                          }
                          const newStake = Math.min(attempted, maxStake);
                          setStake(newStake);
                          setStakeInputValue(String(newStake));
                          setStakeProtected(newStake);
                        }}
                        className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-300 hover:bg-slate-200 text-sm font-bold disabled:opacity-50"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                  {myBetAmount > 0 && !stakeLocked && (
                    <p className="text-xs text-amber-400/90">
                      Adjust stake locally, then tap <strong>Lock Stake</strong> once to save to the server.
                    </p>
                  )}
                  {participantCount >= 1 && (
                    <>
                      <p className="text-xs text-slate-500" title="Max is the lower of: current pool (excluding your bet) or your available balance">
                        Min {formatCurrency(MIN_STAKE)} · Max {formatCurrency(maxStake)} (pool, capped by balance)
                      </p>
                      {totalPool > 0 && (
                        <p className="text-xs text-amber-400/95 bg-amber-500/10 rounded-lg px-2 py-1.5 border border-amber-500/30">
                          Max stake is the present pool ({formatCurrency(presentPool)}) or your balance. Your max: {formatCurrency(maxStake)}.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer" title="Cost is deducted when you place the bet; if your side loses you get 50% of your stake back">
              <input
                type="checkbox"
                checked={insured}
                onChange={(e) => setInsured(e.target.checked)}
                className="rounded border-slate-300"
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
