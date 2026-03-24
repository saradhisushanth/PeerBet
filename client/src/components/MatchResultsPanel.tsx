import ProfitBreakdown from "./ProfitBreakdown";
import { formatCurrency } from "../utils/format";

const CARD_SHADOW_STATIC = "shadow-[0_8px_28px_-6px_rgba(15,23,42,0.1)]";

export type MatchResultsSettlementRow = {
  userId: string;
  username: string;
  side: string;
  stake: number;
  poolGained: number;
  basePoolShare?: number;
  underdogBonus?: number;
  winningStreakAfter?: number;
  streakBonus?: number;
};

export type MatchResultsSettlementMeta = {
  totalPool: number;
  losingPool: number;
  totalWinningStake: number;
  underdogSide?: string;
};

type MatchResultsPanelProps = {
  matchStatus: string;
  settlementResults: MatchResultsSettlementRow[];
  user: { id: string; username: string } | null;
  settlementMeta?: MatchResultsSettlementMeta | null;
};

function resultsPlaceholder(matchStatus: string, hasRows: boolean): { title: string; body: string } {
  if (matchStatus === "CANCELLED") {
    return {
      title: "Match cancelled",
      body: "This match was cancelled. There are no profit or loss results.",
    };
  }
  if (matchStatus === "COMPLETED" && !hasRows) {
    return {
      title: "No results yet",
      body: "Settlement data will appear here once processing finishes.",
    };
  }
  if (matchStatus === "LIVE") {
    return {
      title: "Match in progress",
      body: "Player profits and streaks will show here after the match ends and the result is settled.",
    };
  }
  if (matchStatus === "UPCOMING") {
    return {
      title: "Match not finished",
      body: "Results appear here after the match is played and an admin records the winner.",
    };
  }
  return {
    title: "Results pending",
    body: "Check back after this match is completed and settled.",
  };
}

export default function MatchResultsPanel({
  matchStatus,
  settlementResults,
  user,
  settlementMeta,
}: MatchResultsPanelProps) {
  const showTable = matchStatus === "COMPLETED" && settlementResults.length > 0;
  const myR = user && settlementResults.find((r) => r.userId === user.id);
  const meta = settlementMeta;

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className={`overflow-hidden rounded-2xl border border-slate-100 bg-white ${CARD_SHADOW_STATIC}`}>
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">Match Results</p>
        </div>
        {showTable ? (
          <div className="divide-y divide-slate-50">
            <div className="px-5 py-2 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              <span>Player</span>
              <span className="text-right">Profit</span>
              <span className="text-right">Streak</span>
            </div>
            {settlementResults.map((r) => (
              <div
                key={r.userId}
                className={`px-5 py-3 grid grid-cols-[1fr_auto_auto] gap-x-3 items-center ${r.userId === user?.id ? "bg-rose-50/60" : ""}`}
              >
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${r.userId === user?.id ? "text-rose-600" : "text-slate-800"}`}>
                    {r.username}
                    {r.userId === user?.id && <span className="text-[10px] ml-1 opacity-70">(you)</span>}
                  </p>
                  <p className="text-[10px] text-slate-400">{r.side}</p>
                </div>
                <span className={`text-xs font-bold tabular-nums ${r.poolGained >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {r.poolGained >= 0 ? "+" : ""}
                  {formatCurrency(r.poolGained, 2)}
                </span>
                <span className="text-xs text-slate-500 tabular-nums">
                  {r.winningStreakAfter != null ? `🔥${r.winningStreakAfter}` : "—"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-6">
            {(() => {
              const { title, body } = resultsPlaceholder(matchStatus, settlementResults.length > 0);
              return (
                <>
                  <p className="text-sm font-semibold text-slate-800">{title}</p>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">{body}</p>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {myR && myR.poolGained > 0 && meta && (
        <ProfitBreakdown
          stake={myR.stake}
          basePoolShare={myR.basePoolShare ?? 0}
          underdogBonus={myR.underdogBonus ?? 0}
          streakBonus={myR.streakBonus ?? 0}
          totalPool={meta.totalPool}
          losingPool={meta.losingPool}
          totalWinningStake={meta.totalWinningStake}
          underdogSide={meta.underdogSide}
          playerSide={myR.side}
          isUnderdog={meta.underdogSide === myR.side}
        />
      )}
    </div>
  );
}
