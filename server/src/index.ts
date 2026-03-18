import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "../../shared/types.js";
import { authRoutes } from "./routes/auth.routes.js";
import { userRoutes } from "./routes/user.routes.js";
import { matchRoutes } from "./routes/match.routes.js";
import { betRoutes } from "./routes/bet.routes.js";
import { leaderboardRoutes } from "./routes/leaderboard.routes.js";
import { tournamentRoutes } from "./routes/tournament.routes.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { authService } from "./services/auth.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(projectRoot, ".env") });

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Create a .env file in the project root (ipl-betting-app/.env) with:\n  DATABASE_URL=\"postgresql://user:password@localhost:5432/ipl_betting\""
  );
}

const app = express();
const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    return next(new Error("Authentication required"));
  }
  try {
    const payload = authService.verifyToken(token);
    (socket.data as { userId: string }).userId = payload.userId;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const userId = (socket.data as { userId: string }).userId;
  socket.join(`user:${userId}`);
  console.log(`Client connected: ${socket.id} (user: ${userId})`);

  socket.on("joinMatch", (matchId) => {
    socket.join(`match:${matchId}`);
  });

  socket.on("leaveMatch", (matchId) => {
    socket.leave(`match:${matchId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

export { io };

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/bets", betRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/tournament", tournamentRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
