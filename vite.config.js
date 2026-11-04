import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 700 },
  server: { port: 5174, proxy: { "/api": "http://localhost:5100" } },
});
