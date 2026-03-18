import type { Request, Response, NextFunction } from "express";
import { betService, BetError } from "../services/bet.service.js";
import { io } from "../index.js";

export const betController = {
  async place(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId, selectedTeamId, amount, insured } = req.body;
      const userId = (req as Request & { userId: string }).userId;

      if (!matchId || !selectedTeamId || !amount) {
        res.status(400).json({ success: false, error: "matchId, selectedTeamId, and amount are required" });
        return;
      }

      const bet = await betService.place(userId, matchId, selectedTeamId, Number(amount), Boolean(insured));

      io.to(`match:${matchId}`).emit("betPlaced", {
        matchId,
        userId,
        selectedTeamId,
        amount: Number(amount),
        insured: Boolean(insured),
      });

      res.status(201).json({ success: true, data: bet });
    } catch (err) {
      if (err instanceof BetError) {
        res.status(err.statusCode).json({ success: false, error: err.message });
        return;
      }
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const { matchId } = req.body;
      const userId = (req as Request & { userId: string }).userId;
      if (!matchId) {
        res.status(400).json({ success: false, error: "matchId is required" });
        return;
      }
      const bet = await betService.cancel(userId, matchId);
      if (bet) {
        io.to(`match:${matchId}`).emit("betPlaced", { matchId, userId });
        io.to(`match:${matchId}`).emit("betRemoved", {
          matchId,
          userId,
          username: bet.user.username,
          amount: bet.amount,
          teamShortName: bet.selectedTeam.shortName,
        });
      }
      res.json({ success: true, data: bet });
    } catch (err) {
      if (err instanceof BetError) {
        res.status(err.statusCode).json({ success: false, error: err.message });
        return;
      }
      next(err);
    }
  },

  async getMyBets(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as Request & { userId: string }).userId;
      const bets = await betService.getByUser(userId);
      res.json({ success: true, data: bets });
    } catch (err) {
      next(err);
    }
  },
};
