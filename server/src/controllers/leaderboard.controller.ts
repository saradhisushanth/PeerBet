import type { Request, Response, NextFunction } from "express";
import { leaderboardService } from "../services/leaderboard.service.js";

export const leaderboardController = {
  async getTop(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 500;
      const leaderboard = await leaderboardService.getTop(limit);
      res.json({ success: true, data: leaderboard });
    } catch (err) {
      next(err);
    }
  },
};
