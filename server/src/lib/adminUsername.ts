import { ADMIN_USERNAME as DEFAULT_ADMIN_USERNAME } from "../../../shared/constants.js";

/** Resolved admin login name: `ADMIN_USERNAME` in `.env`, else shared default. */
export function getAdminUsername(): string {
  return process.env.ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
}

export function isAdminUsername(username: string): boolean {
  return username === getAdminUsername();
}
