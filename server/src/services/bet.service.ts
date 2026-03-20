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

/** Response shape for place(); keep selects tight to cut JOIN work inside the write transaction. */
const betPlaceInclude = {
  selectedTeam: {
    select: { id: true, name: true, shortName: true, logoUrl: true },
  },
  match: {
    select: {
      startTime: true,
      status: true,
      homeTeam: {
        select: { id: true, name: true, shortName: true, logoUrl: true },
      },
      awayTeam: {
        select: { id: true, name: true, shortName: true, logoUrl: true },
      },
      winner: {
        select: { id: true, name: true, shortName: true, logoUrl: true },
      },
    },
  },
} as const;

const userWalletSelect = {
  balance: true,
  prizePoolContribution: true,
  consecutiveMissedMatches: true,
} as const;

export type PlaceBetWalletSnapshot = {
  balance: number;
  prizePoolContribution: number;
  consecutiveMissedMatches: number;
};

export const betService = {
  async place(
    userId: string,
    matchId: string,
    selectedTeamId: string,
    amount: number,
    insured = false
  ): Promise<{ bet: unknown; wallet: PlaceBetWalletSnapshot }> {
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

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        startTime: true,
        tossTime: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { id: true, name: true, shortName: true } },
        awayTeam: { select: { id: true, name: true, shortName: true } },
      },
    });

    if (!match) throw new BetError("Match not found", 404);

    if (match.status !== "UPCOMING") {
      throw new BetError("Bets can only be placed on upcoming matches", 400);
    }

    const bettingClosesAt = getBettingClosesAt(match.startTime, match.tossTime);
    if (new Date() >= bettingClosesAt) {
      throw new BetError("Betting has closed (toss time)", 400);
    }

    const validTeamIds = [match.homeTeamId, match.awayTeamId];
    if (!validTeamIds.includes(selectedTeamId)) {
      throw new BetError("Selected team is not part of this match", 400);
    }

    // One round-trip wave: balance + user's pending bet + pool sum (was two sequential waves).
    const [user, existingBet, poolAgg] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, ...userWalletSelect },
      }),
      prisma.bet.findFirst({
        where: { userId, matchId, status: "PENDING" },
        include: betPlaceInclude,
      }),
      prisma.bet.aggregate({
        where: { matchId, status: "PENDING" },
        _sum: { amount: true },
      }),
    ]);

    if (!user) throw new BetError("User not found", 404);

    const currentTotalPool = poolAgg._sum.amount ?? 0;

    const refundAmount = existingBet?.amount ?? 0;
    const existingInsurance = existingBet && existingBet.insured ? INSURANCE_COST : 0;
    const balance = user.balance ?? 0;
    const availableBalance = balance + refundAmount + existingInsurance;
    const maxStakeByBalance = Math.max(0, availableBalance - (insured ? INSURANCE_COST : 0));

    const presentPool = currentTotalPool - (existingBet?.amount ?? 0);
    const poolCap = presentPool > 0 ? Math.floor(Number(presentPool)) : MAX_STAKE;
    const maxAllowed = Math.max(MIN_STAKE, Math.min(poolCap, MAX_STAKE, maxStakeByBalance));

    if (stake > maxAllowed) {
      throw new BetError(
        `Stake too high. Max is 💰 ${maxAllowed} (pool / balance cap). Your stake 💰 ${stake}.`,
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

    if (
      existingBet &&
      existingBet.selectedTeamId === selectedTeamId &&
      existingBet.amount === stake &&
      existingBet.insured === insured
    ) {
      return {
        bet: existingBet,
        wallet: {
          balance: user.balance,
          prizePoolContribution: user.prizePoolContribution,
          consecutiveMissedMatches: user.consecutiveMissedMatches,
        },
      };
    }

    // Update in place when possible: 2 statements in tx instead of delete + create + update.
    const txOps = existingBet
      ? [
          prisma.bet.update({
            where: { id: existingBet.id },
            data: {
              selectedTeamId,
              amount: stake,
              oddsMultiplier: FIXED_ODDS,
              insured,
            },
            include: betPlaceInclude,
          }),
          prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: netBalanceChange } },
            select: userWalletSelect,
          }),
        ]
      : [
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
            include: betPlaceInclude,
          }),
          prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: netBalanceChange } },
            select: userWalletSelect,
          }),
        ];

    const results = await prisma.$transaction(txOps);
    const bet = results[0];
    const walletRow = results[1] as PlaceBetWalletSnapshot;
    return {
      bet,
      wallet: {
        balance: walletRow.balance,
        prizePoolContribution: walletRow.prizePoolContribution,
        consecutiveMissedMatches: walletRow.consecutiveMissedMatches,
      },
    };
  },

  async cancel(userId: string, matchId: string) {
    // When user has a pending bet, one query loads bet + match for validation (was match + bet).
    const existingBet = await prisma.bet.findFirst({
      where: { userId, matchId, status: "PENDING" },
      include: {
        match: {
          select: {
            id: true,
            status: true,
            startTime: true,
            tossTime: true,
          },
        },
        user: { select: { username: true } },
        selectedTeam: { select: { shortName: true } },
      },
    });

    if (!existingBet) {
      const matchExists = await prisma.match.findUnique({
        where: { id: matchId },
        select: { id: true },
      });
      if (!matchExists) throw new BetError("Match not found", 404);
      return null;
    }

    const m = existingBet.match;
    if (m.status !== "UPCOMING") {
      throw new BetError("Bets can only be cancelled for upcoming matches", 400);
    }
    const bettingClosesAt = getBettingClosesAt(m.startTime, m.tossTime);
    if (new Date() >= bettingClosesAt) {
      throw new BetError("Betting has closed (toss time)", 400);
    }

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
    const rows = await prisma.bet.findMany({
      where: { userId },
      include: {
        match: { include: { homeTeam: true, awayTeam: true, winner: true } },
        selectedTeam: true,
      },
      orderBy: { createdAt: "desc" },
    });
    // At most one row per match (latest stake / row by createdAt). Duplicates can exist from legacy flows or races.
    const byMatchId = new Map<string, (typeof rows)[number]>();
    for (const bet of rows) {
      if (!byMatchId.has(bet.matchId)) byMatchId.set(bet.matchId, bet);
    }
    return Array.from(byMatchId.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
};

export class BetError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "BetError";
  }
}
