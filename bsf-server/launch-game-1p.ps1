# Banner Saga Factions Custom Server - Single-Player Game Launch Script
# Usage: .\launch-game-1p.ps1
# Prerequisites: Server must be running on localhost:8082 (or pass -ServerUrl)
# Against the test server, use .\launch-game-test-server.ps1 -Mode Queue, which calls this.

param(
    [string]$ServerUrl = "http://localhost:8082/",
    [string]$GamePath = "C:\Program Files (x86)\Steam\steamapps\common\The Banner Saga Factions\win32",
    [string]$Username = "test2",
    [string]$SteamId = "123457"
)

Write-Host "Banner Saga Factions - Single-Player Launch" -ForegroundColor Green
Write-Host "Launches one game client to queue for matchmaking" -ForegroundColor Yellow
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
Write-Host "Username:       $Username" -ForegroundColor Cyan
Write-Host "Steam ID:       $SteamId" -ForegroundColor Cyan
Write-Host ""

# Check if server is running (TCP port check — avoids false failures from HTTP error codes)
# The host and port come from -ServerUrl, so this works for a remote server too.
$serverUri = [uri]$ServerUrl
Write-Host "Checking server connection..." -ForegroundColor Yellow
$serverUp = Test-NetConnection -ComputerName $serverUri.Host -Port $serverUri.Port -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $serverUp) {
    Write-Host "ERROR: Nothing listening on $($serverUri.Host):$($serverUri.Port)." -ForegroundColor Red
    if ($serverUri.IsLoopback) {
        Write-Host "Start the server first with: .\start-server.bat" -ForegroundColor Yellow
    }
    exit 1
}
Write-Host "Server is running." -ForegroundColor Green
Write-Host ""

Write-Host "Launching game client..." -ForegroundColor Cyan
Write-Host ""

$arguments = @(
    "--debug",
    "--server", $ServerUrl,
    "--username", $Username,
    "--factions",
    # --versus_start below overwrites this: all six run-mode options share one setting and the
    # last one wins, so this launch runs as FACTIONS with no developer privileges — no unlocked
    # unit classes, no debug console. See docs/Development.md → "Which screen a launch command
    # lands on".
    "--developer",
    "--steam_id", $SteamId,
    "--steam", "true",
    "--versus_start",
    "--versus_countdown", "0"
)

Set-Location $GamePath
Write-Host "Running: `"$gameBinary`" $($arguments -join ' ')" -ForegroundColor DarkGray
& $gameBinary @arguments

Write-Host ""
Write-Host "Game has closed." -ForegroundColor Yellow
