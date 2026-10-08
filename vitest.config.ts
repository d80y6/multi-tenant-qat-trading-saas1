import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // حتى تُحمَّل الوحدات التي تتصل بـ @/db دون إجراء اتصال فعلي
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
      JWT_SECRET: process.env.JWT_SECRET ?? "vitest-secret",
    },
  },
});
