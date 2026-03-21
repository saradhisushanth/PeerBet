import { useEffect } from "react";
import { useLeaderboardStore, type LeaderboardEntry } from "../store/leaderboardStore";
import { useAuthStore } from "../store/authStore";
import { api } from "../services/api";
import { formatCurrency, formatNumber } from "../utils/format";

const STALE_MS = 30_000;

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-base leading-none select-none">
        {MEDAL[rank]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold font-mono">
      {rank}
    </span>
  );
}

function StatPill({
  label,
  value,
  color = "slate",
}: {
  label: string;
  value: string | number;
  color?: "slate" | "green" | "red" | "amber";
}) {
  const colorMap = {
    slate: "bg-slate-50 text-slate-600",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-slate-50 min-w-[64px]">
      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium mb-0.5">{label}</span>
      <span className={`text-sm font-bold ${colorMap[color].split(" ")[1]}`}>{value}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-8 w-8 rounded-full bg-slate-100" />
        <div className="h-4 w-28 rounded bg-slate-100" />
        <div className="h-5 w-20 rounded bg-slate-100 ml-auto" />
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((k) => (
          <div key={k} className="flex-1 h-12 rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export default function LeaderboardScreen() {
  const { entries, setEntries, loading, setLoading, lastFetched } = useLeaderboardStore();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const hasCache = entries.length > 0;
    const isStale = !lastFetched || Date.now() - lastFetched > STALE_MS;
    if (!hasCache) setLoading(true);
    if (isStale) {
      api.leaderboard
        .getTop()
        .then((data) => setEntries(data as LeaderboardEntry[]))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [setEntries, setLoading, lastFetched, entries.length]);

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-10 py-7 mb-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold mb-1">
                Season Rankings
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Leaderboard
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                All players ranked by current coin balance.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500 sm:text-right">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                Underdog 1.3× bonus on winning minority side
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
                💰 50 miss penalty from 2nd consecutive miss
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 space-y-4">

        {/* ── Desktop Table ─────────────────────────────────────── */}
        <div className="hidden lg:block bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{ width: "3.5rem" }} />   {/* Rank */}
              <col />                                {/* Player — fluid */}
              <col style={{ width: "8rem" }} />      {/* Balance */}
              <col style={{ width: "4rem" }} />      {/* W */}
              <col style={{ width: "4rem" }} />      {/* L */}
              <col style={{ width: "7rem" }} />      {/* Underdog */}
              <col style={{ width: "7.5rem" }} />    {/* Profit */}
              <col style={{ width: "7rem" }} />      {/* Missed */}
            </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">
                    Rank
                  </th>
                  <th className="text-left px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">
                    Player
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">
                    Balance 💰
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" title="Wins">
                    W
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" title="Losses">
                    L
                  </th>
                  <th
                    className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold"
                    title="Extra payout when you won on the side with fewer players"
                  >
                    Underdog*
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">
                    Profit 💰
                  </th>
                  <th
                    className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold"
                    title="Deductions for missed matches"
                  >
                    Missed 💰
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  [1, 2, 3, 4, 5].map((row) => (
                    <tr key={`s-${row}`} className="animate-pulse">
                      <td className="px-4 py-4">
                        <div className="h-8 w-8 rounded-full bg-slate-100" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-3 w-28 rounded bg-slate-100" />
                      </td>
                      {[...Array(6)].map((_, i) => (
                        <td key={i} className="px-4 py-4 text-right">
                          <div className="h-3 w-12 rounded bg-slate-100 ml-auto" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-slate-400 text-sm">
                      No players yet.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, i) => {
                    const rank = entry.rank ?? i + 1;
                    const isMe = entry.userId === user?.id;
                    const isTop3 = rank <= 3;
                    return (
                      <tr
                        key={entry.userId}
                        className={`group transition-colors ${
                          isMe
                            ? "bg-rose-50/60 hover:bg-rose-50"
                            : isTop3
                            ? "hover:bg-slate-50/80"
                            : "hover:bg-slate-50/60"
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <RankBadge rank={rank} />
                        </td>
                        <td className={`px-4 py-3.5 font-semibold ${isMe ? "text-rose-600" : "text-slate-800"}`}>
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{entry.user.username}</span>
                            {isMe && (
                              <span className="shrink-0 text-[10px] bg-rose-100 text-rose-500 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                                You
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-emerald-600 tabular-nums">
                          {formatNumber(entry.balance, 2)}
                        </td>
                        <td className="px-4 py-3.5 text-right text-emerald-600 font-medium tabular-nums">
                          {entry.totalWins}
                        </td>
                        <td className="px-4 py-3.5 text-right text-red-400 tabular-nums">
                          {entry.totalLosses}
                        </td>
                        <td className="px-4 py-3.5 text-right text-amber-500 tabular-nums">
                          {formatNumber(entry.underdogBonus ?? 0, 2)}
                        </td>
                        <td
                          className={`px-4 py-3.5 text-right font-semibold tabular-nums ${
                            entry.profit >= 0 ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {entry.profit >= 0 ? "+" : ""}{formatNumber(entry.profit, 2)}
                        </td>
                        <td className="px-4 py-3.5 text-right text-red-400 tabular-nums">
                          {(entry.missedPenalties ?? 0) > 0
                            ? `−${formatNumber(entry.missedPenalties!, 2)}`
                            : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

          {/* Table footer legend */}
          <div className="border-t border-slate-100 px-5 py-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-400">
            <span>Balance = entry + top-ups + profit − missed penalties</span>
            <span>* Underdog: 1.3× share of losing pool when winning on minority side</span>
            <span>Profit = betting gains/losses only</span>
          </div>
        </div>

        {/* ── Mobile Cards ──────────────────────────────────────── */}
        <div className="lg:hidden space-y-3">
          {loading ? (
            [1, 2, 3, 4].map((k) => <SkeletonCard key={k} />)
          ) : entries.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center text-slate-400 text-sm shadow-sm">
              No players yet.
            </div>
          ) : (
            entries.map((entry, i) => {
              const rank = entry.rank ?? i + 1;
              const isMe = entry.userId === user?.id;
              return (
                <div
                  key={entry.userId}
                  className={`rounded-2xl border shadow-sm overflow-hidden ${
                    isMe ? "border-rose-200 bg-rose-50/40" : "border-slate-100 bg-white"
                  }`}
                >
                  {/* Card header */}
                  <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                    <RankBadge rank={rank} />
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-base truncate leading-tight ${isMe ? "text-rose-600" : "text-slate-800"}`}>
                        {entry.user.username}
                        {isMe && (
                          <span className="ml-2 text-[10px] bg-rose-100 text-rose-500 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide align-middle">
                            You
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Balance</p>
                      <p className="text-emerald-600 font-extrabold text-base tabular-nums leading-tight">
                        💰 {formatNumber(entry.balance, 2)}
                      </p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="mx-4 border-t border-slate-100" />

                  {/* Stats row */}
                  <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
                    <StatPill label="Wins" value={entry.totalWins} color="green" />
                    <StatPill label="Losses" value={entry.totalLosses} color="red" />
                    <StatPill label="Underdog" value={formatNumber(entry.underdogBonus ?? 0, 2)} color="amber" />
                    <StatPill
                      label="Profit"
                      value={`${entry.profit >= 0 ? "+" : ""}${formatNumber(entry.profit, 2)}`}
                      color={entry.profit >= 0 ? "green" : "red"}
                    />
                    <StatPill
                      label="Missed"
                      value={(entry.missedPenalties ?? 0) > 0 ? `−${formatNumber(entry.missedPenalties!, 2)}` : "—"}
                      color={(entry.missedPenalties ?? 0) > 0 ? "red" : "slate"}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Mobile legend ─────────────────────────────────────── */}
        <div className="lg:hidden text-[11px] text-slate-400 space-y-1 pb-4">
          <p>Balance = entry + top-ups + profit − missed penalties</p>
          <p>* Underdog: 1.3× share of losing pool when winning on minority side</p>
          <p>Missed penalty: 💰50 from 2nd consecutive missed match</p>
        </div>
      </div>
    </div>
  );
}