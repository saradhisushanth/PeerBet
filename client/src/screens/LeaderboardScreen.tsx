import { useEffect } from "react";
import { useLeaderboardStore, type LeaderboardEntry } from "../store/leaderboardStore";
import { useAuthStore } from "../store/authStore";
import { api } from "../services/api";
import { formatNumber } from "../utils/format";

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

/* ── Shared table row used in both main table and sticky bar ── */
function TableRow({
  entry,
  rank,
  isMe,
  stickyBg = "bg-white",
}: {
  entry: LeaderboardEntry;
  rank: number;
  isMe: boolean;
  stickyBg?: string;
}) {
  const rowBg   = isMe ? "bg-rose-50/60 hover:bg-rose-50" : "hover:bg-slate-50/80";
  const stickyCell = `md:sticky md:z-10 ${isMe ? stickyBg + " group-hover:bg-rose-50" : stickyBg + " group-hover:bg-slate-50/80"}`;

  return (
    <tr className={`group transition-colors ${rowBg}`}>
      {/* Rank — sticky */}
      <td className={`${stickyCell} md:left-0 px-4 py-3.5`}>
        <RankBadge rank={rank} />
      </td>

      {/* Player — sticky */}
      <td className={`${stickyCell} md:left-14 px-4 py-3.5 md:shadow-[3px_0_8px_-2px_rgba(0,0,0,0.06)] font-semibold ${isMe ? "text-rose-600" : "text-slate-800"}`}>
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate">{entry.user.username}</span>
          {isMe && (
            <span className="shrink-0 text-[10px] bg-rose-100 text-rose-500 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide">
              You
            </span>
          )}
        </span>
      </td>

      {/* Balance */}
      <td className="px-4 py-3.5 text-right font-bold text-emerald-600 tabular-nums">
        {formatNumber(entry.balance, 2)}
      </td>

      {/* W */}
      <td className="px-4 py-3.5 text-right text-emerald-600 font-medium tabular-nums">
        {entry.totalWins}
      </td>

      {/* L */}
      <td className="px-4 py-3.5 text-right text-red-400 tabular-nums">
        {entry.totalLosses}
      </td>

      {/* Underdog */}
      <td className="px-4 py-3.5 text-right text-amber-500 tabular-nums">
        {formatNumber(entry.underdogBonus ?? 0, 2)}
      </td>

      {/* Profit */}
      <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${entry.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
        {entry.profit >= 0 ? "+" : ""}{formatNumber(entry.profit, 2)}
      </td>

      {/* Missed */}
      <td className="px-4 py-3.5 text-right text-red-400 tabular-nums">
        {(entry.missedPenalties ?? 0) > 0
          ? `−${formatNumber(entry.missedPenalties!, 2)}`
          : <span className="text-slate-300">—</span>
        }
      </td>
    </tr>
  );
}

/* Shared colgroup — keeps sticky bar columns aligned with main table */
function TableCols() {
  return (
    <colgroup>
      <col style={{ width: "3.5rem" }} />  {/* Rank */}
      <col style={{ width: "9rem" }} />   {/* Player */}
      <col style={{ width: "8rem" }} />    {/* Balance */}
      <col style={{ width: "4rem" }} />    {/* W */}
      <col style={{ width: "4rem" }} />    {/* L */}
      <col style={{ width: "7rem" }} />    {/* Underdog */}
      <col style={{ width: "7.5rem" }} />  {/* Profit */}
      <col style={{ width: "7rem" }} />    {/* Missed */}
    </colgroup>
  );
}

/* ── Main export ── */
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

  const myEntry = entries.find((e) => e.userId === user?.id) ?? null;
  const myIndex = entries.findIndex((e) => e.userId === user?.id);
  const myRank  = myEntry ? (myEntry.rank ?? myIndex + 1) : null;

  return (
    /* pb-36 = clears sticky bar (≈52px) + bottom nav (≈64px) + breathing room */
    <div className="min-h-screen bg-[#F8F9FC] pb-36">

      {/* ══ HEADER ═══════════════════════════════════════════════════════ */}
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
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                Underdog 1.3× bonus on winning minority side
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-red-400 shrink-0" />
                💰50 miss penalty from 2nd consecutive miss
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ══ CONTENT ══════════════════════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 space-y-4">

        {/* ── Table (desktop + mobile — single unified table with horizontal scroll) ── */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto" data-prevent-route-swipe="true">
            <table className="w-full text-sm min-w-[580px]">
              <TableCols />

              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {/* Rank — sticky header cell */}
                  <th className="md:sticky md:left-0 md:z-20 bg-slate-50 text-left px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap">
                    Rank
                  </th>
                  {/* Player — sticky header cell */}
                  <th className="md:sticky md:left-14 md:z-20 bg-slate-50 text-left px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold md:shadow-[3px_0_8px_-2px_rgba(0,0,0,0.06)] whitespace-nowrap">
                    Player
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap">
                    Balance 💰
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" title="Wins">
                    W
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold" title="Losses">
                    L
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap" title="Extra payout when you won on the minority side">
                    Underdog*
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap">
                    Profit 💰
                  </th>
                  <th className="text-right px-4 py-3.5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold whitespace-nowrap" title="Deductions for missed matches">
                    Missed 💰
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  [1, 2, 3, 4, 5].map((row) => (
                    <tr key={`s-${row}`} className="animate-pulse">
                      <td className="md:sticky md:left-0 bg-white px-4 py-4">
                        <div className="h-8 w-8 rounded-full bg-slate-100" />
                      </td>
                      <td className="md:sticky md:left-14 bg-white px-4 py-4 md:shadow-[3px_0_8px_-2px_rgba(0,0,0,0.06)]">
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
                    return (
                      <TableRow
                        key={entry.userId}
                        entry={entry}
                        rank={rank}
                        isMe={isMe}
                        stickyBg={isMe ? "bg-rose-50/60" : "bg-white"}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table footer legend */}
          <div className="border-t border-slate-100 px-5 py-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-400">
            <span>Balance = entry + top-ups + profit − missed penalties</span>
            <span>* Underdog: 1.3× share of losing pool when winning on minority side</span>
            <span>Profit = betting gains/losses only</span>
          </div>
        </div>

      </div>

      {/* ══ STICKY "YOU" ROW — compact and scoped to leaderboard area ═══ */}
      {myEntry && myRank !== null && !loading && (
        <div className="hidden md:block sticky bottom-20 lg:bottom-3 z-20 mt-2 px-4 sm:px-6 lg:px-10">
          <div className="max-w-5xl mx-auto">
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-[10px] text-slate-400 font-semibold">#{myRank}</p>
            </div>
            {/* Sticky row card — same colgroup keeps columns pixel-aligned with the main table */}
            <div className="bg-white border border-rose-200 rounded-xl shadow-[0_3px_10px_rgba(15,23,42,0.08)] overflow-hidden">
              <div className="overflow-x-auto" data-prevent-route-swipe="true">
                <table className="w-full text-xs min-w-[580px]">
                  <TableCols />
                  <tbody>
                    <TableRow
                      entry={myEntry}
                      rank={myRank}
                      isMe={true}
                      stickyBg="bg-rose-50/60"
                    />
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}