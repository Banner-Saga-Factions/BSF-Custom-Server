# Banner Saga Factions Custom Server - Deploy to PRODUCTION (the live server)
# Usage:  .\deploy-production.ps1
#
# Deploys whatever is merged into main on GitHub - nothing else, and nothing from this PC. It never
# commits or pushes: changes reach main through a pull request first.
#
# Runs the steps in docs/Deployment.md -> "Deploying Code Changes" against the production machine
# named in deploy-targets.local.psd1. Before anything changes it shows the commits about to go live
# and asks you to type the machine's name. It stops, with the server untouched, if the machine's
# checkout is not on main, has changed files or holds commits that GitHub's main does not, or if
# the backup fails.

# This window may be the older Windows PowerShell 5.1, the default "PowerShell" on Windows. The
# helpers need PowerShell 7, so under 5.1 this script runs itself again in PowerShell 7 and hands
# back its result. The whole file must stay readable by 5.1, which reads all of it before running
# any of it.
if ($PSVersionTable.PSVersion.Major -lt 7) {
    $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
    if (-not $pwsh) {
        Write-Host "ERROR: this script needs PowerShell 7. Install it with: winget install Microsoft.PowerShell" -ForegroundColor Red
        exit 1
    }
    & $pwsh.Source -NoProfile -File $PSCommandPath
    exit $LASTEXITCODE
}

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\deploy-common.ps1')

try {
    Invoke-Deploy -TargetName production -Branch main
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
