import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { ADMIN_USERNAME } from "../../../shared/constants.js";

export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    if (!user || user.username !== ADMIN_USERNAME) {
      res.status(403).json({ success: false, error: "Admin only" });
      return;
    }
    next();
  } catch {
    res.status(500).json({ success: false, error: "Failed to verify admin" });
  }
}
