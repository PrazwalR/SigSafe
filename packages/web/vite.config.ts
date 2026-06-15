import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // sigsafe runs entirely in the browser; no server, no API keys.
  build: { target: "es2022" },
});
