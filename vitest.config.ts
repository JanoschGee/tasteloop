import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/core/test/**/*.test.ts", "apps/landing/test/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
