-- Enums and core tables exist from earlier migrations. Idempotent so it succeeds
-- if a previous deploy partially applied this migration (e.g. User.email already exists).

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
UPDATE "User" SET "email" = "id" || '@migrate.placeholder' WHERE "email" IS NULL;
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "prizePoolContribution" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- AlterTable Match
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "tossTime" TIMESTAMP(3);
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "bettingLockedAt" TIMESTAMP(3);

-- AlterTable BetHistory
ALTER TABLE "BetHistory" ADD COLUMN IF NOT EXISTS "winningStreakAfter" INTEGER;
ALTER TABLE "BetHistory" ADD COLUMN IF NOT EXISTS "streakBonus" DOUBLE PRECISION;

-- AlterTable Leaderboard
ALTER TABLE "Leaderboard" ADD COLUMN IF NOT EXISTS "underdogBonus" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WalletTransaction_userId_idx" ON "WalletTransaction"("userId");

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
