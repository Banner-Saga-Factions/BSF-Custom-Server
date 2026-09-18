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

# ---------- Hold matchmaking for a few seconds --------------------------------
# See the note on --versus_start below for why. Harmless if it fails: the launch
# still works, it is just more likely one half sticks on the matched screen.

$matchDelayUri = "${ServerUrl}debug/match-delay"
Write-Host "Asking the server to wait 10s before pairing anyone..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Method POST -Uri $matchDelayUri -ContentType "application/json" -Body '{"ms":10000}' | Out-Null
    Write-Host "  Done." -ForegroundColor Green
} catch {
    Write-Host "  WARNING: the server does not know this setting. Rebuild it with .\start-server.bat" -ForegroundColor Yellow
    Write-Host "           to get it. Carrying on without it." -ForegroundColor Yellow
}
Write-Host ""

Write-Host "Launching two game clients (test vs Pieloaf)..." -ForegroundColor Cyan
Write-Host ""

$arguments = @(
    "--debug",
    "--server", $ServerUrl,
    "--username", "test,Pieloaf",
    "--factions",
    # --versus_start below overwrites this: all six run-mode options share one setting and the
    # last one wins, so this launch runs as FACTIONS with no developer privileges — no unlocked
    # unit classes, no debug console. See docs/Development.md → "Which screen a launch command
    # lands on".
    "--developer",
    "--steam_id", "123456,293850",
    "--steam", "true",
    # Sound OFF for both halves. With it on, the half that gets the real sound engine
    # runs out of memory loading the battle music, the call into it fails in a way the
    # game does not expect, and that half never finishes loading the battle — so it
    # never tells the server it is ready and the battle never starts. Measured on
    # 2026-09-16: three launches out of five ended that way.
    # Tracked as https://github.com/Banner-Saga-Factions/BSF-Client/issues/49.
    "--sound", "false",
    # Skip straight to the match search, with no countdown to sit through.
    # These do NOT prevent the hang above, whatever older notes said: all five launches
    # on 2026-09-16 passed them and none started a battle.
    # They do make both halves queue the moment the game starts, which is why this script
    # asks the server to wait before pairing anyone (above): a match that arrives before a
    # half has finished drawing its "found an opponent" screen never starts that half's
    # countdown, and it is stuck there.
    # Tracked as https://github.com/Banner-Saga-Factions/BSF-Client/issues/50.
    # Background for both: https://github.com/Banner-Saga-Factions/BSF-Client/issues/7
    # and docs/Development.md -> "Two-Player Local Test".
    "--versus_start",
    "--versus_countdown", "0"
)

Set-Location $GamePath
Write-Host "Running: `"$gameBinary`" $($arguments -join ' ')" -ForegroundColor DarkGray
& $gameBinary @arguments

# The game exe is a launcher — it starts the real game and exits straight away, so without
# this wait the script would announce the game had closed while it was still running, and
# would put the pairing setting back mid-session.
Start-Sleep -Seconds 4
$gameProc = Get-Process -Name "The Banner Saga Factions" -ErrorAction SilentlyContinue
if ($gameProc) {
    Write-Host ""
    Write-Host "  Game is running (PID $($gameProc.Id)). Waiting for it to close..." -ForegroundColor Yellow
    $gameProc | Wait-Process
} else {
    Write-Host ""
    Write-Host "  WARNING: could not find the game process — the pairing wait will not clear on close." -ForegroundColor Yellow
    Write-Host "           Restart the server, or POST {} to /debug/match-delay, to clear it by hand." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Game has closed. Letting the server pair players normally again..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Method POST -Uri $matchDelayUri -ContentType "application/json" -Body '{}' | Out-Null
    Write-Host "  Done." -ForegroundColor Green
} catch {
    Write-Host "  WARNING: could not clear it. Restart the server to reset." -ForegroundColor Yellow
}
