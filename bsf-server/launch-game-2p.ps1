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

# The name Windows knows the running game by — the .exe name without its extension. Used to
# spot the window this script opened. Same name misc/local/verify-launch-flags.ps1 looks for.
$GameProcessName = "The Banner Saga Factions"

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

# ---------- Hold matchmaking while both halves start up -----------------------
# See the note on --versus_start below for why. Harmless if it fails: the launch
# still works, it is just more likely one half sticks on the matched screen.
#
# $holdIsSet records whether the server actually accepted it, so the clean-up at
# the bottom only tries to undo something that was really done.

# Trim the trailing slash before joining, so -ServerUrl works with or without one.
# Without this, "http://localhost:8082" + "debug/..." gives port "8082debug".
$apiBase = $ServerUrl.TrimEnd('/')
$matchDelayUri = "$apiBase/debug/match-delay"
$holdIsSet = $false

Write-Host "Asking the server to wait 10s before pairing anyone..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Method POST -Uri $matchDelayUri -ContentType "application/json" -Body '{"ms":10000}' | Out-Null
    $holdIsSet = $true
    Write-Host "  Done. (Pairing happens on the next 5s sweep after that, so 10-15s.)" -ForegroundColor Green
} catch {
    # Do not name a single cause here — an old build without the route, a refused
    # connection and a bad -ServerUrl all land in this block. Print what went wrong.
    Write-Host "  WARNING: could not set it: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "           If the server predates this setting, rebuild it with .\start-server.bat." -ForegroundColor Yellow
    Write-Host "           Carrying on without it." -ForegroundColor Yellow
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

# Any game already running before we launch is somebody else's — an instance left open from an
# earlier run. Remember those so the wait below ignores them; otherwise this script would sit
# waiting for the old window to close, holding the pairing wait on the whole time.
$preExistingIds = @(Get-Process -Name $GameProcessName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })

$ourProc = $null
$pushed  = $false
try {
    Push-Location $GamePath
    $pushed = $true
    Write-Host "Running: `"$gameBinary`" $($arguments -join ' ')" -ForegroundColor DarkGray
    & $gameBinary @arguments

    # The game exe is only a launcher: it starts the real game and exits straight away, so there
    # is a gap before there is any process to find. Poll rather than sleeping a fixed few seconds
    # — a cold start or a Steam handshake can take far longer than any single guess, and getting
    # this wrong used to clear the pairing wait while the game was still starting, which put back
    # the very race this script exists to avoid. Same 30s budget as misc/local/verify-launch-flags.ps1.
    Write-Host ""
    Write-Host "  Waiting for the game window to appear..." -ForegroundColor Yellow
    $deadline = (Get-Date).AddSeconds(30)
    while (-not $ourProc -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $found = @(Get-Process -Name $GameProcessName -ErrorAction SilentlyContinue |
                   Where-Object { $preExistingIds -notcontains $_.Id })
        if ($found.Count -gt 0) { $ourProc = $found }
    }

    if ($ourProc) {
        Write-Host "  Game is running (PID $($ourProc.Id -join ', ')). Waiting for it to close..." -ForegroundColor Yellow
        $ourProc | Wait-Process
    } else {
        Write-Host "  WARNING: no game process appeared within 30 seconds." -ForegroundColor Yellow
    }
}
finally {
    if ($pushed) { Pop-Location }

    # Put the server back. This runs on every way out — a normal close, a Ctrl+C during the wait,
    # or an error — so the setting does not outlive the script. The one case we deliberately do
    # NOT clear is "no process ever appeared": the game may simply be starting slowly, and
    # clearing here would strip the pairing wait out from under a run that is about to need it.
    if ($holdIsSet -and $ourProc) {
        Write-Host ""
        Write-Host "Game has closed. Letting the server pair players normally again..." -ForegroundColor Yellow
        try {
            Invoke-RestMethod -Method POST -Uri $matchDelayUri -ContentType "application/json" -Body '{}' | Out-Null
            Write-Host "  Done." -ForegroundColor Green
        } catch {
            Write-Host "  WARNING: could not clear it: $($_.Exception.Message)" -ForegroundColor Yellow
            Write-Host "           Restart the server to reset." -ForegroundColor Yellow
        }
    } elseif ($holdIsSet) {
        Write-Host ""
        Write-Host "  Leaving the pairing wait ON, in case the game is still starting." -ForegroundColor Yellow
        Write-Host "  Clear it by hand once you are done:" -ForegroundColor Yellow
        Write-Host "    Invoke-RestMethod -Method POST -Uri $matchDelayUri -ContentType 'application/json' -Body '{}'" -ForegroundColor Yellow
    }
}
