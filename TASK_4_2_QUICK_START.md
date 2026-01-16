# Task 4.2: Data Migration & Testing - Quick Start Guide

**Duration:** ~2-3 hours  
**Status:** READY FOR EXECUTION  
**Prerequisites:** Docker, Node.js, npm

---

## 🚀 TL;DR - Run This To Test Everything

```powershell
cd c:\workspace\fediverse-identity-bridge

# 1. Start Redis
docker-compose up -d redis
Start-Sleep -Seconds 2

# 2. Run migration
node scripts/migrate-to-redis.js

# 3. Validate
node scripts/validate-migration.js

# 4. Start bridge (in new terminal)
$env:REDIS_HOST = "localhost"
node bridge.js

# 5. Test endpoint (in another terminal)
curl http://localhost:4000/health

# 6. Stop everything
# Ctrl+C in bridge terminal
docker-compose down
```

**Expected success:** All scripts complete without errors + validation passes

---

## 📋 What's Been Created for Task 4.2

### Testing Scripts

1. **`scripts/quick-migration-test.js`** (NEW)
   - Pre-migration health check
   - Verifies test data, dependencies, migration script
   - Run: `node scripts/quick-migration-test.js`
   - Status: **✅ All systems ready (Redis offline is expected)**

2. **`scripts/validate-migration.js`** (NEW)
   - Post-migration verification
   - Counts DIDs and VCs in Redis
   - Spot-checks sample data
   - Run: `node scripts/validate-migration.js` (after migration)
   - Status: **✅ Ready to use**

3. **`scripts/test-redis-data-migration.js`** (NEW)
   - Comprehensive test suite
   - Generates test data, starts Redis, runs migration
   - Tests bridge endpoints
   - Run: `node scripts/test-redis-data-migration.js`
   - Status: **✅ Ready to use**

### Test Data

- **`registry/did_registry.json`** — 3 sample DIDs (alice, bob, carol)
- **`registry/vc_registry.json`** — 2 sample VCs (migration credentials)
- Status: **✅ Generated and ready**

### Infrastructure

- **`docker-compose.yml`** (from Task 4.1)
  - Redis 7-alpine with persistence
  - Status: **✅ Ready to use**

- **`.env.example`** (from Task 4.1)
  - Configuration template
  - Status: **✅ Ready to use**

### Documentation

- **`TASK_4_2_MIGRATION_TESTING.md`** (NEW)
  - Detailed 7-step testing procedure with expected outputs
  - Troubleshooting guide
  - Success criteria
  - Status: **✅ Complete**

- **`TASK_4_2_EXECUTION_LOG.md`** (NEW)
  - 4-phase execution plan with commands and expected output
  - Performance baseline procedure
  - Results archiving
  - Status: **✅ Complete**

---

## ✅ Pre-Flight Checklist

Before you start, verify:

- [ ] Docker Desktop is running: `docker ps`
- [ ] Node.js is installed: `node --version`
- [ ] Test data exists: `ls registry/did_registry.json registry/vc_registry.json`
- [ ] npm packages installed: `npm ls redis`
- [ ] Migration script exists: `ls scripts/migrate-to-redis.js`

---

## 🎯 Testing Phases

### Phase 1: Data Migration (15 min)
```powershell
docker-compose up -d redis
node scripts/migrate-to-redis.js
node scripts/validate-migration.js
```

**Success criteria:**
- ✅ Migration script completes
- ✅ Validation shows matching counts (3 DIDs, 2 VCs)
- ✅ No errors or missing data

---

### Phase 2: Bridge Integration (20 min)
```powershell
$env:REDIS_HOST = "localhost"
node bridge.js
```

In another terminal:
```powershell
curl http://localhost:4000/health
```

**Success criteria:**
- ✅ Bridge starts without errors
- ✅ Health endpoint responds (200 OK)
- ✅ Bridge logs show Redis connected

---

### Phase 3: Endpoint Testing (20 min)

Test each endpoint with sample requests.

**Success criteria:**
- ✅ POST /verify responds correctly
- ✅ GET /resolve/:did returns DID data
- ✅ GET /lineage/* returns chain info

---

### Phase 4: Cleanup (5 min)
```powershell
# Stop bridge (Ctrl+C)
docker-compose down
```

---

## 📊 Expected Results

### Migration Output
```
[migrate] ✓ Connected to Redis
[migrate] ✓ Loaded 2 VCs from file
[migrate] ✓ Loaded 3 DIDs from file
[migrate] ✓ Migrated 2 VCs to Redis
[migrate] ✓ Migrated 3 DIDs to Redis
[migrate] ✓ Migration completed successfully
```

### Validation Output
```
📊 Counting data in Redis...
  ✓ DIDs in Redis: 3
  ✓ VCs in Redis: 2

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

### Bridge Output
```
[bridge] Initializing bridge...
[bridge] Using storage backend: Redis (host=localhost)
[bridge] ✓ Loaded 3 DIDs
[bridge] Listening on http://localhost:4000
```

---

## 🐛 Common Issues & Fixes

### Redis won't start
```powershell
# Check if port 6379 is in use
netstat -ano | findstr :6379

# Clean restart
docker-compose down -v
docker-compose up -d redis
```

### Migration fails
```powershell
# Verify test data exists
cat registry/did_registry.json

# Verify redis-cli works
docker exec fediverse-identity-bridge-redis-1 redis-cli ping
# Should output: PONG
```

### Bridge can't connect to Redis
```powershell
# Verify REDIS_HOST is set
$env:REDIS_HOST
# Should output: localhost

# Test Redis is reachable
docker exec fediverse-identity-bridge-redis-1 redis-cli PING
```

---

## 📈 Performance Baseline

Once bridge is running, measure latency:

```powershell
# Simple latency test
$timer = [System.Diagnostics.Stopwatch]::StartNew()
for ($i=0; $i -lt 100; $i++) {
    curl -s http://localhost:4000/health | Out-Null
}
$timer.Stop()
Write-Host "100 requests in $($timer.ElapsedMilliseconds)ms = $([math]::Round(100000/$timer.ElapsedMilliseconds)) req/sec"
```

Expected: ~30-50 req/sec (single instance, simple health check)

---

## 🔄 Task 4.2 Sub-tasks

- ✅ **4.2.1:** Test data generation
- ✅ **4.2.2:** Migration validation script
- ⏳ **4.2.3:** Full end-to-end test execution (YOU ARE HERE)
- ⏳ **4.2.4:** Performance baseline measurement
- ⏳ **4.2.5:** Documentation & runbook

---

## 🎓 What Gets Validated

1. **Data Integrity** — All DIDs and VCs migrated correctly
2. **Redis Connectivity** — Bridge can connect and query Redis
3. **API Functionality** — All endpoints working with Redis backend
4. **No Data Loss** — File counts match Redis counts exactly
5. **Performance** — Baseline latency and throughput documented

---

## ✨ After Task 4.2 Passes

Once this task is complete, proceed to:

**Task 2.2: Actor-side Integration**
- Document unsigned VC workflow
- Create integration guide for actor nodes
- Provide code examples for signing VCs locally

---

## 📚 Related Files

- [lib/storage-redis.js](../lib/storage-redis.js) — Redis storage implementation
- [bridge.js](../bridge.js) — Updated bridge code
- [lib/vc-resolution.js](../lib/vc-resolution.js) — VC resolution module
- [docker-compose.yml](../docker-compose.yml) — Redis configuration

---

## 🚨 If Something Goes Wrong

1. Check logs:
   ```powershell
   docker-compose logs redis
   ```

2. Inspect data in Redis:
   ```powershell
   docker exec fediverse-identity-bridge-redis-1 redis-cli
   > KEYS *
   > SMEMBERS dids:keys
   > SMEMBERS vcs:keys
   > GET did:<did_string>
   ```

3. Full debug with verbose logging:
   ```powershell
   node scripts/migrate-to-redis.js 2>&1 | Tee-Object -FilePath "debug.log"
   ```

---

## 📝 Next Commands to Run

Copy and paste in order:

```powershell
# Terminal 1: Start Redis
docker-compose up -d redis

# Wait 2 seconds
Start-Sleep -Seconds 2

# Terminal 1: Run migration (watch for success)
node scripts/migrate-to-redis.js

# Terminal 1: Validate
node scripts/validate-migration.js

# Terminal 2: Start bridge
$env:REDIS_HOST = "localhost"
node bridge.js

# Terminal 3: Quick test
curl http://localhost:4000/health

# When done, stop everything:
# Press Ctrl+C in Terminal 2 (bridge)
docker-compose down  # Terminal 1
```

---

**Status:** Ready to execute  
**Difficulty:** ⭐ Low (mostly pre-built scripts)  
**Time:** ~1.5 hours of hands-on testing
