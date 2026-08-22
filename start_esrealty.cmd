@echo off
rem ES Realty one-click launcher
rem Starts the Market Scan backend (http://localhost:8932) if needed, then opens the app.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_esrealty.ps1"
