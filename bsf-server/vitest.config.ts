import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        // #358: on Windows a test worker sometimes died with no failed test ("Worker exited
        // unexpectedly"). Measured 2026-11-06: Node itself stops the worker (Windows code
        // 0xC0000409, nothing printed), in files that send requests to the server, and far
        // less often with the JavaScript engine's two optimising compilers (Maglev and
        // Turbofan) switched off for the test workers: the full suite went from 7 crashes in
        // 20 runs to 1 in 20, and no slower. A rarer crash remains even with every compiler
        // off. The database library was not the cause: the crashing files use a stand-in
        // database. Evidence and how to re-measure: docs/Development.md -> "When a test worker crashes".
        execArgv: ["--no-maglev", "--no-turbofan"],
        // Test files run one at a time. This was the first attempt at the crash above; kept
        // until a measured run shows it is no longer needed.
        fileParallelism: false,
        include: [
            "src/**/*.test.ts",
            "test/routes/**/*.test.ts",
            "test/protocol/**/*.test.ts",
            "test/scripts/**/*.test.ts",
            "test/deploy/**/*.test.ts",
        ],
        setupFiles: ["test/setup.ts"],
        testTimeout: 15000,
        env: {
            JWT_SECRET: "test-secret-do-not-use-in-prod",
            NODE_ENV: "test",
            // A command started from a test inherits this too, so a test that runs a
            // script must name its database itself (see test/deploy/inspect-db.test.ts).
            DB_PATH: ":memory:",
            // Pinned empty so the suite still passes on a machine where an operator
            // has exported these -- which .env.example now tells them they may.
            // TRUST_PROXY has to be pinned rather than merely ought to be: an
            // unrecognised value throws inside src/app.ts, which every file under
            // test/routes imports, so one stray export would fail the whole suite
            // and the pre-commit hook with it.
            STARTING_RENOWN: "",
            SKIP_TUTORIAL: "",
            TRUST_PROXY: "",
            // #326: without this pin, a developer's own .env key would make every test that
            // signs in with a real Steam number ask Steam itself. Tests that need a key set one.
            STEAM_WEB_API_KEY: "",
            // #269: so the message-of-the-day tests read the default category whatever is exported.
            MOTD_DISCUSSION_CATEGORY: "",
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
