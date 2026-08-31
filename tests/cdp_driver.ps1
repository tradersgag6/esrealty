param(
    [string]$TestFile,
    [string]$Url = "http://127.0.0.1:8931/index.html",
    [int]$NavDelayMs = 4500,
    [string]$WindowSize = "1400,900"
)

# Headless-Chrome e2e driver shim: forwards to the Node CDP client which
# produces a single JSON line on stdout for tests\run_all.ps1 to parse.

$driver = Join-Path $PSScriptRoot "cdp_driver_runner.js"
& node $driver -test-file $TestFile -url $Url -nav-delay-ms $NavDelayMs -window-size $WindowSize 2>$null
exit $LASTEXITCODE