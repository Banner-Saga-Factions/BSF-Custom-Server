// Report-only code checks (issue #343). Every rule is a warning: nothing here blocks a commit or a
// pull request until wave 7 (#347) decides which ones earned trust. Thresholds come from the W1 audit
// on issue #341. Layout is Prettier's job (`yarn format:check`), type problems are tsc's.
//
// Parser only, no type-aware rules: they would need a full TypeScript program per run and the
// commit-time check has to stay fast.
import tseslint from "typescript-eslint";

export default [
    { ignores: ["build/", "coverage/", "node_modules/", "logs/", "data/", "deploy/"] },
    {
        files: ["**/*.ts", "**/*.mts"],
        languageOptions: { parser: tseslint.parser },
        linterOptions: { reportUnusedDisableDirectives: "off" },
        rules: {
            complexity: ["warn", 15],
            "max-lines-per-function": ["warn", { max: 75, skipBlankLines: true, skipComments: true }],
            "prefer-const": "warn",
            "max-len": [
                "warn",
                { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true },
            ],
        },
    },
    {
        // A test file is mostly long `describe` blocks; the audit found that normal.
        files: ["test/**/*.ts", "src/**/*.test.ts"],
        rules: { "max-lines-per-function": "off" },
    },
];
