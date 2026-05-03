import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts", "test/routes/**/*.test.ts", "test/protocol/**/*.test.ts"],
        setupFiles: ["test/setup.ts"],
        testTimeout: 15000,
        env: {
            JWT_SECRET: "test-secret-do-not-use-in-prod",
            NODE_ENV: "test",
            DB_PATH: ":memory:",
        },
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: [
                "src/**/*.test.ts",
                "src/index.ts",
                "src/services/battle/BattlePartyData.ts",
                "src/services/battle/BattleTurnData.ts",
            ],
            thresholds: { lines: 70, functions: 70, branches: 60 },
        },
    },
    resolve: {
        alias: { "@": resolve(__dirname, "src") },
    },
});
