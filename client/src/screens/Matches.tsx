import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMatchStore, type Match } from "../store/matchStore";
import { api } from "../services/api";

type StatusFilter = "ALL" | "UPCOMING" | "LIVE" | "COMPLETED";

const ROW_HEIGHT = 140;
const ROW_GAP = 16;
const OVERSCAN = 4;

export default function Matches() {
  const { matches, setMatches, loading, setLoading } = useMatchStore();
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    api.matches
      .getAll()
      .then((data) => setMatches(data as Match[]))
      .finally(() => setLoading(false));
  }, [setMatches, setLoading]);

  const filtered =
    filter === "ALL" ? matches : matches.filter((m) => m.status === filter);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT + ROW_GAP,
    overscan: OVERSCAN,
  });

  const statusColors: Record<string, string> = {
    UPCOMING: "bg-blue-500/20 text-blue-400",
    LIVE: "bg-red-500/20 text-red-400",
    COMPLETED: "bg-gray-500/20 text-gray-400",
    CANCELLED: "bg-yellow-500/20 text-yellow-400",
  };

  /** IPL team brand colors for winner badge (bg + text) */
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
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 space-y-4 pb-4">
        <div>
          <h1 className="text-3xl font-bold">Matches</h1>
          <p className="text-gray-400 mt-1">Browse matches and pick your side.</p>
        </div>

        <div className="flex gap-2">
          {(["ALL", "UPCOMING", "LIVE", "COMPLETED"] as StatusFilter[]).map((f) => (
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
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm flex-shrink-0">Loading matches...</p>
      ) : filtered.length === 0 ? (
        <div className="flex-shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-gray-500 text-sm">No matches found.</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-auto"
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
              return (
                <Link
                  key={match.id}
                  to={`/matches/${match.id}`}
                  className="absolute left-0 w-fit max-w-full pr-1"
                  style={{
                    top: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    height: `${virtualRow.size}px`,
                  }}
                >
                  <div className="h-[calc(100%-16px)] w-fit max-w-full bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors flex flex-col min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 min-w-0 flex-shrink-0">
                      <div className="flex items-center gap-4">
                        <div className="text-right w-24">
                          <p className="font-bold">{match.homeTeam.shortName}</p>
                          <p className="text-xs text-gray-500">{match.homeTeam.name}</p>
                        </div>
                        <div className="text-gray-500 text-sm font-medium px-3">VS</div>
                        <div className="w-24">
                          <p className="font-bold">{match.awayTeam.shortName}</p>
                          <p className="text-xs text-gray-500">{match.awayTeam.name}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[match.status]}`}>
                          {match.status}
                        </span>
                        <span className="text-sm text-gray-400">
                          {new Date(match.startTime).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {match.winner && (
                      <span
                        className={`mt-3 inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getWinnerStyle(match.winner.shortName)}`}
                        title={match.winner.name}
                      >
                        Winner: {match.winner.shortName ?? match.winner.name}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
