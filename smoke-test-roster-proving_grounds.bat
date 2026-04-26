@echo off
setlocal enabledelayedexpansion
set BASE=http://localhost:8082
set TMPOUT=%TEMP%\bsf_roster_test_out.txt
set TOTAL=9

echo ============================================================
echo  BSF Roster Routes Smoke Test
echo  Fresh account per run (renown=0) -- no client required
echo ============================================================
echo.

REM ── Step 1: Check server ─────────────────────────────────────────
echo [1/%TOTAL%] Checking server on port 8082...
powershell -NoProfile -Command "if ((Test-NetConnection -ComputerName localhost -Port 8082 -InformationLevel Quiet -WarningAction SilentlyContinue) -eq $true) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [FAIL] Nothing on port 8082. Run start-server.bat first.
    exit /b 1
)
echo [OK]   Server is up.
echo.

REM ── Step 2: Login fresh test account ─────────────────────────────
echo [2/%TOTAL%] Logging in fresh test account ^(renown=0^)...
for /f %%a in ('powershell -NoProfile -Command "[int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"') do set TEST_ID=%%a
echo       steam_id = !TEST_ID!
powershell -NoProfile -Command "$r = Invoke-RestMethod -Method POST -Uri '%BASE%/services/auth/login/11' -ContentType 'application/json' -Body ('{\"steam_id\":\"' + '!TEST_ID!' + '\"}'); $r.session_key" > "%TMPOUT%" 2>&1
set /p SK= < "%TMPOUT%"
if "!SK!"=="" (
    echo [FAIL] Login failed. Check server logs.
    type "%TMPOUT%"
    exit /b 1
)
echo [OK]   session_key = !SK!
echo.

REM ── Step 3: Hire unit with insufficient renown (expect 402) ───────
echo [3/%TOTAL%] Hire 'archer' with renown=0 ^(expect 402^)...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Method POST -Uri '%BASE%/services/roster/unit/hire/!SK!' -ContentType 'application/json' -Body '{\"purchasable_unit_id\":\"archer\",\"new_unit_id\":\"archer\",\"new_unit_name\":\"Test\"}' -UseBasicParsing; Write-Host $r.StatusCode } catch { Write-Host $_.Exception.Response.StatusCode.value__ }" > "%TMPOUT%" 2>&1
set /p CODE= < "%TMPOUT%"
if "!CODE!"=="402" (
    echo [OK]   Got 402 ^(renown affordability check works^)
) else (
    echo [FAIL] Expected 402, got !CODE!
    exit /b 1
)
echo.

REM ── Step 4: Arrange party with unknown unit ID (expect 400) ──────
echo [4/%TOTAL%] Arrange party with fake unit ID ^(expect 400^)...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Method POST -Uri '%BASE%/services/roster/party/arrange/!SK!' -ContentType 'application/json' -Body '{\"party\":[\"fake_unit_999\"]}' -UseBasicParsing; Write-Host $r.StatusCode } catch { Write-Host $_.Exception.Response.StatusCode.value__ }" > "%TMPOUT%" 2>&1
set /p CODE= < "%TMPOUT%"
if "!CODE!"=="400" (
    echo [OK]   Got 400 ^(unknown unit ID rejected^)
) else (
    echo [FAIL] Expected 400, got !CODE!
    exit /b 1
)
echo.

REM ── Step 5: Stats purchase with out-of-range delta (expect 400) ──
echo [5/%TOTAL%] Purchase stat with delta=6 ^(out of range, expect 400^)...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Method POST -Uri '%BASE%/services/roster/unit/stats/purchase/!SK!' -ContentType 'application/json' -Body '{\"unit_id\":\"warrior_start_0\",\"stats\":[\"STRENGTH\"],\"deltas\":[6]}' -UseBasicParsing; Write-Host $r.StatusCode } catch { Write-Host $_.Exception.Response.StatusCode.value__ }" > "%TMPOUT%" 2>&1
set /p CODE= < "%TMPOUT%"
if "!CODE!"=="400" (
    echo [OK]   Got 400 ^(delta bounds check works^)
) else (
    echo [FAIL] Expected 400, got !CODE!
    exit /b 1
)
echo.

REM ── Step 6: Expand barracks with insufficient renown (expect 402) ─
echo [6/%TOTAL%] Expand barracks with renown=0 ^(expect 402^)...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Method POST -Uri '%BASE%/services/roster/unlock/!SK!' -ContentType 'application/json' -Body '{}' -UseBasicParsing; Write-Host $r.StatusCode } catch { Write-Host $_.Exception.Response.StatusCode.value__ }" > "%TMPOUT%" 2>&1
set /p CODE= < "%TMPOUT%"
if "!CODE!"=="402" (
    echo [OK]   Got 402 ^(barracks unlock renown check works^)
) else (
    echo [FAIL] Expected 402, got !CODE!
    exit /b 1
)
echo.

REM ── Step 7: Retire unit that's in the active party (expect 200) ──
echo [7/%TOTAL%] Retire 'thrasher_start_0' ^(in party^) -- expect 200...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Method POST -Uri '%BASE%/services/roster/unit/retire/!SK!' -ContentType 'application/json' -Body '{\"unit_id\":\"thrasher_start_0\"}' -UseBasicParsing; Write-Host $r.StatusCode } catch { Write-Host $_.Exception.Response.StatusCode.value__ }" > "%TMPOUT%" 2>&1
set /p CODE= < "%TMPOUT%"
if "!CODE!"=="200" (
    echo [OK]   Got 200
) else (
    echo [FAIL] Expected 200, got !CODE!
    exit /b 1
)
echo.

REM ── Step 8: Verify /account/info shows unit gone from both roster and party ─
echo [8/%TOTAL%] Verify /account/info: thrasher_start_0 absent from roster AND party...
powershell -NoProfile -Command "$info = Invoke-RestMethod -Method GET -Uri '%BASE%/services/account/info/!SK!'; $inRoster = ($info.roster.defs | Where-Object { $_.id -eq 'thrasher_start_0' }).Count -gt 0; $inParty = $info.party.ids -contains 'thrasher_start_0'; if ($inRoster) { Write-Host 'STILL_IN_ROSTER' } elseif ($inParty) { Write-Host 'STILL_IN_PARTY' } else { Write-Host 'GONE' }" > "%TMPOUT%" 2>&1
set /p RESULT= < "%TMPOUT%"
if "!RESULT!"=="GONE" (
    echo [OK]   Absent from both roster and party ^(in-memory sync correct^)
) else if "!RESULT!"=="STILL_IN_ROSTER" (
    echo [FAIL] thrasher_start_0 still in roster after retire
    exit /b 1
) else if "!RESULT!"=="STILL_IN_PARTY" (
    echo [FAIL] thrasher_start_0 still in party after retire ^(party sync broken^)
    exit /b 1
) else (
    echo [FAIL] Unexpected result from /account/info: !RESULT!
    exit /b 1
)
echo.

REM ── Step 9: Valid stat purchase, verify in-memory sync via /account/info ─
echo [9/%TOTAL%] Purchase STRENGTH +1 on warrior_start_0, verify via /account/info...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Method POST -Uri '%BASE%/services/roster/unit/stats/purchase/!SK!' -ContentType 'application/json' -Body '{\"unit_id\":\"warrior_start_0\",\"stats\":[\"STRENGTH\"],\"deltas\":[1]}' -UseBasicParsing; Write-Host $r.StatusCode } catch { Write-Host $_.Exception.Response.StatusCode.value__ }" > "%TMPOUT%" 2>&1
set /p CODE= < "%TMPOUT%"
if not "!CODE!"=="200" (
    echo [FAIL] stats/purchase returned !CODE! instead of 200
    exit /b 1
)
powershell -NoProfile -Command "$info = Invoke-RestMethod -Method GET -Uri '%BASE%/services/account/info/!SK!'; $unit = $info.roster.defs | Where-Object { $_.id -eq 'warrior_start_0' }; $str = ($unit.stats | Where-Object { $_.stat -eq 'STRENGTH' }).value; Write-Host $str" > "%TMPOUT%" 2>&1
set /p STRENGTH= < "%TMPOUT%"
if "!STRENGTH!"=="13" (
    echo [OK]   STRENGTH = 13 ^(was 12, delta applied and visible in /account/info^)
) else (
    echo [FAIL] Expected STRENGTH=13, got '!STRENGTH!' -- in-memory sync may be broken
    exit /b 1
)
echo.

echo ============================================================
echo  RESULT: PASS -- All %TOTAL% roster route checks passed.
echo ============================================================
echo.

del "%TMPOUT%" >nul 2>&1
exit /b 0
