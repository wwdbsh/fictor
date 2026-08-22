import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { releasePublicAssetsPlugin } from "./scripts/assets/release-public-assets";

export default defineConfig(({ command }) => ({
  base: "./",
  // Vite's normal public/ behavior remains active for dev. Build mode gets a
  // unique allowlisted publicDir from the release plugin's config hook.
  plugins: [react(), ...(command === "build" ? [releasePublicAssetsPlugin()] : [])],
  build: {
    target: "es2022",
  },
  test: {
    environment: "node",
  },
}));
