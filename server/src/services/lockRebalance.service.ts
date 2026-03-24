/**
 * When betting closes (toss time), auto-assign the last 2 participants (by overall leaderboard rank)
 * to the "other side" (the team with fewer stakes) so the match has both sides.
 * If only 2 participants, the last 1 (by rank) is moved. If only 1 participant, no move (solo benefit TBD).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma.js";
import { refreshOddsMultipliersForPendingMatchTx } from "../lib/matchPoolOdds.js";
import { TOSS_DEFAULT_MINUTES_BEFORE_MATCH } from "../../../shared/constants.js";

function getBettingClosesAt(startTime: Date, tossTime: Date | null | undefined): Date {
  if (tossTime != null) return tossTime as Date;
  return new Date((startTime as Date).getTime() - TOSS_DEFAULT_MINUTES_BEFORE_MATCH * 60 * 1000);
}

export async function rebalanceMatchIfLocked(matchId: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, homeTeamId: true, awayTeamId: true, tossTime: true, startTime: true, bettingLockedAt: true },
  });
  if (!match) return;

  const now = new Date();
  const lockTime = getBettingClosesAt(match.startTime, match.tossTime);

  if (now < lockTime) {
    return; // Lock time not reached yet
  }
  if (match.bettingLockedAt != null) {
    return; // Already locked and rebalanced
  }

  const pendingBets = await prisma.bet.findMany({
    where: { matchId, status: "PENDING" },
    select: { id: true, userId: true, selectedTeamId: true, amount: true, insured: true },
  });

  if (pendingBets.length === 0) {
    await prisma.match.update({ where: { id: matchId }, data: { bettingLockedAt: now } });
    return;
  }

  if (pendingBets.length === 1) {
    await prisma.match.update({ where: { id: matchId }, data: { bettingLockedAt: now } });
    return;
  }

  type PendingBet = (typeof pendingBets)[number];
  const participantIds = [...new Set(pendingBets.map((b: PendingBet) => b.userId))];
  const leaderboardEntries = await prisma.leaderboard.findMany({
    where: { userId: { in: participantIds } },
    select: { userId: true, rank: true },
  });
  type LeaderboardRow = (typeof leaderboardEntries)[number];
  const rankByUser = new Map(leaderboardEntries.map((e: LeaderboardRow) => [e.userId, e.rank ?? 999999]));

  const participantsWithRank = pendingBets.map((b: PendingBet) => ({
    betId: b.id,
    userId: b.userId,
    selectedTeamId: b.selectedTeamId,
    amount: b.amount,
    insured: b.insured,
    rank: rankByUser.get(b.userId) ?? 999999,
  }));

  const byUserId = new Map<string, { betId: string; userId: string; selectedTeamId: string; amount: number; insured: boolean; rank: number }>();
  for (const p of participantsWithRank) {
    const existing = byUserId.get(p.userId);
    if (!existing || p.rank > existing.rank) byUserId.set(p.userId, p);
  }
  const uniqueParticipants = [...byUserId.values()].sort(
    (a: { rank: number; userId: string }, b: { rank: number; userId: string }) => b.rank - a.rank || a.userId.localeCompare(b.userId)
  );

  const homeStake = pendingBets.filter((b: PendingBet) => b.selectedTeamId === match.homeTeamId).reduce((s: number, b: PendingBet) => s + b.amount, 0);
  const awayStake = pendingBets.filter((b: PendingBet) => b.selectedTeamId === match.awayTeamId).reduce((s: number, b: PendingBet) => s + b.amount, 0);
  const homeCount = pendingBets.filter((b: PendingBet) => b.selectedTeamId === match.homeTeamId).length;
  const awayCount = pendingBets.filter((b: PendingBet) => b.selectedTeamId === match.awayTeamId).length;

  // Only move players when one side has zero participants (everyone on same side). If both sides have someone, just lock.
  if (homeCount > 0 && awayCount > 0) {
    await prisma.match.update({ where: { id: matchId }, data: { bettingLockedAt: now } });
    return;
  }

  const howManyToMove = uniqueParticipants.length === 2 ? 1 : 2;
  const toMove = uniqueParticipants.slice(0, howManyToMove);
  const otherSideTeamId = awayStake <= homeStake ? match.awayTeamId : match.homeTeamId;
  const movesToDo = toMove.filter((p: { selectedTeamId: string }) => p.selectedTeamId !== otherSideTeamId);
  if (movesToDo.length === 0) {
    await prisma.match.update({ where: { id: matchId }, data: { bettingLockedAt: now } });
    return;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const p of movesToDo) {
      await tx.bet.delete({ where: { id: p.betId } });
      await tx.bet.create({
        data: {
          userId: p.userId,
          matchId,
          selectedTeamId: otherSideTeamId,
          amount: p.amount,
          oddsMultiplier: 1,
          insured: p.insured,
          status: "PENDING",
        },
      });
    }
    await refreshOddsMultipliersForPendingMatchTx(
      tx,
      matchId,
      match.homeTeamId,
      match.awayTeamId,
    );
    await tx.match.update({ where: { id: matchId }, data: { bettingLockedAt: now } });
  });
}

/**
 * Admin-only: run lock rebalance now for a match (ignores lock time). Use for testing when e.g. toss time is in the future after reset.
 */
export async function forceRebalanceMatch(matchId: string): Promise<boolean> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, homeTeamId: true, awayTeamId: true, bettingLockedAt: true },
  });
  if (!match || match.bettingLockedAt != null) return false;

  const pendingBets = await prisma.bet.findMany({
    where: { matchId, status: "PENDING" },
    select: { id: true, userId: true, selectedTeamId: true, amount: true, insured: true },
  });
  if (pendingBets.length < 2) return false;

  type PendingBet2 = (typeof pendingBets)[number];
  const participantIds = [...new Set(pendingBets.map((b: PendingBet2) => b.userId))];
  const leaderboardEntries = await prisma.leaderboard.findMany({
    where: { userId: { in: participantIds } },
    select: { userId: true, rank: true },
  });
  type LeaderboardRow2 = (typeof leaderboardEntries)[number];
  const rankByUser = new Map(leaderboardEntries.map((e: LeaderboardRow2) => [e.userId, e.rank ?? 999999]));

  const participantsWithRank = pendingBets.map((b: PendingBet2) => ({
    betId: b.id,
    userId: b.userId,
    selectedTeamId: b.selectedTeamId,
    amount: b.amount,
    insured: b.insured,
    rank: rankByUser.get(b.userId) ?? 999999,
  }));

  const byUserId = new Map<string, { betId: string; userId: string; selectedTeamId: string; amount: number; insured: boolean; rank: number }>();
  for (const p of participantsWithRank) {
    const existing = byUserId.get(p.userId);
    if (!existing || p.rank > existing.rank) byUserId.set(p.userId, p);
  }
  const uniqueParticipants = [...byUserId.values()].sort(
    (a: { rank: number; userId: string }, b: { rank: number; userId: string }) => b.rank - a.rank || a.userId.localeCompare(b.userId)
  );

  const homeStake = pendingBets.filter((b: PendingBet2) => b.selectedTeamId === match.homeTeamId).reduce((s: number, b: PendingBet2) => s + b.amount, 0);
  const awayStake = pendingBets.filter((b: PendingBet2) => b.selectedTeamId === match.awayTeamId).reduce((s: number, b: PendingBet2) => s + b.amount, 0);
  const homeCount = pendingBets.filter((b: PendingBet2) => b.selectedTeamId === match.homeTeamId).length;
  const awayCount = pendingBets.filter((b: PendingBet2) => b.selectedTeamId === match.awayTeamId).length;

  // Only move players when one side has zero participants. If both sides have someone, just lock and return.
  if (homeCount > 0 && awayCount > 0) {
    await prisma.match.update({ where: { id: matchId }, data: { bettingLockedAt: new Date() } });
    return true;
  }

  const howManyToMove = uniqueParticipants.length === 2 ? 1 : 2;
  const toMove = uniqueParticipants.slice(0, howManyToMove);
  const otherSideTeamId = awayStake <= homeStake ? match.awayTeamId : match.homeTeamId;
  const movesToDo = toMove.filter((p: { selectedTeamId: string }) => p.selectedTeamId !== otherSideTeamId);
  if (movesToDo.length === 0) {
    await prisma.match.update({ where: { id: matchId }, data: { bettingLockedAt: new Date() } });
    return true;
  }

  const now = new Date();
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const p of movesToDo) {
      await tx.bet.delete({ where: { id: p.betId } });
      await tx.bet.create({
        data: {
          userId: p.userId,
          matchId,
          selectedTeamId: otherSideTeamId,
          amount: p.amount,
          oddsMultiplier: 1,
          insured: p.insured,
          status: "PENDING",
        },
      });
    }
    await refreshOddsMultipliersForPendingMatchTx(
      tx,
      matchId,
      match.homeTeamId,
      match.awayTeamId,
    );
    await tx.match.update({ where: { id: matchId }, data: { bettingLockedAt: now } });
  });
  return true;
}
