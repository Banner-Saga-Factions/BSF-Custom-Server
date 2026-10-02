# Banner Saga Factions Custom Server - Deploy to PRODUCTION (the live server)
# Usage:  .\deploy-production.ps1
#
# Deploys whatever is merged into main on GitHub - nothing else, and nothing from this PC. It never
# commits or pushes: changes reach main through a pull request first.
#
# Runs the steps in docs/Deployment.md -> "Deploying Code Changes" against the production machine
# named in deploy-targets.local.psd1. Before anything changes it shows the commits about to go live
# and asks you to type the machine's name. It stops, with the server untouched, if the machine's
# checkout is not on main, has changed files, or the backup fails.

#Requires -Version 7.2

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\deploy-common.ps1')

try {
    Invoke-Deploy -TargetName production -Branch main
} catch {
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
