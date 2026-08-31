@echo off
rem Market Scan worker launcher (ES Realty)
rem Starts the local Market Scan worker on http://localhost:8932
rem   /api/market-scan        live scans (DotProperty, MyProperty, web, benchmarks, FB)
rem   /api/market-scan/bench  live per-city price/sqm medians
rem   /api/fb/status          Facebook Marketplace adapter status
rem   /api/fb/login           one-time Facebook Marketplace login (needs Playwright)
rem Install the FB scraper (optional):  cd worker && npm i playwright && npx playwright install chromium
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js is required. Install from https://nodejs.org
  pause
  exit /b 1
)
start "ES Realty Market Scan" /min node "%~dp0worker\server.js"
echo Market Scan worker starting on http://localhost:8932 ...
