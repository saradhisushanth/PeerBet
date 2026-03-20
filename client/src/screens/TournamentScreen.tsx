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
    if (!isStale) {
      setLoading(false);
      return;
    }
    retryCountRef.current = 0;
    const cleanup = fetchDetails(true);
    return cleanup;
  }, [fetchDetails]);

  async function handleWalletTopUp(e: React.FormEvent) {
    e.preventDefault();
    if (!topUpUserId || !topUpAmount) return;
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid positive amount");
      return;
    }
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

  if (loading) {
    return (
      <div className="space-y-6 pb-20">
        <h1 className="text-3xl font-bold">Tournament</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="space-y-6 pb-20">
        <h1 className="text-3xl font-bold">Tournament</h1>
        <div className="bg-gray-900 border border-red-800 rounded-xl p-6 text-center space-y-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => fetchDetails()} className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-500">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold">Tournament</h1>
        <p className="text-gray-400 mt-1">Prize distribution, rules, and balance sheet.</p>
      </div>

      {details && (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-semibold text-lg mb-2">Total prize pool</h2>
            <p className="text-2xl font-bold text-green-400">{formatPrizePool(details.totalPrizePool, 2)}</p>
            <p className="text-xs text-gray-500 mt-1">Sum of all players&apos; contributions (entry + admin-approved top-ups).</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-semibold mb-3">Prize distribution</h2>
            <p className="text-xs text-gray-500 mb-3">Final standings by in-game balance. 1st–5th get a share; 6th and below receive ₹0.</p>
            <ul className="space-y-2">
              {details.prizeDistribution.map(({ rank, percent, amount }) => (
                <li key={rank} className="flex justify-between text-sm">
                  <span className="text-gray-400">{rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`} place — {percent}%</span>
                  <span className="font-medium text-green-400">{formatPrizePool(amount, 2)}</span>
                </li>
              ))}
              <li className="flex justify-between text-sm border-t border-gray-800 pt-2 mt-2">
                <span className="text-gray-500">House / rollover — {details.houseCutPercent}%</span>
                <span className="text-amber-400/90">{formatPrizePool(details.houseCutAmount, 2)}</span>
              </li>
            </ul>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-semibold mb-3">Rules</h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
              {details.rules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <h2 className="font-semibold px-4 py-3 border-b border-gray-800">Balance sheet</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400">
                    <th className="text-left px-4 py-2">Player</th>
                    <th className="text-right px-4 py-2">Coins 💰</th>
                    <th className="text-right px-4 py-2">Prize pool contribution ₹</th>
                  </tr>
                </thead>
                <tbody>
                  {details.balanceSheet.map((row) => (
                    <tr key={row.userId} className="border-b border-gray-800/50">
                      <td className={`px-4 py-2 font-medium ${row.userId === user?.id ? "text-primary-400 font-semibold" : ""}`}>{row.username}{row.userId === user?.id ? " (you)" : ""}</td>
                      <td className="px-4 py-2 text-right text-green-400">{formatNumber(row.balance, 2)}</td>
                      <td className="px-4 py-2 text-right text-amber-400/90">{formatPrizePool(row.prizePoolContribution, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <h2 className="font-semibold px-4 py-3 border-b border-gray-800">Wallet transactions</h2>
            {details.transactions.length === 0 ? (
              <p className="px-4 py-6 text-gray-500 text-sm">No top-ups yet. When a player adds money (with admin approval), it appears here.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400">
                      <th className="text-left px-4 py-2">Player</th>
                      <th className="text-right px-4 py-2">Amount ₹</th>
                      <th className="text-left px-4 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.transactions.map((tx) => (
                      <tr key={tx.id} className="border-b border-gray-800/50">
                        <td className={`px-4 py-2 font-medium ${tx.userId === user?.id ? "text-primary-400 font-semibold" : ""}`}>{tx.username}</td>
                        <td className="px-4 py-2 text-right text-green-400">+ {formatPrizePool(tx.amount, 2)}</td>
                        <td className="px-4 py-2 text-gray-500">{new Date(tx.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-4">
              <h2 className="font-semibold text-amber-400/95 mb-3">Admin: Add to wallet</h2>
              <p className="text-xs text-gray-500 mb-3">Increases the player&apos;s balance and their prize pool contribution. Requires your approval.</p>
              {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
              <form onSubmit={handleWalletTopUp} className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Player</label>
                  <select
                    value={topUpUserId}
                    onChange={(e) => setTopUpUserId(e.target.value)}
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm min-w-[140px]"
                    required
                  >
                    <option value="">Select</option>
                    {details.balanceSheet.map((row) => (
                      <option key={row.userId} value={row.userId}>{row.username}{row.userId === user?.id ? " (you)" : ""}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={topUpAmount}
                    onChange={(e) => setTopUpAmount(e.target.value)}
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm w-24"
                    placeholder="500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={topUpSubmitting}
                  className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 disabled:opacity-50"
                >
                  {topUpSubmitting ? "Adding…" : "Add to wallet"}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
