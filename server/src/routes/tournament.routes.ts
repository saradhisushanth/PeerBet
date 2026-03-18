import { Router } from "express";
import { tournamentController } from "../controllers/tournament.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminMiddleware } from "../middlewares/admin.middleware.js";

export const tournamentRoutes = Router();

tournamentRoutes.get("/details", authMiddleware, tournamentController.getDetails);
tournamentRoutes.post("/admin/wallet-top-up", authMiddleware, adminMiddleware, tournamentController.walletTopUp);
