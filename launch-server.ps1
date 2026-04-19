# Banner Saga Factions Custom Server - Start Script
# Usage: .\launch-server.ps1

Write-Host "Starting Banner Saga Factions Custom Server..." -ForegroundColor Green
Write-Host "Server will listen on http://localhost:8082/" -ForegroundColor Yellow
Write-Host ""

# Check if yarn is installed
if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: yarn is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Install yarn with: npm install -g yarn" -ForegroundColor Yellow
    exit 1
}

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Navigate to project directory
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

Write-Host "Project directory: $projectDir" -ForegroundColor Cyan
Write-Host ""

# Start development server
Write-Host "Running: yarn dev" -ForegroundColor Cyan
yarn dev
