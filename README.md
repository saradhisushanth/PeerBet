# PeerBet — IPL betting app

Full-stack monorepo: **React 19 + Vite**, **Express + Socket.io**, **Prisma + PostgreSQL**. Shared types and constants live under `shared/`.

## Requirements

| Tool | Notes |
|------|--------|
| **Node.js** | v20+ recommended |
| **PostgreSQL** | Local install, or a hosted DB (e.g. [Supabase](https://supabase.com)) |
| **npm** | Comes with Node |

## Repository layout

```
ipl-betting-app/
├── client/          # React SPA (Vite dev on :5173)
├── server/          # Express API + Socket.io
├── shared/          # Shared TS (constants, types)
├── prisma/          # schema.prisma (includes datasource url) + migrations
└── .env             # Create from .env.example (not committed)
```

## Local setup

### 1. Clone and install dependencies

From **`ipl-betting-app`** (this folder):

```bash
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..
```

### 2. Environment file

```bash
cp .env.example .env
```

Edit **`.env`** and set at least:

| Variable | Purpose |
|----------|---------|
| **`DATABASE_URL`** | Postgres connection string (see [Database](#database) below) |
| **`PORT`** | API port (default `3001`). The Vite dev server reads this and proxies `/api` and `/socket.io` here — **keep client and server in sync**. |
| **`CLIENT_URL`** | Usually `http://localhost:5173` for local Vite. |
| **`JWT_SECRET`** | Any non-empty string locally; use a strong secret in production. |

### 3. Database

Prisma **6.19.x** reads **`DATABASE_URL`** from **`prisma/schema.prisma`** (`url = env("DATABASE_URL")`) and **`.env`** in the repo root.

Use **npm scripts** (or `npm exec prisma …`) so the CLI matches the installed version. Avoid bare **`npx prisma`**, which can pull **Prisma 7** and conflict with this schema.

**Apply migrations** (creates tables on an empty database):

```bash
npm run prisma:generate
npm exec prisma migrate deploy
```

**Optional — seed IPL teams/fixtures** (dev):

```bash
npm run db:seed
```

**Optional — open Prisma Studio** (browse tables):

```bash
npm run prisma:studio
```

**New migration after editing `prisma/schema.prisma`** (development only):

```bash
npm run prisma:migrate
```

### 4. Run the app

**Recommended — one terminal (API + client):**

```bash
npm run dev
```

- **Frontend:** http://localhost:5173  
- **API:** `http://localhost:<PORT>` (e.g. http://localhost:3001)  
- The browser talks to Vite; Vite **proxies** `/api/*` and `/socket.io` to the API.

**Alternative — two terminals**

1. `cd server && npm run dev`
2. `cd client && npm run dev`

Start the **server first** (or you’ll see proxy / connection errors until it’s up).

### 5. Health check

With the API running:

```bash
curl -s http://localhost:3001/api/health
```

(Use your **`PORT`** if not `3001`.)

---

## Database

### Local PostgreSQL

Example:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/peerbet"
```

Create the database first (`createdb peerbet` or via GUI), then run `npx prisma migrate deploy`.

### Supabase

1. Create a project and ensure it’s **not paused**.
2. **Settings → Database → Connection string** — use the **pooler** URI (matches how cloud hosts connect).  
   - User is often `postgres.<project-ref>`.  
   - Host is like `aws-*-<region>.pooler.supabase.com`.  
   - Use the **database password** from the same settings page, not the anon/service API keys.
3. Paste the full URI into **`DATABASE_URL`** in `.env`.

The server configures SSL automatically for Supabase/pooler hosts in `server/src/lib/prisma.ts`.

---

## NPM scripts (repo root)

| Script | Description |
|--------|-------------|
| `npm run dev` | Runs **server** and **client** together (`concurrently`) |
| `npm run dev:server` | API only |
| `npm run dev:client` | Vite only |
| `npm run prisma:generate` | `prisma generate` |
| `npm run prisma:migrate` | `prisma migrate dev` (create/apply migrations) |
| `npm run prisma:studio` | Prisma Studio |
| `npm run db:seed` | Seed teams/matches |
| `npm run db:reset` | Reset script (destructive — dev only) |

**Client** (`client/`): `npm run dev`, `npm run build`, `npm run preview`  
**Server** (`server/`): `npm run dev`, `npm run build`, `npm start`

---

## Production build (monolith-style)

1. `cd client && npm run build` → outputs to `client/dist/`
2. `cd server && npm run build` (runs `prisma generate` + `tsc`)
3. Set **`NODE_ENV=production`**, **`DATABASE_URL`**, **`PORT`**, **`JWT_SECRET`**, **`CLIENT_URL`** (your real frontend origin if split)
4. If `client/dist` exists, the server can serve the SPA and API from one process (`server/src/index.ts`).

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| **`ECONNREFUSED` / proxy errors** in Vite | API running? **`PORT`** in `.env` matches the running server and Vite’s proxy (same file). |
| **Prisma / DB errors on login** | **`DATABASE_URL`** correct? Supabase **pool** URI + current DB password? Project **restored** if paused? |
| **Render / CI: “url is missing” or Prisma validate fails** | Run Prisma from the **repo root** after `npm install`, using **`npm run prisma:generate`** / **`npm exec prisma migrate deploy`** (not `npx prisma`, which may use Prisma 7). This repo pins **Prisma 6.19.2** and keeps **`url = env("DATABASE_URL")`** in **`schema.prisma`**. |
| **Port already in use** | Change **`PORT`** in `.env` or stop the other process: `lsof -i :3001` (macOS). |

---

## License

Private / your terms — add a `LICENSE` file if you open-source the repo.
