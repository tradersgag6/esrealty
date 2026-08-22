@echo off
rem Market Scan scraper server launcher (ES Realty)
rem Starts the local property-scraping backend on http://localhost:8932
rem The Market Scan view in the app talks to this server.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0market_scan_server.ps1"
