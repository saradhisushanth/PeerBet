import { Router } from "express";
import { matchController } from "../controllers/match.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminMiddleware } from "../middlewares/admin.middleware.js";

export const matchRoutes = Router();

matchRoutes.get("/", matchController.getAll);
matchRoutes.get("/:id/summary", matchController.getSummary);
matchRoutes.get("/:id/board", matchController.getBoard);
matchRoutes.get("/:id", matchController.getById);
matchRoutes.patch("/:id/times", authMiddleware, adminMiddleware, matchController.updateTimes);
matchRoutes.post("/:id/force-rebalance", authMiddleware, adminMiddleware, matchController.forceRebalance);
matchRoutes.post("/:id/settle", authMiddleware, adminMiddleware, matchController.settle);
