import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const repoRoot = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const apiTarget = `http://127.0.0.1:${env.PORT || "3001"}`;

  return {
    envDir: repoRoot,
    envPrefix: ["VITE_", "ADMIN_"],
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "../shared"),
      },
    },
    server: {
      port: 5173,
      allowedHosts: true,
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
        "/socket.io": { target: apiTarget, ws: true },
      },
    },
  };
});
