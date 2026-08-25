param(
    [string]$Test = "",          # run one test by name (without .js), e.g. -Test crm_core_e2e
    [string]$BaseUrl = "http://127.0.0.1:8931/index.html",
    [int]$NavDelayMs = 4500,
    [string]$WindowSize = "1400,900",
    [switch]$Mobile              # shorthand for -WindowSize "390,844"
)

# ES Realty regression runner (Chrome DevTools Protocol, headless Chrome)
# Requires: Chrome installed; local server running on :8931 (start_esrealty.cmd)
# Usage:
#   powershell -File tests\run_all.ps1              # run every *_e2e.js
#   powershell -File tests\run_all.ps1 -Test appraisal_b2_e2e
#   powershell -File tests\run_all.ps1 -Mobile      # mobile viewport pass

$driver = Join-Path $env:TEMP "opencode\cdp_driver.ps1"
if (-not (Test-Path $driver)) {
    # fallback: extract driver from repo copy if present
    $driver = Join-Path $PSScriptRoot "cdp_driver.ps1"
}
if (-not (Test-Path $driver)) { Write-Error "cdp_driver.ps1 not found"; exit 1 }

if ($Mobile) { $WindowSize = "390,844" }

$tests = @()
if ($Test) {
    $tests = @(Join-Path $PSScriptRoot "$Test.js")
    if (-not (Test-Path $tests[0])) { Write-Error "Test not found: $($tests[0])"; exit 1 }
} else {
    $tests = Get-ChildItem $PSScriptRoot -Filter "*_e2e.js" | Sort-Object Name | ForEach-Object { $_.FullName }
}

$results = @()
foreach ($t in $tests) {
    $name = [IO.Path]::GetFileNameWithoutExtension($t)
    Write-Host "== $name ==" -ForegroundColor Cyan
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $driver -TestFile $t -Url $BaseUrl -NavDelayMs $NavDelayMs -WindowSize $WindowSize 2>&1
    try { $json = ($out -join "") | ConvertFrom-Json } catch { $json = $null }
    $pass = $json -and $json.ok
    $results += [pscustomobject]@{ Test = $name; Pass = [bool]$pass }
    if ($json -and $json.checks) {
        foreach ($c in $json.checks) {
            $mark = if ($c.ok) { "PASS" } else { "FAIL" }
            $color = if ($c.ok) { "Green" } else { "Red" }
            Write-Host ("  [{0}] {1} {2}" -f $mark, $c.name, $c.detail) -ForegroundColor $color
        }
    } elseif (-not $pass) {
        Write-Host ($out | Select-Object -First 5) -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==== SUMMARY ====" -ForegroundColor White
$failed = $results | Where-Object { -not $_.Pass }
$results | ForEach-Object { $m = if ($_.Pass) { "PASS" } else { "FAIL" }; $col = if ($_.Pass) { "Green" } else { "Red" }; Write-Host ("[{0}] {1}" -f $m, $_.Test) -ForegroundColor $col }
if ($failed.Count -eq 0) { Write-Host "ALL GREEN ($($results.Count) tests)" -ForegroundColor Green; exit 0 }
else { Write-Host "$($failed.Count)/$($results.Count) FAILED" -ForegroundColor Red; exit 1 }
