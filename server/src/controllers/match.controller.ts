import type { Request, Response, NextFunction } from "express";
import { matchService } from "../services/match.service.js";
import { settlementService } from "../services/settlement.service.js";
import { forceRebalanceMatch } from "../services/lockRebalance.service.js";
import { io } from "../index.js";

export const matchController = {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const matches = await matchService.getAll();
      res.json({ success: true, data: matches });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const matchId = req.params.id as string;
      const match = await matchService.getById(matchId);
      if (!match) {
        res.status(404).json({ success: false, error: "Match not found" });
        return;
      }
      res.json({ success: true, data: match });
    } catch (err) {
      next(err);
    }
  },

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const matchId = req.params.id as string;
      const summary = await matchService.getSummary(matchId);
      if (!summary) {
        res.status(404).json({ success: false, error: "Match not found" });
        return;
      }
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  },

  async getBoard(req: Request, res: Response, next: NextFunction) {
    try {
      const matchId = req.params.id as string;
      const board = await matchService.getBoard(matchId);
      if (!board) {
        res.status(404).json({ success: false, error: "Match not found" });
        return;
      }
      res.json({ success: true, data: board });
    } catch (err) {
      next(err);
    }
  },

  async updateTimes(req: Request, res: Response, next: NextFunction) {
    try {
      const matchId = req.params.id as string;
      const body = req.body as { startTime?: string; tossTime?: string | null };
      const match = await matchService.updateTimes(matchId, {
        startTime: body.startTime,
        tossTime: body.tossTime,
      });
      if (!match) {
        res.status(404).json({ success: false, error: "Match not found" });
        return;
      }

      // Broadcast to every connected client so toss/lock times update immediately (not only users in match room)
      io.emit("matchUpdate", {
        matchId,
        status: match.status,
        startTime: match.startTime.toISOString(),
        tossTime: match.tossTime != null ? match.tossTime.toISOString() : null,
      });

      res.json({ success: true, data: match });
    } catch (err) {
      next(err);
    }
  },

  async forceRebalance(req: Request, res: Response, next: NextFunction) {
    try {
      const matchId = req.params.id as string;
      const done = await forceRebalanceMatch(matchId);
      if (!done) {
        res.status(400).json({ success: false, error: "Match not found, already locked, or fewer than 2 participants" });
        return;
      }
      res.json({ success: true, data: { rebalanced: true } });
    } catch (err) {
      next(err);
    }
  },

  async settle(req: Request, res: Response, next: NextFunction) {
    try {
      const { winnerTeamId } = req.body as { winnerTeamId: string };
      const matchId = req.params.id as string;

      if (!winnerTeamId) {
        res.status(400).json({ success: false, error: "winnerTeamId is required" });
        return;
      }

      const match = await matchService.setWinner(matchId, winnerTeamId);
      const { results, underdogTeamId } = await settlementService.settleMatch(matchId, winnerTeamId);

      // Broadcast so match status updates everywhere (not only clients in match room)
      io.emit("matchUpdate", {
        matchId,
        status: "COMPLETED",
        winnerTeamId,
      });

      if (underdogTeamId && winnerTeamId === underdogTeamId) {
        io.to(`match:${matchId}`).emit("upsetAlert", {
          matchId,
          winnerTeamId,
          message: "Underdog won!",
        });
      }

      for (const r of results) {
        io.emit("betSettled", {
          betId: r.betId,
          userId: r.userId,
          result: r.result,
          payout: r.payout,
          ...(r.insuredRefund != null && { insuredRefund: r.insuredRefund }),
          ...(r.streakBonus != null && { streakBonus: r.streakBonus }),
          ...(r.soloBonus != null && { soloBonus: r.soloBonus }),
          ...(r.soloByeRefund != null && { soloByeRefund: r.soloByeRefund }),
        });
      }

      res.json({ success: true, data: { match, settledBets: results.length } });
    } catch (err) {
      next(err);
    }
  },
};
