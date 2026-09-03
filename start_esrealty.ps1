$ErrorActionPreference = "SilentlyContinue"
$proj = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $node)) { $node = "node" }
$workerDir = Join-Path $proj "market-scan\worker"

$up = $false
try { $ping = Invoke-RestMethod "http://localhost:8932/api/ping" -TimeoutSec 2; $up = ($ping.ok -eq $true) } catch {}

if (-not $up) {
  # Market Scan worker (node) — serves the full API incl. /api/market-scan/stores.
  Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $workerDir -WindowStyle Hidden
  for ($i = 0; $i -lt 20 -and -not $up; $i++) {
    Start-Sleep -Milliseconds 750
    try { $ping = Invoke-RestMethod "http://localhost:8932/api/ping" -TimeoutSec 2; $up = ($ping.ok -eq $true) } catch {}
  }
}

# Serve the app over HTTP (Supabase auth requires a real origin; file:// breaks login).
$appUp = $false
try { $r = Invoke-WebRequest "http://localhost:8931/index.html" -UseBasicParsing -TimeoutSec 2; $appUp = ($r.StatusCode -eq 200) } catch {}
if (-not $appUp -and (Test-Path $node)) {
  Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $proj "serve.js") + '"') -WindowStyle Hidden
  for ($i = 0; $i -lt 12 -and -not $appUp; $i++) {
    Start-Sleep -Milliseconds 750
    try { $r = Invoke-WebRequest "http://localhost:8931/index.html" -UseBasicParsing -TimeoutSec 2; $appUp = ($r.StatusCode -eq 200) } catch {}
  }
}

if ($appUp) {
  Start-Process "http://localhost:8931/"
} else {
  Start-Process (Join-Path $proj "index.html")
}
