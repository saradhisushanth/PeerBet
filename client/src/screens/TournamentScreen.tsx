import { useEffect, useState, useCallback, useRef } from "react";
import { useAuthStore } from "../store/authStore";
import { api } from "../services/api";
import { formatCurrency, formatNumber, formatPrizePool } from "../utils/format";
import { ADMIN_USERNAME } from "@shared/constants";

type Details = Awaited<ReturnType<typeof api.tournament.getDetails>>;

const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const STALE_MS = 30_000;

let tournamentCache: { data: Details; fetchedAt: number } | null = null;

const RANK_LABEL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th" };
const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// ── Shared skeleton block ────────────────────────────────────────────────────
function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm animate-pulse space-y-3">
      <div className="h-4 w-36 rounded bg-slate-100" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-3 rounded bg-slate-100 ${i % 2 === 0 ? "w-full" : "w-3/4"}`} />
      ))}
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

export default function TournamentScreen() {
  const user = useAuthStore((s) => s.user);
  const [details, setDetails] = useState<Details | null>(tournamentCache?.data ?? null);
  const [loading, setLoading] = useState(!tournamentCache);
  const [error, setError] = useState<string | null>(null);
  const [topUpUserId, setTopUpUserId] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpSubmitting, setTopUpSubmitting] = useState(false);
  const retryCountRef = useRef(0);

  const isAdmin = user?.username === ADMIN_USERNAME;

  const fetchDetails = useCallback((autoRetry = false) => {
    let cancelled = false;
    if (!tournamentCache) setLoading(true);
    setError(null);
    api.tournament
      .getDetails()
      .then((data) => {
        if (cancelled) return;
        setDetails(data);
        tournamentCache = { data, fetchedAt: Date.now() };
        retryCountRef.current = 0;
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        if (autoRetry && retryCountRef.current < MAX_AUTO_RETRIES) {
          retryCountRef.current++;
          setTimeout(() => { if (!cancelled) fetchDetails(true); }, RETRY_DELAY_MS);
        } else {
          setError(e instanceof Error ? e.message : "Failed to load");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const isStale = !tournamentCache || Date.now() - tournamentCache.fetchedAt > STALE_MS;
    if (!isStale) { setLoading(false); return; }
    retryCountRef.current = 0;
    return fetchDetails(true);
  }, [fetchDetails]);

  async function handleWalletTopUp(e: React.FormEvent) {
    e.preventDefault();
    if (!topUpUserId || !topUpAmount) return;
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter a valid positive amount"); return; }
    setTopUpSubmitting(true);
    setError(null);
    try {
      await api.tournament.walletTopUp(topUpUserId, amount);
      const updated = await api.tournament.getDetails();
      setDetails(updated);
      setTopUpAmount("");
      if (user?.id === topUpUserId) {
        const row = updated.balanceSheet.find((r) => r.userId === user.id);
        if (row) useAuthStore.getState().updateUser({ balance: row.balance, prizePoolContribution: row.prizePoolContribution });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Top-up failed");
    } finally {
      setTopUpSubmitting(false);
    }
  }

  // ── Full-page skeleton ─────────────────────────────────────────────────────
  if (loading && !details) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] pb-24">
        <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-10 py-7 mb-6">
          <div className="max-w-3xl mx-auto animate-pulse space-y-2">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-7 w-44 rounded bg-slate-100" />
            <div className="h-3 w-64 rounded bg-slate-100" />
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 space-y-4">
          {[3, 4, 3].map((lines, i) => <SkeletonBlock key={i} lines={lines} />)}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error && !details) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] pb-24">
        <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-10 py-7 mb-6">
          <div className="max-w-3xl mx-auto">
            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold mb-1">Season Info</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Tournament</h1>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="bg-white border border-red-100 rounded-2xl p-8 text-center space-y-4 shadow-sm">
            <div className="text-3xl">⚠️</div>
            <p className="text-red-400 text-sm font-medium">{error}</p>
            <button
              onClick={() => fetchDetails()}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-10 py-7 mb-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold mb-1">Season Info</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Tournament</h1>
          <p className="text-slate-500 text-sm mt-1">Prize distribution, rules, and balance sheet.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 space-y-4">
        {details && (
          <>
            {/* ── Prize Pool Hero ──────────────────────────────────────────── */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm px-5 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold mb-1">Total Prize Pool</p>
                <p className="text-3xl font-extrabold text-emerald-600 tracking-tight">
                  {formatPrizePool(details.totalPrizePool, 2)}
                </p>
              </div>
              <p className="text-xs text-slate-400 sm:text-right sm:max-w-[220px]">
                Sum of all players' contributions (entry + admin-approved top-ups).
              </p>
            </div>

            {/* ── Prize Distribution ───────────────────────────────────────── */}
            <Section title="Prize Distribution">
              <div className="px-5 py-4">
                <p className="text-xs text-slate-400 mb-4">
                  Final standings by in-game balance. 1st–5th get a share; 6th and below receive ₹0.
                </p>
                <div className="space-y-2">
                  {details.prizeDistribution.map(({ rank, percent, amount }) => (
                    <div
                      key={rank}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        {RANK_MEDAL[rank] && <span>{RANK_MEDAL[rank]}</span>}
                        <span>{RANK_LABEL[rank] ?? `${rank}th`} place</span>
                        <span className="text-slate-400 font-normal">— {percent}%</span>
                      </span>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">
                        {formatPrizePool(amount, 2)}
                      </span>
                    </div>
                  ))}
                  {/* House cut */}
                  <div className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-dashed border-slate-200 mt-3">
                    <span className="text-sm text-slate-400">
                      House / rollover — {details.houseCutPercent}%
                    </span>
                    <span className="text-sm font-semibold text-amber-500 tabular-nums">
                      {formatPrizePool(details.houseCutAmount, 2)}
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* ── Rules ────────────────────────────────────────────────────── */}
            <Section title="Rules">
              <ul className="px-5 py-4 space-y-2">
                {details.rules.map((rule, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-700">
                    <span className="mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold">
                      {i + 1}
                    </span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </Section>

            {/* ── Balance Sheet ────────────────────────────────────────────── */}
            <Section title="Balance Sheet">
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-slate-50">
                {details.balanceSheet.map((row) => {
                  const isMe = row.userId === user?.id;
                  return (
                    <div
                      key={row.userId}
                      className={`flex items-center justify-between px-5 py-3.5 ${isMe ? "bg-rose-50/40" : ""}`}
                    >
                      <span className={`text-sm font-semibold ${isMe ? "text-rose-600" : "text-slate-800"}`}>
                        {row.username}
                        {isMe && (
                          <span className="ml-2 text-[10px] bg-rose-100 text-rose-500 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide align-middle">
                            You
                          </span>
                        )}
                      </span>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-600 tabular-nums">💰 {formatNumber(row.balance, 2)}</p>
                        <p className="text-xs text-amber-500 tabular-nums">{formatPrizePool(row.prizePoolContribution, 2)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col />
                    <col style={{ width: "9rem" }} />
                    <col style={{ width: "11rem" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-5 py-3 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Player</th>
                      <th className="text-right px-5 py-3 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Coins 💰</th>
                      <th className="text-right px-5 py-3 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Prize pool ₹</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {details.balanceSheet.map((row) => {
                      const isMe = row.userId === user?.id;
                      return (
                        <tr key={row.userId} className={`transition-colors hover:bg-slate-50 ${isMe ? "bg-rose-50/40 hover:bg-rose-50/60" : ""}`}>
                          <td className={`px-5 py-3 font-semibold text-sm ${isMe ? "text-rose-600" : "text-slate-800"}`}>
                            <span className="flex items-center gap-2">
                              <span className="truncate">{row.username}</span>
                              {isMe && (
                                <span className="shrink-0 text-[10px] bg-rose-100 text-rose-500 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                  You
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-emerald-600 font-bold tabular-nums">{formatNumber(row.balance, 2)}</td>
                          <td className="px-5 py-3 text-right text-amber-500 font-semibold tabular-nums">{formatPrizePool(row.prizePoolContribution, 2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* ── Wallet Transactions ──────────────────────────────────────── */}
            <Section title="Wallet Transactions">
              {details.transactions.length === 0 ? (
                <p className="px-5 py-6 text-slate-400 text-sm">
                  No top-ups yet. When a player adds money (with admin approval), it appears here.
                </p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="sm:hidden divide-y divide-slate-50">
                    {details.transactions.map((tx) => {
                      const isMe = tx.userId === user?.id;
                      return (
                        <div key={tx.id} className={`flex items-center justify-between px-5 py-3.5 ${isMe ? "bg-rose-50/40" : ""}`}>
                          <div>
                            <p className={`text-sm font-semibold ${isMe ? "text-rose-600" : "text-slate-800"}`}>{tx.username}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{new Date(tx.createdAt).toLocaleString()}</p>
                          </div>
                          <span className="text-sm font-bold text-emerald-600 tabular-nums">+ {formatPrizePool(tx.amount, 2)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col />
                        <col style={{ width: "9rem" }} />
                        <col style={{ width: "13rem" }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-5 py-3 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Player</th>
                          <th className="text-right px-5 py-3 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Amount ₹</th>
                          <th className="text-left px-5 py-3 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {details.transactions.map((tx) => {
                          const isMe = tx.userId === user?.id;
                          return (
                            <tr key={tx.id} className={`transition-colors hover:bg-slate-50 ${isMe ? "bg-rose-50/40 hover:bg-rose-50/60" : ""}`}>
                              <td className={`px-5 py-3 font-semibold text-sm ${isMe ? "text-rose-600" : "text-slate-800"}`}>
                                <span className="flex items-center gap-2">
                                  <span className="truncate">{tx.username}</span>
                                  {isMe && (
                                    <span className="shrink-0 text-[10px] bg-rose-100 text-rose-500 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                      You
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right text-emerald-600 font-bold tabular-nums">+ {formatPrizePool(tx.amount, 2)}</td>
                              <td className="px-5 py-3 text-slate-400 text-sm">{new Date(tx.createdAt).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Section>

            {/* ── Admin: Top-Up ────────────────────────────────────────────── */}
            {isAdmin && (
              <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-amber-100 flex items-center gap-2">
                  <span className="text-amber-500 text-base">🔐</span>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-amber-500 font-semibold">Admin — Add to Wallet</p>
                </div>
                <div className="px-5 py-5">
                  <p className="text-xs text-slate-400 mb-4">
                    Increases the player's balance and their prize pool contribution. Requires your approval.
                  </p>
                  {error && (
                    <div className="mb-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100 text-sm text-red-500">
                      {error}
                    </div>
                  )}
                  <form onSubmit={handleWalletTopUp} className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs text-slate-400 font-medium mb-1.5 uppercase tracking-wide">Player</label>
                      <select
                        value={topUpUserId}
                        onChange={(e) => setTopUpUserId(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 transition"
                        required
                      >
                        <option value="">Select player…</option>
                        {details.balanceSheet.map((row) => (
                          <option key={row.userId} value={row.userId}>
                            {row.username}{row.userId === user?.id ? " (you)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-full sm:w-32">
                      <label className="block text-xs text-slate-400 font-medium mb-1.5 uppercase tracking-wide">Amount (₹)</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={topUpAmount}
                        onChange={(e) => setTopUpAmount(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 transition"
                        placeholder="500"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={topUpSubmitting}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      {topUpSubmitting ? "Adding…" : "Add to wallet"}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}