import { defineConfig } from "vitest/config";

const inheritedBase = process.env.BASE_URL;
const appOrigin =
  inheritedBase && /^https?:\/\//.test(inheritedBase) ? inheritedBase.replace(/\/$/, "") : "http://localhost:4321";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: {
      TEST_APP_URL: appOrigin,
    },
  },
});
