Write-Host "=== Running VC Chain Depth Benchmark ===" -ForegroundColor Cyan

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

$script = Join-Path $root "bench_chain_depth.js"

if (!(Test-Path $script)) {
    Write-Host "ERROR: bench_chain_depth.js not found" -ForegroundColor Red
    exit 1
}

Write-Host "Executing chain depth benchmark..."
node $script

Write-Host "`n=== Chain Benchmark Completed ==="

# Show latest result folder
$resultsRoot = Join-Path $root "results"
$latest = Get-ChildItem -Directory $resultsRoot |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($latest) {
    Write-Host "Latest chain results:" $latest.FullName -ForegroundColor Green
    Invoke-Item $latest.FullName
} else {
    Write-Host "No results found." -ForegroundColor Yellow
}
