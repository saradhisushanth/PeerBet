-- Enums and base tables already exist from 20260314065711_init + follow-ups.
-- This migration only adds schema that init did not include (avoids duplicate CREATE TYPE).

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "email" TEXT;
UPDATE "User" SET "email" = "id" || '@migrate.placeholder' WHERE "email" IS NULL;
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "prizePoolContribution" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- AlterTable Match
ALTER TABLE "Match" ADD COLUMN "tossTime" TIMESTAMP(3);
ALTER TABLE "Match" ADD COLUMN "bettingLockedAt" TIMESTAMP(3);

-- AlterTable BetHistory
ALTER TABLE "BetHistory" ADD COLUMN "winningStreakAfter" INTEGER;
ALTER TABLE "BetHistory" ADD COLUMN "streakBonus" DOUBLE PRECISION;

-- AlterTable Leaderboard
ALTER TABLE "Leaderboard" ADD COLUMN "underdogBonus" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_idx" ON "WalletTransaction"("userId");

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
