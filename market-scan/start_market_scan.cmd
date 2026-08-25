@echo off
rem Market Scan scraper server launcher (ES Realty)
rem Starts the local property-scraping backend on http://localhost:8932
rem Runs the same Node engine as the Vercel deployment (single source of truth).
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js is required. Install from https://nodejs.org
  pause
  exit /b 1
)
start "ES Realty Market Scan" /min node "%~dp0vercel\server.js"
echo Market Scan server starting on http://localhost:8932 ...
