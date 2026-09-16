#Requires -Version 7.3
<#
.SYNOPSIS
    Verifies the build and test suite once, then commits - skipping the pre-commit hook's own
    redundant re-run of the same check.

.DESCRIPTION
    The pre-commit hook configured in package.json ("simple-git-hooks" -> "pre-commit") runs
    `yarn build && yarn test` on every `git commit`. That is the right check for a commit made by
    hand, but when this script has *just* run the identical check, letting the hook run it again
    only duplicates the wait and dumps a second full copy of the build/test output into whatever
    is watching the commit (see issue #279) - nothing changed in between, so the second run finds
    nothing the first one didn't.

    This script runs `yarn build` and `yarn test` itself, with their full output captured to
    logs/verify-build.log and logs/verify-test.log (both already covered by .gitignore) instead of
    printed - only a short pass/fail line, or the tail of the log on failure, appears on screen.
    If both pass, it commits with SKIP_SIMPLE_GIT_HOOKS=1 set around that one git invocation and
    put back afterwards: the hook's own documented off switch, not `git commit --no-verify` - it
    skips a repeat of a check this script just ran, not the check itself. If either step fails,
    nothing is committed and whatever was already staged stays staged.

    Never runs `git add` - stage the files you want committed first. The check builds and tests
    the working folder, so unstaged edits are included in it.

    Needs PowerShell 7.3 or newer (`pwsh`): Windows PowerShell 5.1 drops double quotes from the
    commit message and treats warnings on the error stream as failures.

.PARAMETER Message
    The full commit message (subject line first, body after - the same text you would pass to
    `git commit -m`).

.PARAMETER TailLines
    How many lines of the failing log to print on a build or test failure. Default 40.

.EXAMPLE
    ./scripts/verify-and-commit.ps1 -Message "Fix crash when exiting a battle after the opponent disconnects"

.EXAMPLE
    ./scripts/verify-and-commit.ps1 -Message @'
Fix crash when exiting a battle after the opponent disconnects

Battle exit route was not guarded against a null opponent reference.
Affected: src/services/battle/battleRouter.ts
'@
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Message,

    [int] $TailLines = 40
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$previousSkip = $env:SKIP_SIMPLE_GIT_HOOKS
Push-Location $repoRoot
try {
    if (-not (Test-Path logs)) {
        New-Item -ItemType Directory -Path logs -Force | Out-Null
    }

    $staged = git diff --cached --name-only
    if (-not $staged) {
        Write-Host "Nothing is staged - stage the files you want committed first." -ForegroundColor Yellow
        exit 1
    }

    Write-Host "Building ..." -ForegroundColor Cyan
    yarn build *> logs/verify-build.log
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "BUILD FAILED - last $TailLines line(s) of logs/verify-build.log:" -ForegroundColor Red
        Get-Content logs/verify-build.log -Tail $TailLines
        exit 1
    }
    Write-Host "Build OK." -ForegroundColor Green

    Write-Host "Testing ..." -ForegroundColor Cyan
    yarn test *> logs/verify-test.log
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "TESTS FAILED - last $TailLines line(s) of logs/verify-test.log:" -ForegroundColor Red
        Get-Content logs/verify-test.log -Tail $TailLines
        exit 1
    }
    Write-Host "Tests OK." -ForegroundColor Green

    Write-Host "Committing (pre-commit hook's own build+test skipped - just ran it above) ..." -ForegroundColor Cyan
    $env:SKIP_SIMPLE_GIT_HOOKS = '1'
    git commit -m $Message
    exit $LASTEXITCODE
}
finally {
    # Put the switch back, or every later plain `git commit` in this terminal skips the hook.
    $env:SKIP_SIMPLE_GIT_HOOKS = $previousSkip
    Pop-Location
}
