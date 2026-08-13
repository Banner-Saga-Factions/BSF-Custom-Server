<#
.SYNOPSIS
    Fails if a claim we have already established is wrong reappears in a tracked Markdown file.

.DESCRIPTION
    Five rounds of corrections to docs/client-contract.md taught the same lesson each time:
    judgement rules ("check your facts", "trace every claim") did not stop the errors — each one was
    broken in the very commit that introduced it. So this script only does something a machine can
    decide.

    A measurement on 2026-08-11 retired the older version of that lesson, which said the summary
    tables were always right and only the explanations underneath were wrong. Mistakes land in
    proportion to how much was written, not to how it was formatted: the table is 11% of that
    document's words and has carried about 10% of its errors. See CLAUDE.md -> "Code Review".

    THE CHECK — retired claims
        A list of statements that were wrong in a shipped document and were corrected. If one turns up
        again, something was copied from a stale source. No reviewer needed, nothing to argue about.

        A retired claim wrapped in "double quotes" is being QUOTED so it can be corrected — that is a
        document doing its job, not repeating the mistake — so quoted spans are stripped before
        matching. Code spans in `backticks` are NOT stripped: a stale `File.as:123` citation is live
        however it is typeset.

    WHAT WAS TRIED AND ABANDONED — scanning for unscoped absolutes
        The theory was good: most of our errors are a true narrow finding widened into a false
        universal one while being rewritten into plain English ("never abandoned by anything", "zero
        server calls"). So flag never / always / zero / none / cannot and re-check each.

        It does not work, and the numbers are worth recording so nobody rebuilds it:
            all tracked files, broad word list ...... 1,349 hits
            changed files, narrow word list ..........  128 hits
            added lines only, narrow word list .......   98 hits
        Those words are simply too common in ordinary technical writing — "we cannot yet tell",
        "nothing on our side was written with it in mind", "never gives up" are all fine. At that
        signal-to-noise a check trains you to skim past it, which is worse than no check.

        It would also have missed a third of the real errors anyway: "our requests run one at a time"
        and "25 concrete kinds of request" contain no absolute at all.

        If you want to catch that class of error, a reviewer reading the prose is still the only thing
        that has worked. See CLAUDE.md → "Code Review".

.EXAMPLE
    ./scripts/check-docs.ps1
    Checks every tracked .md file.

.EXAMPLE
    ./scripts/check-docs.ps1 -Changed
    Checks only files changed against main. Quicker; use it before opening a pull request.
#>
[CmdletBinding()]
param(
    [switch] $Changed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {

    # ---------------------------------------------------------------------------------------------
    # Claims we have already retired.
    #
    # Every entry was wrong in a shipped document. Keep "Correct" short and specific — it is what the
    # person who trips the check will read, and it should tell them what to write instead.
    # ---------------------------------------------------------------------------------------------
    $retired = @(
        @{ Pattern = '\bnine\b(?=[^.\n]{0,60}(500|server error))'
           Correct = 'roster.ts answers 500 EIGHT times, not nine.' }

        @{ Pattern = '\b(eleven|11)\b(?=[^.\n]{0,40}menu-driven)'
           Correct = 'FOURTEEN menu-driven request classes are never abandoned, not eleven.' }

        @{ Pattern = 'triples the query rate'
           Correct = '/battle/query raises the rate about 2.5x (5 s re-poll vs 2 s retry).' }

        @{ Pattern = '(twenty-five|25)\s+(concrete\s+)?(request\s+)?(kinds|types)'
           Correct = 'Say "25 concrete CLASSES". The route figure is 30 — one lobby class serves six routes.' }

        @{ Pattern = 'HttpAction\.as:\s*346'
           Correct = 'Name the function (HttpAction.canRetry). Six client copies disagree on the line.' }

        @{ Pattern = 'never (aborted|abandoned) by anything'
           Correct = 'A 401 or maintenance reply abandons whichever request received it. Scope the claim.' }

        @{ Pattern = 'async shells around a synchronous'
           Correct = 'The DB helpers DO suspend the caller; they never yield to the event loop. (#144, wrong twice.)' }

        @{ Pattern = 'built outside any (stage|state)'
           Correct = 'True of one surrender send out of three. Say which one.' }

        @{ Pattern = 'falls back to (its own )?cached copy'
           Correct = 'The client keeps the copy already in memory. No cross-session restore is visible in code.' }

        @{ Pattern = 'desync leaves no trace in our logs'
           Correct = 'We log both players hashes every turn ([BATTLE-SYNC]). Nothing COMPARES them.' }
    )

    # Debt we have already filed. A check that is red for reasons you are not allowed to fix in this
    # change is a check people switch off.
    $allowed = @(
        @{ File = 'CHANGELOG.md'; Why = 'append-only history; the stale entries are tracked by #175' }
    )

    if ($Changed) {
        $files = @(git diff --relative --name-only main...HEAD -- '*.md' 2>$null) +
                 @(git diff --relative --name-only -- '*.md' 2>$null)
        $files = $files | Sort-Object -Unique | Where-Object { $_ -and (Test-Path $_) }
        $scope = 'changed against main'
    } else {
        $files = @(git ls-files '*.md' 2>$null) | Where-Object { Test-Path $_ }
        $scope = 'all tracked'
    }

    $files = @($files)
    if ($files.Count -eq 0) {
        Write-Host "No Markdown files to check ($scope)." -ForegroundColor Yellow
        exit 0
    }

    Write-Host ""
    Write-Host "Checking $($files.Count) Markdown file(s) — $scope." -ForegroundColor Cyan

    $failures = @()
    foreach ($file in $files) {
        if ($allowed | Where-Object { $file -like "*$($_.File)" }) { continue }
        # @() matters: a one-line file makes Get-Content return a string, whose .Count throws
        # under StrictMode. Found by the script's own negative test.
        $lines = @(Get-Content -LiteralPath $file)
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $stripped = $lines[$i] -replace '"[^"]*"', '' -replace '“[^”]*”', ''
            foreach ($claim in $retired) {
                if ($stripped -match $claim.Pattern) {
                    $failures += [pscustomobject]@{
                        File    = $file
                        Line    = $i + 1
                        Text    = $lines[$i].Trim()
                        Correct = $claim.Correct
                    }
                }
            }
        }
    }

    $failCount = @($failures).Count
    Write-Host ""
    if ($failCount -eq 0) {
        Write-Host "OK — no retired claims." -ForegroundColor Green
        exit 0
    }

    foreach ($f in @($failures)) {
        $snippet = if ($f.Text.Length -gt 110) { $f.Text.Substring(0, 110) + '...' } else { $f.Text }
        Write-Host ("  {0}:{1}" -f $f.File, $f.Line) -ForegroundColor Red
        Write-Host ("      found : {0}" -f $snippet) -ForegroundColor DarkGray
        Write-Host ("      say   : {0}" -f $f.Correct) -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host ("FAILED — {0} retired claim(s) found." -f $failCount) -ForegroundColor Red
    exit 1

} finally {
    Pop-Location
}
