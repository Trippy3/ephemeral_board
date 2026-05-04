import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environmentMatchGlobs: [
      ["tests/unit/sanitize-client.test.ts", "happy-dom"],
      ["tests/unit/connector-geometry.test.ts", "happy-dom"],
    ],
    environment: "node",
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptEvaluation: true,
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
        },
      },
    },
    testTimeout: 5000,
    hookTimeout: 5000,
  },
});
