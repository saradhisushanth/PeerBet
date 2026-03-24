import { ADMIN_USERNAME as DEFAULT_ADMIN_USERNAME } from "@shared/constants";

/** Same resolution as server `getAdminUsername()`: `ADMIN_USERNAME` from repo `.env` (via Vite `envPrefix`), else shared default. */
export function getClientAdminUsername(): string {
  const fromEnv = import.meta.env.ADMIN_USERNAME?.trim();
  return fromEnv || DEFAULT_ADMIN_USERNAME;
}
