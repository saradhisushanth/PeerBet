import { Router } from "express";
import { leaderboardController } from "../controllers/leaderboard.controller.js";

export const leaderboardRoutes = Router();

leaderboardRoutes.get("/", leaderboardController.getTop);
