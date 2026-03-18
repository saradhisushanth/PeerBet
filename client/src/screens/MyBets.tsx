import { useEffect, useState } from "react";
import { INSURANCE_REFUND_PERCENT } from "@shared/constants";
import { useBetStore, type Bet } from "../store/betStore";
import { api } from "../services/api";
import { formatCurrency } from "../utils/format";

type Filter = "ALL" | "PENDING" | "WON" | "LOST";

export default function MyBets() {
  const { bets, setBets, loading, setLoading } = useBetStore();
  const [filter, setFilter] = useState<Filter>("ALL");

  useEffect(() => {
    setLoading(true);
    api.bets
      .getMy()
      .then((data) => setBets(data as Bet[]))
      .finally(() => setLoading(false));
  }, [setBets, setLoading]);

  const filtered =
    filter === "ALL" ? bets : bets.filter((b) => b.status === filter);

  const statusStyle: Record<string, string> = {
    PENDING: "bg-yellow-500/20 text-yellow-400",
    WON: "bg-green-500/20 text-green-400",
    LOST: "bg-red-500/20 text-red-400",
    CANCELLED: "bg-gray-500/20 text-gray-400",
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold">My Bets</h1>
        <p className="text-gray-400 mt-1">Track all your bets.</p>
      </div>

      <div className="flex gap-2">
        {(["ALL", "PENDING", "WON", "LOST"] as Filter[]).map((f) => (
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

      {loading ? (
        <p className="text-gray-500 text-sm">Loading bets...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-gray-500 text-sm">No bets found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((bet) => (
            <div
              key={bet.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">
                    {bet.match?.homeTeam.shortName} vs {bet.match?.awayTeam.shortName}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Picked: <span className="text-white font-medium">{bet.selectedTeam.shortName}</span>
                    {" "}&middot;{" "}
                    Odds: {bet.oddsMultiplier}x
                    {bet.insured && <span className="text-amber-400 ml-1" title="Insured — refund if you lose">🛡 Insured</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{formatCurrency(bet.amount)}</p>
                  <span className={`inline-block mt-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusStyle[bet.status]}`}>
                    {bet.status}
                  </span>
                </div>
              </div>
              {bet.status === "LOST" && bet.insured && (
                <p className="text-sm text-amber-400/95 mt-2">
                  Insurance refund: {formatCurrency(Math.round((bet.amount * INSURANCE_REFUND_PERCENT) / 100), 2)} (50% of stake)
                </p>
              )}
              <p className="text-xs text-gray-500 mt-3">
                {new Date(bet.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
