import { defineConfig } from "vite";
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "BugLens",
      formats: ["iife"],
      fileName: () => "widget.js",
    },
    outDir: "../../apps/web/public",
    emptyOutDir: false,
  },
});
