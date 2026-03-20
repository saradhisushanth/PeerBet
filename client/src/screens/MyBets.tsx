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
    if (!isStale && bets.length > 0) {
      setLoading(false);
      return;
    }
    retryCountRef.current = 0;
    const cleanup = fetchBets(true);
    return cleanup;
  }, [fetchBets, lastFetched, bets.length]);

  /** One entry per match — latest bet by createdAt (server also dedupes; this covers stale client merges). */
  const betsOnePerMatch = useMemo(() => {
    const sorted = [...bets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const seen = new Set<string>();
    const out: Bet[] = [];
    for (const b of sorted) {
      if (!seen.has(b.matchId)) {
        seen.add(b.matchId);
        out.push(b);
      }
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

  const statusStyle: Record<string, string> = {
    PENDING: "bg-yellow-500/20 text-yellow-400",
    WON: "bg-green-500/20 text-green-400",
    LOST: "bg-red-500/20 text-red-400",
    CANCELLED: "bg-gray-500/20 text-gray-400",
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold">My Bets</h1>
        <p className="text-gray-400 mt-1">Track all your bets.</p>
      </div>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by team or date..."
          className="w-full px-4 py-2 pl-9 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-sm">✕</button>
        )}
      </div>

      <div className="flex gap-2">
        {(["ALL", "PENDING", "WON", "LOST"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-primary-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {f === "ALL" ? "All" : f[0] + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading bets...</p>
      ) : error ? (
        <div className="bg-gray-900 border border-red-800 rounded-xl p-6 text-center space-y-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => fetchBets()} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-500">
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-gray-500 text-sm">No bets found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((bet) => (
            <Link
              key={bet.id}
              to={`/matches/${bet.matchId}`}
              className="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold flex items-center gap-2">
                    {bet.match?.homeTeam.shortName} vs {bet.match?.awayTeam.shortName}
                    <svg className="text-gray-600 group-hover:text-gray-400 transition-colors" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Picked: <span className="text-white font-medium">{bet.selectedTeam.shortName}</span>
                    {" "}&middot;{" "}
                    Odds: {bet.oddsMultiplier}x
                    {bet.insured && <span className="text-amber-400 ml-1" title="Insured — refund if you lose">🛡 Insured</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{formatCurrency(bet.amount)}</p>
                  <span className={`inline-block mt-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusStyle[bet.status]}`}>
                    {bet.status}
                  </span>
                </div>
              </div>
              {bet.status === "LOST" && bet.insured && (
                <p className="text-sm text-amber-400/95 mt-2">
                  Insurance refund: {formatCurrency(Math.round((bet.amount * INSURANCE_REFUND_PERCENT) / 100), 2)} (50% of stake)
                </p>
              )}
              <p className="text-xs text-gray-500 mt-3">
                {new Date(bet.createdAt).toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
