# Banner Saga Factions - Quick Battle (1 warrior per side)
# Calls POST /debug/party-limit before launch so the server caps each party to
# 1 unit at battle-creation time, regardless of what the client sends.
# The cap is cleared automatically after the game closes.
# Usage: .\launch-game-2p-quickbattle.ps1
# Prerequisites: Server running on localhost:8082 (rebuilt with party-limit support).

param(
    [string]$ServerUrl = "http://localhost:8082/",
    [string]$GamePath  = "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32"
)

$ErrorActionPreference = "Stop"

Write-Host "Banner Saga Factions - Quick Battle (1v1 warrior)" -ForegroundColor Green
Write-Host ""

# ---------- Validate prerequisites --------------------------------------------

if (-not (Test-Path $GamePath)) {
    Write-Host "ERROR: Game directory not found: $GamePath" -ForegroundColor Red
    exit 1
}
$gameBinary = Join-Path $GamePath "The Banner Saga Factions.exe"
if (-not (Test-Path $gameBinary)) {
    Write-Host "ERROR: Game executable not found: $gameBinary" -ForegroundColor Red
    exit 1
}

Write-Host "Checking server connection..." -ForegroundColor Yellow
$serverUp = Test-NetConnection -ComputerName localhost -Port 8082 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $serverUp) {
    Write-Host "ERROR: Nothing listening on port 8082. Start it first with: .\start-server.bat" -ForegroundColor Red
    exit 1
}
Write-Host "Server is running." -ForegroundColor Green
Write-Host ""

# ---------- Activate 1-unit party cap -----------------------------------------

$debugUri = "${ServerUrl}debug/party-limit"
Write-Host "Activating 1-warrior party cap on server..." -ForegroundColor Yellow
Invoke-RestMethod -Method POST -Uri $debugUri -ContentType "application/json" -Body '{"limit":1}' | Out-Null
Write-Host "  Done. Server will cap each party to 1 unit at battle creation." -ForegroundColor Green
Write-Host ""

# ---------- Launch game -------------------------------------------------------

Write-Host "Launching game (test vs Pieloaf, 1v1 warrior)..." -ForegroundColor Cyan
Write-Host ""

$arguments = @(
    "--debug",
    "--server", $ServerUrl,
    "--username", "test,Pieloaf",
    "--factions",
    "--developer",
    "--steam_id", "123456,293850",
    "--steam", "true",
    "--versus_start",
    "--versus_countdown", "0"
)

Set-Location $GamePath
& $gameBinary @arguments

# The game exe is a launcher — it spawns the AIR runtime and exits immediately.
# Give the real process time to start, then wait for it to close.
Start-Sleep -Seconds 4
$gameProc = Get-Process -Name "The Banner Saga Factions" -ErrorAction SilentlyContinue
if ($gameProc) {
    Write-Host "  Game is running (PID $($gameProc.Id)). Waiting for it to close..." -ForegroundColor Yellow
    $gameProc | Wait-Process
} else {
    Write-Host "  WARNING: Could not find game process — party cap will not auto-clear on close." -ForegroundColor Yellow
    Write-Host "           Restart the server or POST /debug/party-limit {} to reset manually." -ForegroundColor Yellow
}

# ---------- Clear party cap ---------------------------------------------------

Write-Host ""
Write-Host "Game closed. Clearing party cap..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Method POST -Uri $debugUri -ContentType "application/json" -Body '{}' | Out-Null
    Write-Host "  Done." -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Could not clear party cap. Restart the server to reset." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Done." -ForegroundColor Green
