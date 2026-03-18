/**
 * Full data reset for clean testing:
 * - Deletes all bets and bet history
 * - Resets leaderboard (profit, wins, losses)
 * - Resets all matches to UPCOMING, no winner
 * - Resets all user balances to 1000 and consecutiveMissedMatches to 0
 *
 * Run: npm run db:reset (from server dir) or npx tsx src/reset.ts
 */
import type { Prisma } from "./generated/prisma/client";
import { prisma } from "./lib/prisma.js";

const INITIAL_BALANCE = 1000;

async function main() {
  console.log("Starting full data reset...");

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const deletedHistory = await tx.betHistory.deleteMany({});
    console.log(`  Deleted ${deletedHistory.count} bet history records`);

    const deletedBets = await tx.bet.deleteMany({});
    console.log(`  Deleted ${deletedBets.count} bets`);

    const leaderboard = await tx.leaderboard.updateMany({
      data: { totalWins: 0, totalLosses: 0, profit: 0, underdogBonus: 0, rank: null },
    });
    console.log(`  Reset ${leaderboard.count} leaderboard entries`);

    const matches = await tx.match.updateMany({
      data: {
        status: "UPCOMING",
        winnerTeamId: null,
        tossTime: null,
        bettingLockedAt: null,
      },
    });
    console.log(`  Reset ${matches.count} matches to UPCOMING (tossTime and bettingLockedAt cleared)`);

    const walletTx = await tx.walletTransaction.deleteMany({});
    console.log(`  Deleted ${walletTx.count} wallet transactions`);

    const users = await tx.user.updateMany({
      data: { balance: INITIAL_BALANCE, prizePoolContribution: INITIAL_BALANCE, consecutiveMissedMatches: 0, totalMissedPenalties: 0 },
    });
    console.log(`  Reset ${users.count} users (balance=${INITIAL_BALANCE}, consecutiveMissed=0, totalMissedPenalties=0)`);
  });

  console.log("Reset complete.");
}

main()
  .catch((e) => {
    console.error("Reset failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
