import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMatchStore } from "../store/matchStore";
import { getTeamLogo, getTeamLogoVisualScale } from "../utils/teamLogos";

type StatusFilter = "UPCOMING" | "LIVE" | "COMPLETED";

const ROW_HEIGHT = 116;
const ROW_GAP = 10;

interface MatchesPanelProps {
  className?: string;
}

const teamWinnerStyles: Record<string, { bg: string; text: string }> = {
  RCB:  { bg: "#dc2626", text: "#fff" },
  SRH:  { bg: "#f97316", text: "#fff" },
  MI:   { bg: "#2563eb", text: "#fff" },
  CSK:  { bg: "#fbbf24", text: "#111" },
  KKR:  { bg: "#7c3aed", text: "#fff" },
  DC:   { bg: "#4338ca", text: "#fff" },
  RR:   { bg: "#e11d48", text: "#fff" },
  PBKS: { bg: "#b91c1c", text: "#fff" },
  GT:   { bg: "#475569", text: "#fff" },
  LSG:  { bg: "#16a34a", text: "#fff" },
};

const TABS: { key: StatusFilter; label: string }[] = [
  { key: "UPCOMING",  label: "Upcoming" },
  { key: "LIVE",      label: "Live"     },
  { key: "COMPLETED", label: "Results"  },
];

export default function MatchesPanel({ className = "" }: MatchesPanelProps) {
  const { matches } = useMatchStore();
  const [filter, setFilter] = useState<StatusFilter>("UPCOMING");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  const filtered = matches.filter((m) => m.status === filter);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT + ROW_GAP,
    overscan: 5,
  });

  const getCountdown = (startTime: string): string => {
    const diffMs = new Date(startTime).getTime() - now;
    if (diffMs <= 0) return "Starting soon";
    const s = Math.floor(diffMs / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h >= 24)
      return new Date(startTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className={`flex flex-col h-full min-h-0 bg-[#f8f9fc] ${className}`}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-100">
        <div className="px-4 pt-4 pb-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[17px] font-extrabold text-slate-900 tracking-tight leading-none">Match Fixtures</h2>
            </div>
            {matches.some((m) => m.status === "LIVE") && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-[10px] font-bold text-red-500 uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                Live
              </span>
            )}
          </div>
          {/* Tab bar */}
          <div className="flex">
            {TABS.map(({ key, label }) => {
              const active = filter === key;
              const count = matches.filter((m) => m.status === key).length;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${
                    active ? "border-rose-600 text-rose-600" : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {key === "LIVE" && (
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${active ? "bg-rose-500 animate-pulse" : "bg-red-400"}`} />
                  )}
                  {label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${active ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <span className="text-3xl">🏏</span>
          <p className="text-slate-400 text-sm font-medium">No {filter.toLowerCase()} matches</p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-3 py-3" style={{ contain: "strict" }}>
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vr) => {
              const match = filtered[vr.index];
              const homeScale = getTeamLogoVisualScale(match.homeTeam.shortName, match.homeTeam.name);
              const awayScale = getTeamLogoVisualScale(match.awayTeam.shortName, match.awayTeam.name);
              const homeLogo = getTeamLogo(match.homeTeam.shortName, match.homeTeam.name);
              const awayLogo = getTeamLogo(match.awayTeam.shortName, match.awayTeam.name);
              const winner = match.winner;
              const ws = winner ? (teamWinnerStyles[winner.shortName] ?? { bg: "#64748b", text: "#fff" }) : null;

              return (
                <Link
                  key={match.id}
                  to={`/matches/${match.id}`}
                  className="absolute left-0 w-full"
                  style={{ top: 0, transform: `translateY(${vr.start}px)`, height: `${vr.size}px` }}
                >
                  <div className="h-[calc(100%-10px)] bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-rose-200 transition-all overflow-hidden group flex flex-col justify-center px-4 py-3 gap-2">

                    {/* ── Top meta row ── */}
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        Indian T20 League
                      </p>
                      <div className="flex items-center gap-2">
                        {/* Status chip */}
                        {match.status === "LIVE" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                            <span className="w-1 h-1 rounded-full bg-white/80 animate-pulse inline-block" />
                            LIVE
                          </span>
                        )}
                        {match.status === "UPCOMING" && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full tabular-nums">
                            {getCountdown(match.startTime)}
                          </span>
                        )}
                        {match.status === "COMPLETED" && !winner && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                            {new Date(match.startTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                          </span>
                        )}
                        {/* Winner badge */}
                        {winner && ws && (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: ws.bg, color: ws.text }}
                          >
                            👑 {winner.shortName}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ── Teams row ── */}
                    <div className="flex items-center gap-3">

                      {/* Home */}
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 p-1">
                          {homeLogo ? (
                            <img
                              src={homeLogo}
                              alt={match.homeTeam.name}
                              className="w-full h-full object-contain"
                              style={{ transform: `scale(${homeScale})` }}
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-[10px] font-extrabold text-slate-700">{match.homeTeam.shortName}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 leading-tight">{match.homeTeam.shortName}</p>
                          <p className="text-[10px] text-slate-400 leading-tight truncate">{match.homeTeam.name}</p>
                        </div>
                      </div>

                      {/* VS */}
                      <span className="text-[10px] font-extrabold tracking-widest text-slate-300 shrink-0">VS</span>

                      {/* Away — reversed (logo on right) */}
                      <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-row-reverse">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 p-1">
                          {awayLogo ? (
                            <img
                              src={awayLogo}
                              alt={match.awayTeam.name}
                              className="w-full h-full object-contain"
                              style={{ transform: `scale(${awayScale})` }}
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-[10px] font-extrabold text-slate-700">{match.awayTeam.shortName}</span>
                          )}
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="text-sm font-bold text-slate-800 leading-tight">{match.awayTeam.shortName}</p>
                          <p className="text-[10px] text-slate-400 leading-tight truncate">{match.awayTeam.name}</p>
                        </div>
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
  );
}