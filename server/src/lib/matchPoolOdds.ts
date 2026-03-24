import type { Prisma } from "../generated/prisma/client";
import {
  impliedGrossReturnMultiplierForPick,
  roundOddsMultiplier,
} from "../../../shared/settlementMath.js";
import { prisma } from "./prisma.js";

export async function aggregateHomeAwayStakesForMatch(
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
  mode: "pending" | "settled",
): Promise<{ home: number; away: number }> {
  const rows = await prisma.bet.groupBy({
    by: ["selectedTeamId"],
    where: {
      matchId,
      status: mode === "pending" ? "PENDING" : { in: ["WON", "LOST"] },
    },
    _sum: { amount: true },
  });
  let home = 0;
  let away = 0;
  for (const r of rows) {
    const a = Number(r._sum.amount ?? 0);
    if (r.selectedTeamId === homeTeamId) home = a;
    else if (r.selectedTeamId === awayTeamId) away = a;
  }
  return { home, away };
}

/** Recompute `oddsMultiplier` on every PENDING bet for the match from current pool + settlement rules. */
export async function refreshOddsMultipliersForPendingMatchTx(
  tx: Prisma.TransactionClient,
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<void> {
  const rows = await tx.bet.groupBy({
    by: ["selectedTeamId"],
    where: { matchId, status: "PENDING" },
    _sum: { amount: true },
  });
  let home = 0;
  let away = 0;
  for (const r of rows) {
    const a = Number(r._sum.amount ?? 0);
    if (r.selectedTeamId === homeTeamId) home = a;
    else if (r.selectedTeamId === awayTeamId) away = a;
  }
  const pending = await tx.bet.findMany({
    where: { matchId, status: "PENDING" },
    select: { id: true, selectedTeamId: true },
  });
  for (const b of pending) {
    const mult = impliedGrossReturnMultiplierForPick(
      b.selectedTeamId,
      homeTeamId,
      awayTeamId,
      home,
      away,
    );
    await tx.bet.update({
      where: { id: b.id },
      data: { oddsMultiplier: roundOddsMultiplier(mult) },
    });
  }
}
