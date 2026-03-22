import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { useMatchStore, type Match, type MatchSummary as MatchSummaryType } from "../store/matchStore";
import { useAuthStore } from "../store/authStore";
import { useBetStore, type Bet } from "../store/betStore";
import { useSocketEvent } from "../hooks/useSocket";
import { joinMatchRoom, leaveMatchRoom } from "../services/socket";
import { api } from "../services/api";
import {
  ADMIN_USERNAME, MIN_STAKE, MAX_STAKE, INSURANCE_COST,
  INSURANCE_REFUND_PERCENT, TOSS_DEFAULT_MINUTES_BEFORE_MATCH,
} from "@shared/constants";
import PlayerBettingBoard from "../components/PlayerBettingBoard";
import ProfitBreakdown from "../components/ProfitBreakdown";
import { formatCurrency } from "../utils/format";
import { getTeamLogo, getTeamLogoVisualScale } from "../utils/teamLogos";
import type { BetPlacedPayload, MatchUpdatePayload } from "@shared/types";

const STAKE_STEP = 10;

/* ─── helpers ──────────────────────────────────────────────────────────── */

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIntegerStake(v: string): string {
  if (v === "" || v === "-") return v;
  const n = Math.floor(Number(v));
  return Number.isNaN(n) || n < 0 ? "" : String(n);
}

function formatBetLockCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), rem1 = s % 86400;
  const h = Math.floor(rem1 / 3600), rem2 = rem1 % 3600;
  const m = Math.floor(rem2 / 60), sec = rem2 % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

interface MatchSummary {
  matchId: string; totalPool: number;
  momentum: { homePercent: number; awayPercent: number };
  recentBets: { id: string; username: string; teamShortName: string; amount: number; createdAt: string }[];
  settlementResults?: { userId: string; username: string; side: string; stake: number; poolGained: number; basePoolShare?: number; underdogBonus?: number; winningStreakAfter?: number; streakBonus?: number }[];
  settlementMeta?: { totalPool: number; losingPool: number; totalWinningStake: number; underdogSide?: string };
}

const TEAM_ACCENT: Record<string, { bar: string; ring: string; bg: string }> = {
  RCB:  { bar: "bg-red-600",    ring: "ring-red-500",    bg: "bg-red-50"    },
  SRH:  { bar: "bg-orange-500", ring: "ring-orange-400", bg: "bg-orange-50" },
  MI:   { bar: "bg-blue-600",   ring: "ring-blue-500",   bg: "bg-blue-50"   },
  CSK:  { bar: "bg-amber-400",  ring: "ring-amber-400",  bg: "bg-amber-50"  },
  KKR:  { bar: "bg-purple-600", ring: "ring-purple-500", bg: "bg-purple-50" },
  DC:   { bar: "bg-indigo-600", ring: "ring-indigo-500", bg: "bg-indigo-50" },
  RR:   { bar: "bg-rose-500",   ring: "ring-rose-400",   bg: "bg-rose-50"   },
  PBKS: { bar: "bg-red-700",    ring: "ring-red-600",    bg: "bg-red-50"    },
  GT:   { bar: "bg-slate-600",  ring: "ring-slate-400",  bg: "bg-slate-50"  },
  LSG:  { bar: "bg-green-600",  ring: "ring-green-500",  bg: "bg-green-50"  },
};
const accent = (s: string) => TEAM_ACCENT[s] ?? { bar: "bg-rose-500", ring: "ring-rose-400", bg: "bg-rose-50" };

/* ─── TeamPickCard ─ full-width horizontal card for side selection ───────── */
function TeamPickCard({
  team, isSelected, momentum, playerCount, onSelect, disabled, align,
}: {
  team: { id: string; shortName: string; name: string };
  isSelected: boolean; momentum: number; playerCount: number;
  onSelect: () => void; disabled: boolean;
  align: "left" | "right";
}) {
  const logo = getTeamLogo(team.shortName, team.name);
  const logoScale = getTeamLogoVisualScale(team.shortName, team.name);
  const a = accent(team.shortName);
  const isRight = align === "right";

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`
        relative flex ${isRight ? "flex-row-reverse" : "flex-row"} items-center gap-4
        w-full px-5 py-5 rounded-2xl border-2 transition-all duration-200 text-${isRight ? "right" : "left"}
        ${isSelected
          ? `border-transparent ring-2 ${a.ring} ${a.bg} shadow-lg`
          : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-md shadow-sm"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.98]"}
      `}
    >
      {/* Selected badge */}
      {isSelected && (
        <span className={`absolute top-3 ${isRight ? "left-3" : "right-3"} inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold shadow`}>✓</span>
      )}

      {/* Logo */}
      <div className={`shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center p-2 ${isSelected ? "bg-white/80 shadow-sm" : "bg-slate-50 border border-slate-100"}`}>
        {logo
          ? <img src={logo} alt={team.name} className="w-full h-full object-contain" style={{ transform: `scale(${logoScale})` }} />
          : <span className="text-lg font-extrabold text-slate-700">{team.shortName}</span>
        }
      </div>

      {/* Info */}
      <div className={`flex-1 min-w-0 ${isRight ? "text-right" : ""}`}>
        <p className="text-xl font-extrabold text-slate-900 leading-tight">{team.shortName}</p>
        <p className="text-xs text-slate-400 mt-0.5 leading-snug">{team.name}</p>

        {/* Support bar */}
        <div className={`flex items-center gap-2 mt-2.5 ${isRight ? "flex-row-reverse" : ""}`}>
          <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${a.bar}`} style={{ width: `${momentum}%` }} />
          </div>
          <span className="shrink-0 text-xs font-bold text-slate-700 tabular-nums">{momentum}%</span>
        </div>
        <p className={`text-xs text-slate-400 mt-1 ${isRight ? "text-right" : ""}`}>
          {playerCount} player{playerCount !== 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}

/* ─── MatchDetail ─────────────────────────────────────────────────────── */
export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const { selectedMatch, setSelectedMatch, getMatchDetailCache, setMatchDetailCache } = useMatchStore();
  const { user, setBalance, updateUser } = useAuthStore();
  const { addBet } = useBetStore();

  const [stake, setStake] = useState(Math.max(MIN_STAKE, 300));
  const [stakeInputValue, setStakeInputValue] = useState(String(Math.max(MIN_STAKE, 300)));
  const [stakeAnimating, setStakeAnimating] = useState(false);
  const stakeInputFocusedRef = useRef(false);
  const stakeInputRef = useRef<HTMLInputElement>(null);
  const lastBoardAmountRef = useRef<number | null>(null);
  const lastPlacedStakeRef = useRef<number | null>(null);
  const lastPlacedStakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setStakeProtected(value: number, timeoutMs = 800) {
    lastPlacedStakeRef.current = value;
    if (lastPlacedStakeTimeoutRef.current) clearTimeout(lastPlacedStakeTimeoutRef.current);
    lastPlacedStakeTimeoutRef.current = setTimeout(() => { lastPlacedStakeRef.current = null; lastPlacedStakeTimeoutRef.current = null; }, timeoutMs);
  }

  const [stakeLocked, setStakeLocked] = useState(false);
  const [isBetPanelCollapsed, setIsBetPanelCollapsed] = useState(false);
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

  const myBetAmount = useMemo(() => {
    if (!board || !user) return 0;
    return board.onHome.find(p => p.userId === user.id)?.amount ?? board.onAway.find(p => p.userId === user.id)?.amount ?? 0;
  }, [board, user?.id]);

  const myBetInsured = useMemo(() => {
    if (!board || !user) return false;
    return board.onHome.find(p => p.userId === user.id)?.insured ?? board.onAway.find(p => p.userId === user.id)?.insured ?? false;
  }, [board, user?.id]);

  const matchDetailLoadGenRef = useRef(0);
  const summaryFetchSeqRef = useRef(0);
  const boardFetchSeqRef = useRef(0);

  const fetchSummary = useCallback(() => {
    if (!id) return Promise.resolve();
    const seq = ++summaryFetchSeqRef.current;
    return api.matches.getSummary(id).then(data => { if (seq === summaryFetchSeqRef.current) setSummary(data as MatchSummary); });
  }, [id]);

  const fetchBoard = useCallback(() => {
    if (!id) return Promise.resolve();
    const seq = ++boardFetchSeqRef.current;
    return api.matches.getBoard(id).then(data => { if (seq === boardFetchSeqRef.current) setBoard(data); });
  }, [id]);

  const debouncedRefetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefetch = useCallback(() => {
    if (debouncedRefetchRef.current) clearTimeout(debouncedRefetchRef.current);
    debouncedRefetchRef.current = setTimeout(() => { fetchSummary(); fetchBoard(); }, 300);
  }, [fetchSummary, fetchBoard]);

  useEffect(() => () => { if (debouncedRefetchRef.current) clearTimeout(debouncedRefetchRef.current); }, []);

  useEffect(() => {
    if (!id) return;
    const gen = ++matchDetailLoadGenRef.current;
    summaryFetchSeqRef.current++; boardFetchSeqRef.current++;
    const sSnap = summaryFetchSeqRef.current, bSnap = boardFetchSeqRef.current;
    const cached = getMatchDetailCache(id);
    if (cached) { setSelectedMatch(cached.match); setSummary(cached.summary as MatchSummary); setBoard(cached.board); }
    setRecentRemovals([]);
    Promise.all([api.matches.getById(id), api.matches.getSummary(id), api.matches.getBoard(id)]).then(([m, s, b]) => {
      if (gen !== matchDetailLoadGenRef.current) return;
      const md = m as Match, sd = s as MatchSummary;
      setSelectedMatch(md);
      const as_ = summaryFetchSeqRef.current === sSnap, ab = boardFetchSeqRef.current === bSnap;
      if (as_) setSummary(sd); if (ab) setBoard(b);
      if (as_ && ab) setMatchDetailCache(id, { match: md, summary: sd as MatchSummaryType, board: b });
    });
    api.auth.me().then(me => updateUser({ balance: me.balance, prizePoolContribution: me.prizePoolContribution, consecutiveMissedMatches: me.consecutiveMissedMatches }));
    joinMatchRoom(id);
    return () => { leaveMatchRoom(id!); };
  }, [id, setSelectedMatch, setMatchDetailCache, getMatchDetailCache, updateUser]);

  useEffect(() => {
    if (!selectedMatch || selectedMatch.status !== "UPCOMING") return;
    const startMs = new Date(selectedMatch.startTime).getTime();
    const closesAt = selectedMatch.tossTime ? new Date(selectedMatch.tossTime).getTime() : startMs - TOSS_DEFAULT_MINUTES_BEFORE_MATCH * 60_000;
    const tick = () => setCountdown(Math.max(0, closesAt - Date.now()));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [selectedMatch]);

  const hasRefetchedAtZeroRef = useRef(false);
  useEffect(() => { if (id) hasRefetchedAtZeroRef.current = false; }, [id]);
  useEffect(() => {
    if (!id || countdown !== 0 || hasRefetchedAtZeroRef.current) return;
    hasRefetchedAtZeroRef.current = true;
    const run = () => { fetchSummary(); fetchBoard(); };
    run(); const timers = [2000, 5000, 8000, 12000].map(ms => setTimeout(run, ms));
    return () => timers.forEach(clearTimeout);
  }, [countdown, id, fetchSummary, fetchBoard]);

  useEffect(() => { if (!selectedMatch) return; setTossTimeInput(toDatetimeLocal(selectedMatch.tossTime ?? null)); }, [selectedMatch?.id, selectedMatch?.tossTime]);
  useEffect(() => { if (!id || !selectedMatch || !summary || !board) return; setMatchDetailCache(id, { match: selectedMatch, summary: summary as MatchSummaryType, board }); }, [id, selectedMatch, summary, board, setMatchDetailCache]);

  useEffect(() => {
    if (!board || !user || placing || stakeInputFocusedRef.current) return;
    const raw = board.onHome.find(p => p.userId === user.id)?.amount ?? board.onAway.find(p => p.userId === user.id)?.amount;
    const inUndecided = board.undecided.some(p => p.userId === user.id);
    const amount = inUndecided ? undefined : raw;
    const just = lastPlacedStakeRef.current;
    if (just !== null) { if (raw === just && !inUndecided) { lastBoardAmountRef.current = raw; lastPlacedStakeRef.current = null; if (lastPlacedStakeTimeoutRef.current) { clearTimeout(lastPlacedStakeTimeoutRef.current); lastPlacedStakeTimeoutRef.current = null; } } return; }
    if (amount != null && amount !== lastBoardAmountRef.current) { lastBoardAmountRef.current = amount; if (!(myBetAmount > 0 && !stakeLocked)) { setStake(amount); setStakeInputValue(String(amount)); } }
    else if (amount == null && !(stakeLocked && stake >= MIN_STAKE)) lastBoardAmountRef.current = null;
  }, [board?.onHome, board?.onAway, board?.undecided, user?.id, placing, myBetAmount, stakeLocked, stake]);

  useEffect(() => () => { if (lastPlacedStakeTimeoutRef.current) clearTimeout(lastPlacedStakeTimeoutRef.current); if (stakeWarningTimerRef.current) clearTimeout(stakeWarningTimerRef.current); }, []);

  useEffect(() => {
    if (lastPlacedStakeRef.current !== null || stakeInputFocusedRef.current) return;
    const hasBet = myBetAmount > 0, srv = hasBet ? myBetAmount : lastBoardAmountRef.current ?? 0;
    const truth = stakeLocked && (srv > 0 || stake >= MIN_STAKE) ? srv > 0 ? srv : stake : stake;
    setStakeInputValue(String(truth));
    if (stakeLocked && hasBet && stake !== myBetAmount) setStake(myBetAmount);
  }, [stake, myBetAmount, stakeLocked]);

  const isInitialStakeRef = useRef(true);
  useEffect(() => {
    if (isInitialStakeRef.current) { isInitialStakeRef.current = false; return; }
    setStakeAnimating(true); const t = setTimeout(() => setStakeAnimating(false), 250); return () => clearTimeout(t);
  }, [stake]);

  useSocketEvent("matchUpdate", (data: MatchUpdatePayload) => {
    if (!id || data.matchId !== id) return;
    api.matches.getById(id).then(m => setSelectedMatch(m as Match)); debouncedRefetch();
    api.auth.me().then(me => updateUser({ balance: me.balance, prizePoolContribution: me.prizePoolContribution, consecutiveMissedMatches: me.consecutiveMissedMatches }));
  });
  useSocketEvent("betPlaced", (data: BetPlacedPayload) => { if (id && data.matchId === id) debouncedRefetch(); });
  useSocketEvent("upsetAlert", (data) => { if (data.matchId === id) setUpsetMessage(data.message || "Underdog won!"); });
  useSocketEvent("betRemoved", (data) => {
    if (data.matchId !== id) return;
    setRecentRemovals(prev => [{ id: `${data.userId}-${Date.now()}`, username: data.username, amount: data.amount, teamShortName: data.teamShortName, at: Date.now() }, ...prev.slice(0, 19)]);
    debouncedRefetch();
  });

  async function placeBet(teamId: string, amount: number): Promise<boolean> {
    if (!user || !id) return false;
    setError(null); setSuccess(null);
    const balBefore = (user.balance ?? 0) + myBetAmount + (myBetInsured ? INSURANCE_COST : 0);
    if (amount + (insured ? INSURANCE_COST : 0) > balBefore) { setError(`Balance insufficient. Available: ${formatCurrency(balBefore)}`); return false; }
    const pool = summary?.totalPool ?? 0, myAmt = board ? (board.onHome.find(p => p.userId === user.id)?.amount ?? board.onAway.find(p => p.userId === user.id)?.amount ?? 0) : 0;
    const presentPool = Number(pool) - myAmt, poolCap = presentPool > 0 ? Math.floor(presentPool) : MAX_STAKE;
    const effMax = Math.min(Math.max(MIN_STAKE, Math.min(poolCap, MAX_STAKE)), Math.max(0, balBefore - (insured ? INSURANCE_COST : 0)));
    if (amount < MIN_STAKE) { setError(`Min stake: ${formatCurrency(MIN_STAKE)}`); return false; }
    if (amount > MAX_STAKE) { setError(`Max stake: ${formatCurrency(MAX_STAKE)}`); return false; }
    if (amount > effMax) { setError(`Max: ${formatCurrency(effMax)}`); return false; }
    const prev = board;
    if (board && user) {
      const me = { userId: user.id, username: user.username, amount, insured };
      const wo = (l: typeof board.onHome) => l.filter(p => p.userId !== user.id);
      const isHome = teamId === board.homeTeam.id;
      setBoard({ ...board, onHome: isHome ? [...wo(board.onHome), me] : wo(board.onHome), onAway: isHome ? wo(board.onAway) : [...wo(board.onAway), me], undecided: board.undecided.filter(p => p.userId !== user.id) });
    }
    setPlacing(true);
    try {
      const { bet, wallet } = await api.bets.place(id, teamId, amount, insured);
      addBet(bet as Bet);
      const tName = selectedMatch?.homeTeam.id === teamId ? selectedMatch.homeTeam.shortName : selectedMatch?.awayTeam.shortName;
      setSuccess(`Bet ${formatCurrency(amount)} on ${tName} ✓`);
      setStakeProtected(amount, 2000); setStakeLocked(true);
      updateUser({ balance: wallet.balance, prizePoolContribution: wallet.prizePoolContribution, consecutiveMissedMatches: wallet.consecutiveMissedMatches });
      void Promise.all([fetchBoard(), fetchSummary()]);
      return true;
    } catch (err) { setBoard(prev); setError(err instanceof Error ? err.message : "Failed"); return false; }
    finally { setPlacing(false); }
  }

  async function cancelBet() {
    if (!user || !id) return;
    setStakeProtected(stake, 3000);
    const prev = board;
    if (board) { const wo = (l: typeof board.onHome) => l.filter(p => p.userId !== user.id); setBoard({ ...board, onHome: wo(board.onHome), onAway: wo(board.onAway), undecided: board.undecided.some(p => p.userId === user.id) ? board.undecided : [...board.undecided, { userId: user.id, username: user.username }] }); }
    setPlacing(true); setError(null); setSuccess(null);
    try {
      const c = await api.bets.cancel(id) as { amount: number; insured?: boolean } | null;
      if (c) { setBalance(user.balance + c.amount + (c.insured ? INSURANCE_COST : 0)); setSuccess("Bet cancelled"); setStakeLocked(false); }
      debouncedRefetch();
    } catch (err) { setBoard(prev); setError(err instanceof Error ? err.message : "Failed to cancel"); }
    finally { setPlacing(false); }
  }

  async function handleSaveTimes(e: React.FormEvent) {
    e.preventDefault(); if (!id) return; setTimesSaving(true); setTimesError(null);
    try { await api.matches.updateTimes(id, { tossTime: tossTimeInput ? new Date(tossTimeInput).toISOString() : null }); setSelectedMatch(await api.matches.getById(id) as Match); }
    catch (err) { setTimesError(err instanceof Error ? err.message : "Failed"); } finally { setTimesSaving(false); }
  }

  async function handleForceRebalance() {
    if (!id) return; setRebalanceLoading(true); setRebalanceError(null);
    try { await api.matches.forceRebalance(id); setSuccess("Rebalance run."); await Promise.all([fetchSummary(), fetchBoard()]); setSelectedMatch(await api.matches.getById(id) as Match); }
    catch (err) { setRebalanceError(err instanceof Error ? err.message : "Failed"); } finally { setRebalanceLoading(false); }
  }

  async function handleSettle(winnerTeamId: string) {
    if (!id) return; setSettling(true); setError(null); setSuccess(null);
    try { await api.matches.settle(id, winnerTeamId); setSuccess("Match settled ✓"); setSelectedMatch(await api.matches.getById(id) as Match); fetchSummary(); fetchBoard(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); } finally { setSettling(false); }
  }

  const balanceAtMatchEntry = (user?.balance ?? 0) + myBetAmount + (myBetInsured ? INSURANCE_COST : 0);
  useEffect(() => { if (board && user && myBetAmount > 0) setInsured(myBetInsured); }, [board, user?.id, myBetAmount, myBetInsured]);

  /* ── loading state ── */
  if (!selectedMatch) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 text-sm font-medium">Loading match…</p>
        </div>
      </div>
    );
  }

  /* ── derived ── */
  const home = selectedMatch.homeTeam, away = selectedMatch.awayTeam;
  const isUpcoming = selectedMatch.status === "UPCOMING";
  const bettingOpen = isUpcoming && countdown > 0;
  const isAdmin = user?.username === ADMIN_USERNAME;
  const canSettle = !selectedMatch.winner && (isUpcoming || selectedMatch.status === "LIVE");
  const totalPool = summary?.totalPool ?? 0;
  const presentPool = Number(totalPool) - myBetAmount;
  const participantCount = board ? board.onHome.length + board.onAway.length : 0;
  const poolCap = presentPool > 0 ? Math.floor(presentPool) : MAX_STAKE;
  const maxStakeFromPool = Math.max(MIN_STAKE, Math.min(poolCap, MAX_STAKE));
  const maxStakeFromBalance = Math.max(0, ((user?.balance ?? 0) + myBetAmount) - (insured ? INSURANCE_COST : 0));
  const maxStake = Math.min(maxStakeFromPool, maxStakeFromBalance);
  const momentumHome = summary?.momentum?.homePercent ?? 50;
  const momentumAway = summary?.momentum?.awayPercent ?? 50;
  const recentBets = summary?.recentBets ?? [];
  const settlementResults = summary?.settlementResults ?? [];
  const isUserUndecided = !!user && (board?.undecided?.some(p => p.userId === user.id) ?? false);
  const consecutiveMissed = user?.consecutiveMissedMatches ?? 0;
  const userBetTeamId = board && user ? board.onHome.some(p => p.userId === user.id) ? board.homeTeam.id : board.onAway.some(p => p.userId === user.id) ? board.awayTeam.id : null : null;
  const myBetTeamName = userBetTeamId ? (userBetTeamId === home.id ? home.shortName : away.shortName) : null;
  const isSoleBettor = participantCount === 1 && !!userBetTeamId;

  function clampStake(): number {
    const n = Math.floor(Number(stakeInputValue));
    if (!Number.isNaN(n) && n < MIN_STAKE) flashStakeWarning(`Min stake is ${formatCurrency(MIN_STAKE)}.`);
    else if (!Number.isNaN(n) && n > maxStake) flashStakeWarning(`Max stake is ${formatCurrency(maxStake)}.`);
    const final = Math.floor(Number.isNaN(n) || n < MIN_STAKE ? MIN_STAKE : Math.min(n, maxStake));
    setStake(final); setStakeInputValue(String(final)); setStakeProtected(final);
    return final;
  }

  const statusMeta = {
    UPCOMING:  { label: "Upcoming",  cls: "text-rose-600 bg-rose-50 border-rose-200" },
    LIVE:      { label: "Live",      cls: "text-red-600 bg-red-50 border-red-200"     },
    COMPLETED: { label: "Completed", cls: "text-slate-600 bg-slate-100 border-slate-200" },
  }[selectedMatch.status] ?? { label: selectedMatch.status, cls: "text-slate-500 bg-slate-50 border-slate-200" };

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div className="min-h-screen bg-[#F8F9FC]">

      {/* ══ STICKY HEADER ══════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 py-3">
            <Link to="/" className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-rose-500 leading-none mb-0.5">Indian T20 · Match Detail</p>
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 truncate leading-tight">
                {home.shortName} <span className="text-slate-400 font-normal">vs</span> {away.shortName}
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${statusMeta.cls}`}>
                {selectedMatch.status === "LIVE" && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />}
                {statusMeta.label}
              </span>
              <span className="hidden sm:inline-flex text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                Pool  {formatCurrency(totalPool)}
              </span>
            </div>
          </div>
          {/* Bet-lock sub-bar */}
          {isUpcoming && (
            <div className="flex items-center justify-between pb-2.5 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium">Betting closes in</span>
                <span className={`text-[11px] font-extrabold tabular-nums ${countdown <= 60_000 ? "text-red-500 animate-pulse" : "text-slate-800"}`}>
                  {formatBetLockCountdown(countdown)}
                </span>
              </div>
              {myBetTeamName && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  ✓ Backing {myBetTeamName}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ══ MATCH HERO ═════════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Teams row */}
          <div className="flex items-center justify-between gap-4">

            {/* Home team */}
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <div className={`w-11 h-11 sm:w-16 sm:h-16 shrink-0 rounded-2xl flex items-center justify-center p-2 flex-shrink-0 ${accent(home.shortName).bg} border border-slate-100`}>
                {getTeamLogo(home.shortName, home.name)
                  ? <img src={getTeamLogo(home.shortName, home.name)!} alt={home.name} className="w-full h-full object-contain" style={{ transform: `scale(${getTeamLogoVisualScale(home.shortName, home.name)})` }} />
                  : <span className="font-extrabold text-slate-800 text-sm">{home.shortName}</span>}
              </div>
              <div className="min-w-0">
                <p className="text-base sm:text-2xl font-extrabold text-slate-900 leading-tight">{home.shortName}</p>
                <p className="text-[10px] text-slate-400 truncate">{home.name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`inline-block h-1.5 rounded-full ${accent(home.shortName).bar}`} style={{ width: `${momentumHome * 0.6}px`, minWidth: "12px", maxWidth: "60px" }} />
                  <span className="text-[8px] text-slate-400">{momentumHome}% support</span>
                </div>
              </div>
            </div>

            {/* Centre */}
            <div className="flex flex-col items-center gap-1 shrink-0 px-1 sm:px-3">
              <div className="flex flex-col items-center">
                <span className="text-xl sm:text-3xl font-black text-slate-200 tracking-tight leading-none">VS</span>
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mt-1">
                  {new Date(selectedMatch.startTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
              {selectedMatch.winner && (
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${accent(selectedMatch.winner.shortName).bg} ${accent(selectedMatch.winner.shortName).ring} ring-1`}>
                  👑 {selectedMatch.winner.shortName} won
                </span>
              )}
              <div className="flex items-center gap-1 text-[10px] text-slate-400 flex-col sm:flex-row">
                <span className="font-semibold text-emerald-600"> {formatCurrency(totalPool)}</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">{participantCount} players</span>
              </div>
            </div>

            {/* Away team */}
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 flex-row-reverse">
              <div className={`w-11 h-11 sm:w-16 sm:h-16 shrink-0 rounded-2xl flex items-center justify-center p-2 flex-shrink-0 ${accent(away.shortName).bg} border border-slate-100`}>
                {getTeamLogo(away.shortName, away.name)
                  ? <img src={getTeamLogo(away.shortName, away.name)!} alt={away.name} className="w-full h-full object-contain" style={{ transform: `scale(${getTeamLogoVisualScale(away.shortName, away.name)})` }} />
                  : <span className="font-extrabold text-slate-800 text-sm">{away.shortName}</span>}
              </div>
              <div className="min-w-0 text-right">
                <p className="text-base sm:text-2xl font-extrabold text-slate-900 leading-tight">{away.shortName}</p>
                <p className="text-[10px] text-slate-400 truncate">{away.name}</p>
                <div className="flex items-center gap-1.5 mt-1 justify-end">
                  <span className="text-[10px] text-slate-400">{momentumAway}% support</span>
                  <span className={`inline-block h-1.5 rounded-full ${accent(away.shortName).bar}`} style={{ width: `${momentumAway * 0.6}px`, minWidth: "12px", maxWidth: "60px" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Momentum bar */}
          <div className="mt-4 h-2 rounded-full overflow-hidden flex bg-slate-100">
            <div className={`h-full transition-all duration-700 ${accent(home.shortName).bar}`} style={{ width: `${momentumHome}%` }} />
            <div className={`h-full transition-all duration-700 ${accent(away.shortName).bar}`} style={{ width: `${momentumAway}%` }} />
          </div>
        </div>
      </div>

      {/* ══ ALERTS ══════════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 space-y-2">
        {bettingOpen && countdown <= 60_000 && (
          <div className="flex gap-3 items-start bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <span className="shrink-0 text-base">⏱</span>
            <div><p className="text-sm font-bold text-amber-700">Betting locks soon!</p>
              <p className="text-xs text-amber-600 mt-0.5">{isSoleBettor ? "Solo rules apply — win bonus or 50% bye refund." : participantCount <= 2 ? "Lower-ranked player will be auto-moved to balance the match." : "Last 2 players by rank will be auto-assigned to the other side."}</p>
            </div>
          </div>
        )}
        {isUserUndecided && user && (
          <div className="flex gap-3 items-start bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <span className="shrink-0 text-base">⚠️</span>
            <div><p className="text-sm font-bold text-amber-700">You haven't placed a bet yet</p>
              <p className="text-xs text-amber-600 mt-0.5">{consecutiveMissed === 0 ? "Missing matches reduces your balance (−💰50 from 2nd miss)." : `You've missed ${consecutiveMissed} match${consecutiveMissed !== 1 ? "es" : ""}. Another miss will reduce your balance.`}</p>
            </div>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
            <span className="text-emerald-500">✓</span><p className="text-sm font-semibold text-emerald-700 flex-1">{success}</p>
            <button onClick={() => setSuccess(null)} className="text-emerald-300 hover:text-emerald-500 text-sm">✕</button>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <span className="text-red-400">!</span><p className="text-sm font-semibold text-red-600 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-300 hover:text-red-500 text-sm">✕</button>
          </div>
        )}
      </div>

      {/* ══ MAIN GRID ══════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5 pb-48">

        {/* ── CHOOSE YOUR SIDE — full width, prominent ── */}
        {bettingOpen && board && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">Choose Your Side</p>
                <p className="text-sm font-bold text-slate-800 mt-0.5">Which team wins tonight?</p>
              </div>
              {userBetTeamId && (
                <button onClick={cancelBet} disabled={placing}
                  className="text-xs font-semibold text-slate-400 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors disabled:opacity-40">
                  Cancel bet
                </button>
              )}
            </div>

            {/* Team cards — horizontal, stacked on mobile, side-by-side on sm+ */}
            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TeamPickCard
                team={{ id: board.homeTeam.id, shortName: board.homeTeam.shortName, name: board.homeTeam.name }}
                isSelected={userBetTeamId === board.homeTeam.id}
                momentum={momentumHome} playerCount={board.onHome.length}
                onSelect={async () => { const amt = clampStake(); await placeBet(board.homeTeam.id, amt); }}
                disabled={placing || maxStake < MIN_STAKE}
                align="left"
              />
              <TeamPickCard
                team={{ id: board.awayTeam.id, shortName: board.awayTeam.shortName, name: board.awayTeam.name }}
                isSelected={userBetTeamId === board.awayTeam.id}
                momentum={momentumAway} playerCount={board.onAway.length}
                onSelect={async () => { const amt = clampStake(); await placeBet(board.awayTeam.id, amt); }}
                disabled={placing || maxStake < MIN_STAKE}
                align="right"
              />
            </div>

            {/* VS divider — only visible on sm+ between the two cards */}
            <div className="hidden sm:flex items-center justify-center -mt-2 mb-1">
              <span className="text-xs font-extrabold tracking-widest text-slate-300 bg-white px-3">VS</span>
            </div>

            {/* Selecting hint */}
            {!userBetTeamId && maxStake >= MIN_STAKE && (
              <p className="text-center text-xs text-slate-400 pb-4">Tap a team to place your bet of  {formatCurrency(stake)}</p>
            )}
            {maxStake >= MIN_STAKE && (
              <p className="lg:hidden text-center text-[11px] text-slate-500 pb-4 -mt-2">
                Use the stake controls at the bottom to increase or decrease before locking.
              </p>
            )}
            {maxStake < MIN_STAKE && (
              <p className="text-center text-xs text-amber-500 font-medium pb-4">Balance too low to bet. Ask admin for a top-up.</p>
            )}
          </div>
        )}

        {/* ── RESPONSIVE GRID: stacks on mobile, 3-col on lg ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* ── LEFT: Pool Stats + Activity ── */}
          <aside className="lg:col-span-3 space-y-4">

            {/* Pool Stats — horizontal pills on mobile, vertical list on desktop */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">Pool Stats</p>
              </div>
              {/* Mobile: horizontal pill row */}
              <div className="flex lg:hidden items-center gap-0 divide-x divide-slate-100">
                <div className="flex-1 px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">Pool</p>
                  <p className="text-sm font-extrabold text-emerald-600"> {formatCurrency(totalPool)}</p>
                </div>
                <div className="flex-1 px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">Players</p>
                  <p className="text-sm font-extrabold text-slate-800">{participantCount}</p>
                </div>
                {myBetAmount > 0 && (
                  <div className="flex-1 px-4 py-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-0.5">Your Bet</p>
                    <p className="text-sm font-extrabold text-rose-600"> {formatCurrency(myBetAmount)}{myBetInsured ? " 🛡" : ""}</p>
                  </div>
                )}
              </div>
              {/* Desktop: vertical list */}
              <div className="hidden lg:block px-5 py-4 space-y-3">
                {[
                  { label: "Total Pool", value: ` ${formatCurrency(totalPool)}`, cls: "text-emerald-600 font-extrabold" },
                  { label: "Players", value: String(participantCount), cls: "text-slate-800 font-bold" },
                  ...(myBetAmount > 0 ? [{ label: "Your Stake", value: ` ${formatCurrency(myBetAmount)}${myBetInsured ? " 🛡" : ""}`, cls: "text-rose-600 font-bold" }] : []),
                ].map(({ label, value, cls }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{label}</span>
                    <span className={`text-sm ${cls}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity — always visible, scrollable */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col" style={{ height: "200px" }}>
              <div className="px-5 py-3 border-b border-slate-100 shrink-0">
                <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">Activity</p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {recentBets.length === 0 && recentRemovals.length === 0
                  ? <p className="px-5 py-5 text-xs text-slate-400">No activity yet.</p>
                  : [...recentBets.map(b => ({ type: "bet" as const, id: b.id, username: b.username, amount: b.amount, team: b.teamShortName, at: new Date(b.createdAt).getTime() })),
                     ...recentRemovals.map(r => ({ type: "remove" as const, id: r.id, username: r.username, amount: r.amount, team: r.teamShortName, at: r.at }))]
                      .sort((a, b) => b.at - a.at).slice(0, 20).map(entry => (
                        <div key={entry.id} className="px-5 py-2.5 text-xs">
                          <span className={`font-semibold ${entry.username === user?.username ? "text-rose-600" : "text-slate-700"}`}>{entry.username}</span>
                          {entry.type === "bet"
                            ? <><span className="text-slate-400"> bet </span><span className="font-semibold text-emerald-600">{formatCurrency(entry.amount)}</span><span className="text-slate-400"> on {entry.team}</span></>
                            : <span className="text-slate-400"> removed {formatCurrency(entry.amount)} bet</span>}
                        </div>
                      ))
                }
              </div>
            </div>
          </aside>

          {/* ── CENTRE: Betting Board — hidden on mobile, full on desktop ── */}
          <section className="hidden lg:block lg:col-span-6">
            {board ? (
              <PlayerBettingBoard
                board={board} currentUserId={user?.id ?? null} stake={stake}
                onPlaceBet={async (teamId, amount) => { await placeBet(teamId, amount); }}
                onCancelBet={cancelBet} placing={placing} isUpcoming={isUpcoming}
                bettingOpen={bettingOpen} canAffordBet={maxStake >= MIN_STAKE}
                winnerTeamId={selectedMatch.winner?.id ?? null}
              />
            ) : (
              <div className="bg-white border border-slate-100 rounded-2xl p-10 flex items-center justify-center text-slate-400 text-sm shadow-sm animate-pulse">Loading board…</div>
            )}
          </section>

          {/* Mobile-only: compact support columns */}
          <section className="lg:hidden">
            {board && (
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  {/* Home support */}
                  <div className="p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-2">{board.homeTeam.shortName}</p>
                    <div className="space-y-1.5">
                      {board.onHome.length === 0
                        ? <p className="text-[11px] text-slate-300 italic">No bets</p>
                        : board.onHome.map(p => (
                          <div key={p.userId} className={`text-[11px] px-2 py-1.5 rounded-lg font-medium truncate ${p.userId === user?.id ? "bg-rose-100 text-rose-700" : "bg-slate-50 text-slate-700"}`}>
                            <p className="font-semibold truncate">{p.username === user?.username ? "You" : p.username}</p>
                            <p className="text-[10px] text-slate-400">💰 {formatCurrency(p.amount)}</p>
                          </div>
                        ))
                      }
                    </div>
                  </div>

                  {/* Undecided */}
                  <div className="p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-2 text-center">Undecided</p>
                    <div className="space-y-1.5">
                      {board.undecided.length === 0
                        ? <p className="text-[11px] text-slate-300 italic text-center">—</p>
                        : board.undecided.map(p => (
                          <div key={p.userId} className={`text-[11px] px-2 py-1.5 rounded-lg text-center truncate ${p.userId === user?.id ? "bg-amber-50 text-amber-700 font-bold" : "bg-slate-50 text-slate-600"}`}>
                            {p.username === user?.username ? "You" : p.username}
                          </div>
                        ))
                      }
                    </div>
                  </div>

                  {/* Away support */}
                  <div className="p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-2 text-right">{board.awayTeam.shortName}</p>
                    <div className="space-y-1.5">
                      {board.onAway.length === 0
                        ? <p className="text-[11px] text-slate-300 italic text-right">No bets</p>
                        : board.onAway.map(p => (
                          <div key={p.userId} className={`text-[11px] px-2 py-1.5 rounded-lg font-medium truncate ${p.userId === user?.id ? "bg-rose-100 text-rose-700" : "bg-slate-50 text-slate-700"}`}>
                            <p className="font-semibold truncate text-right">{p.username === user?.username ? "You" : p.username}</p>
                            <p className="text-[10px] text-slate-400 text-right">💰 {formatCurrency(p.amount)}</p>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>

                {/* Mobile momentum bar */}
                <div className="px-3 pb-3">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                    <span>{board.homeTeam.shortName} {momentumHome}%</span>
                    <span>{momentumAway}% {board.awayTeam.shortName}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden flex bg-slate-100">
                    <div className={`h-full transition-all duration-700 ${accent(home.shortName).bar}`} style={{ width: `${momentumHome}%` }} />
                    <div className={`h-full transition-all duration-700 ${accent(away.shortName).bar}`} style={{ width: `${momentumAway}%` }} />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── RIGHT: Results + Admin ── */}
          <aside className="lg:col-span-3 space-y-4">
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">Match Results</p>
              </div>
              <div className="divide-y divide-slate-50">
                <div className="px-5 py-2 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                  <span>Player</span><span className="text-right">Profit</span><span className="text-right">Streak</span>
                </div>
                {settlementResults.map(r => (
                  <div key={r.userId} className={`px-5 py-3 grid grid-cols-[1fr_auto_auto] gap-x-3 items-center ${r.userId === user?.id ? "bg-rose-50/60" : ""}`}>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold truncate ${r.userId === user?.id ? "text-rose-600" : "text-slate-800"}`}>{r.username}{r.userId === user?.id && <span className="text-[10px] ml-1 opacity-70">(you)</span>}</p>
                      <p className="text-[10px] text-slate-400">{r.side}</p>
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${r.poolGained >= 0 ? "text-emerald-600" : "text-red-500"}`}>{r.poolGained >= 0 ? "+" : ""}{formatCurrency(r.poolGained, 2)}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{r.winningStreakAfter != null ? `🔥${r.winningStreakAfter}` : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          

          {/* Profit breakdown */}
          {(() => {
            const myR = user && settlementResults.find(r => r.userId === user.id);
            const meta = summary?.settlementMeta;
            if (!myR || myR.poolGained <= 0 || !meta) return null;
            return <ProfitBreakdown stake={myR.stake} basePoolShare={myR.basePoolShare ?? 0} underdogBonus={myR.underdogBonus ?? 0} streakBonus={myR.streakBonus ?? 0} totalPool={meta.totalPool} losingPool={meta.losingPool} totalWinningStake={meta.totalWinningStake} underdogSide={meta.underdogSide} playerSide={myR.side} isUnderdog={meta.underdogSide === myR.side} />;
          })()}

          {/* Admin panel */}
          {isAdmin && (
            <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 flex items-center gap-2">
                <span>🔐</span><p className="text-[11px] uppercase tracking-[0.15em] text-amber-500 font-semibold">Admin Controls</p>
              </div>
              <div className="px-5 py-4 space-y-4">
                {canSettle && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400 font-medium">Set match result</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => handleSettle(home.id)} disabled={settling} className="py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-400 disabled:opacity-50 transition-colors">{home.shortName} won</button>
                      <button onClick={() => handleSettle(away.id)} disabled={settling} className="py-2.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-400 disabled:opacity-50 transition-colors">{away.shortName} won</button>
                    </div>
                    {settling && <p className="text-[10px] text-amber-500 text-center animate-pulse">Settling…</p>}
                  </div>
                )}
                <div className="space-y-2 border-t border-amber-100 pt-3">
                  <p className="text-xs text-slate-400 font-medium">Toss time (betting closes)</p>
                  <form onSubmit={handleSaveTimes} className="space-y-2">
                    <input type="datetime-local" value={tossTimeInput} onChange={e => setTossTimeInput(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"/>
                    {timesError && <p className="text-xs text-red-400">{timesError}</p>}
                    <button type="submit" disabled={timesSaving} className="w-full py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-50 transition-colors">{timesSaving ? "Saving…" : "Save Toss Time"}</button>
                  </form>
                </div>
                <div className="border-t border-amber-100 pt-3 space-y-2">
                  <p className="text-xs text-slate-400 font-medium">Lock rebalance</p>
                  <button onClick={handleForceRebalance} disabled={rebalanceLoading} className="w-full py-2 rounded-xl bg-slate-700 text-white text-xs font-bold hover:bg-slate-600 disabled:opacity-50 transition-colors">{rebalanceLoading ? "Running…" : "Run Rebalance"}</button>
                  {rebalanceError && <p className="text-xs text-red-400">{rebalanceError}</p>}
                </div>
              </div>
            </div>
          )}
        </aside>
        </div>{/* end 3-col grid */}
      </div>{/* end outer space-y-5 */}

      {/* ══ UPSET TOAST ═══════════════════════════════════════════════════ */}
      {upsetMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-500 text-white font-bold text-sm shadow-xl">
          🏆 {upsetMessage}
          <button onClick={() => setUpsetMessage(null)} className="ml-1 opacity-80 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ══ BOTTOM BETTING PANEL ═══════════════════════════════════════════ */}
      {bettingOpen && (typeof document !== "undefined" ? createPortal(
        <div className="fixed left-0 right-0 bottom-[72px] sm:bottom-0 z-[120] bg-white/95 backdrop-blur-sm border-t border-slate-100 shadow-[0_-8px_32px_rgba(15,23,42,0.10)]">
          <div className="max-w-xl mx-auto px-4 pt-3 pb-4 sm:pb-3 space-y-3">

            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Bet Controls</p>
              <button
                type="button"
                onClick={() => setIsBetPanelCollapsed(v => !v)}
                className="h-7 min-w-7 px-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-bold touch-manipulation"
                aria-expanded={!isBetPanelCollapsed}
                aria-label={isBetPanelCollapsed ? "Expand bet controls" : "Collapse bet controls"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 transition-transform ${isBetPanelCollapsed ? "" : "rotate-180"}`}
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            {!isBetPanelCollapsed && (
              <>

            {/* Warnings */}
            {maxStake < MIN_STAKE && <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"><span className="text-xs shrink-0">⚠️</span><p className="text-xs text-amber-600 font-medium">Balance too low. Available: {formatCurrency(balanceAtMatchEntry)}. Ask admin for top-up.</p></div>}
            {stakeWarning && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2"><p className="text-xs text-red-500 font-medium">{stakeWarning}</p></div>}

            {/* Stake row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-full sm:flex-1">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Stake</p>
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                  <button disabled={placing || maxStake < MIN_STAKE || stakeLocked}
                    onClick={() => { const c = parseInt(stakeInputValue,10)||stake, n=Math.max(MIN_STAKE,Math.min(c-STAKE_STEP,maxStake)); if(c-STAKE_STEP<MIN_STAKE){flashStakeWarning(`Min ${formatCurrency(MIN_STAKE)}`);return;} setStake(n);setStakeInputValue(String(n));setStakeProtected(n); }}
                    className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors touch-manipulation">−10</button>
                  <input ref={stakeInputRef} type="number" min={MIN_STAKE} max={maxStake} step={1} value={stakeInputValue} disabled={maxStake < MIN_STAKE || stakeLocked}
                    onFocus={() => { stakeInputFocusedRef.current = true; }}
                    onBlur={() => { stakeInputFocusedRef.current = false; clampStake(); }}
                    onChange={e => setStakeInputValue(toIntegerStake(e.target.value))}
                    className={`w-full min-w-0 text-center font-extrabold border rounded-xl px-2 py-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-rose-300 ${stakeLocked ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-slate-200 text-slate-900"}`}/>
                  <button disabled={placing || maxStake < MIN_STAKE || stakeLocked}
                    onClick={() => { const c=parseInt(stakeInputValue,10)||stake, n=Math.min(c+STAKE_STEP,maxStake); if(c+STAKE_STEP>maxStake){flashStakeWarning(`Max ${formatCurrency(maxStake)}`);return;} setStake(n);setStakeInputValue(String(n));setStakeProtected(n); }}
                    className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors touch-manipulation">+10</button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Min {formatCurrency(MIN_STAKE)} · Max {formatCurrency(maxStake)}</p>
              </div>

              {/* Lock button */}
              <button disabled={placing}
                onClick={async () => {
                  if (placing) return;
                  if (stakeLocked) { setStakeLocked(false); const v = Math.max(MIN_STAKE, Math.floor(myBetAmount > 0 ? myBetAmount : lastBoardAmountRef.current ?? stake)); setStake(v); setStakeInputValue(String(v)); return; }
                  stakeInputRef.current?.blur(); stakeInputFocusedRef.current = false;
                  const amt = clampStake();
                  if (userBetTeamId && myBetAmount > 0) { if (amt !== myBetAmount) { setStakeLocked(true); const ok = await placeBet(userBetTeamId, amt); if (!ok) setStakeLocked(false); } else setStakeLocked(true); return; }
                  setStakeLocked(true);
                }}
                className={`w-full sm:w-auto justify-center sm:justify-start shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors touch-manipulation ${stakeLocked ? "bg-amber-100 text-amber-700 border border-amber-300" : "bg-slate-900 text-white hover:bg-slate-700"}`}>
                {stakeLocked ? "🔒 Unlock" : "🔓 Lock"}
              </button>
            </div>

            {/* Insurance */}
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              <input type="checkbox" checked={insured} onChange={e => setInsured(e.target.checked)} className="w-4 h-4 rounded accent-rose-600 border-slate-300"/>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-800">Insurance <span className="text-rose-600 font-extrabold">{formatCurrency(INSURANCE_COST)}</span></p>
                <p className="text-[10px] text-slate-400">Get {INSURANCE_REFUND_PERCENT}% stake back if you lose</p>
              </div>
            </label>

            {myBetAmount > 0 && !stakeLocked && (
              <p className="text-xs text-amber-600 font-medium text-center">Adjust stake above, then tap <strong>Lock</strong> to save.</p>
            )}
              </>
            )}
          </div>
        </div>,
        document.body
      ) : (
        <div className="fixed left-0 right-0 bottom-[72px] sm:bottom-0 z-[120] bg-white/95 backdrop-blur-sm border-t border-slate-100 shadow-[0_-8px_32px_rgba(15,23,42,0.10)]">
          <div className="max-w-xl mx-auto px-4 pt-3 pb-4 sm:pb-3 space-y-3">

            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Bet Controls</p>
              <button
                type="button"
                onClick={() => setIsBetPanelCollapsed(v => !v)}
                className="h-7 min-w-7 px-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-bold touch-manipulation"
                aria-expanded={!isBetPanelCollapsed}
                aria-label={isBetPanelCollapsed ? "Expand bet controls" : "Collapse bet controls"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`h-4 w-4 transition-transform ${isBetPanelCollapsed ? "" : "rotate-180"}`}
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            {!isBetPanelCollapsed && (
              <>

            {/* Warnings */}
            {maxStake < MIN_STAKE && <div className="flex gap-2 items-start bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"><span className="text-xs shrink-0">⚠️</span><p className="text-xs text-amber-600 font-medium">Balance too low. Available: {formatCurrency(balanceAtMatchEntry)}. Ask admin for top-up.</p></div>}
            {stakeWarning && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2"><p className="text-xs text-red-500 font-medium">{stakeWarning}</p></div>}

            {/* Stake row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-full sm:flex-1">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Stake</p>
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                  <button disabled={placing || maxStake < MIN_STAKE || stakeLocked}
                    onClick={() => { const c = parseInt(stakeInputValue,10)||stake, n=Math.max(MIN_STAKE,Math.min(c-STAKE_STEP,maxStake)); if(c-STAKE_STEP<MIN_STAKE){flashStakeWarning(`Min ${formatCurrency(MIN_STAKE)}`);return;} setStake(n);setStakeInputValue(String(n));setStakeProtected(n); }}
                    className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors touch-manipulation">−10</button>
                  <input ref={stakeInputRef} type="number" min={MIN_STAKE} max={maxStake} step={1} value={stakeInputValue} disabled={maxStake < MIN_STAKE || stakeLocked}
                    onFocus={() => { stakeInputFocusedRef.current = true; }}
                    onBlur={() => { stakeInputFocusedRef.current = false; clampStake(); }}
                    onChange={e => setStakeInputValue(toIntegerStake(e.target.value))}
                    className={`w-full min-w-0 text-center font-extrabold border rounded-xl px-2 py-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none focus:ring-2 focus:ring-rose-300 ${stakeLocked ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-slate-200 text-slate-900"}`}/>
                  <button disabled={placing || maxStake < MIN_STAKE || stakeLocked}
                    onClick={() => { const c=parseInt(stakeInputValue,10)||stake, n=Math.min(c+STAKE_STEP,maxStake); if(c+STAKE_STEP>maxStake){flashStakeWarning(`Max ${formatCurrency(maxStake)}`);return;} setStake(n);setStakeInputValue(String(n));setStakeProtected(n); }}
                    className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors touch-manipulation">+10</button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Min {formatCurrency(MIN_STAKE)} · Max {formatCurrency(maxStake)}</p>
              </div>

              {/* Lock button */}
              <button disabled={placing}
                onClick={async () => {
                  if (placing) return;
                  if (stakeLocked) { setStakeLocked(false); const v = Math.max(MIN_STAKE, Math.floor(myBetAmount > 0 ? myBetAmount : lastBoardAmountRef.current ?? stake)); setStake(v); setStakeInputValue(String(v)); return; }
                  stakeInputRef.current?.blur(); stakeInputFocusedRef.current = false;
                  const amt = clampStake();
                  if (userBetTeamId && myBetAmount > 0) { if (amt !== myBetAmount) { setStakeLocked(true); const ok = await placeBet(userBetTeamId, amt); if (!ok) setStakeLocked(false); } else setStakeLocked(true); return; }
                  setStakeLocked(true);
                }}
                className={`w-full sm:w-auto justify-center sm:justify-start shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors touch-manipulation ${stakeLocked ? "bg-amber-100 text-amber-700 border border-amber-300" : "bg-slate-900 text-white hover:bg-slate-700"}`}>
                {stakeLocked ? "🔒 Unlock" : "🔓 Lock"}
              </button>
            </div>

            {/* Insurance */}
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              <input type="checkbox" checked={insured} onChange={e => setInsured(e.target.checked)} className="w-4 h-4 rounded accent-rose-600 border-slate-300"/>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-800">Insurance <span className="text-rose-600 font-extrabold">{formatCurrency(INSURANCE_COST)}</span></p>
                <p className="text-[10px] text-slate-400">Get {INSURANCE_REFUND_PERCENT}% stake back if you lose</p>
              </div>
            </label>

            {myBetAmount > 0 && !stakeLocked && (
              <p className="text-xs text-amber-600 font-medium text-center">Adjust stake above, then tap <strong>Lock</strong> to save.</p>
            )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}