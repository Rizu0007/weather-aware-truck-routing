/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Not VITE_-prefixed, so it stays in this config and never reaches the bundle.
  const backend = loadEnv(mode, process.cwd(), "").DEV_BACKEND_URL ?? "http://127.0.0.1:8000";
  const proxy = { "/api": { target: backend, changeOrigin: true } };

  return {
    plugins: [react(), tailwindcss()],
    resolve: { tsconfigPaths: true },
    server: { proxy },
    preview: { proxy },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      restoreMocks: true,
      // Local-time conversions depend on the zone; pin it so tests pass anywhere (CI is UTC).
      // `npm run test:zones` runs the time-zone suite under other zones via TZ.
      env: { TZ: process.env.TZ ?? "America/Chicago" },
    },
  };
});
