import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useMatchStore } from "../store/matchStore";
import { useAuthStore } from "../store/authStore";
import { useBetStore } from "../store/betStore";
import { api } from "../services/api";
import { formatCurrency } from "../utils/format";

export default function Dashboard() {
  const { matches, setMatches, setLoading } = useMatchStore();
  const user = useAuthStore((s) => s.user);
  const { bets, setBets } = useBetStore();

  useEffect(() => {
    setLoading(true);
    api.matches
      .getAll()
      .then((data) => setMatches(data as never))
      .finally(() => setLoading(false));
  }, [setMatches, setLoading]);

  useEffect(() => {
    if (user) {
      api.bets.getMy().then((data) => setBets(data as never));
    }
  }, [user, setBets]);

  const liveMatches = matches.filter((m) => m.status === "LIVE");
  const upcomingMatches = matches.filter((m) => m.status === "UPCOMING");
  const activeBets = bets.filter((b) => b.status === "PENDING");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Welcome back, <span className="text-primary-400 font-semibold">{user?.username}</span>. Here's what's happening today.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Live Matches", value: String(liveMatches.length), color: "text-red-400" },
          { label: "Upcoming", value: String(upcomingMatches.length), color: "text-blue-400" },
          { label: "Active Bets", value: String(activeBets.length), color: "text-yellow-400" },
          { label: "Balance", value: formatCurrency(user?.balance ?? 0, 2), color: "text-green-400" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Upcoming Matches</h2>
        {upcomingMatches.length === 0 ? (
          <p className="text-slate-500 text-sm">No upcoming matches right now.</p>
        ) : (
          <div className="space-y-3">
            {upcomingMatches.slice(0, 5).map((match) => (
              <Link
                key={match.id}
                to={`/matches/${match.id}`}
                className="flex items-center justify-between p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{match.homeTeam.shortName}</span>
                  <span className="text-slate-500 text-sm">vs</span>
                  <span className="font-semibold">{match.awayTeam.shortName}</span>
                </div>
                <div className="text-sm text-slate-500">
                  {new Date(match.startTime).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
