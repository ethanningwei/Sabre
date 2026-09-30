import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      // DB tests run against a separate database: createdb sabre_test && npm run db:migrate:test
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/sabre_test",
    },
    fileParallelism: false,
  },
});
