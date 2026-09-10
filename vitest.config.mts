import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside an RSC; stub it so pure helpers in
      // modules that import it (e.g. lib/extraction/match.ts) stay testable.
      "server-only": fileURLToPath(
        new URL("./vitest/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e/**"],
  },
});
