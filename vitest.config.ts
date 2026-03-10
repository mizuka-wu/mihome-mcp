import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,ts}"],
    exclude: ["node_modules", "dist", ".build"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/",
        "dist/",
        ".build/",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/types.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
