import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

// Load .env before reading DATABASE_URL (prisma is often imported before index.ts runs dotenv)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
