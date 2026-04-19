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
    Write-Host "Please install The Banner Saga Factions from Steam" -ForegroundColor Yellow
    exit 1
}

$gameBinary = Join-Path $GamePath "The Banner Saga Factions.exe"
if (-not (Test-Path $gameBinary)) {
    Write-Host "ERROR: Game executable not found: $gameBinary" -ForegroundColor Red
    exit 1
}

Write-Host "Game directory: $GamePath" -ForegroundColor Cyan
Write-Host "Server URL: $ServerUrl" -ForegroundColor Cyan
Write-Host ""

# Check if server is running
Write-Host "Checking server connection..." -ForegroundColor Yellow
try {
    $null = Invoke-WebRequest -Uri "$ServerUrl/services/session/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "✓ Server is running" -ForegroundColor Green
}
catch {
    Write-Host "✗ Cannot connect to server at $ServerUrl" -ForegroundColor Red
    Write-Host "Please start the server first with: .\launch-server.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Launching two game clients..." -ForegroundColor Cyan
Write-Host ""

# Set up arguments for two-player game
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

# Start game with arguments
Set-Location $GamePath
Write-Host "Running: & '$gameBinary' $($arguments -join ' ')" -ForegroundColor Cyan
& $gameBinary @arguments

Write-Host ""
Write-Host "Game has closed" -ForegroundColor Yellow
