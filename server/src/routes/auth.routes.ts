import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

export const authRoutes = Router();

authRoutes.post("/register", authController.register);
authRoutes.post("/login", authController.login);
authRoutes.get("/me", authMiddleware, authController.me);
