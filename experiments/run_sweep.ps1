param(
    [switch]$Verbose,
    [switch]$NoArchive
)

Write-Host "=== Running Concurrency Sweep ===" -ForegroundColor Cyan

# Move to script directory
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

# Results root
$resultsRoot = Join-Path $root "results"
if (!(Test-Path $resultsRoot)) {
    New-Item -ItemType Directory -Path $resultsRoot | Out-Null
}

# Archive old results if requested
if (!$NoArchive) {
    $archiveRoot = Join-Path $root "archive"
    if (!(Test-Path $archiveRoot)) {
        New-Item -ItemType Directory -Path $archiveRoot | Out-Null
    }
    
    $oldSweeps = Get-ChildItem -Directory $resultsRoot -Filter "sweep_*" | 
                 Sort-Object LastWriteTime -Descending | 
                 Select-Object -Skip 1
    
    if ($oldSweeps) {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $archiveDir = Join-Path $archiveRoot "sweep_$timestamp"
        New-Item -ItemType Directory -Path $archiveDir | Out-Null
        
        foreach ($sweep in $oldSweeps) {
            Move-Item -Path $sweep.FullName -Destination $archiveDir -Force
        }
        Write-Host "Archived old sweeps to: $archiveDir" -ForegroundColor Gray
    }
}

Write-Host "Starting sweep..." -ForegroundColor Yellow

# Run the sweep script
$script = Join-Path $root "experiment_concurrency_sweep.js"

if ($Verbose) {
    & node $script
    $exitCode = $LASTEXITCODE
} else {
    & node $script 2>&1 | Out-Null
    $exitCode = $LASTEXITCODE
}

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "=== Sweep FAILED ===" -ForegroundColor Red
    Write-Host "Exit code: $exitCode" -ForegroundColor Red
    exit $exitCode
}

Write-Host ""
Write-Host "=== Sweep Completed ===" -ForegroundColor Green

# Find newest sweep results folder
$latest = Get-ChildItem -Directory $resultsRoot -Filter "sweep_*" |
          Sort-Object LastWriteTime -Descending |
          Select-Object -First 1

if ($null -eq $latest) {
    Write-Host "No results found." -ForegroundColor Red
    exit 1
}

Write-Host "Latest results: $($latest.FullName)" -ForegroundColor Cyan

# List files in results
Write-Host "Files:" -ForegroundColor Gray
Get-ChildItem -File $latest.FullName | ForEach-Object { 
    Write-Host "  - $($_.Name)" -ForegroundColor Gray 
}

# Try to open folder in Explorer (graceful failure)
try {
    Invoke-Item $latest.FullName
    Write-Host "Opened in Explorer." -ForegroundColor Green
} catch {
    Write-Host "Could not open Explorer. Results at: $($latest.FullName)" -ForegroundColor Yellow
}
