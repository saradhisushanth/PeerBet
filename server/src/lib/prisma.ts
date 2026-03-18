import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Load .env before reading DATABASE_URL (prisma is often imported before index.ts runs dotenv)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(projectRoot, ".env") });

let connectionString = process.env.DATABASE_URL!;
// Supabase (and most cloud Postgres) require SSL; append if not already present
if (connectionString.includes("supabase.co") && !connectionString.includes("sslmode=")) {
  connectionString += connectionString.includes("?") ? "&sslmode=require" : "?sslmode=require";
}
const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
