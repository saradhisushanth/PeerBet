import { prisma } from "../lib/prisma.js";
import {
  MIN_STAKE,
  MAX_STAKE,
  INSURANCE_COST,
  TOSS_DEFAULT_MINUTES_BEFORE_MATCH,
} from "../../../shared/constants.js";

function getBettingClosesAt(startTime: Date, tossTime: Date | null | undefined): Date {
  if (tossTime != null) return tossTime as Date;
  return new Date((startTime as Date).getTime() - TOSS_DEFAULT_MINUTES_BEFORE_MATCH * 60 * 1000);
}

const FIXED_ODDS = 2;

export const betService = {
  async place(userId: string, matchId: string, selectedTeamId: string, amount: number, insured = false) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });

    if (!match) throw new BetError("Match not found", 404);

    if (match.status !== "UPCOMING") {
      throw new BetError("Bets can only be placed on upcoming matches", 400);
    }

    const bettingClosesAt = getBettingClosesAt(match.startTime, (match as { tossTime?: Date | null }).tossTime);
    if (new Date() >= bettingClosesAt) {
      throw new BetError("Betting has closed (toss time)", 400);
    }

    const validTeamIds = [match.homeTeamId, match.awayTeamId];
    if (!validTeamIds.includes(selectedTeamId)) {
      throw new BetError("Selected team is not part of this match", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BetError("User not found", 404);

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum % 1 !== 0) {
      throw new BetError("Stake must be a whole number (no decimals)", 400);
    }
    const stake = Math.floor(amountNum);
    if (stake < MIN_STAKE) {
      throw new BetError(`Minimum stake is 💰 ${MIN_STAKE}`, 400);
    }
    if (stake > MAX_STAKE) {
      throw new BetError(`Maximum stake is 💰 ${MAX_STAKE}`, 400);
    }

    const [existingBet, poolAgg] = await Promise.all([
      prisma.bet.findFirst({
        where: { userId, matchId, status: "PENDING" },
      }),
      prisma.bet.aggregate({
        where: { matchId, status: "PENDING" },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const currentTotalPool = poolAgg._sum.amount ?? 0;
    const pendingBetCount = poolAgg._count.id ?? 0;

    // Present pool = pool before this player's bet. Pot rule: max = half of present pool (or MAX_STAKE if pool empty). Also capped by balance.
    const refundAmount = existingBet?.amount ?? 0;
    const existingInsurance = existingBet && (existingBet as { insured?: boolean }).insured ? INSURANCE_COST : 0;
    const balance = (user as { balance?: number }).balance ?? 0;
    const availableBalance = balance + refundAmount + existingInsurance;
    const maxStakeByBalance = Math.max(0, availableBalance - (insured ? INSURANCE_COST : 0));

    const presentPool = currentTotalPool - (existingBet?.amount ?? 0);
    const halfPool = presentPool > 0 ? Math.floor(Number(presentPool) / 2) : MAX_STAKE;
    const maxAllowed = Math.max(MIN_STAKE, Math.min(halfPool, MAX_STAKE, maxStakeByBalance));

    if (stake > maxAllowed) {
      throw new BetError(
        `Stake too high. Max is 💰 ${maxAllowed} (half of pool / balance cap). Your stake 💰 ${stake}.`,
        400
      );
    }

    const insuranceDeduction = insured ? INSURANCE_COST : 0;
    const totalDeduction = stake + insuranceDeduction;
    if (totalDeduction > availableBalance) {
      throw new BetError(
        `Insufficient balance. You have 💰 ${availableBalance} available (including refund from your current bet). Stake + insurance would be 💰 ${totalDeduction}.`,
        400
      );
    }
    const netBalanceChange = refundAmount + existingInsurance - totalDeduction;

    if (existingBet && existingBet.selectedTeamId === selectedTeamId && existingBet.amount === stake && (existingBet as { insured?: boolean }).insured === insured) {
      return existingBet;
    }


    const results = await prisma.$transaction([
      ...(existingBet ? [prisma.bet.delete({ where: { id: existingBet.id } })] : []),
      prisma.bet.create({
        data: {
          userId,
          matchId,
          selectedTeamId,
          amount: stake,
          oddsMultiplier: FIXED_ODDS,
          insured,
          status: "PENDING",
        },
        include: {
          match: { include: { homeTeam: true, awayTeam: true } },
          selectedTeam: true,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: netBalanceChange } },
      }),
    ]);
    const bet = results[existingBet ? 1 : 0];
    return bet as typeof results[1];
  },

  async cancel(userId: string, matchId: string) {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new BetError("Match not found", 404);
    if (match.status !== "UPCOMING") {
      throw new BetError("Bets can only be cancelled for upcoming matches", 400);
    }
    const bettingClosesAt = getBettingClosesAt(match.startTime, (match as { tossTime?: Date | null }).tossTime);
    if (new Date() >= bettingClosesAt) {
      throw new BetError("Betting has closed (toss time)", 400);
    }
    const existingBet = await prisma.bet.findFirst({
      where: { userId, matchId, status: "PENDING" },
      include: {
        user: { select: { username: true } },
        selectedTeam: { select: { shortName: true } },
      },
    });
    if (!existingBet) return null;
    const refund = existingBet.amount + (existingBet.insured ? INSURANCE_COST : 0);
    await prisma.$transaction([
      prisma.bet.delete({ where: { id: existingBet.id } }),
      prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: refund } },
      }),
    ]);
    return existingBet;
  },

  async getByUser(userId: string) {
    return prisma.bet.findMany({
      where: { userId },
      include: {
        match: { include: { homeTeam: true, awayTeam: true, winner: true } },
        selectedTeam: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },
};

export class BetError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "BetError";
  }
}
