import { Router } from "express";
import { betController } from "../controllers/bet.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

export const betRoutes = Router();

betRoutes.post("/place", authMiddleware, betController.place);
betRoutes.post("/cancel", authMiddleware, betController.cancel);
betRoutes.get("/my", authMiddleware, betController.getMyBets);
