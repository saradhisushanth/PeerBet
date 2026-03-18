import type { Request, Response, NextFunction } from "express";
import { authService, AuthError } from "../services/auth.service.js";

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, email, password } = req.body;
      const result = await authService.register(username, email, password);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.statusCode).json({ success: false, error: err.message });
        return;
      }
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.statusCode).json({ success: false, error: err.message });
        return;
      }
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as Request & { userId: string }).userId;
      const { prisma } = await import("../lib/prisma.js");
      const { getStreakStats } = await import("../services/settlement.service.js");
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, email: true, balance: true, prizePoolContribution: true, consecutiveMissedMatches: true },
      });
      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }
      const { currentStreak, maxStreak } = await getStreakStats(userId);
      res.json({
        success: true,
        data: {
          ...user,
          prizePoolContribution: (user as { prizePoolContribution?: number }).prizePoolContribution ?? 0,
          currentStreak,
          maxStreak,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
