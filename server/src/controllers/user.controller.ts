import type { Request, Response, NextFunction } from "express";
import { userService } from "../services/user.service.js";

export const userController = {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const users = await userService.getAll();
      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  },
};
