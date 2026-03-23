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

function parseDatabaseUrl(raw: string) {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const normalized = trimmed.replace(/^postgresql:/i, "http:").replace(/^postgres:/i, "http:");
  const u = new URL(normalized);
  const database = (u.pathname || "/postgres").replace(/^\//, "") || "postgres";
  const port = u.port ? parseInt(u.port, 10) : 5432;
  const safeDecode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  return {
    host: u.hostname,
    port,
    user: safeDecode(u.username),
    password: safeDecode(u.password),
    database,
  };
}

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  throw new Error(
    "DATABASE_URL is missing. Add it to ipl-betting-app/.env (see .env.example)."
  );
}

const pgConfig = parseDatabaseUrl(rawUrl);
const isCloud =
  pgConfig.host.includes("supabase") || pgConfig.host.includes("pooler.supabase.com");

const adapter = new PrismaPg({
  host: pgConfig.host,
  port: pgConfig.port,
  user: pgConfig.user,
  password: pgConfig.password,
  database: pgConfig.database,
  ...(isCloud && {
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  }),
} as ConstructorParameters<typeof PrismaPg>[0]);

export const prisma = new PrismaClient({ adapter });
