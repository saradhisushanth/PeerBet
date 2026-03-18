import { useEffect } from "react";
import { useLeaderboardStore, type LeaderboardEntry } from "../store/leaderboardStore";
import { useAuthStore } from "../store/authStore";
import { api } from "../services/api";
import { formatCurrency, formatNumber } from "../utils/format";

export default function LeaderboardScreen() {
  const { entries, setEntries, loading, setLoading } = useLeaderboardStore();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    setLoading(true);
    api.leaderboard
      .getTop()
      .then((data) => setEntries(data as LeaderboardEntry[]))
      .finally(() => setLoading(false));
  }, [setEntries, setLoading]);

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold">Leaderboard</h1>
        <p className="text-gray-400 mt-1">All players, ranked by coin balance (coins remaining).</p>
        <p className="text-gray-500 text-xs mt-2">
          * Underdog bonus: extra payout when you win on the side with fewer players (1.3× your share of the losing pool). Shown is total underdog bonus earned so far.
        </p>
        <p className="text-gray-500 text-xs mt-1">
          Profit is from betting only.
        </p>
        <p className="text-gray-500 text-xs mt-1">
          Balance = entry + top-ups + profit − missed penalties. &quot;Missed&quot; = deductions for not placing a bet on a match (from 2nd consecutive miss: 💰 50 per match).
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto overflow-y-visible overscroll-x-contain">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th className="sticky left-0 z-10 w-14 min-w-[3.5rem] bg-gray-900 text-left px-4 py-3 font-medium" title="Position by coin balance">Rank</th>
              <th className="sticky left-14 z-10 min-w-[7rem] bg-gray-900 text-left px-4 py-3 font-medium shadow-[4px_0_6px_-2px_rgba(0,0,0,0.3)]">Player</th>
              <th className="text-right px-6 py-3 font-medium" title="Current coin balance">Coins 💰</th>
              <th className="text-right px-6 py-3 font-medium" title="Matches won (correct bet)">Wins</th>
              <th className="text-right px-6 py-3 font-medium" title="Matches lost (wrong bet)">Losses</th>
              <th className="text-right px-6 py-3 font-medium" title="Extra payout when you won on the side with fewer players">Underdog* 💰</th>
              <th className="text-right px-6 py-3 font-medium" title="From betting only">Profit 💰</th>
              <th className="text-right px-6 py-3 font-medium" title="Deductions for missed matches">Missed 💰</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  No players yet.
                </td>
              </tr>
            ) : (
              entries.map((entry, i) => (
                <tr
                  key={entry.userId}
                  className="group border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="sticky left-0 z-10 w-14 min-w-[3.5rem] bg-gray-900 px-4 py-3 font-mono group-hover:bg-gray-800/30">
                    {entry.rank ?? i + 1}
                  </td>
                  <td className={`sticky left-14 z-10 min-w-[7rem] bg-gray-900 px-4 py-3 font-medium shadow-[4px_0_6px_-2px_rgba(0,0,0,0.3)] group-hover:bg-gray-800/30 ${entry.userId === user?.id ? "text-primary-400 font-semibold" : ""}`}>
                    {entry.user.username}
                  </td>
                  <td className="px-6 py-3 text-right text-green-400 font-medium">
                    {formatNumber(entry.balance, 2)}
                  </td>
                  <td className="px-6 py-3 text-right text-green-400">
                    {entry.totalWins}
                  </td>
                  <td className="px-6 py-3 text-right text-red-400">
                    {entry.totalLosses}
                  </td>
                  <td className="px-6 py-3 text-right text-amber-400/90">
                    {formatNumber(entry.underdogBonus ?? 0, 2)}
                  </td>
                  <td
                    className={`px-6 py-3 text-right font-semibold ${
                      entry.profit >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {entry.profit >= 0 ? "+" : ""}{formatNumber(entry.profit, 2)}
                  </td>
                  <td className="px-6 py-3 text-right text-red-400/90">
                    {(entry.missedPenalties ?? 0) > 0 ? `−${formatNumber(entry.missedPenalties!, 2)}` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
