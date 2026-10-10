import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { resolve } from "path";

// Runs the real script the way CI and the review skill do, but with the changed files named
// directly instead of read from git. The list it sorts by is .github/review-tiers.json.
const script = resolve(__dirname, "../../scripts/review-tier.js");

// The script reads two things from its surroundings: the pull-request description, and (on GitHub's
// runners) a file to write its answer to. A test run must control the first and never touch the second.
function surroundings(body?: string) {
    const env = { ...process.env };
    delete env.GITHUB_OUTPUT;
    delete env.PR_BODY;
    if (body !== undefined) env.PR_BODY = body;
    return env;
}
const runWithBody = (body: string | undefined, ...files: string[]) =>
    execFileSync(process.execPath, [script, "--files", ...files], { encoding: "utf8", env: surroundings(body) });
const run = (...files: string[]) => runWithBody(undefined, ...files);
const tierOf = (...files: string[]) => /^Review tier: \*\*(\d)\*\*/m.exec(run(...files))?.[1];

const risky = "bsf-server/src/services/lobby.ts";
const record = [
    "## Review record",
    "- Tier: 2 by path (services), rounds: 1",
    "- Checker: 3 findings, 3 fixed, 0 dismissed",
    "- Refuter: 4 claims, 1 refuted, 3 survived, 0 unresolved",
    "- Acceptance criteria (#344): 5 of 5 met",
    "- Left open: none",
];

describe("the review tier a set of changed files lands in", () => {
    it.each([
        ["a file that answers the game", ["bsf-server/src/services/lobby.ts"], "2"],
        ["sign-in", ["bsf-server/src/services/auth/auth.ts"], "2"],
        ["battle", ["bsf-server/src/services/battle/Battle.ts"], "2"],
        ["the gate every request passes", ["bsf-server/src/app.ts"], "2"],
        ["the wire format", ["bsf-server/src/util/serialization.ts"], "2"],
        ["the shape of stored data", ["bsf-server/src/db/migrations/005_activity_totals.sql"], "2"],
        ["a deploy script at the top of the server folder", ["bsf-server/deploy-production.ps1"], "2"],
        ["a file the live server runs", ["bsf-server/deploy/install.sh"], "2"],
        ["the same path written with Windows slashes", ["bsf-server\\src\\services\\queue.ts"], "2"],
        ["a test of a risky file, on its own", ["bsf-server/src/services/battle/Battle.test.ts"], "1"],
        ["database query code", ["bsf-server/src/db/account.ts"], "1"],
        ["a guide that is loaded into every session", ["bsf-server/CLAUDE.md"], "1"],
        ["the review skill itself", [".claude/skills/bsf-review/SKILL.md"], "1"],
        ["the tier list itself", [".github/review-tiers.json"], "1"],
        ["a CI workflow", [".github/workflows/ci.yml"], "1"],
        ["the changelog alone", ["bsf-server/CHANGELOG.md"], "0"],
        ["documents only", ["bsf-server/docs/idea-triage.md", "README.md"], "0"],
        ["a README inside a risky folder", ["bsf-server/src/services/battle/README.md"], "0"],
        ["documents plus one risky file", ["bsf-server/docs/idea-triage.md", "bsf-server/src/services/roster.ts"], "2"],
        ["documents plus one ordinary file", ["bsf-server/CHANGELOG.md", "bsf-server/package.json"], "1"],
    ])("%s", (_name, files, expected) => {
        expect(tierOf(...files)).toBe(expected);
    });

    it("names the file that set the tier, and why", () => {
        const out = run("bsf-server/CHANGELOG.md", "bsf-server/src/services/roster.ts");
        expect(out).toMatch(/`bsf-server\/src\/services\/roster\.ts`/);
        expect(out).not.toMatch(/`bsf-server\/CHANGELOG\.md`/);
    });

    it("says it did not run when it is given no files, instead of calling that the lowest tier", () => {
        const out = run();
        expect(out).toMatch(/TOOL DID NOT RUN/);
        expect(out).not.toMatch(/Review tier:/);
    });
});

describe("the review record in a pull-request description", () => {
    it("is found when all five lines are there, with the line endings GitHub's website sends", () => {
        const out = runWithBody(["## Summary", "Text.", "", ...record, "", "## Test plan"].join("\r\n"), risky);
        expect(out).toMatch(/Review record: found/);
    });

    it("is reported missing on a tier-2 change that has none", () => {
        expect(runWithBody("## Summary\nText.", risky)).toMatch(/\*\*No review record\.\*\*/);
    });

    it("is not found in an untouched template, whose example sits inside a comment", () => {
        const untouched = ["## Review record", "", "<!--", ...record.slice(1), "-->", "", "## Dependencies"].join("\n");
        expect(runWithBody(untouched, risky)).toMatch(/\*\*No review record\.\*\*/);
    });

    it("names the lines that are missing from a partial one", () => {
        const out = runWithBody(record.slice(0, 3).join("\n"), risky);
        expect(out).toMatch(/incomplete/);
        expect(out).toMatch(/"Refuter:", "Acceptance criteria", "Left open:"/);
    });

    it("does not count lines that sit under a different heading", () => {
        const elsewhere = ["## Summary", ...record.slice(1), "", "## Review record", ""].join("\n");
        expect(runWithBody(elsewhere, risky)).toMatch(/\*\*No review record\.\*\*/);
    });

    it("is not demanded below tier 2", () => {
        const out = runWithBody("## Summary\nText.", "bsf-server/CHANGELOG.md");
        expect(out).toMatch(/Review record: none/);
        expect(out).not.toMatch(/\*\*No review record/);
    });

    it("is not mentioned when no description was supplied", () => {
        expect(run(risky)).not.toMatch(/[Rr]eview record/);
    });
});
