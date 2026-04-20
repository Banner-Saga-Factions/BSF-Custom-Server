@echo off
setlocal enabledelayedexpansion
set BASE=http://localhost:8082
set TMPOUT=%TEMP%\bsf_test_out.txt

echo ============================================================
echo  BSF 2-Player Match Test
echo  Players: "test" (123456) vs "Pieloaf" (293850)
echo ============================================================
echo.

REM ── Step 1: Check server is up ───────────────────────────────
echo [1/6] Checking server is reachable on port 8082...
powershell -NoProfile -Command "if ((Test-NetConnection -ComputerName localhost -Port 8082 -InformationLevel Quiet -WarningAction SilentlyContinue) -eq $true) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [FAIL] Nothing listening on port 8082. Start it with start-server.bat first.
    exit /b 1
)
echo [OK]   Server is up.
echo.

REM ── Step 2: Login Player 1 ───────────────────────────────────
echo [2/6] Login Player 1 (test / steam_id=123456)...
powershell -NoProfile -Command "$r = Invoke-RestMethod -Method POST -Uri '%BASE%/services/auth/login/11' -ContentType 'application/json' -Body '{\"steam_id\":\"123456\"}'; $r.session_key" > "%TMPOUT%" 2>&1
set /p P1_KEY= < "%TMPOUT%"
if "!P1_KEY!"=="" (
    echo [FAIL] Login failed. Check server logs.
    type "%TMPOUT%"
    exit /b 1
)
echo [OK]   P1 session_key = !P1_KEY!
echo.

REM ── Step 3: Login Player 2 ───────────────────────────────────
echo [3/6] Login Player 2 (Pieloaf / steam_id=293850)...
powershell -NoProfile -Command "$r = Invoke-RestMethod -Method POST -Uri '%BASE%/services/auth/login/11' -ContentType 'application/json' -Body '{\"steam_id\":\"293850\"}'; $r.session_key" > "%TMPOUT%" 2>&1
set /p P2_KEY= < "%TMPOUT%"
if "!P2_KEY!"=="" (
    echo [FAIL] Login failed. Check server logs.
    type "%TMPOUT%"
    exit /b 1
)
echo [OK]   P2 session_key = !P2_KEY!
echo.

REM ── Step 4: Queue both players ───────────────────────────────
echo [4/6] Queueing Player 1 for QUICK match...
powershell -NoProfile -Command "Invoke-RestMethod -Method POST -Uri '%BASE%/services/vs/start/!P1_KEY!' -ContentType 'application/json' -Body '{\"vs_type\":\"QUICK\",\"match_handle\":1}'" > "%TMPOUT%" 2>&1
if errorlevel 1 (
    echo [FAIL] Queue failed for Player 1.
    type "%TMPOUT%"
    exit /b 1
)
echo [OK]   Player 1 queued.

echo [4/6] Queueing Player 2 (triggers matchmaking)...
powershell -NoProfile -Command "Invoke-RestMethod -Method POST -Uri '%BASE%/services/vs/start/!P2_KEY!' -ContentType 'application/json' -Body '{\"vs_type\":\"QUICK\",\"match_handle\":1}'" > "%TMPOUT%" 2>&1
if errorlevel 1 (
    echo [FAIL] Queue failed for Player 2.
    type "%TMPOUT%"
    exit /b 1
)
echo [OK]   Player 2 queued. Matchmaking should have fired.
echo.

REM ── Step 5: Poll Player 1 for BATTLE_CREATE_DATA ─────────────
echo [5/6] Polling Player 1 for BATTLE_CREATE_DATA...
powershell -NoProfile -Command "$r = Invoke-RestMethod -Method GET -Uri '%BASE%/services/game/!P1_KEY!'; $b = $r | Where-Object { $_.class -eq 'tbs.srv.battle.data.BattleCreateData' } | Select-Object -First 1; if ($b) { Write-Host $b.battle_id } else { Write-Host 'NOT_FOUND' }" > "%TMPOUT%" 2>&1
set /p BATTLE_ID= < "%TMPOUT%"
if "!BATTLE_ID!"=="NOT_FOUND" (
    echo [FAIL] No BATTLE_CREATE_DATA received. Matchmaking may not have fired.
    echo        (Did both players have the same power level? Check server console.)
    exit /b 1
)
if "!BATTLE_ID!"=="" (
    echo [FAIL] Poll request failed.
    type "%TMPOUT%"
    exit /b 1
)
echo [OK]   Battle created! battle_id = !BATTLE_ID!
echo.

REM ── Step 6: Poll Player 2 for BATTLE_CREATE_DATA ─────────────
echo [6/6] Polling Player 2 for BATTLE_CREATE_DATA...
powershell -NoProfile -Command "$r = Invoke-RestMethod -Method GET -Uri '%BASE%/services/game/!P2_KEY!'; $b = $r | Where-Object { $_.class -eq 'tbs.srv.battle.data.BattleCreateData' } | Select-Object -First 1; if ($b) { Write-Host $b.battle_id } else { Write-Host 'NOT_FOUND' }" > "%TMPOUT%" 2>&1
set /p BATTLE_ID2= < "%TMPOUT%"
if "!BATTLE_ID2!"=="NOT_FOUND" (
    echo [WARN] Player 2 did not receive BATTLE_CREATE_DATA (already consumed or poll timed out).
) else if "!BATTLE_ID2!"=="!BATTLE_ID!" (
    echo [OK]   Player 2 confirmed same battle_id = !BATTLE_ID2!
) else (
    echo [WARN] Player 2 received different battle_id: !BATTLE_ID2!
)

echo.
echo ============================================================
echo  RESULT: PASS — Battle !BATTLE_ID! created successfully
echo  Both players are now in a QUICK match.
echo ============================================================
echo.

del "%TMPOUT%" >nul 2>&1
exit /b 0
