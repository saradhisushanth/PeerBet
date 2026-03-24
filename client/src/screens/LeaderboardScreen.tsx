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

/**
 * Leaderboard is NOT a <table>: iOS Safari / WebKit often ignore position:sticky on table cells.
 * Each row is flex; Rank + Player are sticky inside overflow-x-auto (works reliably).
 */
const ROW = "flex w-max min-w-[720px] items-stretch border-b border-slate-100 text-sm";

/* left-14 (3.5rem) = width of rank column — must match w-14 */
const STICKY_RANK =
  "sticky left-0 z-[12] flex w-14 shrink-0 items-center justify-center border-r border-slate-200/90 bg-white";
const STICKY_PLAYER =
  "sticky left-14 z-[12] flex w-36 shrink-0 items-center border-r border-slate-200/90 bg-white shadow-[4px_0_14px_-6px_rgba(15,23,42,0.18)]";

const STICKY_RANK_HDR = STICKY_RANK.replace("z-[12]", "z-[20]").replace("bg-white", "bg-slate-50");
const STICKY_PLAYER_HDR = STICKY_PLAYER.replace("z-[12]", "z-[20]").replace("bg-white", "bg-slate-50");

const statHead =
  "relative z-0 shrink-0 border-slate-100 bg-slate-50 px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-400";
const statCell = "relative z-0 shrink-0 px-4 py-3.5 text-right tabular-nums";

function LeaderboardHeader() {
  return (
    <div className={`${ROW} bg-slate-50`} role="row">
      <div
        className={`${STICKY_RANK_HDR} px-2 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400`}
        role="columnheader"
      >
        Rank
      </div>
      <div
        className={`${STICKY_PLAYER_HDR} px-3 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400`}
        role="columnheader"
      >
        Player
      </div>
      <div className={`${statHead} w-32 whitespace-nowrap`} role="columnheader">
        Balance 💰
      </div>
      <div className={`${statHead} w-16`} role="columnheader" title="Wins">
        W
      </div>
      <div className={`${statHead} w-16`} role="columnheader" title="Losses">
        L
      </div>
      <div
        className={`${statHead} min-w-[7rem] whitespace-nowrap`}
        role="columnheader"
        title="Extra payout when you won on the minority side"
      >
        Underdog*
      </div>
      <div className={`${statHead} min-w-[7.5rem] whitespace-nowrap`} role="columnheader">
        Profit 💰
      </div>
      <div
        className={`${statHead} min-w-[7rem] whitespace-nowrap`}
        role="columnheader"
        title="Deductions for missed matches"
      >
        Missed 💰
      </div>
    </div>
  );
}

function LeaderboardBodyRow({
  entry,
  rank,
  isMe,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isMe: boolean;
}) {
  const rowBg = isMe ? "bg-rose-50/90 hover:bg-rose-50" : "bg-white hover:bg-slate-50/90";
  const stickyRank = isMe ? `${STICKY_RANK} !bg-rose-50` : STICKY_RANK;
  const stickyPlayer = isMe ? `${STICKY_PLAYER} !bg-rose-50` : STICKY_PLAYER;

  return (
    <div className={`${ROW} ${rowBg} transition-colors`} role="row">
      <div className={`${stickyRank} py-3.5`}>
        <RankBadge rank={rank} />
      </div>
      <div
        className={`${stickyPlayer} min-w-0 px-3 py-3.5 font-semibold ${isMe ? "text-rose-700" : "text-slate-800"}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{entry.user.username}</span>
          {isMe && (
            <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-500">
              You
            </span>
          )}
        </span>
      </div>
      <div className={`${statCell} w-32 font-bold text-emerald-600`}>{formatNumber(entry.balance, 2)}</div>
      <div className={`${statCell} w-16 font-medium text-emerald-600`}>{entry.totalWins}</div>
      <div className={`${statCell} w-16 text-red-400`}>{entry.totalLosses}</div>
      <div className={`${statCell} min-w-[7rem] text-amber-500`}>
        {formatNumber(entry.underdogBonus ?? 0, 2)}
      </div>
      <div
        className={`${statCell} min-w-[7.5rem] font-semibold ${entry.profit >= 0 ? "text-emerald-600" : "text-red-500"}`}
      >
        {entry.profit >= 0 ? "+" : ""}
        {formatNumber(entry.profit, 2)}
      </div>
      <div className={`${statCell} min-w-[7rem] text-red-400`}>
        {(entry.missedPenalties ?? 0) > 0 ? (
          `−${formatNumber(entry.missedPenalties!, 2)}`
        ) : (
          <span className="text-slate-300">—</span>
        )}
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
    <div className="min-h-full bg-[#F8F9FC] pb-24 md:pb-36">
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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 space-y-4">
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="md:hidden rounded-t-2xl border-b border-slate-50 bg-slate-50/80 px-4 py-2 text-[11px] text-slate-400">
            Swipe sideways for stats — <span className="font-semibold text-slate-600">Rank &amp; Player stay fixed.</span>
          </p>
          <div
            className="relative isolate overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
            data-prevent-route-swipe="true"
            role="table"
            aria-label="Leaderboard"
          >
            <div className="min-w-0">
              <LeaderboardHeader />

              {loading ? (
                [1, 2, 3, 4, 5].map((row) => (
                  <div key={`s-${row}`} className={`${ROW} animate-pulse bg-white`} role="row">
                    <div className={`${STICKY_RANK} py-4`}>
                      <div className="h-8 w-8 rounded-full bg-slate-100" />
                    </div>
                    <div className={`${STICKY_PLAYER} py-4`}>
                      <div className="h-3 w-28 rounded bg-slate-100" />
                    </div>
                    <div className={`${statCell} w-32`}>
                      <div className="ml-auto h-3 w-12 rounded bg-slate-100" />
                    </div>
                    <div className={`${statCell} w-16`}>
                      <div className="ml-auto h-3 w-12 rounded bg-slate-100" />
                    </div>
                    <div className={`${statCell} w-16`}>
                      <div className="ml-auto h-3 w-12 rounded bg-slate-100" />
                    </div>
                    <div className={`${statCell} min-w-[7rem]`}>
                      <div className="ml-auto h-3 w-12 rounded bg-slate-100" />
                    </div>
                    <div className={`${statCell} min-w-[7.5rem]`}>
                      <div className="ml-auto h-3 w-12 rounded bg-slate-100" />
                    </div>
                    <div className={`${statCell} min-w-[7rem]`}>
                      <div className="ml-auto h-3 w-12 rounded bg-slate-100" />
                    </div>
                  </div>
                ))
              ) : entries.length === 0 ? (
                <div className="border-b border-slate-100 px-6 py-16 text-center text-sm text-slate-400" role="row">
                  No players yet.
                </div>
              ) : (
                entries.map((entry, i) => {
                  const rank = entry.rank ?? i + 1;
                  const isMe = entry.userId === user?.id;
                  return (
                    <LeaderboardBodyRow
                      key={entry.userId}
                      entry={entry}
                      rank={rank}
                      isMe={isMe}
                    />
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-b-2xl border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
            <span>Balance = entry + top-ups + profit − missed penalties</span>
            <span>* Underdog: 1.3× share of losing pool when winning on minority side</span>
            <span>Profit = betting gains/losses only</span>
          </div>
        </div>
      </div>
    </div>
  );
}
