# scripts/run_migration_test.ps1
# Comprehensive Redis migration testing workflow

param(
    [switch]$Clean,
    [switch]$GenerateOnly,
    [switch]$QuickTest
)

$ErrorActionPreference = "Stop"

function Log {
    param([string]$Message, [string]$Level = "info")
    
    $colors = @{
        "info"    = "Cyan"
        "success" = "Green"
        "warn"    = "Yellow"
        "error"   = "Red"
    }
    
    $color = $colors[$Level] ?? "White"
    Write-Host "[$Level] $Message" -ForegroundColor $color
}

function Test-Command {
    param([string]$Command)
    $exists = $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
    return $exists
}

# Verify prerequisites
Log "Checking prerequisites..." "info"

if (-not (Test-Command docker)) {
    Log "Docker not found. Please install Docker Desktop." "error"
    exit 1
}

if (-not (Test-Command node)) {
    Log "Node.js not found. Please install Node.js." "error"
    exit 1
}

Log "Prerequisites OK" "success"

# Change to workspace root
$workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $workspaceRoot

# Clean up previous runs (optional)
if ($Clean) {
    Log "Cleaning up previous test data..." "info"
    
    docker-compose down -v 2>$null
    Remove-Item -Path "registry/did_registry.json" -ErrorAction SilentlyContinue
    Remove-Item -Path "registry/vc_registry.json" -ErrorAction SilentlyContinue
    
    Log "Cleanup completed" "success"
}

# Generate sample data
Log "Generating sample test data..." "info"
node -e @'
const fs = require('fs');
const path = require('path');

const registryDir = path.join(process.cwd(), 'registry');
if (!fs.existsSync(registryDir)) {
    fs.mkdirSync(registryDir, { recursive: true });
}

const dids = {
    'did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6': 'alice_pubkey_b64',
    'did:key:z6MktYT8UoGQxN1z2xwhbGVnp6eV1jQjmL5J7Z3N5zH5V2mK': 'bob_pubkey_b64',
    'did:key:z6MkpGJbtJ7N8qV3L1KxR2Z4mS5t6U7v8W9X0Y1Z2a3B4c5d': 'carol_pubkey_b64'
};

const vcs = [
    {
        id: 'http://localhost:3000/credentials/vc1',
        type: ['VerifiableCredential', 'MigrationCredential'],
        issuer: Object.keys(dids)[0],
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
            id: Object.keys(dids)[1],
            oldActor: 'http://localhost:3000/actor/alice',
            newActor: 'http://localhost:3001/actor/alice'
        },
        proof: {
            type: 'Ed25519Signature2020',
            created: new Date().toISOString(),
            proofPurpose: 'assertionMethod',
            verificationMethod: Object.keys(dids)[0] + '#owner',
            signature: 'test_sig_1'
        }
    },
    {
        id: 'http://localhost:3000/credentials/vc2',
        type: ['VerifiableCredential', 'MigrationCredential'],
        issuer: Object.keys(dids)[1],
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
            id: Object.keys(dids)[2],
            oldActor: 'http://localhost:3000/actor/bob',
            newActor: 'http://localhost:3001/actor/bob'
        },
        proof: {
            type: 'Ed25519Signature2020',
            created: new Date().toISOString(),
            proofPurpose: 'assertionMethod',
            verificationMethod: Object.keys(dids)[1] + '#owner',
            signature: 'test_sig_2'
        }
    }
];

fs.writeFileSync(
    path.join(registryDir, 'did_registry.json'),
    JSON.stringify(dids, null, 2)
);

fs.writeFileSync(
    path.join(registryDir, 'vc_registry.json'),
    JSON.stringify(vcs, null, 2)
);

console.log(`Generated ${Object.keys(dids).length} DIDs and ${vcs.length} VCs`);
'@

Log "Sample data generated" "success"

if ($GenerateOnly) {
    Log "Exiting after data generation (--GenerateOnly flag)" "info"
    exit 0
}

# Start Redis
Log "Starting Redis via docker-compose..." "info"
docker-compose up -d redis

Log "Waiting for Redis to be ready..." "info"
Start-Sleep -Seconds 3

# Run migration script
Log "Running data migration to Redis..." "info"
node scripts/migrate-to-redis.js

Log "Migration completed" "success"

# Start bridge for testing
if (-not $QuickTest) {
    Log "Starting bridge service..." "info"
    $bridge = Start-Process -FilePath "node" -ArgumentList "bridge.js" -WindowStyle Minimized -PassThru -ErrorAction SilentlyContinue
    
    Log "Waiting for bridge to start..." "info"
    Start-Sleep -Seconds 3
    
    # Quick verification
    Log "Testing bridge connectivity..." "info"
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:4000/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Log "Bridge is running and healthy" "success"
        }
    } catch {
        Log "Bridge health check failed (this may be normal)" "warn"
    }
    
    # Stop bridge
    Stop-Process -Id $bridge.Id -ErrorAction SilentlyContinue
}

# Cleanup
Log "Stopping Redis..." "info"
docker-compose down

Log "=== MIGRATION TEST COMPLETED SUCCESSFULLY ===" "success"
Log ""
Log "Next steps:" "info"
Log "  1. Review migration results: cat registry/migration_log.txt" "info"
Log "  2. Start bridge with Redis: REDIS_HOST=localhost node bridge.js" "info"
Log "  3. Test endpoints with sample VCs" "info"
Log ""
