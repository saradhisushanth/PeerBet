import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMatchStore, type Match } from "../store/matchStore";
import { api } from "../services/api";
import { getTeamLogo, getTeamLogoVisualScale } from "../utils/teamLogos";

type StatusFilter = "ALL" | "UPCOMING" | "LIVE" | "COMPLETED";

const ROW_HEIGHT = 224;
const ROW_GAP = 16;
const OVERSCAN = 4;

const STALE_MS = 30_000;

const FILTER_LABELS: Record<StatusFilter, string> = {
  ALL: "All",
  UPCOMING: "Upcoming",
  LIVE: "Live",
  COMPLETED: "Completed",
};

const FILTER_DOT: Record<StatusFilter, string> = {
  ALL: "bg-slate-400",
  UPCOMING: "bg-rose-400",
  LIVE: "bg-red-500 animate-pulse",
  COMPLETED: "bg-slate-400",
};

export default function Matches() {
  const { matches, setMatches, loading, setLoading, lastFetched } = useMatchStore();
  const [filter, setFilter] = useState<StatusFilter>("UPCOMING");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hasCache = matches.length > 0;
    const isStale = !lastFetched || Date.now() - lastFetched > STALE_MS;
    if (!hasCache) setLoading(true);
    if (isStale) {
      api.matches
        .getAll()
        .then((data) => setMatches(data as Match[]))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [setMatches, setLoading, lastFetched, matches.length]);

  const filtered =
    filter === "ALL" ? matches : matches.filter((m) => m.status === filter);

  const getFixtureBadge = (match: Match): string => {
    if (match.status === "LIVE") return "LIVE";
    return new Date(match.startTime).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  };

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT + ROW_GAP,
    overscan: OVERSCAN,
  });

  const statusBadgeStyle: Record<string, string> = {
    UPCOMING: "bg-rose-600 text-white",
    LIVE: "bg-red-600 text-white",
    COMPLETED: "bg-slate-700 text-white",
    CANCELLED: "bg-yellow-600 text-white",
  };

  const teamWinnerStyles: Record<string, string> = {
    RCB: "bg-red-600 text-white",
    SRH: "bg-orange-500 text-white",
    MI: "bg-blue-600 text-white",
    CSK: "bg-amber-400 text-gray-900",
    KKR: "bg-purple-600 text-white",
    DC: "bg-indigo-600 text-white",
    RR: "bg-rose-500 text-white",
    PBKS: "bg-red-700 text-white",
    GT: "bg-slate-600 text-white",
    LSG: "bg-green-600 text-white",
  };
  const getWinnerStyle = (shortName: string) =>
    teamWinnerStyles[shortName] ?? "bg-gray-500 text-white";

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#F8F9FC]">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-8 py-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          {/* Title */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-500 mb-0.5">
              Indian T20
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Official Fixtures
            </h1>
            <p className="text-slate-500 text-sm mt-1">Browse matches and pick your side.</p>
          </div>

          {/* Filter tabs — pushed right on sm+ */}
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {(["ALL", "UPCOMING", "LIVE", "COMPLETED"] as StatusFilter[]).map((f) => {
              const active = filter === f;
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
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      active ? "bg-white/70" : FILTER_DOT[f]
                    }`}
                  />
                  {FILTER_LABELS[f]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-4 sm:px-6 lg:px-8 pt-4">
        {loading ? (
          <div className="space-y-3 pb-20">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className="bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-sm animate-pulse"
              >
                <div className="h-3 w-28 rounded bg-slate-100 mb-4 mx-auto" />
                <div className="h-px bg-slate-100 mb-4" />
                <div className="flex items-center justify-between">
                  <div className="h-[86px] w-[86px] rounded-2xl bg-slate-100" />
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-4 w-8 rounded bg-slate-100" />
                    <div className="h-8 w-[120px] rounded-xl bg-slate-100" />
                  </div>
                  <div className="h-[86px] w-[86px] rounded-2xl bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm">
            <p className="text-slate-400 text-sm">No matches found.</p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="h-full overflow-auto pb-20"
            style={{ contain: "strict" }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const match = filtered[virtualRow.index];
                const homeLogoScale = getTeamLogoVisualScale(
                  match.homeTeam.shortName,
                  match.homeTeam.name
                );
                const awayLogoScale = getTeamLogoVisualScale(
                  match.awayTeam.shortName,
                  match.awayTeam.name
                );
                const homeLogo = getTeamLogo(match.homeTeam.shortName, match.homeTeam.name);
                const awayLogo = getTeamLogo(match.awayTeam.shortName, match.awayTeam.name);

                return (
                  <Link
                    key={match.id}
                    to={`/matches/${match.id}`}
                    className="absolute left-0 w-full"
                    style={{
                      top: 0,
                      transform: `translateY(${virtualRow.start}px)`,
                      height: `${virtualRow.size}px`,
                    }}
                  >
                    <div className="h-[calc(100%-16px)] bg-white border border-slate-100 rounded-2xl px-5 py-4 hover:border-rose-200 hover:shadow-md transition-all flex flex-col shadow-sm group">

                      {/* ── Match header ── */}
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">
                          Indian T20 League
                        </p>
                        {match.winner && (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${getWinnerStyle(match.winner.shortName)}`}
                            title={match.winner.name}
                          >
                            <span aria-hidden>👑</span>
                            {match.winner.shortName}
                          </span>
                        )}
                      </div>

                      <div className="h-px bg-slate-100 mb-3" />

                      {/* ── Teams row ── */}
                      <div className="flex items-center justify-between gap-3 flex-1">

                        {/* Home team */}
                        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                          <div className="w-[82px] h-[82px] rounded-2xl border border-slate-100 bg-slate-50 p-2.5 flex items-center justify-center shadow-sm group-hover:border-slate-200 transition-colors">
                            {homeLogo ? (
                              <img
                                src={homeLogo}
                                alt={match.homeTeam.name}
                                className="max-h-full max-w-full object-contain"
                                style={{ transform: `scale(${homeLogoScale})` }}
                                loading="lazy"
                              />
                            ) : (
                              <p className="font-extrabold text-sm text-slate-800">
                                {match.homeTeam.shortName}
                              </p>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium truncate w-full text-center">
                            {match.homeTeam.name}
                          </p>
                        </div>

                        {/* VS + badge */}
                        <div className="flex flex-col items-center gap-2 shrink-0">
                          <p className="text-sm font-extrabold tracking-widest text-slate-400">VS</p>
                          <span
                            className={`inline-flex items-center justify-center h-7 w-[92px] rounded-lg text-[11px] font-bold tracking-[0.03em] ${statusBadgeStyle[match.status]}`}
                          >
                            {match.status === "LIVE" && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse mr-1.5" />
                            )}
                            {getFixtureBadge(match)}
                          </span>
                          {match.winner && (
                            <p className="text-[10px] text-slate-400 text-center">Winner declared</p>
                          )}
                        </div>

                        {/* Away team */}
                        <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                          <div className="w-[82px] h-[82px] rounded-2xl border border-slate-100 bg-slate-50 p-2.5 flex items-center justify-center shadow-sm group-hover:border-slate-200 transition-colors">
                            {awayLogo ? (
                              <img
                                src={awayLogo}
                                alt={match.awayTeam.name}
                                className="max-h-full max-w-full object-contain"
                                style={{ transform: `scale(${awayLogoScale})` }}
                                loading="lazy"
                              />
                            ) : (
                              <p className="font-extrabold text-sm text-slate-800">
                                {match.awayTeam.shortName}
                              </p>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium truncate w-full text-center">
                            {match.awayTeam.name}
                          </p>
                        </div>

                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}