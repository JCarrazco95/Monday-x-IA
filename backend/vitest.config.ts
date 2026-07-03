import { defineConfig } from "vitest/config";

// Las pruebas viven en src/**. Se excluye dist/ (build) para no ejecutar copias
// compiladas de los mismos tests.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"]
  }
});
