// Report-only check (issue #343): flags new prose that is longer than the guide allows.
//
// The cap exists because errors track the number of words written (bsf-server/CLAUDE.md, "Write
// shorter"): about 120 words for a CHANGELOG entry (the *Technical:* paragraph does not count) and
// about 250 for a pull-request body. This is the one W1-audit rule traced to a real review correction.
//
// Usage: node scripts/check-word-caps.js [base-ref]     (base-ref defaults to origin/main)
// The pull-request body comes from the PR_BODY environment variable; with none, that part is skipped.
// Prints Markdown for the job summary. Always exits 0: nothing blocks until wave 7 (#347).
const { execFileSync } = require("child_process");
const fs = require("fs");

const CHANGELOG_CAP = 120;
const PR_BODY_CAP = 250;
const base = process.argv[2] || "origin/main";

const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

// Line numbers (in the new file) that the pull request added to the changelog.
function addedLineNumbers() {
    const diff = execFileSync("git", ["diff", "-U0", `${base}...HEAD`, "--", "CHANGELOG.md"], { encoding: "utf8" });
    const added = new Set();
    for (const hunk of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
        const start = Number(hunk[1]);
        const length = hunk[2] === undefined ? 1 : Number(hunk[2]);
        for (let n = start; n < start + length; n++) added.add(n);
    }
    return added;
}

// Each "### " entry under "## [Unreleased]", with its line range and the words that count.
function unreleasedEntries(lines) {
    const entries = [];
    let inUnreleased = false;
    let current = null;
    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        if (/^## /.test(line)) {
            inUnreleased = /^## \[Unreleased\]/i.test(line);
            current = null;
        } else if (inUnreleased && /^### /.test(line)) {
            current = { title: line.replace(/^### /, "").trim(), first: lineNumber, last: lineNumber, body: [] };
            entries.push(current);
        } else if (inUnreleased && current) {
            current.last = lineNumber;
            current.body.push(line);
        }
    });
    return entries;
}

// Drops the *Technical:* paragraph (it runs to the next blank line), which has no cap.
function proseOf(bodyLines) {
    const prose = [];
    let inTechnical = false;
    for (const line of bodyLines) {
        if (/^\s*\*Technical:\*/.test(line)) inTechnical = true;
        else if (line.trim() === "") inTechnical = false;
        if (!inTechnical) prose.push(line);
    }
    return prose.join("\n");
}

function main() {
    const out = [];
    const lines = fs.readFileSync("CHANGELOG.md", "utf8").split(/\r?\n/);
    const added = addedLineNumbers();
    const touched = unreleasedEntries(lines).filter((e) => [...added].some((n) => n >= e.first && n <= e.last));

    out.push(`Checked ${touched.length} new or changed changelog entr${touched.length === 1 ? "y" : "ies"}.`);
    for (const entry of touched) {
        const words = countWords(proseOf(entry.body));
        if (words > CHANGELOG_CAP) out.push(`- Changelog entry "${entry.title}": ${words} words, cap ${CHANGELOG_CAP}.`);
    }

    if (process.env.PR_BODY === undefined) {
        out.push("No pull-request body was supplied, so its length was not checked.");
    } else {
        const words = countWords(process.env.PR_BODY);
        out.push(
            words > PR_BODY_CAP
                ? `- Pull-request body: ${words} words, cap ${PR_BODY_CAP}. Anything longer goes on the issue.`
                : `Pull-request body: ${words} words (cap ${PR_BODY_CAP}).`
        );
    }
    console.log(out.join("\n"));
}

try {
    main();
} catch (error) {
    console.log(`TOOL DID NOT RUN: ${error.message}`);
}
