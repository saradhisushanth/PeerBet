/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** From repo `.env` (same key as server); exposed via `envPrefix: ["ADMIN_"]` in vite.config. */
  readonly ADMIN_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
