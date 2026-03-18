import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMatchStore } from "../store/matchStore";
import { useAuthStore } from "../store/authStore";
import { useBetStore } from "../store/betStore";
import { api } from "../services/api";
import { formatCurrency, formatPrizePool } from "../utils/format";

export default function Stats() {
  const { matches, setMatches, setLoading } = useMatchStore();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { bets, setBets } = useBetStore();
  const [streakLoaded, setStreakLoaded] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.matches.getAll().then((data) => setMatches(data as never)).finally(() => setLoading(false));
  }, [setMatches, setLoading]);

  useEffect(() => {
    if (user) {
      api.bets.getMy().then((data) => setBets(data as never));
    }
  }, [user, setBets]);

  useEffect(() => {
    if (user) {
      api.auth.me().then((me) => {
        updateUser({ balance: me.balance, prizePoolContribution: me.prizePoolContribution, consecutiveMissedMatches: me.consecutiveMissedMatches, currentStreak: me.currentStreak, maxStreak: me.maxStreak });
        setStreakLoaded(true);
      });
    }
  }, [user?.id, updateUser]);

  const liveMatches = matches.filter((m) => m.status === "LIVE");
  const upcomingMatches = matches.filter((m) => m.status === "UPCOMING");
  const activeBets = bets.filter((b) => b.status === "PENDING");

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold">Stats</h1>
        <p className="text-gray-400 text-sm mt-1">Your overview. Add money to your wallet (via admin) to increase your prize pool contribution.</p>
      </div>

      <div className="bg-gray-900 border border-amber-500/40 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-amber-400 mb-2">Winning streak</h2>
        <div className="grid grid-cols-2 gap-3">
          <div title="Wins in a row; 2nd–5th consecutive win pays a streak bonus">
            <p className="text-xs text-gray-400">Current streak</p>
            <p className="text-xl font-bold text-white">{streakLoaded ? (user?.currentStreak ?? 0) : "—"}</p>
            <p className="text-[10px] text-gray-500">Wins in a row (2nd–5th win pay bonus)</p>
          </div>
          <div title="Your best streak of consecutive wins so far">
            <p className="text-xs text-gray-400">Max streak</p>
            <p className="text-xl font-bold text-white">{streakLoaded ? (user?.maxStreak ?? 0) : "—"}</p>
            <p className="text-[10px] text-gray-500">Best ever</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Live", value: String(liveMatches.length), color: "text-red-400", tip: "Matches currently in progress" },
          { label: "Upcoming", value: String(upcomingMatches.length), color: "text-blue-400", tip: "Matches you can still bet on" },
          { label: "Active Bets", value: String(activeBets.length), color: "text-yellow-400", tip: "Your bets waiting for match result" },
          { label: "Balance", value: formatCurrency(user?.balance ?? 0, 2), color: "text-green-400", tip: "Coins available to bet (entry + top-ups + profit − penalties)" },
          { label: "Prize pool contribution", value: formatPrizePool(user?.prizePoolContribution ?? 0, 2), color: "text-amber-400", tip: "Your share of the tournament prize pool (add money via admin to increase)" },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4" title={stat.tip}>
            <p className="text-xs text-gray-400">{stat.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="font-semibold mb-3">Upcoming</h2>
        {upcomingMatches.length === 0 ? (
          <p className="text-gray-500 text-sm">No upcoming matches.</p>
        ) : (
          <div className="space-y-2">
            {upcomingMatches.slice(0, 4).map((match) => (
              <Link
                key={match.id}
                to={`/matches/${match.id}`}
                className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
              >
                <span className="font-medium text-sm">
                  {match.homeTeam.shortName} vs {match.awayTeam.shortName}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(match.startTime).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
