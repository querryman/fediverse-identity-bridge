# run_multi.ps1
# Runs the multi-federation test (circular migration flow)

Write-Host "=== Running Multi-Federation Test ===" -ForegroundColor Cyan

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $root
Set-Location $projectRoot

Write-Host "Executing multi-federation test..."
Write-Host ""

# Run the specific test file directly with mocha (avoid glob pattern)
npx mocha tests/multi_federation.test.js --timeout 30000

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== Multi-Federation Test Passed ===" -ForegroundColor Green
} else {
    Write-Host "`n=== Multi-Federation Test Failed ===" -ForegroundColor Red
    exit $LASTEXITCODE
}
