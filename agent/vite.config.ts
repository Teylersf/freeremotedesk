import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri v2 conventions:
//   - port 1420 fixed; Tauri points its webview at this in dev
//   - drop symlinks + resolve from workspace root
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      // Ignore Rust output so Vite doesn't reload on every cargo touch
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
