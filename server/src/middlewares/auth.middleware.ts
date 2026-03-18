import type { Request, Response, NextFunction } from "express";
import { authService, AuthError } from "../services/auth.service.js";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Authentication required" });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = authService.verifyToken(token);
    (req as Request & { userId: string }).userId = payload.userId;
    next();
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ success: false, error: err.message });
      return;
    }
    res.status(401).json({ success: false, error: "Invalid token" });
  }
}
