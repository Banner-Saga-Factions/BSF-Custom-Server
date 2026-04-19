@echo off
REM Banner Saga Factions Custom Server - Quick Start (Windows Command Prompt)
REM This script starts the development server

setlocal enabledelayedexpansion

echo.
echo ================================================================================
echo Banner Saga Factions Custom Server - Starting Development Server
echo ================================================================================
echo.
echo Server will listen on: http://localhost:8082/
echo.

REM Check if yarn is installed
where yarn >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: yarn is not installed or not in PATH
    echo Install yarn with: npm install -g yarn
    echo.
    pause
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Get project directory
cd /d "%~dp0"

echo Current directory: %cd%
echo.
echo ================================================================================
echo Running: yarn dev
echo ================================================================================
echo.

call yarn dev

echo.
echo Server has stopped
pause
