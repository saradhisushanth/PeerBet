import { prisma } from "../lib/prisma.js";
import { PRIZE_DISTRIBUTION_PERCENT, HOUSE_CUT_PERCENT } from "../../../shared/constants.js";

export const tournamentService = {
  async getDetails() {
    // Run user list + recent transactions in parallel (independent reads).
    // NOTE: Do not run updateMany/backfills here — that ran on every GET before and killed latency on remote DBs.
    const [users, transactions] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          balance: true,
          prizePoolContribution: true,
        },
        orderBy: { username: "asc" },
      }),
      prisma.walletTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          userId: true,
          amount: true,
          approvedBy: true,
          createdAt: true,
          user: { select: { username: true } },
        },
      }),
    ]);

    type UserRow = (typeof users)[number];
    const totalPrizePool = users.reduce((s: number, u: UserRow) => s + (u.prizePoolContribution ?? 0), 0);

    const balanceSheet = users.map((u: UserRow) => ({
      userId: u.id,
      username: u.username,
      balance: u.balance ?? 0,
      prizePoolContribution: u.prizePoolContribution ?? 0,
    }));

    const prizeDistribution = PRIZE_DISTRIBUTION_PERCENT.map((pct, i) => ({
      rank: i + 1,
      percent: pct,
      amount: Math.round((totalPrizePool * pct) / 100),
    }));

    const houseCutAmount = Math.round((totalPrizePool * HOUSE_CUT_PERCENT) / 100);

    return {
      totalPrizePool,
      prizeDistribution,
      houseCutPercent: HOUSE_CUT_PERCENT,
      houseCutAmount,
      balanceSheet,
      transactions: transactions.map((t: (typeof transactions)[number]) => ({
        id: t.id,
        userId: t.userId,
        username: t.user.username,
        amount: t.amount,
        approvedBy: t.approvedBy ?? null,
        createdAt: t.createdAt,
      })),
      rules: [
        "In-game balance is used for ranking only; final standings determine prize payout.",
        "1st–5th place receive a share of the prize pool (40%, 25%, 15%, 10%, 5%). 6th and below receive ₹0.",
        "5% of the prize pool is house cut or rollover.",
        "Prize pool is the sum of all players' contributions (entry + admin-approved top-ups).",
        "Wallet top-ups require admin approval and increase both your balance and the prize pool.",
      ],
    };
  },

  async walletTopUp(adminUserId: string, targetUserId: string, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Amount must be a positive number");
    }
    const rounded = Math.round(amount * 100) / 100;

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new Error("User not found");

    const [updatedUser, tx] = await prisma.$transaction([
      prisma.user.update({
        where: { id: targetUserId },
        data: {
          balance: { increment: rounded },
          prizePoolContribution: { increment: rounded },
        },
        select: { id: true, username: true, balance: true, prizePoolContribution: true },
      }),
      prisma.walletTransaction.create({
        data: {
          userId: targetUserId,
          amount: rounded,
          approvedBy: adminUserId,
        },
      }),
    ]);

    return { user: updatedUser, transaction: tx };
  },
};
