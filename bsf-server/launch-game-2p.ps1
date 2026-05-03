# Banner Saga Factions Custom Server - Two-Player Game Launch Script
# Usage: .\launch-game-2p.ps1
# Prerequisites: Server must be running on localhost:8082

param(
    [string]$ServerUrl = "http://localhost:8082/",
    [string]$GamePath = "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32"
)

Write-Host "Banner Saga Factions - Two-Player Launch" -ForegroundColor Green
Write-Host ""

# Validate game path exists
if (-not (Test-Path $GamePath)) {
    Write-Host "ERROR: Game directory not found: $GamePath" -ForegroundColor Red
    Write-Host "Please install The Banner Saga Factions from Steam, or pass -GamePath to this script." -ForegroundColor Yellow
    exit 1
}

$gameBinary = Join-Path $GamePath "The Banner Saga Factions.exe"
if (-not (Test-Path $gameBinary)) {
    Write-Host "ERROR: Game executable not found: $gameBinary" -ForegroundColor Red
    exit 1
}

Write-Host "Game directory: $GamePath" -ForegroundColor Cyan
Write-Host "Server URL:     $ServerUrl" -ForegroundColor Cyan
Write-Host ""

# Check if server is running (TCP port check — avoids false failures from HTTP error codes)
Write-Host "Checking server connection..." -ForegroundColor Yellow
$serverUp = Test-NetConnection -ComputerName localhost -Port 8082 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $serverUp) {
    Write-Host "ERROR: Nothing listening on port 8082." -ForegroundColor Red
    Write-Host "Start the server first with: .\start-server.bat" -ForegroundColor Yellow
    exit 1
}
Write-Host "Server is running." -ForegroundColor Green
Write-Host ""

Write-Host "Launching two game clients (test vs Pieloaf)..." -ForegroundColor Cyan
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
Write-Host "Running: `"$gameBinary`" $($arguments -join ' ')" -ForegroundColor DarkGray
& $gameBinary @arguments

Write-Host ""
Write-Host "Game has closed." -ForegroundColor Yellow
