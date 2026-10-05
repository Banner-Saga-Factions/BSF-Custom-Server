# Banner Saga Factions Custom Server - Deploy to the TEST server
# Usage:  .\deploy-test.ps1                  (deploys your current branch, as it is on GitHub)
#         .\deploy-test.ps1 -Branch main     (any branch that is on GitHub)
#
# Runs the steps in docs/Deployment.md -> "Deploying Code Changes" against the test machine named
# in deploy-targets.local.psd1: pre-flight, confirm, back up, update, rebuild, verify. Nothing on
# the machine changes until you answer y. The machine pulls from GitHub, so push the branch first.
#
# The test machine is left on a detached checkout of the commit, not on a branch
# (docs/Deployment.md, pitfall #11).

param(
    [string]$Branch
)

# This window may be the older Windows PowerShell 5.1, the default "PowerShell" on Windows. The
# helpers need PowerShell 7, so under 5.1 this script runs itself again in PowerShell 7 with the
# same options and hands back its result. The whole file must stay readable by 5.1, which reads
# all of it before running any of it.
if ($PSVersionTable.PSVersion.Major -lt 7) {
    $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
    if (-not $pwsh) {
        Write-Host "ERROR: this script needs PowerShell 7. Install it with: winget install Microsoft.PowerShell" -ForegroundColor Red
        exit 1
    }
    $forward = @()
    foreach ($key in $PSBoundParameters.Keys) { $forward += "-$key"; $forward += [string]$PSBoundParameters[$key] }
    & $pwsh.Source -NoProfile -File $PSCommandPath @forward
    exit $LASTEXITCODE
}

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
