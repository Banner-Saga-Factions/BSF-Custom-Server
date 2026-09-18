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

# The name Windows knows the running game by — the .exe name without its extension.
$GameProcessName = "The Banner Saga Factions"

Write-Host "Checking server connection..." -ForegroundColor Yellow
$serverUp = Test-NetConnection -ComputerName localhost -Port 8082 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $serverUp) {
    Write-Host "ERROR: Nothing listening on port 8082. Start it first with: .\start-server.bat" -ForegroundColor Red
    exit 1
}
Write-Host "Server is running." -ForegroundColor Green
Write-Host ""

# ---------- Activate 1-unit party cap -----------------------------------------

# Trim the trailing slash before joining, so -ServerUrl works with or without one.
# Without this, "http://localhost:8082" + "debug/..." gives port "8082debug".
$apiBase  = $ServerUrl.TrimEnd('/')
$debugUri = "$apiBase/debug/party-limit"
$capIsSet = $false

Write-Host "Activating 1-warrior party cap on server..." -ForegroundColor Yellow
Invoke-RestMethod -Method POST -Uri $debugUri -ContentType "application/json" -Body '{"limit":1}' | Out-Null
$capIsSet = $true
Write-Host "  Done. Server will cap each party to 1 unit at battle creation." -ForegroundColor Green
Write-Host ""

# ---------- Hold matchmaking while both halves start up -----------------------
# See the note on --versus_start below for why. Harmless if it fails: the launch
# still works, it is just more likely one half sticks on the matched screen.
#
# $holdIsSet records whether the server actually accepted it, so the clean-up at
# the bottom only tries to undo something that was really done.

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

# Any game already running before we launch is somebody else's — an instance left open from an
# earlier run. Remember those so the wait below ignores them; otherwise this script would sit
# waiting for the old window to close, holding both test settings on the whole time.
$preExistingIds = @(Get-Process -Name $GameProcessName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })

$ourProc = $null
$pushed  = $false
try {
    Push-Location $GamePath
    $pushed = $true
    & $gameBinary @arguments

    # The game exe is only a launcher: it spawns the AIR runtime and exits straight away, so there
    # is a gap before there is any process to find. Poll rather than sleeping a fixed few seconds
    # — a cold start or a Steam handshake can take far longer than any single guess, and getting
    # this wrong used to clear both settings while the game was still starting. Same 30s budget as
    # misc/local/verify-launch-flags.ps1.
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
    # ---------- Put both test settings back -----------------------------------
    # This runs on every way out — a normal close, a Ctrl+C during the wait, or an error — so
    # neither setting outlives the script. The one case we deliberately do NOT clear is "no
    # process ever appeared": the game may simply be starting slowly, and clearing here would
    # strip the pairing wait out from under a run that is about to need it.
    if ($pushed) { Pop-Location }

    if ($ourProc) {
        if ($capIsSet) {
            Write-Host ""
            Write-Host "Game closed. Clearing party cap..." -ForegroundColor Yellow
            try {
                Invoke-RestMethod -Method POST -Uri $debugUri -ContentType "application/json" -Body '{}' | Out-Null
                Write-Host "  Done." -ForegroundColor Green
            } catch {
                Write-Host "  WARNING: could not clear party cap: $($_.Exception.Message)" -ForegroundColor Yellow
                Write-Host "           Restart the server to reset." -ForegroundColor Yellow
            }
        }
        if ($holdIsSet) {
            Write-Host "Letting the server pair players normally again..." -ForegroundColor Yellow
            try {
                Invoke-RestMethod -Method POST -Uri $matchDelayUri -ContentType "application/json" -Body '{}' | Out-Null
                Write-Host "  Done." -ForegroundColor Green
            } catch {
                Write-Host "  WARNING: could not clear it: $($_.Exception.Message)" -ForegroundColor Yellow
                Write-Host "           Restart the server to reset." -ForegroundColor Yellow
            }
        }
        Write-Host ""
        Write-Host "Done." -ForegroundColor Green
    } elseif ($capIsSet -or $holdIsSet) {
        Write-Host ""
        Write-Host "  Leaving the test settings ON, in case the game is still starting." -ForegroundColor Yellow
        Write-Host "  Clear them by hand once you are done:" -ForegroundColor Yellow
        if ($capIsSet)  { Write-Host "    Invoke-RestMethod -Method POST -Uri $debugUri -ContentType 'application/json' -Body '{}'" -ForegroundColor Yellow }
        if ($holdIsSet) { Write-Host "    Invoke-RestMethod -Method POST -Uri $matchDelayUri -ContentType 'application/json' -Body '{}'" -ForegroundColor Yellow }
    }
}
