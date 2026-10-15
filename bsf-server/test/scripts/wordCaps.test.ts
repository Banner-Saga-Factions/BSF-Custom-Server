import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { resolve } from "path";

// Runs the real script with a pull-request description supplied, comparing HEAD with itself so the
// changelog half has nothing to report. Only the description's word count is under test here.
const script = resolve(__dirname, "../../scripts/check-word-caps.js");
const serverFolder = resolve(__dirname, "../..");
const bodyLine = (body: string) => {
    const out = execFileSync(process.execPath, [script, "HEAD"], {
        encoding: "utf8",
        cwd: serverFolder,
        env: { ...process.env, PR_BODY: body },
    });
    return out.split("\n").find((line) => line.includes("Pull-request body")) ?? out;
};

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

describe("the word count of a pull-request description", () => {
    it("counts ordinary prose", () => {
        expect(bodyLine(`## Summary\n${words(40)}`)).toMatch(/: 42 words/);
    });

    it("leaves out the template's hidden comments", () => {
        expect(bodyLine(`## Summary\n<!--\n${words(300)}\n-->\n${words(40)}`)).toMatch(/: 42 words/);
    });

    it("leaves out the review record, and resumes at the next heading", () => {
        const body = [
            "## Summary",
            words(40),
            "## Review record",
            `- Tier: ${words(300)}`,
            "## Dependencies",
            words(5),
        ];
        expect(bodyLine(body.join("\r\n"))).toMatch(/: 49 words/);
    });

    it("still flags a description whose prose is over the cap", () => {
        expect(bodyLine(`## Summary\n${words(260)}`)).toMatch(/262 words, cap 250/);
    });
});
