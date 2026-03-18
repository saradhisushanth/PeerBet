import type { Request, Response, NextFunction } from "express";
import { io } from "../index.js";
import { tournamentService } from "../services/tournament.service.js";

export const tournamentController = {
  async getDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const details = await tournamentService.getDetails();
      res.json({ success: true, data: details });
    } catch (err) {
      next(err);
    }
  },

  async walletTopUp(req: Request, res: Response, next: NextFunction) {
    try {
      const adminUserId = (req as Request & { userId: string }).userId;
      const { userId, amount } = req.body as { userId?: string; amount?: number };
      if (!userId || amount == null) {
        res.status(400).json({ success: false, error: "userId and amount required" });
        return;
      }
      const result = await tournamentService.walletTopUp(adminUserId, userId, amount);
      io.to(`user:${userId}`).emit("walletTopUp", {
        amount: result.transaction.amount,
        newBalance: result.user.balance,
        newPrizePoolContribution: result.user.prizePoolContribution ?? 0,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
