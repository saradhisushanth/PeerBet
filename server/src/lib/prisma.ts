import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function findProjectRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return dir;
  return findProjectRoot(parent);
}
const projectRoot = findProjectRoot(__dirname);
dotenv.config({ path: path.join(projectRoot, ".env") });

let connectionString = process.env.DATABASE_URL!;
if (connectionString.includes("supabase") && !connectionString.includes("sslmode=")) {
  connectionString += connectionString.includes("?") ? "&sslmode=require" : "?sslmode=require";
}
const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
