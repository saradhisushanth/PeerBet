import { prisma } from "../lib/prisma.js";
import { rebalanceMatchIfLocked } from "./lockRebalance.service.js";

export const matchService = {
  async getAll() {
    return prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true, winner: true },
      orderBy: { startTime: "asc" },
    });
  },

  async getById(id: string) {
    return prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam: { include: { players: true } },
        awayTeam: { include: { players: true } },
        winner: true,
      },
    });
  },

  async setWinner(matchId: string, winnerTeamId: string) {
    return prisma.match.update({
      where: { id: matchId },
      data: {
        winnerTeamId,
        status: "COMPLETED",
      },
      include: { homeTeam: true, awayTeam: true, winner: true },
    });
  },

  async updateTimes(
    matchId: string,
    data: { startTime?: string; tossTime?: string | null }
  ) {
    const update: { startTime?: Date; tossTime?: Date | null } = {};
    if (data.startTime != null) update.startTime = new Date(data.startTime);
    if (data.tossTime !== undefined) update.tossTime = data.tossTime == null ? null : new Date(data.tossTime);
    if (Object.keys(update).length === 0) {
      return prisma.match.findUnique({
        where: { id: matchId },
        include: { homeTeam: true, awayTeam: true, winner: true },
      });
    }
    return prisma.match.update({
      where: { id: matchId },
      data: update,
      include: { homeTeam: true, awayTeam: true, winner: true },
    });
  },

  async getSummary(matchId: string) {
    await rebalanceMatchIfLocked(matchId);
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) return null;

    const bets = await prisma.bet.findMany({
      where: { matchId },
      include: { user: { select: { username: true } }, selectedTeam: { select: { shortName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const totalPool = bets.reduce((sum, b) => sum + b.amount, 0);
    const homeStake = bets.filter((b) => b.selectedTeamId === match.homeTeamId).reduce((sum, b) => sum + b.amount, 0);
    const awayStake = bets.filter((b) => b.selectedTeamId === match.awayTeamId).reduce((sum, b) => sum + b.amount, 0);
    const homePercent = totalPool > 0 ? Math.round((homeStake / totalPool) * 100) : 50;
    const awayPercent = totalPool > 0 ? Math.round((awayStake / totalPool) * 100) : 50;

    const recentBets = bets.map((b) => ({
      id: b.id,
      username: b.user.username,
      teamShortName: b.selectedTeam.shortName,
      amount: b.amount,
      createdAt: b.createdAt,
    }));

    let settlementResults: { userId: string; username: string; side: string; stake: number; poolGained: number; winningStreakAfter?: number; streakBonus?: number }[] | undefined;
    if (match.status === "COMPLETED") {
      const history = await prisma.betHistory.findMany({
        where: { matchId },
        select: { userId: true, betAmount: true, payout: true, winningStreakAfter: true, streakBonus: true },
      });
      const historyByUser = new Map(
        history.map((h) => [
          h.userId,
          {
            betAmount: h.betAmount,
            payout: h.payout,
            winningStreakAfter: h.winningStreakAfter ?? null,
            streakBonus: h.streakBonus ?? null,
          },
        ])
      );
      const settledBets = await prisma.bet.findMany({
        where: { matchId, status: { in: ["WON", "LOST"] } },
        include: { user: { select: { username: true } } },
      });
      settlementResults = settledBets
        .map((b) => {
          const h = historyByUser.get(b.userId);
          const payout = h?.payout ?? 0;
          const stake = b.amount;
          const poolGained = Math.round((payout - stake) * 100) / 100;
          const side = b.selectedTeamId === match.homeTeamId ? match.homeTeam.shortName : match.awayTeam.shortName;
          return {
            userId: b.userId,
            username: b.user.username,
            side,
            stake,
            poolGained,
            ...(h?.winningStreakAfter != null && { winningStreakAfter: h.winningStreakAfter }),
            ...(h?.streakBonus != null && h.streakBonus > 0 && { streakBonus: h.streakBonus }),
          };
        })
        .sort((a, b) => b.poolGained - a.poolGained);
    }

    return {
      matchId,
      totalPool,
      momentum: { homePercent, awayPercent },
      recentBets,
      ...(settlementResults != null && { settlementResults }),
    };
  },

  async getBoard(matchId: string) {
    await rebalanceMatchIfLocked(matchId);
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) return null;

    const allUsers = await prisma.user.findMany({
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    });

    const bets = await prisma.bet.findMany({
      where: {
        matchId,
        status: { in: ["PENDING", "WON", "LOST"] },
      },
      select: { userId: true, selectedTeamId: true, amount: true, insured: true },
    });
    const userToBet = new Map(bets.map((b) => [b.userId, { teamId: b.selectedTeamId, amount: b.amount, insured: b.insured }]));

    const onHome: { userId: string; username: string; amount: number; insured: boolean }[] = [];
    const onAway: { userId: string; username: string; amount: number; insured: boolean }[] = [];
    const undecided: { userId: string; username: string }[] = [];

    for (const u of allUsers) {
      const bet = userToBet.get(u.id);
      const row = { userId: u.id, username: u.username };
      if (bet?.teamId === match.homeTeamId) onHome.push({ ...row, amount: bet.amount, insured: bet.insured });
      else if (bet?.teamId === match.awayTeamId) onAway.push({ ...row, amount: bet.amount, insured: bet.insured });
      else undecided.push(row);
    }

    return {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      onHome,
      onAway,
      undecided,
    };
  },
};
