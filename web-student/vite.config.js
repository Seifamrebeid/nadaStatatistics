import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Pinned port so the R backend CORS allowlist is deterministic.
// Sibling apps: web-student=5173, web-doctor=5174, web-admin=5175.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
