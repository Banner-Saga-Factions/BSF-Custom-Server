# Banner Saga Factions Custom Server - Deploy to the TEST server
# Usage:  .\deploy-test.ps1                  (deploys your current branch, as it is on GitHub)
#         .\deploy-test.ps1 -Branch main     (any branch that is on GitHub)
#
# Runs the steps in docs/Deployment.md -> "Deploying Code Changes" against the test machine named
# in deploy-targets.local.psd1: pre-flight, confirm, back up, update, rebuild, verify. Nothing on
# the machine changes until you answer y. The machine pulls from GitHub, so push the branch first.
#
# The test machine is left on a detached checkout of the commit, not on a branch, so there is no
# local branch on it to drift out of date (docs/Deployment.md, pitfall #11).

#Requires -Version 7.2

param(
    [string]$Branch
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\deploy-common.ps1')

if (-not $Branch) {
    $Branch = ([string](git -C $PSScriptRoot branch --show-current)).Trim()
    if (-not $Branch) {
        Write-Host "ERROR: this checkout is not on a branch. Say which one: .\deploy-test.ps1 -Branch <name>" -ForegroundColor Red
        exit 1
    }
}

try {
    Invoke-Deploy -TargetName test -Branch $Branch
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
