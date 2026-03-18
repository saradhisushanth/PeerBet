import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || "fallback-dev-secret";
const JWT_EXPIRES_IN = "7d";

export interface AuthPayload {
  userId: string;
}

function handlePrismaError(err: unknown): never {
  if (err instanceof AuthError) throw err;
  const isPrismaError =
    err &&
    typeof err === "object" &&
    ("code" in err || (err as Error).name?.startsWith("Prisma"));
  if (isPrismaError) {
    throw new AuthError("Service temporarily unavailable. Please try again later.", 503);
  }
  throw err;
}

export const authService = {
  async register(username: string, email: string, password: string) {
    if (!username || !email || !password) {
      throw new AuthError("Username, email, and password are required", 400);
    }

    if (password.length < 6) {
      throw new AuthError("Password must be at least 6 characters", 400);
    }

    try {
      const existingEmail = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existingEmail) {
        throw new AuthError("Email already in use", 409);
      }

      const existingUsername = await prisma.user.findUnique({ where: { username } });
      if (existingUsername) {
        throw new AuthError("Username already taken", 409);
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          username,
          email: email.toLowerCase(),
          passwordHash,
          balance: 1000,
          prizePoolContribution: 1000,
        },
      });

      const token = generateToken(user.id);

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          balance: user.balance,
          prizePoolContribution: (user as { prizePoolContribution?: number }).prizePoolContribution ?? 1000,
          consecutiveMissedMatches: (user as { consecutiveMissedMatches?: number }).consecutiveMissedMatches ?? 0,
        },
      };
    } catch (err) {
      handlePrismaError(err);
    }
  },

  async login(email: string, password: string) {
    if (!email || !password) {
      throw new AuthError("Email and password are required", 400);
    }

    try {
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) {
        throw new AuthError("Invalid email or password", 401);
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        throw new AuthError("Invalid email or password", 401);
      }

      const token = generateToken(user.id);

      const u = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, username: true, email: true, balance: true, prizePoolContribution: true, consecutiveMissedMatches: true },
      });
      return {
        token,
        user: {
          id: u!.id,
          username: u!.username,
          email: u!.email,
          balance: u!.balance,
          prizePoolContribution: (u as { prizePoolContribution?: number }).prizePoolContribution ?? 0,
          consecutiveMissedMatches: u!.consecutiveMissedMatches ?? 0,
        },
      };
    } catch (err) {
      handlePrismaError(err);
    }
  },

  verifyToken(token: string): AuthPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      throw new AuthError("Invalid or expired token", 401);
    }
  },
};

function generateToken(userId: string): string {
  return jwt.sign({ userId } satisfies AuthPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "AuthError";
  }
}
