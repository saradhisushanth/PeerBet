import { prisma } from "../lib/prisma.js";
import {
  INSURANCE_REFUND_PERCENT,
  UNDERDOG_MULTIPLIER,
  STREAK_BONUS,
  MISSED_MATCH_PENALTY,
  SOLO_WIN_BONUS_MULTIPLIER,
  SOLO_LOSS_REFUND_PERCENT,
} from "../../../shared/constants.js";

export const settlementService = {
  async settleMatch(matchId: string, winnerTeamId: string) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { homeTeamId: true, awayTeamId: true },
    });
    if (!match) return { results: [], underdogTeamId: null };

    const bets = await prisma.bet.findMany({
      where: { matchId, status: "PENDING" },
      include: { user: true },
    });

    if (bets.length === 0) return { results: [], underdogTeamId: null };

    type BetItem = (typeof bets)[number];
    const totalWinningStake = bets
      .filter((b: BetItem) => b.selectedTeamId === winnerTeamId)
      .reduce((sum: number, b: BetItem) => sum + b.amount, 0);
    const losingPool = bets
      .filter((b: BetItem) => b.selectedTeamId !== winnerTeamId)
      .reduce((sum: number, b: BetItem) => sum + b.amount, 0);

    const homeBets = bets.filter((b: BetItem) => b.selectedTeamId === match.homeTeamId);
    const awayBets = bets.filter((b: BetItem) => b.selectedTeamId === match.awayTeamId);
    const homePlayerCount = homeBets.length;
    const awayPlayerCount = awayBets.length;
    const homeStake = homeBets.reduce((s: number, b: BetItem) => s + b.amount, 0);
    const awayStake = awayBets.reduce((s: number, b: BetItem) => s + b.amount, 0);
    // Underdog = fewer players; if tied, less total stake; if equal players and equal stake, away
    const underdogTeamId =
      homePlayerCount < awayPlayerCount
        ? match.homeTeamId
        : awayPlayerCount < homePlayerCount
          ? match.awayTeamId
          : homeStake < awayStake
            ? match.homeTeamId
            : awayStake < homeStake
              ? match.awayTeamId
              : match.awayTeamId; // equal players and equal stake

    const participantIds = new Set(bets.map((b: BetItem) => b.userId));
    const isSoloMatch = participantIds.size === 1;

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const results: { betId: string; userId: string; result: "WIN" | "LOSS"; payout: number; insuredRefund?: number; streakBonus?: number; soloBonus?: number; soloByeRefund?: number }[] = [];

    for (const bet of bets) {
      const won = bet.selectedTeamId === winnerTeamId;
      const insured = (bet as { insured?: boolean }).insured ?? false;

      let payout: number;
      let insuredRefund: number | undefined;
      let streakBonus: number | undefined;
      let soloBonus: number | undefined;
      let soloByeRefund: number | undefined;
      let winningStreakAfter = 0;

      let underdogBonusAmount = 0;
      if (won) {
        const poolShare = totalWinningStake > 0 ? (bet.amount / totalWinningStake) * losingPool : 0;
        const isUnderdogWinner = bet.selectedTeamId === underdogTeamId;
        const adjustedPoolShare = isUnderdogWinner ? poolShare * UNDERDOG_MULTIPLIER : poolShare;
        if (isUnderdogWinner && poolShare > 0) {
          underdogBonusAmount = round2(poolShare * (UNDERDOG_MULTIPLIER - 1));
        }
        payout = bet.amount + adjustedPoolShare;

        const currentStreak = await getConsecutiveWins(bet.userId);
        const newStreak = currentStreak + 1;
        winningStreakAfter = newStreak;
        const bonus = STREAK_BONUS[newStreak];
        if (bonus != null) {
          streakBonus = bonus;
          payout += bonus;
        }
        if (isSoloMatch) {
          soloBonus = round2(bet.amount * SOLO_WIN_BONUS_MULTIPLIER);
          payout += soloBonus;
        }
        payout = round2(Math.max(bet.amount, payout));
      } else {
        if (isSoloMatch) {
          soloByeRefund = round2((bet.amount * SOLO_LOSS_REFUND_PERCENT) / 100);
          payout = soloByeRefund;
        } else {
          payout = 0;
          if (insured) {
            insuredRefund = round2((bet.amount * INSURANCE_REFUND_PERCENT) / 100);
            payout = insuredRefund;
          }
        }
      }

      const credit = payout;

      const isSoloBye = isSoloMatch && !won;
      const profit = isSoloBye ? 0 : round2(won ? payout - bet.amount : (insuredRefund ?? 0) - bet.amount);

      await prisma.$transaction([
        prisma.bet.update({
          where: { id: bet.id },
          data: { status: won ? "WON" : "LOST" },
        }),

        prisma.user.update({
          where: { id: bet.userId },
          data: { balance: { increment: credit } },
        }),

        prisma.betHistory.create({
          data: {
            userId: bet.userId,
            matchId,
            betAmount: bet.amount,
            payout,
            result: won ? "WIN" : "LOSS",
            winningStreakAfter,
            streakBonus: streakBonus ?? null,
          },
        }),

        prisma.leaderboard.upsert({
          where: { userId: bet.userId },
          create: {
            userId: bet.userId,
            totalWins: won ? 1 : 0,
            totalLosses: isSoloBye ? 0 : won ? 0 : 1,
            profit,
            underdogBonus: underdogBonusAmount,
          },
          update: {
            totalWins: { increment: won ? 1 : 0 },
            totalLosses: { increment: isSoloBye ? 0 : won ? 0 : 1 },
            profit: { increment: profit },
            ...(underdogBonusAmount > 0 && { underdogBonus: { increment: underdogBonusAmount } }),
          },
        }),
      ]);

      results.push({
        betId: bet.id,
        userId: bet.userId,
        result: won ? "WIN" : "LOSS",
        payout,
        ...(insuredRefund != null && { insuredRefund }),
        ...(streakBonus != null && { streakBonus }),
        ...(soloBonus != null && { soloBonus }),
        ...(soloByeRefund != null && { soloByeRefund }),
      });
    }

    await recalculateRanks();

    const allUsers = await prisma.user.findMany({
      select: { id: true, balance: true, consecutiveMissedMatches: true },
    });

    for (const u of allUsers) {
      if (participantIds.has(u.id)) {
        await prisma.user.update({
          where: { id: u.id },
          data: { consecutiveMissedMatches: 0 },
        });
      } else {
        const newMissed = (u.consecutiveMissedMatches ?? 0) + 1;
        const penalty = newMissed >= 2 ? MISSED_MATCH_PENALTY : 0;
        const currentBalance = (u as { balance?: number }).balance ?? 0;
        const balanceAfterPenalty = Math.max(0, currentBalance - penalty);
        await prisma.user.update({
          where: { id: u.id },
          data: {
            consecutiveMissedMatches: newMissed,
            balance: balanceAfterPenalty,
            totalMissedPenalties: { increment: penalty },
          },
        });
      }
    }

    return { results, underdogTeamId };
  },
};

async function getConsecutiveWins(userId: string): Promise<number> {
  const history = await prisma.betHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { result: true },
    take: 20,
  });
  let count = 0;
  for (const h of history) {
    if (h.result === "WIN") count++;
    else break;
  }
  return count;
}

/** Current winning streak and max winning streak ever (from full history). */
export async function getStreakStats(userId: string): Promise<{ currentStreak: number; maxStreak: number }> {
  const history = await prisma.betHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { result: true },
  });
  let currentStreak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].result === "WIN") currentStreak++;
    else break;
  }
  let maxStreak = 0;
  let run = 0;
  for (const h of history) {
    if (h.result === "WIN") {
      run++;
      maxStreak = Math.max(maxStreak, run);
    } else {
      run = 0;
    }
  }
  return { currentStreak, maxStreak };
}

async function recalculateRanks() {
  const entries = await prisma.leaderboard.findMany({
    orderBy: { profit: "desc" },
  });

  for (let i = 0; i < entries.length; i++) {
    await prisma.leaderboard.update({
      where: { id: entries[i].id },
      data: { rank: i + 1 },
    });
  }
}
