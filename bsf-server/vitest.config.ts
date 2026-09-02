import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        // The node:sqlite native module (DatabaseSync) crashes under vitest's default
        // concurrent child-process forks on Windows ("Worker forks emitted error"),
        // nondeterministically dropping tests even when every test passes. Run test files
        // one at a time (still fully isolated) to remove the concurrency that triggers the
        // crash. Adds a few seconds vs parallel, but makes the pre-commit hook reliable.
        fileParallelism: false,
        include: ["src/**/*.test.ts", "test/routes/**/*.test.ts", "test/protocol/**/*.test.ts"],
        setupFiles: ["test/setup.ts"],
        testTimeout: 15000,
        env: {
            JWT_SECRET: "test-secret-do-not-use-in-prod",
            NODE_ENV: "test",
            DB_PATH: ":memory:",
            // Pinned empty so the suite still passes on a machine where an operator
            // has exported this -- which .env.example now tells them they may.
            STARTING_RENOWN: "",
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
