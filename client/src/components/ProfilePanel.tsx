import { useAuthStore } from "../store/authStore";
import { useMatchStore } from "../store/matchStore";
import { useBetStore } from "../store/betStore";
import { formatCurrency, formatPrizePool } from "../utils/format";
import { Link } from "react-router-dom";

interface ProfilePanelProps {
  className?: string;
}

export default function ProfilePanel({ className = "" }: ProfilePanelProps) {
  const user = useAuthStore((s) => s.user);
  const { matches } = useMatchStore();
  const { bets } = useBetStore();

  const liveMatches = matches.filter((m) => m.status === "LIVE");
  const upcomingMatches = matches.filter((m) => m.status === "UPCOMING");
  const activeBets = bets.filter((b) => b.status === "PENDING");
  const winnings = Math.max(0, (user?.balance ?? 1000) - 1000);

  return (
    <div className={`flex flex-col h-full min-h-0 overflow-auto ${className}`}>
      <div className="flex-shrink-0 px-4 py-4 space-y-4">
        <div>
          <h2 className="text-xl font-bold">Account</h2>
          <p className="text-xs text-slate-500 mt-1">Your profile & balance</p>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500">Balance</p>
            <p className="text-lg font-bold text-emerald-600 mt-1">
              ₹ {formatCurrency(user?.balance ?? 0, 0)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Unbidded</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500">Winnings</p>
            <p className="text-lg font-bold text-amber-400 mt-1">
              ₹ {formatCurrency(winnings, 0)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Your winnings</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500">Cash Bonus</p>
            <p className="text-lg font-bold text-sky-600 mt-1">₹ 10</p>
            <p className="text-[10px] text-slate-400 mt-1">Amount to Expire</p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500 truncate">Streak</p>
            <p className="text-lg font-bold text-yellow-400 mt-1">
              {user?.currentStreak ?? 0}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 truncate">Wins in a row</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex gap-2 text-xs">
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-slate-500">Live</p>
            <p className="font-bold text-red-400">{liveMatches.length}</p>
          </div>
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-slate-500">Upcoming</p>
            <p className="font-bold text-sky-600">{upcomingMatches.length}</p>
          </div>
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-slate-500">Active Bets</p>
            <p className="font-bold text-yellow-400">{activeBets.length}</p>
          </div>
        </div>

        {/* Upcoming Matches */}
        {upcomingMatches.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Upcoming</h3>
            <div className="space-y-2">
              {upcomingMatches.slice(0, 3).map((match) => (
                <Link
                  key={match.id}
                  to={`/matches/${match.id}`}
                  className="flex items-center justify-between py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                >
                  <span className="text-xs font-medium truncate">
                    {match.homeTeam.shortName} vs {match.awayTeam.shortName}
                  </span>
                  <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                    {new Date(match.startTime).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
