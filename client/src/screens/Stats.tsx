import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMatchStore } from "../store/matchStore";
import { useAuthStore } from "../store/authStore";
import { useBetStore } from "../store/betStore";
import { api } from "../services/api";
import { formatCurrency, formatPrizePool } from "../utils/format";

const STALE_MS = 30_000;

function StatCard({
  label,
  value,
  sub,
  colorClass,
  tip,
}: {
  label: string;
  value: string;
  sub?: string;
  colorClass: string;
  tip?: string;
}) {
  return (
    <div
      className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col gap-1"
      title={tip}
    >
      <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold">{label}</p>
      <p className={`text-xl font-extrabold tracking-tight ${colorClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

export default function Stats() {
  const { matches, setMatches, setLoading, lastFetched: matchesLastFetched } = useMatchStore();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { bets, setBets, lastFetched: betsLastFetched } = useBetStore();
  const [streakLoaded, setStreakLoaded] = useState(false);

  useEffect(() => {
    const isStale = !matchesLastFetched || Date.now() - matchesLastFetched > STALE_MS;
    if (isStale) {
      if (!matches.length) setLoading(true);
      api.matches.getAll().then((data) => setMatches(data as never)).finally(() => setLoading(false));
    }
  }, [setMatches, setLoading, matchesLastFetched, matches.length]);

  useEffect(() => {
    if (!user) return;
    const isStale = !betsLastFetched || Date.now() - betsLastFetched > STALE_MS;
    if (isStale) api.bets.getMy().then((data) => setBets(data as never));
  }, [user, setBets, betsLastFetched]);

  useEffect(() => {
    if (user) {
      api.auth.me().then((me) => {
        updateUser({
          balance: me.balance,
          prizePoolContribution: me.prizePoolContribution,
          consecutiveMissedMatches: me.consecutiveMissedMatches,
          currentStreak: me.currentStreak,
          maxStreak: me.maxStreak,
        });
        setStreakLoaded(true);
      });
    }
  }, [user?.id, updateUser]);

  const liveMatches = matches.filter((m) => m.status === "LIVE");
  const upcomingMatches = matches.filter((m) => m.status === "UPCOMING");
  const activeBets = bets.filter((b) => b.status === "PENDING");

  // Initials avatar
  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : "??";

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-24">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-10 py-7 mb-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="shrink-0 w-14 h-14 rounded-2xl bg-rose-600 flex items-center justify-center shadow-sm">
              <span className="text-white text-lg font-extrabold tracking-tight">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold mb-0.5">Profile</p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight truncate">
                {user?.username ?? "—"}
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Your overview &amp; tournament stats.
              </p>
            </div>
            {/* Live badge */}
            {liveMatches.length > 0 && (
              <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] font-bold text-red-500 uppercase tracking-wide">
                  {liveMatches.length} Live
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 space-y-4">

        {/* ── Streak Banner ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-100 flex items-center gap-2">
            <span className="text-base">🔥</span>
            <p className="text-[11px] uppercase tracking-[0.15em] text-amber-500 font-semibold">Winning Streak</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-amber-100">
            <div
              className="px-5 py-4"
              title="Wins in a row; 2nd–5th consecutive win pays a streak bonus"
            >
              <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Current</p>
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {streakLoaded ? (user?.currentStreak ?? 0) : <span className="text-slate-300">—</span>}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">2nd–5th win pays bonus</p>
            </div>
            <div
              className="px-5 py-4"
              title="Your best streak of consecutive wins so far"
            >
              <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Best Ever</p>
              <p className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {streakLoaded ? (user?.maxStreak ?? 0) : <span className="text-slate-300">—</span>}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">All-time max streak</p>
            </div>
          </div>
        </div>

        {/* ── Main Stats Grid ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Balance"
            value={` ${formatCurrency(user?.balance ?? 0, 2)}`}
            sub="Available to bet"
            colorClass="text-emerald-600"
            tip="Coins available to bet (entry + top-ups + profit − penalties)"
          />
          <StatCard
            label="Prize Pool"
            value={formatPrizePool(user?.prizePoolContribution ?? 0, 2)}
            sub="Your contribution"
            colorClass="text-amber-500"
            tip="Your share of the tournament prize pool (add money via admin to increase)"
          />
          <StatCard
            label="Active Bets"
            value={String(activeBets.length)}
            sub="Awaiting result"
            colorClass="text-yellow-500"
            tip="Your bets waiting for match result"
          />
          <StatCard
            label="Live"
            value={String(liveMatches.length)}
            sub="In progress"
            colorClass="text-red-500"
            tip="Matches currently in progress"
          />
          <StatCard
            label="Upcoming"
            value={String(upcomingMatches.length)}
            sub="Open to bet"
            colorClass="text-sky-600"
            tip="Matches you can still bet on"
          />
        </div>

        {/* ── Upcoming Matches ──────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[11px] uppercase tracking-[0.15em] text-slate-400 font-semibold">
              Upcoming Matches
            </p>
          </div>
          {upcomingMatches.length === 0 ? (
            <p className="px-5 py-6 text-slate-400 text-sm">No upcoming matches.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {upcomingMatches.slice(0, 4).map((match) => (
                <Link
                  key={match.id}
                  to={`/matches/${match.id}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-sky-400" />
                    <span className="text-sm font-semibold text-slate-800 truncate">
                      {match.homeTeam.shortName}
                      <span className="text-slate-400 font-normal mx-1">vs</span>
                      {match.awayTeam.shortName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-xs text-slate-400">
                      {new Date(match.startTime).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <svg
                      className="text-slate-300 group-hover:text-slate-500 transition-colors"
                      xmlns="http://www.w3.org/2000/svg" width="12" height="12"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Info note ─────────────────────────────────────────────────────── */}
        <p className="text-[11px] text-slate-400 pb-2">
          To increase your prize pool contribution, ask the admin for a wallet top-up.
        </p>

      </div>
    </div>
  );
}