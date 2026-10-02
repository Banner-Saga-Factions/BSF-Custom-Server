# Banner Saga Factions Custom Server - Launch the game against the TEST server
# Usage:  .\launch-game-test-server.ps1 -Mode TwoPlayer   two players side by side, queued against each other
#         .\launch-game-test-server.ps1 -Mode Queue       one player, queued; the opponent joins from elsewhere
#         .\launch-game-test-server.ps1 -Mode VsAI        one player at camp, for an offline practice battle
#
# Looks up the test machine's current address (it changes every time the machine restarts), checks
# that it answers, then hands over to the launch script that already knows each mode:
#   TwoPlayer -> launch-game-2p.ps1 (shipped Steam game, sound off for both halves)
#   Queue     -> launch-game-1p.ps1 (shipped Steam game)
#   VsAI      -> ..\bsf-client\scripts\run-adl.ps1 -Landing camp (OUR recompiled game - the shipped
#                one has no practice battle). Press Ctrl+Shift+A at camp to start it.
#
# The test machine is named in deploy-targets.local.psd1 (see deploy-targets.example.psd1).
#
# One difference from a local two-player run: the test server runs in production mode, so it has
# no debug routes and cannot hold pairing for ten seconds the way launch-game-2p.ps1 asks a local
# server to. Now and then one half will stick on the "found an opponent" screen; close the game
# and launch again. See docs/Development.md -> "Two-Player Local Test".

#Requires -Version 7.2

param(
    [Parameter(Mandatory)]
    [ValidateSet('TwoPlayer', 'Queue', 'VsAI')]
    [string]$Mode,
    # Passed through to the launch script only when given; otherwise each one keeps its own default.
    [string]$Username,
    [string]$SteamId,
    [string]$GamePath
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\deploy-common.ps1')

Write-Host "Banner Saga Factions - launch against the test server ($Mode)" -ForegroundColor Green
Write-Host ""

try {
    $target = Get-DeployTarget test
    Write-Host "Looking up $($target.Vm)'s current address..." -ForegroundColor Yellow
    $url = Get-ServerUrl $target
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host "  $url" -ForegroundColor Cyan

# The launch scripts check this too, but here a failure can say the likely reason: the test
# machine's firewall admits only the addresses it was told about.
$uri = [uri]$url
$up = Test-NetConnection -ComputerName $uri.Host -Port $uri.Port -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $up) {
    Write-Host "ERROR: $($uri.Host):$($uri.Port) does not answer." -ForegroundColor Red
    Write-Host "  The machine is running, so the usual reason is its firewall: it admits only the" -ForegroundColor Yellow
    Write-Host "  addresses it was told about, and your home address may have changed since." -ForegroundColor Yellow
    exit 1
}
Write-Host "  Server answers." -ForegroundColor Green
Write-Host ""

$pass = @{ ServerUrl = $url }
foreach ($name in 'Username', 'SteamId', 'GamePath') {
    if ($PSBoundParameters.ContainsKey($name)) { $pass[$name] = $PSBoundParameters[$name] }
}

# launch-game-1p.ps1 changes the current folder to the game's and leaves it there; put it back.
Push-Location $PSScriptRoot
try {
    switch ($Mode) {
        'TwoPlayer' {
            & (Join-Path $PSScriptRoot 'launch-game-2p.ps1') @pass -SkipPairingWait
        }
        'Queue' {
            Write-Host "This player queues and waits. The opponent joins the same server from another" -ForegroundColor Yellow
            Write-Host "machine (for example the Steam Deck), whose address the firewall must also admit." -ForegroundColor Yellow
            Write-Host ""
            & (Join-Path $PSScriptRoot 'launch-game-1p.ps1') @pass
        }
        'VsAI' {
            $runAdl = Join-Path $PSScriptRoot '..\bsf-client\scripts\run-adl.ps1'
            if (-not (Test-Path $runAdl)) {
                Write-Host "ERROR: $runAdl not found. The practice battle needs the bsf-client submodule (run this from the main checkout)." -ForegroundColor Red
                exit 1
            }
            if (-not $env:AIR_HOME) {
                Write-Host "ERROR: AIR_HOME is not set. The practice battle runs our recompiled game, which needs the AIR SDK." -ForegroundColor Red
                exit 1
            }
            Write-Host "At camp, press Ctrl+Shift+A to start the practice battle." -ForegroundColor Yellow
            Write-Host "Ignore any warning that nothing is listening on localhost:8082 - this run uses the test server." -ForegroundColor Yellow
            Write-Host ""
            & $runAdl @pass -Landing camp
        }
    }
} finally {
    Pop-Location
}
