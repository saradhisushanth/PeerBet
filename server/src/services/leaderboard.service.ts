import { prisma } from "../lib/prisma.js";

export const leaderboardService = {
  /** Returns all registered users with balance and leaderboard stats, sorted by balance (coins remaining) desc. */
  async getTop(limit = 500) {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        balance: true,
        leaderboard: true,
        totalMissedPenalties: true,
      },
    });
    const entries = users.map((u: { id: string; username: string; balance: number | null; leaderboard: { totalWins: number; totalLosses: number; profit: number; underdogBonus: number } | null; totalMissedPenalties?: number | null }) => {
      const balance = u.balance ?? 0;
      const profit = u.leaderboard?.profit ?? 0;
      const missedPenalties = (u as { totalMissedPenalties?: number }).totalMissedPenalties ?? 0;
      return {
        userId: u.id,
        user: { id: u.id, username: u.username },
        balance,
        totalWins: u.leaderboard?.totalWins ?? 0,
        totalLosses: u.leaderboard?.totalLosses ?? 0,
        profit,
        underdogBonus: u.leaderboard?.underdogBonus ?? 0,
        missedPenalties,
        rank: null as number | null,
      };
    });
    entries.sort((a: { balance: number }, b: { balance: number }) => b.balance - a.balance);
    entries.forEach((e: { rank: number | null }, i: number) => {
      e.rank = i + 1;
    });
    return entries.slice(0, limit);
  },
};
