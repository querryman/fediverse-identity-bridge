param(
    [int]$Requests = 1000,
    [int]$Concurrency = 20
)

Write-Host "=== Running Scaling Experiment ==="

# Ensure correct folder
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

# Paths
$results = Join-Path $root "results"
$archiveRoot = Join-Path $root "archive"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$archiveDir = Join-Path $archiveRoot "scaling_$timestamp"

# -----------------------------------------------------------
# 1. Archive old results instead of deleting (prevents lock errors)
# -----------------------------------------------------------
if (Test-Path $results) {
    Write-Host "Archiving old results → $archiveDir"
    if (!(Test-Path $archiveRoot)) { New-Item -ItemType Directory -Path $archiveRoot | Out-Null }
    Copy-Item -Recurse -Force $results $archiveDir
    Start-Sleep -Milliseconds 200
    Remove-Item -Recurse -Force $results
}

# -----------------------------------------------------------
# 2. Create new results folder
# -----------------------------------------------------------
New-Item -ItemType Directory -Path $results | Out-Null

# -----------------------------------------------------------
# 3. Pass experiment parameters to Node
# -----------------------------------------------------------
$env:REQUESTS = $Requests
$env:CONCURRENCY = $Concurrency

Write-Host "Starting experiment_scaling.js with $Requests requests and concurrency=$Concurrency"

# -----------------------------------------------------------
# 4. Run experiment
# -----------------------------------------------------------
node .\experiment_scaling.js

Write-Host "`n=== Experiment Completed ==="
Write-Host "Results saved in: $results"

# -----------------------------------------------------------
# 5. Open results folder (Windows-safe)
# -----------------------------------------------------------
if (Test-Path $results) {
    Write-Host "Opening results folder..."
}
