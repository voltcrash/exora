import { defineConfig } from "vite-plus";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        target: "http://localhost:8787",
      },
    },
  },
});
