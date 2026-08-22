$ErrorActionPreference = "SilentlyContinue"
$proj = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $proj "market-scan\market_scan_server.ps1"

$up = $false
try { $ping = Invoke-RestMethod "http://localhost:8932/api/ping" -TimeoutSec 2; $up = ($ping.ok -eq $true) } catch {}

if (-not $up) {
  Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"' + $server + '"') -WindowStyle Hidden
  for ($i = 0; $i -lt 12 -and -not $up; $i++) {
    Start-Sleep -Milliseconds 750
    try { $ping = Invoke-RestMethod "http://localhost:8932/api/ping" -TimeoutSec 2; $up = ($ping.ok -eq $true) } catch {}
  }
}

Start-Process (Join-Path $proj "index.html")
