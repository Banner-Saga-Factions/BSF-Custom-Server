// Sorts a pull request into a review tier by the files it changes (issue #344).
//
// Tier 2 gets the full review, tier 0 is documents only, and everything else is tier 1. The highest
// tier of any changed file wins. The path list is .github/review-tiers.json; what each tier means is
// in .claude/skills/bsf-review/SKILL.md.
//
// Usage: node scripts/review-tier.js [base-ref]      changed files come from git (default origin/main)
//        node scripts/review-tier.js --files a b c   changed files are named directly
// Prints Markdown for the job summary. In CI it also writes "tier=N" to the file GITHUB_OUTPUT names,
// which is how the workflow learns the answer. Always exits 0: nothing blocks until wave 7 (#347).
// When the pull-request description is supplied in the PR_BODY environment variable, it also says
// whether the description carries a review record.
//
// Given no files it prints TOOL DID NOT RUN and no tier: "nothing to look at" must never read as
// "lowest risk".
//
// Limits: it sees file names, not what changed inside them, so a comment-only edit to a battle file
// is still tier 2. Lowering a tier is a person's decision, written in the pull request's review
// record. A deleted or moved file counts under its old name as well as its new one.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const listPath = path.join(repoRoot, ".github", "review-tiers.json");
const SHOWN = 10;

// "**/" is any number of folders (none included), "**" is anything, "*" stays inside one folder.
function globToRegExp(glob) {
    let source = "";
    for (let i = 0; i < glob.length; i++) {
        if (glob.startsWith("**/", i)) {
            source += "(?:.*/)?";
            i += 2;
        } else if (glob.startsWith("**", i)) {
            source += ".*";
            i += 1;
        } else if (glob[i] === "*") {
            source += "[^/]*";
        } else {
            source += glob[i].replace(/[.+?^${}()|[\]\\]/g, "\\$&");
        }
    }
    return new RegExp(`^${source}$`);
}

const matchesAny = (file, globs) => globs.some((glob) => globToRegExp(glob).test(file));

function readList() {
    const list = JSON.parse(fs.readFileSync(listPath, "utf8"));
    for (const key of ["tier2", "tier2Except", "tier0", "tier0Except"]) {
        if (!Array.isArray(list[key])) throw new Error(`${listPath} has no "${key}" list`);
    }
    // An empty tier-2 list would sort every change as low risk and look like a working check.
    if (
        list.tier2.length === 0 ||
        list.tier2.some((group) => !Array.isArray(group.paths) || group.paths.length === 0)
    ) {
        throw new Error(`${listPath} names no tier-2 paths`);
    }
    return list;
}

function tierOf(file, list) {
    if (!matchesAny(file, list.tier2Except)) {
        const group = list.tier2.find((g) => matchesAny(file, g.paths));
        if (group) return { tier: 2, why: group.why };
    }
    if (matchesAny(file, list.tier0) && !matchesAny(file, list.tier0Except)) return { tier: 0 };
    return { tier: 1 };
}

const git = (...args) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
const gitNames = (...args) =>
    git(...args)
        .split("\0")
        .filter(Boolean);

// A tier-2 path that matches no file protects nothing, and nothing else would notice: the check
// that catches stale file names in documents (path-rot) does not read this list.
function staleTier2Paths(list) {
    const tracked = gitNames("ls-files", "-z");
    return list.tier2
        .flatMap((group) => group.paths)
        .filter((glob) => !tracked.some((f) => globToRegExp(glob).test(f)));
}

// The five lines of a review record, as the review skill writes them under "## Review record".
const RECORD_LINES = ["Tier:", "Checker:", "Refuter:", "Acceptance criteria", "Left open:"];

// Which of the five are missing from a pull-request description. The template shows an example
// inside an HTML comment; comments are dropped first, so an untouched template has no record.
function missingRecordLines(body) {
    const lines = body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/);
    const start = lines.findIndex((line) => /^## Review record\s*$/.test(line));
    if (start === -1) return RECORD_LINES;
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => /^## /.test(line));
    const section = end === -1 ? rest : rest.slice(0, end);
    return RECORD_LINES.filter((label) => !section.some((line) => line.startsWith(`- ${label}`)));
}

function recordReport(body, tier) {
    const missing = missingRecordLines(body);
    if (missing.length === 0) return "Review record: found, all five lines.";
    if (missing.length < RECORD_LINES.length) {
        return `**Review record is incomplete:** no line starting ${missing.map((m) => `"${m}"`).join(", ")}.`;
    }
    if (tier < 2) return "Review record: none.";
    return "**No review record.** A tier-2 pull request should carry one; the pull-request template shows its five lines. Nothing blocks yet.";
}

function main() {
    const args = process.argv.slice(2);
    const named = args[0] === "--files";
    const base = args[0] || "origin/main";
    const list = readList();
    const out = [];

    // --no-renames lists a moved file under both names, so moving a file out of a tier-2 folder
    // still counts as changing that folder.
    const files = (named ? args.slice(1) : gitNames("diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`)).map(
        (f) => f.replace(/\\/g, "/")
    );
    if (files.length === 0) {
        console.log(`TOOL DID NOT RUN: no changed files to sort${named ? "" : ` (compared with ${base})`}.`);
        return;
    }

    const sorted = files.map((file) => ({ file, ...tierOf(file, list) }));
    const tier = Math.max(...sorted.map((s) => s.tier));
    const count = `${files.length} file${files.length === 1 ? "" : "s"} changed`;

    out.push(`Review tier: **${tier}**`, "");
    if (tier === 2) {
        const deciding = sorted.filter((s) => s.tier === 2);
        out.push(`${count}. ${deciding.length} on the tier-2 list:`, "");
        for (const s of deciding.slice(0, SHOWN)) out.push(`- \`${s.file}\`: ${s.why}`);
        if (deciding.length > SHOWN) out.push(`- and ${deciding.length - SHOWN} more`);
    } else if (tier === 1) {
        out.push(`${count}, none on the tier-2 list.`);
    } else {
        out.push(`${count}, all of them documents.`);
    }

    if (process.env.PR_BODY !== undefined) out.push("", recordReport(process.env.PR_BODY, tier));

    if (!named) {
        for (const glob of staleTier2Paths(list)) {
            out.push(
                "",
                `**Stale list:** \`${glob}\` matches no file in the repository, so it protects nothing. Fix \`.github/review-tiers.json\`.`
            );
        }
    }

    console.log(out.join("\n"));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `tier=${tier}\n`);
}

try {
    main();
} catch (error) {
    console.log(`TOOL DID NOT RUN: ${error.message}`);
}
