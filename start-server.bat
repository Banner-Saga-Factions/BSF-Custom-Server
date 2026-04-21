@echo off
echo ============================================================
echo  BSF Server
echo ============================================================
echo.

if not exist "%~dp0build\index.js" (
    echo [ERROR] build\index.js not found. Run: yarn build
    pause
    exit /b 1
)

if not exist "%~dp0.env" (
    echo [WARN] .env file not found. Server may fail if JWT_SECRET is unset.
    echo        Copy .env.example to .env and fill in values.
    echo.
)

echo Building...
call yarn build
if errorlevel 1 (
    echo [ERROR] Build failed. Fix TypeScript errors before starting.
    pause
    exit /b 1
)

powershell -NoProfile -Command "Stop-Process -Name node -Force -ErrorAction SilentlyContinue"

echo Starting on http://localhost:8082
echo Press Ctrl+C to stop.
echo.
node "%~dp0build\index.js"
pause
