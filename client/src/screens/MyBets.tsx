import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { INSURANCE_REFUND_PERCENT } from "@shared/constants";
import { useBetStore, type Bet } from "../store/betStore";
import { api } from "../services/api";
import { formatCurrency } from "../utils/format";

type Filter = "ALL" | "PENDING" | "WON" | "LOST";

const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const STALE_MS = 30_000;

const STATUS_STYLE: Record<string, { pill: string; dot: string }> = {
  PENDING: { pill: "bg-amber-50 text-amber-600 border border-amber-200",  dot: "bg-amber-400" },
  WON:     { pill: "bg-emerald-50 text-emerald-700 border border-emerald-200", dot: "bg-emerald-500" },
  LOST:    { pill: "bg-red-50 text-red-500 border border-red-200",         dot: "bg-red-400" },
  CANCELLED: { pill: "bg-slate-100 text-slate-500 border border-slate-200", dot: "bg-slate-400" },
};

const FILTER_LABELS: Record<Filter, string> = {
  ALL: "All", PENDING: "Pending", WON: "Won", LOST: "Lost",
};

function SkeletonCard() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="h-3 w-56 rounded bg-slate-100" />
          <div className="h-3 w-28 rounded bg-slate-100" />
        </div>
        <div className="space-y-2 items-end flex flex-col">
          <div className="h-5 w-20 rounded bg-slate-100" />
          <div className="h-5 w-16 rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export default function MyBets() {
  const { bets, setBets, lastFetched } = useBetStore();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(!bets.length);
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);

  const fetchBets = useCallback((autoRetry = false) => {
    let cancelled = false;
    if (!bets.length) setLoading(true);
    setError(null);
    api.bets
      .getMy()
      .then((data) => {
        if (cancelled) return;
        setBets(data as Bet[]);
        retryCountRef.current = 0;
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        if (autoRetry && retryCountRef.current < MAX_AUTO_RETRIES) {
          retryCountRef.current++;
          setTimeout(() => { if (!cancelled) fetchBets(true); }, RETRY_DELAY_MS);
        } else {
          setError(e instanceof Error ? e.message : "Failed to load bets");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [setBets, bets.length]);

  useEffect(() => {
    const isStale = !lastFetched || Date.now() - lastFetched > STALE_MS;
    if (!isStale && bets.length > 0) { setLoading(false); return; }
    retryCountRef.current = 0;
    return fetchBets(true);
  }, [fetchBets, lastFetched, bets.length]);

  const betsOnePerMatch = useMemo(() => {
    const sorted = [...bets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const seen = new Set<string>();
    const out: Bet[] = [];
    for (const b of sorted) {
      if (!seen.has(b.matchId)) { seen.add(b.matchId); out.push(b); }
    }
    return out;
  }, [bets]);

  const filtered = betsOnePerMatch.filter((b) => {
    if (filter !== "ALL" && b.status !== filter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const home = b.match?.homeTeam.shortName?.toLowerCase() ?? "";
      const away = b.match?.awayTeam.shortName?.toLowerCase() ?? "";
      const homeFull = b.match?.homeTeam.name?.toLowerCase() ?? "";
      const awayFull = b.match?.awayTeam.name?.toLowerCase() ?? "";
      const dateStr = new Date(b.createdAt).toLocaleDateString().toLowerCase();
      const isoDate = b.createdAt?.slice(0, 10) ?? "";
      if (![home, away, homeFull, awayFull, dateStr, isoDate].some((f) => f.includes(q))) return false;
    }
    return true;
  });

  // Summary counts for filter tabs
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: betsOnePerMatch.length, PENDING: 0, WON: 0, LOST: 0 };
    for (const b of betsOnePerMatch) {
      if (b.status === "PENDING") c.PENDING++;
      else if (b.status === "WON") c.WON++;
      else if (b.status === "LOST") c.LOST++;
    }
    return c;
  }, [betsOnePerMatch]);

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-10 py-7 mb-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold mb-1">History</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">My Bets</h1>
          <p className="text-slate-500 text-sm mt-1">Track all your bets and results.</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 space-y-4">

        {/* ── Search ──────────────────────────────────────────────────────── */}
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            xmlns="http://www.w3.org/2000/svg" width="15" height="15"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by team or date…"
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 shadow-sm transition"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors text-base leading-none"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Filter Tabs ─────────────────────────────────────────────────── */}
        <div className="flex gap-1.5 flex-wrap">
          {(["ALL", "PENDING", "WON", "LOST"] as Filter[]).map((f) => {
            const active = filter === f;
            const dotColor = f === "ALL" ? "bg-slate-400" : STATUS_STYLE[f]?.dot ?? "bg-slate-400";
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? "bg-rose-600 text-white shadow-sm"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f !== "ALL" && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${active ? "bg-white/70" : dotColor}`} />
                )}
                {FILTER_LABELS[f]}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-bold leading-none ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {counts[f]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((s) => <SkeletonCard key={s} />)}
          </div>
        ) : error ? (
          <div className="bg-white border border-red-100 rounded-2xl p-8 text-center space-y-4 shadow-sm">
            <div className="text-3xl">⚠️</div>
            <p className="text-red-400 text-sm font-medium">{error}</p>
            <button
              onClick={() => fetchBets()}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            {/* Cricket illustration — place your image at /no-bets.png (or update the src path) */}
            <div className="flex justify-center pt-10 pb-2 px-6">
              <img
                src="/no-bets.webp"
                alt="No bets yet"
                className="w-full max-w-xs object-contain"
              />
            </div>

            {/* Text + CTA */}
            <div className="text-center px-6 pb-10">
              <p className="text-slate-700 font-medium text-base leading-snug">
                {search || filter !== "ALL"
                  ? "No bets match your filters."
                  : "The match has not yet started!"}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {search || filter !== "ALL"
                  ? ""
                  : "Place your bets before the deadline to get started."}
              </p>
              {(search || filter !== "ALL") ? (
                <button
                  onClick={() => { setSearch(""); setFilter("ALL"); }}
                  className="mt-5 px-6 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-500 transition-colors shadow-sm"
                >
                  Clear filters
                </button>
              ) : (
                <button className="mt-5 px-7 py-3 rounded-xl bg-emerald-500 text-white text-sm font-extrabold uppercase tracking-widest hover:bg-emerald-400 transition-colors shadow-sm">
                  Join Upcoming Contest
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((bet) => {
              const style = STATUS_STYLE[bet.status] ?? STATUS_STYLE.CANCELLED;
              const insuranceRefund = Math.round((bet.amount * INSURANCE_REFUND_PERCENT) / 100);

              return (
                <Link
                  key={bet.id}
                  to={`/matches/${bet.matchId}`}
                  className="block bg-white border border-slate-100 rounded-2xl p-5 hover:border-slate-300 hover:shadow-md transition-all group shadow-sm"
                >
                  {/* ── Top row ── */}
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: match info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 text-base leading-tight">
                          {bet.match?.homeTeam.shortName}{" "}
                          <span className="text-slate-400 font-normal">vs</span>{" "}
                          {bet.match?.awayTeam.shortName}
                        </p>
                        <svg
                          className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0"
                          xmlns="http://www.w3.org/2000/svg" width="13" height="13"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>

                      {/* Sub-line: pick + odds */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        <span className="text-sm text-slate-500">
                          Picked:{" "}
                          <span className="font-semibold text-slate-800">
                            {bet.selectedTeam.shortName}
                          </span>
                        </span>
                        <span className="text-slate-300 hidden sm:inline">·</span>
                        <span className="text-sm text-slate-500">
                          Odds:{" "}
                          <span className="font-semibold text-slate-800">{bet.oddsMultiplier}×</span>
                        </span>
                        {bet.insured && (
                          <>
                            <span className="text-slate-300 hidden sm:inline">·</span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              🛡 Insured
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: amount + status */}
                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-lg text-slate-900 tabular-nums leading-tight">
                        {formatCurrency(bet.amount)}
                      </p>
                      <span className={`inline-block mt-1.5 text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide ${style.pill}`}>
                        {bet.status}
                      </span>
                    </div>
                  </div>

                  {/* ── Insurance refund banner ── */}
                  {bet.status === "LOST" && bet.insured && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                      <span>🛡</span>
                      <span>
                        Insurance refund:{" "}
                        <span className="font-bold">{formatCurrency(insuranceRefund, 2)}</span>
                        <span className="text-amber-500 font-normal"> (50% of stake)</span>
                      </span>
                    </div>
                  )}

                  {/* ── Timestamp ── */}
                  <p className="text-xs text-slate-400 mt-3">
                    {new Date(bet.createdAt).toLocaleString()}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}