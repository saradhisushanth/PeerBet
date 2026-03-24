import { prisma } from "../lib/prisma.js";
import {
  aggregateHomeAwayStakesForMatch,
  refreshOddsMultipliersForPendingMatchTx,
} from "../lib/matchPoolOdds.js";
import {
  MIN_STAKE,
  MAX_STAKE,
  INSURANCE_COST,
  TOSS_DEFAULT_MINUTES_BEFORE_MATCH,
} from "../../../shared/constants.js";
import {
  impliedGrossReturnMultiplierForPick,
  roundOddsMultiplier,
} from "../../../shared/settlementMath.js";

function getBettingClosesAt(startTime: Date, tossTime: Date | null | undefined): Date {
  if (tossTime != null) return tossTime as Date;
  return new Date((startTime as Date).getTime() - TOSS_DEFAULT_MINUTES_BEFORE_MATCH * 60 * 1000);
}

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
      const { home, away } = await aggregateHomeAwayStakesForMatch(
        matchId,
        match.homeTeamId,
        match.awayTeamId,
        "pending",
      );
      const oddsMultiplier = roundOddsMultiplier(
        impliedGrossReturnMultiplierForPick(
          existingBet.selectedTeamId,
          match.homeTeamId,
          match.awayTeamId,
          home,
          away,
        ),
      );
      return {
        bet: { ...existingBet, oddsMultiplier },
        wallet: {
          balance: user.balance,
          prizePoolContribution: user.prizePoolContribution,
          consecutiveMissedMatches: user.consecutiveMissedMatches,
        },
      };
    }

    const { bet, walletRow } = await prisma.$transaction(async (tx) => {
      let betId: string;
      if (existingBet) {
        const u = await tx.bet.update({
          where: { id: existingBet.id },
          data: {
            selectedTeamId,
            amount: stake,
            insured,
          },
          select: { id: true },
        });
        betId = u.id;
      } else {
        const c = await tx.bet.create({
          data: {
            userId,
            matchId,
            selectedTeamId,
            amount: stake,
            oddsMultiplier: 1,
            insured,
            status: "PENDING",
          },
          select: { id: true },
        });
        betId = c.id;
      }
      const wallet = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: netBalanceChange } },
        select: userWalletSelect,
      });
      await refreshOddsMultipliersForPendingMatchTx(
        tx,
        matchId,
        match.homeTeamId,
        match.awayTeamId,
      );
      const full = await tx.bet.findUnique({
        where: { id: betId },
        include: betPlaceInclude,
      });
      return { bet: full, walletRow: wallet };
    });

    if (!bet) throw new BetError("Bet not found after place", 500);

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
            homeTeamId: true,
            awayTeamId: true,
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
    const mid = existingBet.matchId;
    const { homeTeamId, awayTeamId } = existingBet.match;

    await prisma.$transaction([
      prisma.bet.delete({ where: { id: existingBet.id } }),
      prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: refund } },
      }),
    ]);

    const remaining = await prisma.bet.count({
      where: { matchId: mid, status: "PENDING" },
    });
    if (remaining > 0) {
      await prisma.$transaction(async (tx) => {
        await refreshOddsMultipliersForPendingMatchTx(tx, mid, homeTeamId, awayTeamId);
      });
    }

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
    const unique = Array.from(byMatchId.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const matchIds = [...new Set(unique.map((b) => b.matchId))];
    const matchMeta = await prisma.match.findMany({
      where: { id: { in: matchIds } },
      select: { id: true, status: true, homeTeamId: true, awayTeamId: true },
    });
    const metaById = new Map(matchMeta.map((m) => [m.id, m]));

    const completedIds = matchMeta.filter((m) => m.status === "COMPLETED").map((m) => m.id);
    const openIds = matchMeta
      .filter((m) => m.status !== "COMPLETED" && m.status !== "CANCELLED")
      .map((m) => m.id);

    const [pendingAgg, settledAgg] = await Promise.all([
      openIds.length > 0
        ? prisma.bet.groupBy({
            by: ["matchId", "selectedTeamId"],
            where: { matchId: { in: openIds }, status: "PENDING" },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      completedIds.length > 0
        ? prisma.bet.groupBy({
            by: ["matchId", "selectedTeamId"],
            where: { matchId: { in: completedIds }, status: { in: ["WON", "LOST"] } },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
    ]);

    type Totals = { home: number; away: number };
    const totalsByMatch = new Map<string, Totals>();

    function ingestAgg(
      agg: { matchId: string; selectedTeamId: string; _sum: { amount: number | null } }[],
    ) {
      for (const r of agg) {
        const m = metaById.get(r.matchId);
        if (!m) continue;
        const cur: Totals = totalsByMatch.get(r.matchId) ?? { home: 0, away: 0 };
        const a = Number(r._sum.amount ?? 0);
        if (r.selectedTeamId === m.homeTeamId) cur.home = a;
        else if (r.selectedTeamId === m.awayTeamId) cur.away = a;
        totalsByMatch.set(r.matchId, cur);
      }
    }
    ingestAgg(pendingAgg as never);
    ingestAgg(settledAgg as never);

    return unique.map((bet) => {
      const m = metaById.get(bet.matchId);
      let home = 0;
      let away = 0;
      if (m?.status === "COMPLETED") {
        const t = totalsByMatch.get(bet.matchId);
        if (t) {
          home = t.home;
          away = t.away;
        }
      } else if (m && m.status !== "CANCELLED") {
        const t = totalsByMatch.get(bet.matchId);
        if (t) {
          home = t.home;
          away = t.away;
        }
      }
      const mult =
        m?.status === "CANCELLED"
          ? 1
          : impliedGrossReturnMultiplierForPick(
              bet.selectedTeamId,
              m?.homeTeamId ?? bet.match.homeTeamId,
              m?.awayTeamId ?? bet.match.awayTeamId,
              home,
              away,
            );
      return { ...bet, oddsMultiplier: roundOddsMultiplier(mult) };
    });
  },
};

export class BetError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "BetError";
  }
}
