Write-Host "=== Running ALL Experiments ==="

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

# Global archive root
$archiveRoot = Join-Path $root "../archive"
if (!(Test-Path $archiveRoot)) {
    New-Item -ItemType Directory -Path $archiveRoot | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$batch = Join-Path $archiveRoot "batch_$timestamp"
New-Item -ItemType Directory -Path $batch | Out-Null

# Results directory (per experiment)
$resultsRoot = Join-Path $root "results"

# ---------------------------------------------------------
# Run Scaling
# ---------------------------------------------------------
Write-Host "`n→ Running Scaling Experiment..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File .\run_experiment.ps1

$latest = Get-ChildItem -Directory $resultsRoot |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item -Recurse -Force $latest.FullName (Join-Path $batch "scaling")

# ---------------------------------------------------------
# Run Federation
# ---------------------------------------------------------
Write-Host "`n→ Running Federation Experiment..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File .\run_multi.ps1

$latest = Get-ChildItem -Directory $resultsRoot |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item -Recurse -Force $latest.FullName (Join-Path $batch "federation")

# ---------------------------------------------------------
# Run Chain Benchmark
# ---------------------------------------------------------
Write-Host "`n→ Running Chain Benchmark..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File .\run_chain_benchmark.ps1

$latest = Get-ChildItem -Directory $resultsRoot |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item -Recurse -Force $latest.FullName (Join-Path $batch "chain")

# ---------------------------------------------------------
# Done
# ---------------------------------------------------------
Write-Host "`n=== ALL EXPERIMENTS COMPLETE ==="
Write-Host "Batch archived at: $batch"

Invoke-Item $batch
