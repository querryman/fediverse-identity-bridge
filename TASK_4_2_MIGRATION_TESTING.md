# TASK 4.2: Data Migration & Testing

**Status:** IN-PROGRESS  
**Objective:** Validate Redis migration and test bridge with Redis backend  
**Estimated Duration:** 4 hours  
**Priority:** CRITICAL (blocks production deployment)

---

## 📋 Task Breakdown

### ✅ Sub-task 4.2.1: Test Data Generation
**Status:** COMPLETED  
**Files Created:**
- `scripts/test-redis-data-migration.js` — Comprehensive test suite (390 lines)
- `scripts/run_migration_test.ps1` — PowerShell test launcher

**What it does:**
- Generates 3 sample DIDs (alice, bob, carol)
- Creates 2 sample VCs (migration credentials)
- Writes test data to `registry/did_registry.json` and `registry/vc_registry.json`
- Can be regenerated as needed for testing

**Sample test DIDs:**
```
did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6  (alice)
did:key:z6MktYT8UoGQxN1z2xwhbGVnp6eV1jQjmL5J7Z3N5zH5V2mK  (bob)
did:key:z6MkpGJbtJ7N8qV3L1KxR2Z4mS5t6U7v8W9X0Y1Z2a3B4c5d  (carol)
```

**Sample test VCs:**
- VC 1: Alice issuer → Bob migration (actor alice @ 3000 → 3001)
- VC 2: Bob issuer → Carol migration (actor bob @ 3000 → 3001)

---

### ✅ Sub-task 4.2.2: Migration Validation Script
**Status:** COMPLETED  
**Files Created:**
- `scripts/validate-migration.js` — Post-migration verification (120 lines)

**What it does:**
1. Loads DIDs and VCs from JSON files
2. Connects to Redis
3. Checks Redis health
4. Counts DIDs/VCs in Redis using SET operations
5. Spot-checks 3 samples from each type
6. Compares file counts vs Redis counts
7. Provides PASS/FAIL summary

**Test procedure:**
```powershell
# After running migration, validate:
node scripts/validate-migration.js
```

**Expected output:**
```
📈 VALIDATION SUMMARY
──────────────────────────────────────
File DIDs:        3
Redis DIDs:       3
Match:            ✓ YES

File VCs:         2
Redis VCs:        2
Match:            ✓ YES

✅ MIGRATION VALIDATED SUCCESSFULLY
```

---

## 🚀 Testing Procedure

### Step 1: Generate Sample Data
```powershell
cd c:\workspace\fediverse-identity-bridge

# Generate test data with sample VCs and DIDs
node scripts/test-redis-data-migration.js --generate-only
```

**Expected output:**
- `registry/did_registry.json` — 3 sample DIDs
- `registry/vc_registry.json` — 2 sample VCs

---

### Step 2: Start Redis
```powershell
# Start Redis via docker-compose
docker-compose up -d redis

# Verify Redis is running
docker-compose ps
```

**Expected output:**
```
NAME        COMMAND              STATE
redis       redis-server --aof   Up 2 seconds
```

---

### Step 3: Run Migration
```powershell
# Migrate file-based data to Redis
node scripts/migrate-to-redis.js
```

**Expected output:**
```
[migrate] Starting migration from file to Redis...
[migrate] Initializing Redis connection...
[migrate] ✓ Connected to Redis
[migrate] Loading file-based data...
[migrate] ✓ Loaded 2 VCs from file
[migrate] ✓ Loaded 3 DIDs from file
...
[migrate] ✓ Migrated 2 VCs to Redis
[migrate] ✓ Migrated 3 DIDs to Redis
[migrate] ✓ Created backup at registry/backup-1735104000000/
[migrate] ✓ Migration completed successfully
```

---

### Step 4: Validate Migration
```powershell
# Verify data in Redis
node scripts/validate-migration.js
```

**Expected output:**
```
📁 Loading file-based data...
  ✓ File contains 2 VCs and 3 DIDs

🔄 Connecting to Redis...
  ✓ Connected to Redis

🏥 Checking Redis health...
  ✓ Connected: true
  ✓ Redis version: 7.0.0

📊 Counting data in Redis...
  ✓ DIDs in Redis: 3
  ✓ VCs in Redis: 2

🔍 Spot-checking samples...
  ✓ DID found: did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N...
  ✓ VC found: http://localhost:3000/credentials/vc1...

📈 VALIDATION SUMMARY
──────────────────────────────────────
File DIDs:        3
Redis DIDs:       3
Match:            ✓ YES

File VCs:         2
Redis VCs:        2
Match:            ✓ YES

✅ MIGRATION VALIDATED SUCCESSFULLY
```

---

### Step 5: Test Bridge with Redis
```powershell
# Start bridge with Redis backend
$env:REDIS_HOST = "localhost"
node bridge.js
```

**Bridge startup log:**
```
[bridge] Initializing with Redis backend...
[bridge] Using storage: redis (host=localhost)
[bridge] Endpoints:
  POST /migrate      — Returns unsigned migration VC
  POST /store        — Stores signed migration VC
  POST /verify       — Verifies stored VC
  GET  /lineage/*    — Resolves identity chain
  GET  /resolve/:did — Resolves DID
[bridge] Listening on http://localhost:4000
```

---

### Step 6: Test Bridge Endpoints
In a separate terminal:

```powershell
# Test 1: Verify endpoint (with test VC)
$testVC = @{
    id = "http://test/vc/1"
    type = @("VerifiableCredential", "MigrationCredential")
    issuer = "did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6"
    credentialSubject = @{
        id = "did:key:z6MktYT8UoGQxN1z2xwhbGVnp6eV1jQjmL5J7Z3N5zH5V2mK"
        oldActor = "http://localhost:3000/actor/alice"
        newActor = "http://localhost:3001/actor/alice"
    }
    proof = @{
        type = "Ed25519Signature2020"
        signature = "test_signature_base64"
    }
}

$body = $testVC | ConvertTo-Json
Invoke-WebRequest `
  -Uri "http://localhost:4000/verify" `
  -Method POST `
  -Body $body `
  -ContentType "application/json" | Select-Object -ExpandProperty Content
```

**Expected response:**
```json
{
  "valid": true,
  "reason": "VC signature verified",
  "issuer": "did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6",
  "subject": "did:key:z6MktYT8UoGQxN1z2xwhbGVnp6eV1jQjmL5J7Z3N5zH5V2mK"
}
```

---

### Step 7: Stop Services
```powershell
# Stop bridge (Ctrl+C in bridge terminal)

# Stop Redis
docker-compose down
```

---

## 📊 Migration Checklist

- [ ] Step 1: Sample data generated (3 DIDs, 2 VCs)
- [ ] Step 2: Redis container running (`docker ps` shows redis)
- [ ] Step 3: Migration script completed without errors
- [ ] Step 4: Validation passed (✅ MIGRATION VALIDATED SUCCESSFULLY)
- [ ] Step 5: Bridge started with `REDIS_HOST` env var set
- [ ] Step 6: Bridge health check responds (GET /health → 200 OK)
- [ ] Step 7: Endpoints tested successfully
  - [ ] POST /verify returns valid status
  - [ ] POST /store accepts and stores VC
  - [ ] GET /resolve/:did returns DID data
- [ ] Step 8: Services shut down cleanly

---

## 🐛 Troubleshooting

### Redis fails to start
```powershell
# Check if port 6379 is already in use
netstat -ano | findstr :6379

# If in use, kill process
taskkill /PID <PID> /F

# Rebuild Redis container
docker-compose down -v
docker-compose up -d redis
```

### Migration script fails
```powershell
# Check Redis connectivity manually
redis-cli ping

# Check file permissions on registry/
Get-Item registry/ -Attributes

# Verify JSON syntax in registry files
node -e "console.log(JSON.parse(require('fs').readFileSync('registry/did_registry.json')))"
```

### Bridge won't start with Redis
```powershell
# Check REDIS_HOST is set
$env:REDIS_HOST
# Output should be: localhost

# Check bridge error logs
node bridge.js 2>&1 | Select-Object -First 20

# Verify bridge can connect to Redis
node -e "const s = require('./lib/storage-redis'); s.initClient().then(() => console.log('✓ Connected')).catch(e => console.error('✗', e.message))"
```

### Validation shows mismatched counts
```powershell
# Check what was actually migrated
redis-cli

# In redis-cli:
SCARD dids:keys
SCARD vcs:keys
KEYS *

# Check file data
Get-Content registry/did_registry.json | ConvertFrom-Json | Get-Member -Type NoteProperty | Measure-Object
Get-Content registry/vc_registry.json | ConvertFrom-Json | Get-Member -Type NoteProperty | Measure-Object
```

---

## 📝 Success Criteria

✅ **All of the following must be true:**

1. **Migration script completes** without errors
2. **Validation passes** with matching counts (file DIDs = Redis DIDs, file VCs = Redis VCs)
3. **Redis connectivity** confirmed (health check passes)
4. **Bridge starts** with `REDIS_HOST` env var
5. **Endpoints respond** to test requests
6. **No data loss** (all items migrated)
7. **No duplication** (counts match exactly)

---

## 🔄 Next Steps After Passing

Once Task 4.2 passes, we proceed to:

1. **Task 2.2: Actor-side Integration** — Update actor nodes to use unsigned VC + signing workflow
2. **Task 5.1: Chain Depth Verification** — Add loop detection and depth limits
3. **Task 3.1: Multi-server Coordination** — Enable federation across multiple bridge instances

---

## 📚 Related Documentation

- [Redis Storage Backend](../lib/storage-redis.js) — Production Redis implementation
- [VC Resolution](../lib/vc-resolution.js) — Dual-strategy resolution module
- [Bridge Refactoring](../bridge.js) — Updated endpoints and Redis integration
- [Docker Setup](../docker-compose.yml) — Redis container configuration

---

## 🎯 Current Status

**Task 4.2 Progress:**
- ✅ Sub-task 4.2.1: Test data generation
- ✅ Sub-task 4.2.2: Migration validation script
- ⏳ Sub-task 4.2.3: Full end-to-end test execution
- ⏳ Sub-task 4.2.4: Performance baseline measurement
- ⏳ Sub-task 4.2.5: Documentation & runbook

**Ready for:** Testing and execution

---

*Last Updated: 2024-12-25*  
*Task Owner: @agent*  
*Status: IN-PROGRESS*
