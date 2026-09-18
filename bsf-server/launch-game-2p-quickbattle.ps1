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

# ---------- Launch game -------------------------------------------------------

Write-Host "Launching game (test vs Pieloaf, 1v1 warrior)..." -ForegroundColor Cyan
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
& $gameBinary @arguments

# The game exe is a launcher — it spawns the AIR runtime and exits immediately.
# Give the real process time to start, then wait for it to close.
Start-Sleep -Seconds 4
$gameProc = Get-Process -Name "The Banner Saga Factions" -ErrorAction SilentlyContinue
if ($gameProc) {
    Write-Host "  Game is running (PID $($gameProc.Id)). Waiting for it to close..." -ForegroundColor Yellow
    $gameProc | Wait-Process
} else {
    Write-Host "  WARNING: Could not find game process — the two test settings will not auto-clear on close." -ForegroundColor Yellow
    Write-Host "           Restart the server, or POST {} to /debug/party-limit and /debug/match-delay, to reset by hand." -ForegroundColor Yellow
}

# ---------- Put both test settings back ---------------------------------------

Write-Host ""
Write-Host "Game closed. Clearing party cap..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Method POST -Uri $debugUri -ContentType "application/json" -Body '{}' | Out-Null
    Write-Host "  Done." -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Could not clear party cap. Restart the server to reset." -ForegroundColor Yellow
}

Write-Host "Letting the server pair players normally again..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Method POST -Uri $matchDelayUri -ContentType "application/json" -Body '{}' | Out-Null
    Write-Host "  Done." -ForegroundColor Green
} catch {
    Write-Host "  WARNING: could not clear it. Restart the server to reset." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Done." -ForegroundColor Green
