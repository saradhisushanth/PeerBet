-- Speed up tournament wallet transaction list (ORDER BY createdAt DESC LIMIT 100)
CREATE INDEX "WalletTransaction_createdAt_idx" ON "WalletTransaction"("createdAt");
