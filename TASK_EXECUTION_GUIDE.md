# Task Execution Template & Examples

This document provides:
1. A **Task Card Template** for tracking individual tasks
2. **Example Task Cards** for high-complexity tasks
3. **Checklist patterns** for sub-tasks

Use this when executing each task from the implementation plan.

---

## Task Card Template

```
# Task [NUMBER].[LETTER]: [Title]

**Phase:** [Week N]  
**Risk Level:** [HIGH/MEDIUM/LOW]  
**Estimated Duration:** [Xd]  
**Dependency On:** [Task X.Y, Task X.Z]  
**Blocks:** [Task X.Y, Task X.Z]  

## Summary
[2-3 sentence description of what this task accomplishes]

## Current State
[Describe how it works now, with code pointers]

## Target State
[Describe how it should work after this task]

## Files to Modify
- [ ] [path/file.js](path/file.js) — [scope of change]
- [ ] [path/file2.js](path/file2.js) — [scope of change]

## Files to Create
- [ ] [path/new-file.js](path/new-file.js) — [purpose]

## Implementation Checklist

### Subtask A: [Feature]
- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

### Subtask B: [Feature]
- [ ] Step 1
- [ ] Step 2
- [ ] Step 3

## Testing Checklist
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing on localhost
- [ ] Documentation updated
- [ ] Code review approved

## Success Criteria
1. [Specific, testable outcome]
2. [Specific, testable outcome]
3. [Specific, testable outcome]

## Risk Mitigation
**Risk:** [What could go wrong]
**Mitigation:** [How to prevent/handle it]

## Notes
- [Important context]
- [Decisions made]
- [Questions to resolve]

## Completed By
- [ ] Code implementation
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] Merged to main

---
**Status:** [NOT STARTED / IN PROGRESS / BLOCKED / COMPLETED]  
**Assigned To:** [Name]  
**Last Updated:** [Date]
```

---

## Example: Task 4.1 (HIGH-RISK TASK)

```
# Task 4.1: Introduce Redis Client Abstraction

**Phase:** Week 1 (Foundation)  
**Risk Level:** HIGH ⚠️  
**Estimated Duration:** 4 days  
**Dependency On:** None  
**Blocks:** Tasks 5.1, 6.1, 8.1, 1.1  

## Summary
Replace file-based JSON storage and in-memory Map caches with Redis. This enables horizontal scaling and state externalization. **This is a critical blocker for all verification work.**

## Current State
- `lib/storage.js` uses file-based JSON (registry/*.json)
- Bridge.js has in-memory Maps: VC_CACHE, REMOTE_CACHE, STATUS_CACHE
- All caching is lost on restart
- No TTL or expiration management
- File I/O is blocking

## Target State
- `lib/storage-redis.js` provides Redis-backed interface
- All VCs stored in Redis with 24h TTL
- All DIDs stored in Redis with 7d TTL
- In-memory caches removed from bridge.js
- Data persists and survives restarts
- Horizontal scaling possible

## Files to Modify
- [ ] [lib/storage.js](lib/storage.js) — Add Redis backend option (or fully replace)
- [ ] [bridge.js](bridge.js) — Remove VC_CACHE, REMOTE_CACHE, STATUS_CACHE Maps
- [ ] [bridge.js](bridge.js) — Update getCached/putCached to use Redis
- [ ] [bridge.js](bridge.js) — Import storage-redis instead of storage
- [ ] [package.json](package.json) — Add redis dependency

## Files to Create
- [ ] [lib/storage-redis.js](lib/storage-redis.js) — Redis storage backend
- [ ] [scripts/migrate-to-redis.js](scripts/migrate-to-redis.js) — Data migration tool

## Implementation Checklist

### Subtask 1: Create lib/storage-redis.js

**Setup Redis Client:**
- [ ] Import redis client library
- [ ] Configure host/port from env vars (REDIS_HOST, REDIS_PORT)
- [ ] Configure database number (REDIS_DB, default: 0)
- [ ] Configure namespace (REDIS_NAMESPACE, default: identity_bridge)
- [ ] Create async client connection pool

**Implement Core Functions (match existing storage.js interface):**
- [ ] `putVC(vc)` — Store VC with 24h TTL
  - [ ] Key: `{NS}:vc:{vc.id}`
  - [ ] Value: JSON.stringify(vc)
  - [ ] TTL: parseInt(process.env.REDIS_VC_TTL || 86400)
- [ ] `getVC(id)` — Retrieve VC by ID
  - [ ] Query key `{NS}:vc:{id}`
  - [ ] Return parsed JSON or null
- [ ] `putDid(did, publicKeyBase64)` — Store DID→publicKey mapping
  - [ ] Key: `{NS}:did:{did}`
  - [ ] Value: publicKeyBase64 (string)
  - [ ] TTL: parseInt(process.env.REDIS_DID_TTL || 604800)
- [ ] `getDid(did)` — Retrieve public key by DID
  - [ ] Query key `{NS}:did:{did}`
  - [ ] Return publicKeyBase64 or null

**Implement Index Functions:**
- [ ] `getVCsByIssuer(did)` — Get all VC IDs by issuer
  - [ ] Use SET type: `{NS}:vc:issuer:{did}`
  - [ ] Return array of VC IDs
- [ ] `getVCsByOldActor(actor)` — Get all VC IDs by old actor
  - [ ] Use SET type: `{NS}:vc:old_actor:{actor}`
  - [ ] Return array of VC IDs
- [ ] `getVCsByNewActor(actor)` — Get all VC IDs by new actor
  - [ ] Use SET type: `{NS}:vc:new_actor:{actor}`
  - [ ] Return array of VC IDs
- [ ] `getVCsBySubjectDid(did)` — Get all VC IDs by subject DID
  - [ ] Use SET type: `{NS}:vc:subject:{did}`
  - [ ] Return array of VC IDs

**Implement Indexing on Write:**
- [ ] When putVC() called, also index by issuer/oldActor/newActor/subject
  - [ ] SADD to index sets
  - [ ] Handle null/missing fields gracefully

**Export Module:**
- [ ] module.exports = { putVC, getVC, putDid, getDid, ... }

### Subtask 2: Update bridge.js to Use Redis

**Remove In-Memory Caches:**
- [ ] Delete `const VC_CACHE = new Map()`
- [ ] Delete `const REMOTE_CACHE = new Map()`
- [ ] Delete `const STATUS_CACHE = new Map()`
- [ ] Delete `getCached()` function
- [ ] Delete `putCached()` function
- [ ] Delete `MAX_AGE` constant

**Update Storage Initialization:**
- [ ] Change: `const storage = require('./lib/storage')`
- [ ] To: `const storage = require('./lib/storage-redis')`
- [ ] Add environment variable fallback for compatibility:
  ```javascript
  const storage = process.env.REDIS_HOST 
    ? require('./lib/storage-redis')
    : require('./lib/storage');
  ```

**Update fetchJSONWithCache():**
- [ ] Remove caching logic
- [ ] Keep HTTP fetch
- [ ] Add Redis caching after fetch:
  ```javascript
  async function fetchJSONWithCache(url, ttl = 300) {
    const cacheKey = `${NS}:http_cache:${url}`;
    const cached = await storage.getHttpCache(cacheKey);
    if (cached) return cached;
    
    const result = await fetch(url);
    const json = await result.json();
    
    await storage.setHttpCache(cacheKey, json, ttl);
    return json;
  }
  ```

**Update /verify endpoint:**
- [ ] Replace calls to getCached/putCached with Redis calls
- [ ] Ensure timeout handling (Redis should be fast)

**Update /migrate endpoint:**
- [ ] Ensure generated VC is stored in Redis via storage.putVC()

### Subtask 3: Update package.json

- [ ] Add dependency: `"redis": "^4.6.0"`
- [ ] Add development dependency: `"redis-mock": "^0.56.3"` (for testing)
- [ ] Run: `npm install`

### Subtask 4: Create scripts/migrate-to-redis.js

**Read Existing Data:**
- [ ] Load registry/vc_registry.json
- [ ] Load registry/did_registry.json
- [ ] Handle file not found gracefully

**Migrate VCs:**
- [ ] Loop through all VCs in vc_registry.json
- [ ] For each VC:
  - [ ] Call storage.putVC(vc)
  - [ ] Verify stored correctly with storage.getVC(vc.id)

**Migrate DIDs:**
- [ ] Loop through all DIDs in did_registry.json
- [ ] For each did→publicKey mapping:
  - [ ] Call storage.putDid(did, publicKey)
  - [ ] Verify stored correctly with storage.getDid(did)

**Log Results:**
- [ ] Log: "Migrated X VCs"
- [ ] Log: "Migrated Y DIDs"
- [ ] Log: "Migration complete" or error details

**Create Backup:**
- [ ] Copy old files to backup directory: registry-backup-<timestamp>/
- [ ] Keep old files until migration verified

### Subtask 5: Create .env Configuration

- [ ] Create .env.example with:
  ```
  REDIS_HOST=localhost
  REDIS_PORT=6379
  REDIS_DB=0
  REDIS_NAMESPACE=identity_bridge
  REDIS_VC_TTL=86400
  REDIS_DID_TTL=604800
  ```
- [ ] Document each variable

## Testing Checklist

### Unit Tests
- [ ] Test putVC() stores and retrieves VC correctly
- [ ] Test putDid() stores and retrieves DID correctly
- [ ] Test getVCsByIssuer() returns correct IDs
- [ ] Test getVCsByOldActor() returns correct IDs
- [ ] Test TTL expiration (mock time)
- [ ] Test graceful handling of missing keys
- [ ] Test key namespacing (no collisions)

### Integration Tests
- [ ] Start Redis in Docker
- [ ] Run bridge with REDIS_HOST=localhost
- [ ] Verify /migrate stores VC in Redis
- [ ] Verify /verify retrieves VC from Redis
- [ ] Verify caches work (second call is faster)
- [ ] Verify TTL expires correctly

### Manual Testing
- [ ] Start docker-compose (redis only)
  ```bash
  docker-compose up redis
  ```
- [ ] Run migration script
  ```bash
  node scripts/migrate-to-redis.js
  ```
- [ ] Verify data in Redis
  ```bash
  redis-cli
  > KEYS identity_bridge:*
  > GET identity_bridge:did:did:key:z4MXj1...
  ```
- [ ] Start bridge
  ```bash
  REDIS_HOST=localhost node bridge.js
  ```
- [ ] Test /migrate and /verify endpoints
- [ ] Kill bridge, restart, verify data persists

## Success Criteria

1. **Redis Backend Functional**
   - All VC and DID data stored in Redis
   - Keys follow namespace convention (identity_bridge:*)
   - TTLs set correctly (24h VCs, 7d DIDs)

2. **Bridge Works with Redis**
   - Bridge starts with REDIS_HOST env var
   - /migrate stores VCs in Redis
   - /verify retrieves from Redis
   - Responses identical to file-based version

3. **Horizontal Scaling Ready**
   - No in-memory state in bridge.js (except runtime)
   - Two bridge instances share same Redis
   - Data consistent across instances

4. **Data Migration Complete**
   - Migration script works without errors
   - Old data successfully moved to Redis
   - Backup created and verified
   - Data loss is zero

5. **Backwards Compatibility**
   - Bridge can still use file-based storage (fallback)
   - Environment variable controls backend
   - Tests pass with both backends

## Risk Mitigation

**Risk:** Data loss during migration

**Mitigation:**
1. Create comprehensive backup before migration
2. Run migration script on test environment first
3. Use migrate-to-redis.js to verify each VC/DID
4. Keep old files until new system validated
5. Implement rollback procedure (restore from backup)
6. Use Redis BGSAVE for snapshot backup before operations

---

**Risk:** Redis connection failures during operation

**Mitigation:**
1. Add connection retry logic with exponential backoff
2. Implement circuit breaker pattern
3. Log all connection errors to metrics
4. Add health check endpoint `/health/redis`
5. Document failure recovery procedure

---

**Risk:** TTL settings too aggressive (data expires too soon)

**Mitigation:**
1. Start with conservative TTLs (24h, 7d)
2. Monitor Redis memory and eviction
3. Add metrics for cache hit rate
4. Adjust TTLs based on usage patterns
5. Document TTL strategy in REDIS_OPERATIONS.md

---

**Risk:** Index keys accumulate memory usage

**Mitigation:**
1. Use Redis SET data type (efficient)
2. Set TTL on index keys matching VC TTL
3. Use Redis memory analysis tools
4. Monitor memory usage during operations
5. Implement cleanup script if needed

## Notes

- Redis persistence should be enabled (RDB or AOF)
- Use redis:7-alpine image for Docker (lightweight)
- Consider Redis Sentinel for HA in production
- Document connection pooling strategy
- Plan for Redis memory sizing based on VC volume

## Completed By

- [ ] lib/storage-redis.js created and tested
- [ ] bridge.js updated to use Redis
- [ ] package.json updated with redis dependency
- [ ] Migration script created and tested
- [ ] .env.example created with Redis config
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Manual testing complete
- [ ] Documentation updated
- [ ] Code review approved
- [ ] Merged to main branch

---

**Status:** NOT STARTED  
**Assigned To:** [TBD]  
**Last Updated:** January 15, 2026
```

---

## Example: Task 5.1 (MEDIUM-COMPLEXITY TASK)

```
# Task 5.1: Split Verification into Explicit Stages

**Phase:** Week 2 (Verification)  
**Risk Level:** MEDIUM ⚠️  
**Estimated Duration:** 4 days  
**Dependency On:** Task 4.1 (Redis)  
**Blocks:** Tasks 5.2, 5.3, 1.1, 10.2  

## Summary
Refactor `/verify` endpoint to explicitly separate verification into 5 stages with clear input/output and error codes. Each stage can fail independently and be audited.

## Current State
- `/verify` endpoint does all checks in one monolithic function
- Error handling is ad-hoc ("reason" string)
- No clear stage progression
- No audit trail per stage

## Target State
- 5-stage verification pipeline with explicit progression
- Each stage has: input, validation, output, error code
- Responses include stage-by-stage results
- Errors are structured codes (SCHEMA_INVALID, etc.)

## Files to Create
- [ ] [lib/verification-pipeline.js](lib/verification-pipeline.js) — Pipeline logic

## Files to Modify
- [ ] [bridge.js](bridge.js) — Integrate pipeline into endpoints
- [ ] [lib/error-codes.js](lib/error-codes.js) — Error code definitions (created with Task 5.2)

## Implementation Checklist

### Subtask 1: Create lib/verification-pipeline.js

**Define Stage Constants:**
- [ ] STAGE_SCHEMA = 'schema_validation'
- [ ] STAGE_ISSUER = 'issuer_resolution'
- [ ] STAGE_SIGNATURE = 'signature_verification'
- [ ] STAGE_REVOCATION = 'revocation_check'
- [ ] STAGE_LINEAGE = 'lineage_resolution'

**Implement Schema Validation Stage:**
- [ ] Function: `validateVCSchema(vc)`
- [ ] Checks:
  - [ ] vc exists
  - [ ] vc.@context includes credentials context
  - [ ] vc.type includes "VerifiableCredential"
  - [ ] vc.issuer exists
  - [ ] vc.credentialSubject exists
  - [ ] vc.credentialSubject.oldActor exists
  - [ ] vc.credentialSubject.newActor exists
- [ ] Returns: `{ ok: bool, errorCode: string, details: object }`

**Implement Issuer Resolution Stage:**
- [ ] Function: `async resolveIssuer(issuerDid)`
- [ ] Checks:
  - [ ] issuerDid is valid format (did:key:z...)
  - [ ] Query storage.getDid(issuerDid)
  - [ ] Public key found and valid
- [ ] Returns: `{ ok: bool, errorCode: string, publicKey: base64 }`
- [ ] Error codes:
  - [ ] ISSUER_NOT_FOUND (public key not in Redis)
  - [ ] ISSUER_KEY_EXPIRED (if timestamp available)

**Implement Signature Verification Stage:**
- [ ] Function: `async verifySignature(vc, publicKeyBase64)`
- [ ] Checks:
  - [ ] vc.proof exists
  - [ ] vc.proof.signature exists
  - [ ] vc.proof.type === "Ed25519Signature2020"
  - [ ] Call lib/vc.js:verifyMigrationVC(vc, publicKey)
- [ ] Returns: `{ ok: bool, errorCode: string }`
- [ ] Error codes:
  - [ ] SIGNATURE_INVALID
  - [ ] SIGNATURE_ALGO_UNSUPPORTED

**Implement Revocation Check Stage:**
- [ ] Function: `async checkRevocation(actor, vcId)`
- [ ] Checks:
  - [ ] Fetch {actor}/migration/status
  - [ ] Check: status[vcId].revoked === true
- [ ] Returns: `{ ok: bool, errorCode: string }`
- [ ] Error codes:
  - [ ] REVOCATION_REVOKED
  - [ ] REVOCATION_CHECK_FAILED (network error)

**Implement Lineage Resolution Stage:**
- [ ] Function: `async resolveLineage(oldActor)`
- [ ] Checks:
  - [ ] Call lib/lineage.js:resolveLineage(oldActor)
  - [ ] Check for issues array
- [ ] Returns: `{ ok: bool, errorCode: string, chain: [...], issues: [...] }`
- [ ] Error codes:
  - [ ] LINEAGE_CYCLE
  - [ ] LINEAGE_FORK
  - [ ] LINEAGE_HOP_LIMIT

**Implement Pipeline Orchestrator:**
- [ ] Function: `async verifyWithStages(vc, options = {})`
- [ ] Steps:
  1. [ ] Stage 1: Schema validation
     - [ ] If fails and !continueOnError, stop
     - [ ] Otherwise, add to results
  2. [ ] Stage 2: Issuer resolution
     - [ ] If fails and !continueOnError, stop
     - [ ] Extract publicKey for next stage
  3. [ ] Stage 3: Signature verification (uses publicKey from stage 2)
     - [ ] If fails and !continueOnError, stop
  4. [ ] Stage 4: Revocation check
     - [ ] If fails and !continueOnError, stop
  5. [ ] Stage 5: Lineage resolution
     - [ ] Always run (chain analysis important)
- [ ] Returns: `{ stages: [...], valid: bool, reason: string }`

### Subtask 2: Update bridge.js /verify Endpoint

- [ ] Import verification-pipeline module
- [ ] Update `/verify` POST handler:
  ```javascript
  app.post('/verify', async (req, res) => {
    const { vc } = req.body;
    const pipeline = await verifyWithStages(vc);
    
    const valid = pipeline.stages.every(s => s.valid);
    const reason = pipeline.stages.find(s => !s.valid)?.errorCode || null;
    
    res.json({
      valid,
      reason,
      stages: pipeline.stages
    });
  });
  ```

### Subtask 3: Add /verify/detailed Endpoint

- [ ] Create new endpoint `/verify/detailed`
- [ ] Calls: `verifyWithStages(vc, { continueOnError: true })`
- [ ] Always returns all stages (no early exit)
- [ ] Used for debugging/audit trails

### Subtask 4: Add Latency Tracking

- [ ] In each stage, measure start/end time
- [ ] Stage result includes: `stageLatency: endTime - startTime`
- [ ] Overall result includes: `overallLatency: totalTime`
- [ ] Pass to metrics_logger (Task 5.3)

## Testing Checklist

### Unit Tests
- [ ] Test schema validation with valid VC
- [ ] Test schema validation with missing fields
- [ ] Test issuer resolution with valid DID
- [ ] Test issuer resolution with missing DID
- [ ] Test signature verification with valid signature
- [ ] Test signature verification with invalid signature
- [ ] Test revocation check with revoked VC
- [ ] Test revocation check with available status
- [ ] Test lineage resolution with valid chain
- [ ] Test lineage resolution with cycle
- [ ] Test pipeline orchestration (all stages)
- [ ] Test pipeline with continueOnError option

### Integration Tests
- [ ] Create valid VC with known keypair
- [ ] Sign it with Ed25519
- [ ] POST to /verify
- [ ] Verify response includes all 5 stages
- [ ] Verify stage order is correct
- [ ] Verify error codes match definitions

### Success Tests
- [ ] All stages return true for valid VC
- [ ] All stages return false for obviously invalid VC
- [ ] Pipeline aggregates results correctly
- [ ] Error codes are specific and useful

## Success Criteria

1. **Pipeline Functional**
   - 5 stages execute in order
   - Each stage has clear input/output
   - Stages can be audited independently

2. **Error Codes Used**
   - No generic error messages
   - All errors mapped to code constants
   - Error codes are machine-readable

3. **Response Format**
   - `/verify` returns: { valid, reason, stages }
   - `stages` array includes all 5 items
   - Each stage has: stage, valid, errorCode, [optional details]

4. **Backwards Compatible**
   - Existing clients can still parse valid/reason
   - New clients can use stages for details
   - No breaking changes to happy path

5. **Performance**
   - Pipeline latency < 500ms for valid VCs
   - Each stage latency logged
   - No N+1 queries

## Risk Mitigation

**Risk:** Changes to response format break existing clients

**Mitigation:**
1. Ensure response still includes `valid` and `reason`
2. Add stages as new field (additive change)
3. Provide migration guide for clients
4. Consider API versioning (v1/v2)

---

**Risk:** Some VCs incorrectly marked invalid by stricter validation

**Mitigation:**
1. Run in audit mode first (log all failures, don't reject)
2. Collect metrics on what would fail
3. Review why VCs fail (are they actually invalid?)
4. Adjust schema validation if needed

## Notes

- Keep schema validation lenient at first
- Can add stricter validation later
- Document failure rate and reasons
- Consider temporary allow-list for known good VCs

## Completed By

- [ ] lib/verification-pipeline.js created
- [ ] All 5 stages implemented and tested
- [ ] bridge.js /verify endpoint updated
- [ ] /verify/detailed endpoint added
- [ ] Error codes integrated
- [ ] Latency tracking added
- [ ] Unit tests pass (100% stage coverage)
- [ ] Integration tests pass
- [ ] Code review approved

---

**Status:** NOT STARTED  
**Assigned To:** [TBD]  
**Last Updated:** January 15, 2026
```

---

## Checklist for Simple Task (Low Risk)

```
# Task 1.2: Bridge Localhost-Only Binding

**Phase:** Week 3 (Integration)  
**Risk Level:** LOW ✅  
**Estimated Duration:** 0.5 days  
**Dependency On:** None  
**Blocks:** None  

## Summary
Change bridge to listen on 127.0.0.1:4000 instead of 0.0.0.0:4000.

## Quick Checklist
- [ ] Update bridge.js: `app.listen(PORT, '127.0.0.1')`
- [ ] Add env var: BRIDGE_NETWORK (default: 127.0.0.1)
- [ ] Test: Bridge does not accept remote connections
- [ ] Document: Sidecar network isolation
- [ ] Update docker-compose: Expose port internally only

## Testing
- [ ] Start bridge
- [ ] `localhost:4000` works ✓
- [ ] `127.0.0.1:4000` works ✓
- [ ] `0.0.0.0:4000` does NOT work ✓
- [ ] `<IP>:4000` does NOT work ✓

**Status:** NOT STARTED
```

---

## How to Use These Templates

1. **Copy the template** for your assigned task
2. **Fill in all sections** (don't skip)
3. **Create a branch** with task number: `task/4.1-redis-storage`
4. **Track progress** by checking boxes as you go
5. **Update status** and complete checklist when done
6. **Submit for review** with task card completed

---

**End of Task Execution Guide**
