# Fediverse Identity Bridge — Production Evolution Plan

**Date:** January 15, 2026  
**Status:** Blueprint / Planning Phase  
**Target:** User-centric, sidecar-compatible, production-aligned architecture  

---

## Executive Summary

This document outlines a structured, phased evolution of the FIB codebase from research prototype to production-ready sidecar service. The plan:

- **Decouples user key ownership** from bridge/server infrastructure
- **Enforces verification at ingress** (server inbox must validate before state changes)
- **Externalizes all state** to Redis for horizontal scaling
- **Hardenes the verification pipeline** with explicit stages and deterministic error codes
- **Integrates FEP-521 HTTP signatures** consistently across federation
- **Enables sidecar deployment** via Docker and environment isolation

---

## Dependency Graph Overview

```
Foundation Layer (Week 1)
├─ Task 1.1: Storage abstraction → Redis client
├─ Task 2.1: Refactor /migrate to unsigned payload
└─ Task 6.1: Centralize HTTP signature handling

Verification Layer (Week 2)
├─ Task 5.1: Split verification pipeline stages
├─ Task 5.2: Structured error codes
├─ Task 4.1: Lineage resolution refactor
└─ Task 4.2: Revocation enforcement per hop

Integration Layer (Week 3)
├─ Task 1.2: Server inbox validation hook
├─ Task 1.3: Bridge-only localhost binding
├─ Task 3.1: Remove in-memory caches from bridge
└─ Task 6.2: Enforce signature verification on all federation requests

Deployment Layer (Week 4)
├─ Task 7.1: Docker configuration
├─ Task 7.2: Environment variable framework
├─ Task 9.1: Trust model documentation
└─ Task 8.1: Artifact cleanup

Security & Hardening (Week 5)
├─ Task 9.2: Code-enforced trust model
├─ Task 5.3: Latency & outcome logging
└─ Task 3.2: Redis persistence strategy
```

---

## PHASE 1: ARCHITECTURE SHIFTS

### Task Group 1: Sidecar Integration & Server Coupling

#### **Task 1.1: Introduce Bridge Validation Hook in Server Inbox**

**Category:** Architecture (Breaking Change)

**Current State:**
- `server.js` accepts Move activities without consulting bridge
- No validation gate before migration state changes
- Bridge exists as separate verification service

**Target State:**
- Server inbox handler forwards Move payload to bridge `/verify`
- Migration only proceeds if `valid === true`
- Cryptographic failures are logged and rejected

**Files to Modify:**
- [server.js](server.js) — Update inbox handler for Move activities

**Implementation Steps:**
1. Add `BRIDGE_URL` environment variable (default: `http://localhost:4000`)
2. In inbox handler, detect `type: "Move"` activities
3. Extract migration VC from activity payload
4. POST to `bridge:4000/verify` with timeout (5s)
5. If verification fails, reject with 401/403 and log reason
6. If verification passes, proceed with migration logic

**Code Changes (pseudocode):**
```javascript
// In server.js inbox handler
if (activity.type === 'Move') {
  const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:4000';
  try {
    const verifyResp = await fetch(`${bridgeUrl}/verify`, {
      method: 'POST',
      body: JSON.stringify({ vc: activity.object }),
      timeout: 5000
    });
    const result = await verifyResp.json();
    if (!result.valid) {
      return res.status(403).json({ error: 'Migration verification failed', reason: result.reason });
    }
  } catch (e) {
    return res.status(503).json({ error: 'Bridge unreachable', details: e.message });
  }
  // Proceed with migration...
}
```

**Dependency:** Requires Task 5.1 (structured error codes)

**Breaking Change:** ✅ YES
- Server no longer accepts Move activities without bridge validation
- Existing move handlers will fail until bridge is running

---

#### **Task 1.2: Bridge Localhost-Only Binding**

**Category:** Architecture (Safe Addition)

**Current State:**
- Bridge listens on `0.0.0.0:4000` (publicly accessible)
- No network isolation

**Target State:**
- Bridge listens on `127.0.0.1:4000` only
- Only localhost/sidecar requests accepted
- Explicit whitelist for internal-only endpoints

**Files to Modify:**
- [bridge.js](bridge.js) — Update Express listen()

**Implementation Steps:**
1. Change `app.listen(PORT)` to `app.listen(PORT, '127.0.0.1')`
2. Add optional `BRIDGE_NETWORK` env var (default: `127.0.0.1`, allow override for testing)
3. Add documentation warning not to expose port publicly

**Code Changes (pseudocode):**
```javascript
const BRIDGE_HOST = process.env.BRIDGE_NETWORK || '127.0.0.1';
const PORT = process.env.BRIDGE_PORT || 4000;

app.listen(PORT, BRIDGE_HOST, () => {
  console.log(`Bridge listening on ${BRIDGE_HOST}:${PORT} (sidecar mode)`);
});
```

**Dependency:** No direct dependencies

**Breaking Change:** ✅ YES (if currently accessed from remote)
- External clients cannot reach bridge after this change
- Requires explicit port-mapping or sidecar co-location

---

#### **Task 1.3: Environment-Based Server-Bridge Coupling**

**Category:** Architecture (Safe Addition)

**Current State:**
- Hard-coded port assumptions (3000 for server, 4000 for bridge)
- No explicit service discovery

**Target State:**
- `BRIDGE_URL` environment variable controls server→bridge communication
- Supports local sidecar, container, or network scenarios
- Documented deployment patterns

**Files to Modify:**
- [server.js](server.js) — Use `BRIDGE_URL` env var
- [bridge.js](bridge.js) — Export `BRIDGE_PORT` env var

**Implementation Steps:**
1. In `server.js`: Add `const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:4000'`
2. In `bridge.js`: Add `const BRIDGE_PORT = process.env.BRIDGE_PORT || 4000`
3. Document in README: sidecar deployment patterns

**Dependency:** No direct dependencies

**Breaking Change:** ❌ NO
- Backward compatible with defaults

---

### Task Group 2: User-Centric Key Ownership

#### **Task 2.1: Refactor /migrate Endpoint → Unsigned VC Payload**

**Category:** Architecture + Security (Breaking Change)

**Current State:**
- `/migrate` endpoint requires `issuerPrivatePem` from server
- Server signs the VC server-side
- Private key exposure in request/response

**Target State:**
- `/migrate` endpoint returns **unsigned VC payload only**
- Client is responsible for signing with its own Ed25519 private key
- Bridge never handles private keys
- Client submits signed VC back via `/verify` or new `/store` endpoint

**Files to Modify:**
- [bridge.js](bridge.js) — Update `/migrate` endpoint
- [server.js](server.js) — Update `/actor/:username/migrate` endpoint
- [lib/vc.js](lib/vc.js) — Separate VC generation from signing

**Implementation Steps:**

1. **In `lib/vc.js`:** Create new `createMigrationVCUnsigned()` function
   ```javascript
   async function createMigrationVCUnsigned({
     issuerDid,
     subjectDid,
     oldActor,
     newActor
   }) {
     // Returns VC WITHOUT proof field
     // Client will add proof locally
   }
   ```

2. **In `bridge.js` /migrate endpoint:**
   ```javascript
   app.post('/migrate', async (req, res) => {
     const { issuerDid, subjectDid, oldActor, newActor } = req.body;
     // Validate all required
     const vc = await createMigrationVCUnsigned({...});
     return res.json(vc); // Unsigned, ready for client signing
   });
   ```

3. **In `server.js` /actor/:username/migrate endpoint:**
   ```javascript
   app.get('/actor/:username/migrate', async (req, res) => {
     const user = users[req.params.username];
     if (!user) return res.status(404).json({ error: 'User not found' });
     
     // Forward to bridge to get unsigned VC
     const bridgeResp = await fetch(`${BRIDGE_URL}/migrate`, {
       method: 'POST',
       body: JSON.stringify({
         issuerDid: user.did,
         subjectDid: user.did,
         oldActor: user.actorUrl,
         newActor: req.body.newActor // Client must provide
       })
     });
     const unsignedVc = await bridgeResp.json();
     
     // Return to client for signing
     return res.json({
       unsignedVc,
       instruction: 'Sign this VC locally with your Ed25519 private key, then POST to /verify'
     });
   });
   ```

4. **New endpoint `/store` in bridge** (complements existing `/verify`):
   ```javascript
   app.post('/store', async (req, res) => {
     const { vc } = req.body;
     // Verify signature (client-signed)
     const pubKey = await getBase64FromDid(vc.issuer);
     const valid = await verifyMigrationVC(vc, pubKey);
     if (!valid) return res.status(400).json({ error: 'Invalid signature' });
     
     // Store in Redis
     await storage.putVC(vc);
     return res.json({ id: vc.id, stored: true });
   });
   ```

**Security Implications:**
- ✅ Private keys never leave client
- ✅ Server cannot forge migration credentials
- ✅ Bridge acts as neutral verifier only

**Dependency:** Requires Task 3.1 (Redis storage)

**Breaking Change:** ✅ YES
- `/migrate` response format changes completely
- Clients must implement local signing
- New client workflow required

---

#### **Task 2.2: Update Actor Document with Migration Endpoint Discovery**

**Category:** Security (Safe Addition)

**Current State:**
- Actor document has no indication of migration capability or VC endpoint

**Target State:**
- Actor document exposes:
  - `did` (DID:key identifier)
  - `credentialEndpoint` or `migrationEndpoint` (for discovery)

**Files to Modify:**
- [server.js](server.js) — Update `/actor/:username` response

**Implementation Steps:**
1. In actor document endpoint, add fields:
   ```javascript
   {
     "@context": [...],
     id: actorUrl,
     type: "Person",
     did: user.did,
     credentialEndpoint: `${actorUrl}/migrate`,
     ...existing fields
   }
   ```

**Dependency:** Requires Task 2.1

**Breaking Change:** ❌ NO
- Only adds new fields, existing fields unchanged

---

### Task Group 3: User-Centric VC Submission Workflow

#### **Task 3.1: Client-Signing Workflow Documentation**

**Category:** Architecture (Safe Addition)

**Current State:**
- No documented client flow for signing VCs

**Target State:**
- Clear API documentation for client signing
- Example implementations (Node.js, Python, etc.)

**Files to Create:**
- [docs/CLIENT_SIGNING.md](docs/CLIENT_SIGNING.md)

**Content:**
1. Retrieve unsigned VC from server `/actor/:username/migrate?newActor=<url>`
2. Client signs locally:
   ```javascript
   const signedVc = await signVCLocally(unsignedVc, clientPrivateKey);
   ```
3. Submit to bridge: `POST /verify` with signed VC
4. Bridge returns verification result

**Dependency:** Requires Task 2.1

**Breaking Change:** ❌ NO
- Documentation only

---

## PHASE 2: STORAGE LAYER

### Task Group 4: Redis-Based Stateless Storage

#### **Task 4.1: Introduce Redis Client Abstraction**

**Category:** Storage (Breaking Change)

**Current State:**
- `lib/storage.js` uses file-based JSON storage
- In-memory caches in bridge.js (`VC_CACHE`, `REMOTE_CACHE`, `STATUS_CACHE`)

**Target State:**
- `lib/storage-redis.js` replaces file-based storage
- All VCs, DIDs, lineage data stored in Redis
- Backward-compatible storage interface (same function signatures)

**Files to Create:**
- [lib/storage-redis.js](lib/storage-redis.js) — Redis-backed storage layer

**Files to Modify:**
- [lib/storage.js](lib/storage.js) — Add Redis backend option OR replace entirely
- [bridge.js](bridge.js) — Remove in-memory caches, use Redis

**Implementation Steps:**

1. **Create `lib/storage-redis.js`:**
   ```javascript
   const redis = require('redis');
   const { promisify } = require('util');
   
   const client = redis.createClient({
     host: process.env.REDIS_HOST || 'localhost',
     port: process.env.REDIS_PORT || 6379,
     db: process.env.REDIS_DB || 0
   });
   
   const NS = process.env.REDIS_NAMESPACE || 'identity_bridge';
   
   async function putVC(vc) {
     await client.setex(
       `${NS}:vc:${vc.id}`,
       process.env.REDIS_VC_TTL || 86400, // 24h default
       JSON.stringify(vc)
     );
   }
   
   async function getVC(id) {
     const val = await client.get(`${NS}:vc:${id}`);
     return val ? JSON.parse(val) : null;
   }
   
   async function putDid(did, publicKeyBase64) {
     await client.setex(
       `${NS}:did:${did}`,
       process.env.REDIS_DID_TTL || 604800, // 7d default
       publicKeyBase64
     );
   }
   
   async function getDid(did) {
     return client.get(`${NS}:did:${did}`);
   }
   
   // ... similarly for getVCsByIssuer, getVCsByOldActor, etc.
   
   module.exports = { putVC, getVC, putDid, getDid, ... };
   ```

2. **Update `bridge.js` storage initialization:**
   ```javascript
   const storage = process.env.REDIS_URL 
     ? require('./lib/storage-redis')
     : require('./lib/storage');
   ```

3. **Remove Map caches from bridge.js:**
   ```javascript
   // DELETE these lines:
   // const VC_CACHE = new Map();
   // const REMOTE_CACHE = new Map();
   // const STATUS_CACHE = new Map();
   // Replace all getCached/putCached with Redis calls
   ```

4. **Update package.json dependencies:**
   ```json
   {
     "dependencies": {
       "redis": "^4.6.0"  // Add this
     }
   }
   ```

**Redis Key Naming Convention:**
```
identity_bridge:vc:{vc.id}              → JSON VC
identity_bridge:vc:old_actor:{actor}    → SET of VC IDs
identity_bridge:vc:new_actor:{actor}    → SET of VC IDs
identity_bridge:vc:issuer:{did}         → SET of VC IDs
identity_bridge:did:{did}               → base64 public key
identity_bridge:lineage:{did}:{hop}     → lineage cache entry
identity_bridge:status:{actor}          → revocation status JSON
```

**Dependency:** No direct dependencies

**Breaking Change:** ✅ YES
- File-based storage is replaced
- Requires Redis instance
- All existing file-based state is lost (migration script needed)

---

#### **Task 4.2: Data Migration Script (File → Redis)**

**Category:** Storage (Safe Addition)

**Current State:**
- Existing VCs/DIDs in `registry/*.json`

**Target State:**
- Migration tool to bulk-load file-based state into Redis

**Files to Create:**
- [scripts/migrate-to-redis.js](scripts/migrate-to-redis.js)

**Implementation Steps:**
```javascript
// scripts/migrate-to-redis.js
const storage = require('../lib/storage');
const storageRedis = require('../lib/storage-redis');
const fs = require('fs');

async function migrate() {
  // Load from file-based storage
  const vcRegistry = JSON.parse(fs.readFileSync('./registry/vc_registry.json', 'utf8'));
  const didRegistry = JSON.parse(fs.readFileSync('./registry/did_registry.json', 'utf8'));
  
  // Bulk insert to Redis
  for (const [vcId, vc] of Object.entries(vcRegistry)) {
    await storageRedis.putVC(vc);
  }
  
  for (const [did, pubKey] of Object.entries(didRegistry)) {
    await storageRedis.putDid(did, pubKey);
  }
  
  console.log('Migration complete');
}

migrate().catch(console.error);
```

**Dependency:** Requires Task 4.1

**Breaking Change:** ❌ NO
- One-time operation, optional

---

#### **Task 4.3: Redis Persistence & Backup Strategy**

**Category:** Storage (Safe Addition)

**Current State:**
- No persistence strategy documented

**Target State:**
- Document Redis persistence options (RDB/AOF)
- Backup/restore procedures
- TTL strategy for cache expiration

**Files to Create:**
- [docs/REDIS_OPERATIONS.md](docs/REDIS_OPERATIONS.md)

**Content:**
- Recommended Redis config (persistence enabled)
- Backup procedure (daily snapshot)
- TTL settings per data type (VC: 24h, DID: 7d)
- Cleanup of expired keys

**Dependency:** Requires Task 4.1

**Breaking Change:** ❌ NO
- Documentation only

---

## PHASE 3: VERIFICATION PIPELINE

### Task Group 5: Deterministic Verification Stages

#### **Task 5.1: Split Verification into Explicit Stages**

**Category:** Verification (Breaking Change)

**Current State:**
- `/verify` endpoint combines all checks:
  - VC schema validation
  - Issuer resolution
  - Signature verification
  - Revocation check
  - Chain following

**Target State:**
- Separate endpoint `/verify/stages` or internal function `verifyWithDetails(vc, options)`
- Returns structured result with per-stage status and error codes
- Each stage can be audited independently

**Files to Modify:**
- [bridge.js](bridge.js) — Refactor `/verify` handler

**Implementation Steps:**

1. **Create `lib/verification-pipeline.js`:**
   ```javascript
   const stages = {
     SCHEMA: 'schema_validation',
     ISSUER: 'issuer_resolution',
     SIGNATURE: 'signature_verification',
     REVOCATION: 'revocation_check',
     LINEAGE: 'lineage_resolution'
   };

   async function verifyWithStages(vc, options = {}) {
     const results = [];

     // Stage 1: Schema validation
     const schemaResult = validateVCSchema(vc);
     results.push({
       stage: stages.SCHEMA,
       valid: schemaResult.ok,
       errorCode: schemaResult.errorCode,
       details: schemaResult.details
     });
     if (!schemaResult.ok && !options.continueOnError) return results;

     // Stage 2: Issuer resolution
     const issuerResult = await resolveIssuer(vc.issuer);
     results.push({
       stage: stages.ISSUER,
       valid: issuerResult.ok,
       errorCode: issuerResult.errorCode,
       publicKey: issuerResult.publicKey
     });
     if (!issuerResult.ok && !options.continueOnError) return results;

     // Stage 3: Signature verification
     const sigResult = await verifyMigrationVC(vc, issuerResult.publicKey);
     results.push({
       stage: stages.SIGNATURE,
       valid: sigResult.ok,
       errorCode: sigResult.errorCode
     });
     if (!sigResult.ok && !options.continueOnError) return results;

     // Stage 4: Revocation check
     const revResult = await checkRevocation(vc);
     results.push({
       stage: stages.REVOCATION,
       valid: !revResult.revoked,
       errorCode: revResult.errorCode
     });

     // Stage 5: Lineage resolution
     const chainResult = await resolveLineage(vc.credentialSubject.oldActor);
     results.push({
       stage: stages.LINEAGE,
       valid: chainResult.isValid,
       errorCode: chainResult.errorCode,
       chain: chainResult.chain
     });

     return results;
   }
   ```

2. **Update `/verify` to use pipeline:**
   ```javascript
   app.post('/verify', async (req, res) => {
     const { vc } = req.body;
     const stageResults = await verifyWithStages(vc);
     
     const valid = stageResults.every(s => s.valid);
     const firstError = stageResults.find(s => !s.valid);
     
     return res.json({
       valid,
       reason: firstError?.errorCode || null,
       stages: stageResults
     });
   });
   ```

3. **Add `/verify/detailed` endpoint:**
   ```javascript
   app.post('/verify/detailed', async (req, res) => {
     const { vc } = req.body;
     const stageResults = await verifyWithStages(vc, { continueOnError: true });
     return res.json({ stages: stageResults });
   });
   ```

**Structured Error Codes:**
```
SCHEMA_INVALID_CONTEXT
SCHEMA_MISSING_FIELDS
SCHEMA_INVALID_TYPE
ISSUER_NOT_FOUND
ISSUER_KEY_EXPIRED
SIGNATURE_INVALID
SIGNATURE_ALGORITHM_UNSUPPORTED
REVOCATION_STATUS_UNAVAILABLE
REVOCATION_REVOKED
LINEAGE_CYCLE_DETECTED
LINEAGE_FORK_DETECTED
LINEAGE_HOP_LIMIT_EXCEEDED
```

**Dependency:** Requires Task 3.1 (Redis storage)

**Breaking Change:** ✅ YES
- Response format changes
- Error codes replace generic "reason" strings

---

#### **Task 5.2: Structured Error Code System**

**Category:** Verification (Safe Addition)

**Current State:**
- Errors are ad-hoc strings or generic failure messages

**Target State:**
- Consistent, machine-readable error codes
- Documented for client interpretation

**Files to Create:**
- [lib/error-codes.js](lib/error-codes.js)

**Implementation Steps:**
```javascript
// lib/error-codes.js
const ErrorCodes = {
  // Schema
  SCHEMA_INVALID: { code: 'SCHEMA_INVALID', http: 400, recoverable: false },
  SCHEMA_MISSING_REQUIRED: { code: 'SCHEMA_MISSING_REQUIRED', http: 400, recoverable: false },
  
  // Issuer
  ISSUER_NOT_FOUND: { code: 'ISSUER_NOT_FOUND', http: 422, recoverable: true },
  ISSUER_KEY_FETCH_FAILED: { code: 'ISSUER_KEY_FETCH_FAILED', http: 503, recoverable: true },
  
  // Signature
  SIGNATURE_INVALID: { code: 'SIGNATURE_INVALID', http: 401, recoverable: false },
  SIGNATURE_ALGO_UNSUPPORTED: { code: 'SIGNATURE_ALGO_UNSUPPORTED', http: 400, recoverable: false },
  
  // Revocation
  REVOCATION_REVOKED: { code: 'REVOCATION_REVOKED', http: 410, recoverable: false },
  REVOCATION_CHECK_FAILED: { code: 'REVOCATION_CHECK_FAILED', http: 503, recoverable: true },
  
  // Lineage
  LINEAGE_CYCLE: { code: 'LINEAGE_CYCLE', http: 422, recoverable: false },
  LINEAGE_FORK: { code: 'LINEAGE_FORK', http: 422, recoverable: false },
  LINEAGE_HOP_LIMIT: { code: 'LINEAGE_HOP_LIMIT', http: 422, recoverable: false }
};

module.exports = ErrorCodes;
```

**Dependency:** Requires Task 5.1

**Breaking Change:** ❌ NO
- Can be backward-compatible with existing error responses

---

#### **Task 5.3: Verification Latency & Outcome Logging**

**Category:** Verification (Safe Addition)

**Current State:**
- `metrics_logger.js` logs basic events
- No per-verification latency tracking

**Target State:**
- Each verification logs:
  - Timestamp
  - VC ID
  - Each stage duration
  - Pass/fail per stage
  - Overall latency

**Files to Modify:**
- [metrics_logger.js](metrics_logger.js) — Add structured logging

**Implementation Steps:**
```javascript
// metrics_logger.js
const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, 'verification_metrics.csv');

function ensureHeader() {
  if (!fs.existsSync(CSV)) {
    fs.writeFileSync(CSV, 
      'ts,vc_id,stage,stage_latency_ms,stage_result,overall_latency_ms\n'
    );
  }
}

function logVerificationStage(vcId, stage, stageLatency, result, overallLatency) {
  ensureHeader();
  const line = 
    `${Date.now()},${vcId},${stage},${stageLatency},${result},${overallLatency}\n`;
  fs.appendFileSync(CSV, line);
}

module.exports = { logVerificationStage };
```

**Dependency:** Requires Task 5.1

**Breaking Change:** ❌ NO
- New functionality only

---

### Task Group 6: Lineage Resolution Hardening

#### **Task 6.1: Separate Authoritative vs. Cached VC Resolution**

**Category:** Verification (Breaking Change)

**Current State:**
- `lib/lineage.js` uses `fetchAuthoritativeVC()` which mixes:
  - Local file-based storage
  - Remote HTTP fetch with caching

**Target State:**
- Explicit separation:
  - `getAuthorityVC(actor)` — fetch from actor's `/migration` endpoint only
  - `getCachedVC(id)` — check Redis cache first
  - `resolveVC(id)` — strategy-based selection

**Files to Modify:**
- [lib/lineage.js](lib/lineage.js) — Refactor chain resolution

**Implementation Steps:**

1. **Create `lib/vc-resolution.js`:**
   ```javascript
   const storage = require('./storage-redis');
   const fetch = require('node-fetch');
   
   // Authoritative fetch from canonical endpoint
   async function fetchAuthoritativeVC(actorUrl) {
     const url = `${actorUrl}/migration`;
     try {
       const r = await fetch(url, { timeout: 5000 });
       if (!r.ok) return null;
       const vc = await r.json();
       
       // Validate structure before storing
       if (!vc.id || !vc.credentialSubject) return null;
       
       // Store in Redis for future reference
       await storage.putVC(vc);
       return vc;
     } catch (e) {
       console.error(`[vc-resolution] Fetch failed: ${actorUrl}`, e.message);
       return null;
     }
   }
   
   // Cache-first resolution
   async function getVCById(id) {
     return storage.getVC(id);
   }
   
   // Strategy-based resolution
   async function resolveVC(idOrActor, strategy = 'cache-first') {
     if (strategy === 'cache-first') {
       const cached = await getVCById(idOrActor);
       if (cached) return cached;
       return fetchAuthoritativeVC(idOrActor);
     } else if (strategy === 'authoritative') {
       return fetchAuthoritativeVC(idOrActor);
     }
     return null;
   }
   
   module.exports = { fetchAuthoritativeVC, getVCById, resolveVC };
   ```

2. **Update `lib/lineage.js`:**
   ```javascript
   const vcResolution = require('./vc-resolution');
   
   async function resolveLineage(startActor) {
     const chain = [];
     const issues = [];
     const visited = new Set();
     
     let current = normalizeActor(startActor);
     let hop = 0;
     const MAX_HOPS = 10;
     
     while (current && hop < MAX_HOPS) {
       if (visited.has(current)) {
         issues.push(`Cycle detected at hop ${hop}: ${current}`);
         break;
       }
       visited.add(current);
       
       const vc = await vcResolution.fetchAuthoritativeVC(current);
       if (!vc) {
         // Terminal node reached
         break;
       }
       
       chain.push(vc);
       current = vc.credentialSubject?.newActor;
       hop++;
     }
     
     if (hop >= MAX_HOPS) {
       issues.push(`Hop limit (${MAX_HOPS}) exceeded`);
     }
     
     return {
       start: startActor,
       end: current,
       chain,
       issues
     };
   }
   ```

**Dependency:** Requires Task 4.1 (Redis storage)

**Breaking Change:** ✅ YES
- Chain resolution behavior changes (stricter)
- Cache strategy may differ from before

---

#### **Task 6.2: Per-Hop Revocation Enforcement**

**Category:** Verification (Safe Addition)

**Current State:**
- Revocation checked per VC, not per hop in chain

**Target State:**
- Each hop in chain is checked for revocation independently
- Revocation stops chain traversal

**Files to Modify:**
- [lib/lineage.js](lib/lineage.js) — Add revocation per hop
- [lib/vc-resolution.js](lib/vc-resolution.js) — Add revocation fetch

**Implementation Steps:**
```javascript
// In lib/vc-resolution.js
async function getRevocationStatus(actorUrl) {
  const url = `${actorUrl}/migration/status`;
  try {
    const r = await fetch(url, { timeout: 5000 });
    if (!r.ok) return null;
    return r.json();
  } catch (e) {
    console.warn(`[vc-resolution] Revocation fetch failed: ${url}`);
    return null;
  }
}

// In lib/lineage.js, during chain traversal:
const vc = await vcResolution.fetchAuthoritativeVC(current);
const status = await vcResolution.getRevocationStatus(current);

if (status?.[vc.id]?.revoked) {
  issues.push(`VC ${vc.id} revoked at hop ${hop}`);
  break; // Stop chain traversal
}

chain.push(vc);
```

**Dependency:** Requires Task 6.1

**Breaking Change:** ❌ NO
- Adds revocation checks, may reject previously valid chains

---

#### **Task 6.3: Lineage API Endpoint (/resolve/:did)**

**Category:** Verification (Safe Addition)

**Current State:**
- Lineage resolution is internal to `/verify`

**Target State:**
- Public `/resolve/:did` endpoint for standalone lineage queries
- Returns full chain with all intermediate VCs

**Files to Modify:**
- [bridge.js](bridge.js) — Add `/resolve/:did` endpoint

**Implementation Steps:**
```javascript
app.get('/resolve/:did', async (req, res) => {
  const did = req.params.did;
  if (!did.startsWith('did:key:')) {
    return res.status(400).json({ error: 'Invalid DID format' });
  }
  
  try {
    // Find actor URL from DID
    const vcs = await storage.getVCsBySubjectDid(did);
    if (vcs.length === 0) {
      return res.status(404).json({ error: 'DID not found in any VC' });
    }
    
    const startActor = vcs[0].credentialSubject.oldActor;
    const lineage = await resolveLineage(startActor);
    
    return res.json({
      did,
      start: lineage.start,
      end: lineage.end,
      hopCount: lineage.chain.length,
      chain: lineage.chain,
      issues: lineage.issues
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
```

**Dependency:** Requires Task 4.1, 6.1

**Breaking Change:** ❌ NO
- New endpoint

---

## PHASE 4: FEDERATION & SIGNATURES

### Task Group 7: FEP-521 HTTP Signature Enforcement

#### **Task 7.1: Centralize HTTP Signature Handling**

**Category:** Verification (Breaking Change)

**Current State:**
- `fep_extensions.js` provides `createHttpSignature()` and `verifyHttpSignature()`
- Not consistently applied across federation requests
- Some requests lack signature verification

**Target State:**
- All outbound requests to federated nodes use HTTP signatures
- All inbound federation requests are verified via HTTP signatures
- Centralized middleware for verification

**Files to Modify:**
- [fep_extensions.js](fep_extensions.js) — Already provides helpers
- [server.js](server.js) — Apply signatures to all federation requests
- [bridge.js](bridge.js) — Verify signatures on federation responses

**Implementation Steps:**

1. **Create signature middleware in `server.js`:**
   ```javascript
   const { createHttpSignature } = require('./fep_extensions');
   
   // Middleware for outbound federation requests
   async function signOutboundRequest(method, path, host, body) {
     const user = users['alice']; // Sender identity
     const date = new Date().toUTCString();
     const digest = crypto.createHash('sha256').update(body || '').digest('base64');
     
     const sig = await createHttpSignature(
       user.privateKey,
       method,
       path,
       host,
       date,
       `SHA-256=${digest}`,
       `${user.actorUrl}#owner`
     );
     
     return { date, digest, signature: sig };
   }
   
   // Wrap fetch for federation requests
   async function federatedFetch(url, options = {}) {
     const urlObj = new URL(url);
     const headers = await signOutboundRequest(
       options.method || 'GET',
       urlObj.pathname + urlObj.search,
       urlObj.host,
       options.body || ''
     );
     
     return fetch(url, {
       ...options,
       headers: {
         ...options.headers,
         ...headers,
         'Content-Type': 'application/activity+json'
       }
     });
   }
   ```

2. **Verification middleware for inbox:**
   ```javascript
   const { verifyHttpSignature } = require('./fep_extensions');
   
   app.post('/inbox', async (req, res) => {
     const signature = req.headers['signature'];
     const digest = req.headers['digest'];
     const date = req.headers['date'];
     
     if (!signature) {
       return res.status(400).json({ error: 'Missing signature' });
     }
     
     // Extract issuer from activity
     const issuerUrl = req.body.actor;
     const issuerData = await fetch(issuerUrl).then(r => r.json());
     const publicKey = issuerData.publicKey[0].publicKeyBase64;
     
     const valid = await verifyHttpSignature(
       publicKey,
       'POST',
       req.path,
       req.hostname,
       date,
       digest,
       signature
     );
     
     if (!valid) {
       return res.status(401).json({ error: 'Invalid signature' });
     }
     
     // Continue with authenticated request
     // ... rest of inbox logic
   });
   ```

**Dependency:** No direct dependencies

**Breaking Change:** ✅ YES
- All federation requests must now be signed
- Unauthenticated requests will be rejected

---

#### **Task 7.2: FEP-521 Compliance Documentation**

**Category:** Verification (Safe Addition)

**Current State:**
- FEP-521 HTTP signatures loosely integrated

**Target State:**
- Document compliance with FEP-521
- Signature format verified against FEP specs

**Files to Create:**
- [docs/FEP_521_COMPLIANCE.md](docs/FEP_521_COMPLIANCE.md)

**Content:**
- Signature header format
- Supported algorithms (Ed25519 only)
- Signing string construction
- Examples

**Dependency:** No direct dependencies

**Breaking Change:** ❌ NO
- Documentation only

---

## PHASE 5: DEPLOYMENT & CLEANUP

### Task Group 8: Sidecar Deployment Model

#### **Task 8.1: Docker Configuration**

**Category:** Deployment (Safe Addition)

**Current State:**
- No Docker configuration

**Target State:**
- Dockerfile for bridge sidecar
- Docker Compose for bridge + Redis

**Files to Create:**
- [Dockerfile](Dockerfile) — Bridge container
- [docker-compose.yml](docker-compose.yml) — Bridge + Redis + Server (optional)

**Implementation Steps:**

1. **Dockerfile:**
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm install --production
   COPY . .
   EXPOSE 4000
   ENV BRIDGE_NETWORK=0.0.0.0
   ENV BRIDGE_PORT=4000
   ENV REDIS_HOST=redis
   CMD ["node", "bridge.js"]
   ```

2. **docker-compose.yml:**
   ```yaml
   version: '3.8'
   services:
     redis:
       image: redis:7-alpine
       ports:
         - "6379:6379"
       volumes:
         - redis_data:/data
     
     bridge:
       build: .
       ports:
         - "4000:4000"
       environment:
         REDIS_HOST: redis
         REDIS_PORT: 6379
         BRIDGE_NETWORK: 127.0.0.1
       depends_on:
         - redis
     
     server:
       build: .
       ports:
         - "3000:3000"
       environment:
         BRIDGE_URL: http://bridge:4000
         DOMAIN: localhost:3000
       depends_on:
         - bridge
   
   volumes:
     redis_data:
   ```

**Dependency:** Requires Task 4.1 (Redis)

**Breaking Change:** ❌ NO
- Optional configuration

---

#### **Task 8.2: Environment Variable Framework**

**Category:** Deployment (Safe Addition)

**Current State:**
- Some env vars used ad-hoc

**Target State:**
- Documented, centralized env var configuration
- Defaults for development, overridable for production

**Files to Create:**
- [.env.example](.env.example)
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md)

**Implementation Steps:**

1. **.env.example:**
   ```
   # Bridge
   BRIDGE_PORT=4000
   BRIDGE_NETWORK=127.0.0.1
   BRIDGE_URL=http://localhost:4000
   
   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_DB=0
   REDIS_NAMESPACE=identity_bridge
   REDIS_VC_TTL=86400
   REDIS_DID_TTL=604800
   
   # Server
   DOMAIN=localhost:3000
   USERS=alice,bob,carol
   
   # Logging
   LOG_LEVEL=info
   METRICS_ENABLED=true
   ```

2. **docs/CONFIGURATION.md:**
   - Document each variable
   - Explain when to override
   - Provide production examples

**Dependency:** No direct dependencies

**Breaking Change:** ❌ NO
- Documentation only

---

### Task Group 9: Artifact Cleanup

#### **Task 9.1: Separate Core from Experiments**

**Category:** Cleanup (Safe Addition)

**Current State:**
- `experiments/`, `archive/`, `tests/` mixed with core code

**Target State:**
- Clear separation:
  - `/core` — production code (bridge, server, lib, keys)
  - `/experiments` — benchmarking, testing scripts
  - `/deployment` — Docker, K8s configs

**Files to Create/Modify:**
- Restructure directory tree
- Update package.json scripts
- Update imports

**Implementation Steps:**
1. Create `/core` directory with `bridge.js`, `server.js`, `lib/`, `keys/`
2. Move experiment code into `/experiments` (already partially done)
3. Create `/deployment` with Docker configs
4. Update all relative imports

**Dependency:** No direct dependencies

**Breaking Change:** ✅ YES
- Requires path updates across codebase

---

#### **Task 9.2: Remove Dead Code Paths**

**Category:** Cleanup (Safe Addition)

**Current State:**
- Old test endpoints, unused functions may exist

**Target State:**
- Audit and remove test-only code paths

**Implementation Steps:**
1. Grep for `// TODO:`, `// DEBUG:`, `// TEST:` comments
2. Review `/link` endpoint in bridge.js (test-only?)
3. Remove duplicated implementations
4. Clean up old crypto fallbacks (P-521)

**Dependency:** No direct dependencies

**Breaking Change:** Possibly
- Depends on what code is removed

---

#### **Task 9.3: Documentation Cleanup**

**Category:** Cleanup (Safe Addition)

**Current State:**
- Multiple READMEs, scattered instructions

**Target State:**
- Single source of truth in main README
- Separate docs for:
  - Architecture
  - API Reference
  - Deployment
  - Client Integration

**Files to Create/Modify:**
- [README.md](README.md) — Overview + quick start
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/API.md](docs/API.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

**Dependency:** All other tasks should be complete

**Breaking Change:** ❌ NO
- Documentation only

---

## PHASE 6: SECURITY & TRUST MODEL

### Task Group 10: Trust Model Formalization

#### **Task 10.1: Trust Model Documentation**

**Category:** Security (Safe Addition)

**Current State:**
- Trust model is implicit in code

**Target State:**
- Explicit, documented trust assumptions

**Files to Create:**
- [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md)

**Content:**
```markdown
# Trust Model

## What is Trusted?

1. **Ed25519 Signatures**
   - Assumption: Ed25519 CSPRNG is cryptographically secure
   - Assumption: Private keys are never compromised
   - We trust the mathematical properties of Ed25519

2. **DID:key Identifiers**
   - Assumption: Issuer's public key is correctly embedded in DID
   - Assumption: multibase/multicodec encoding is reversible
   - We trust that did:key is self-certifying (no external registry)

3. **Actor URLs**
   - Assumption: HTTPS endpoints are authentically served by claimed actor
   - Assumption: `/migration` endpoint is authoritative for migration VCs
   - Assumption: `/migration/status` endpoint is authoritative for revocation

4. **HTTP Signatures (FEP-521)**
   - Assumption: Signature header is constructed per spec
   - Assumption: Signing key corresponds to claimed issuer
   - We trust that HTTP Signature prevents MITM on federation requests

## What is NOT Trusted?

1. **Blockchain / Distributed Ledger**
   - We make NO assumption about blockchain immutability
   - We make NO assumption about consensus finality

2. **Gossip Protocols**
   - We do NOT trust peer-reported identity claims
   - We do NOT follow transitive trust chains through gossip

3. **Revocation Registries**
   - We check revocation status only at time of verification
   - We do NOT assume global synchronization of revocation

4. **Cached VCs**
   - We may serve cached VCs for performance
   - But we ALWAYS re-verify revocation on critical operations

## Who Can Issue?

- Any actor with Ed25519 keypair and DID:key can issue migration VCs
- No issuer registry or allow-list
- Open issuance model (permissionless)

## Who Can Verify?

- Anyone can verify a VC against published public keys
- Verification is deterministic and non-interactive (after key fetch)
- Multiple verifiers should reach same conclusion

## Verification Guarantee

For a VC to be considered valid:

1. VC must pass schema validation
2. Issuer's Ed25519 public key must be resolvable from DID
3. VC signature must verify with issuer's public key
4. Subject's actor must not be revoked
5. Lineage chain (following `/newActor` links) must:
   - Have no cycles
   - Have no forks (multiple newActor values)
   - Not exceed hop limit
   - Have all intermediate VCs verified

If any stage fails, verification MUST return false.
```

**Dependency:** All verification code should be complete

**Breaking Change:** ❌ NO
- Documentation only

---

#### **Task 10.2: Code-Enforced Trust Model**

**Category:** Security (Breaking Change)

**Current State:**
- Some trust assumptions are loose or optional

**Target State:**
- Code strictly enforces documented trust model
- No bypasses or exceptions

**Implementation Steps:**
1. Ensure `/verify` rejects if ANY stage fails
2. Ensure lineage resolution stops on cycle/fork detection
3. Ensure revocation status is always checked
4. Ensure HTTP signatures are verified on inbound requests

**Dependency:** Requires Tasks 5.1, 6.1, 7.1

**Breaking Change:** ✅ YES
- May reject previously accepted VCs

---

## Summary: File-by-File Change Matrix

| File | Task | Change Type | Breaking | Status |
|------|------|-------------|----------|--------|
| [bridge.js](bridge.js) | 1.1, 1.2, 2.1, 3.1, 5.1, 6.1, 6.3, 7.1 | Major Refactor | ✅ | Blocked on 4.1 |
| [server.js](server.js) | 1.1, 2.1, 2.2, 7.1 | Major Refactor | ✅ | Blocked on 4.1 |
| [lib/storage.js](lib/storage.js) | 4.1 | Replace | ✅ | Core change |
| [lib/lineage.js](lib/lineage.js) | 6.1, 6.2 | Major Refactor | ✅ | Blocked on 4.1 |
| [lib/vc.js](lib/vc.js) | 2.1 | Minor Addition | ❌ | Safe |
| [fep_extensions.js](fep_extensions.js) | 7.1 | No change | ❌ | Already complete |
| [metrics_logger.js](metrics_logger.js) | 5.3 | Extension | ❌ | Safe |
| [package.json](package.json) | 4.1 | Add redis | ❌ | Safe |

**New Files to Create:**

| File | Task | Purpose |
|------|------|---------|
| [lib/storage-redis.js](lib/storage-redis.js) | 4.1 | Redis storage backend |
| [lib/vc-resolution.js](lib/vc-resolution.js) | 6.1 | Separate VC fetch strategies |
| [lib/verification-pipeline.js](lib/verification-pipeline.js) | 5.1 | Staged verification |
| [lib/error-codes.js](lib/error-codes.js) | 5.2 | Centralized error definitions |
| [scripts/migrate-to-redis.js](scripts/migrate-to-redis.js) | 4.2 | Data migration helper |
| [Dockerfile](Dockerfile) | 8.1 | Bridge container |
| [docker-compose.yml](docker-compose.yml) | 8.1 | Multi-service composition |
| [.env.example](.env.example) | 8.2 | Configuration template |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 9.3 | Architecture overview |
| [docs/API.md](docs/API.md) | 9.3 | Endpoint documentation |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 9.3 | Deployment guide |
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | 10.1 | Trust assumptions |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | 8.2 | Environment setup |
| [docs/CLIENT_SIGNING.md](docs/CLIENT_SIGNING.md) | 3.1 | Client workflow |
| [docs/FEP_521_COMPLIANCE.md](docs/FEP_521_COMPLIANCE.md) | 7.2 | FEP compliance |
| [docs/REDIS_OPERATIONS.md](docs/REDIS_OPERATIONS.md) | 4.3 | Redis ops guide |

---

## Implementation Sequencing

**Week 1: Foundation**
- Task 4.1 (Redis storage)
- Task 2.1 (Unsigned VC payload)
- Task 6.1 (VC resolution separation)

**Week 2: Verification Pipeline**
- Task 5.1 (Staged verification)
- Task 5.2 (Error codes)
- Task 6.2 (Per-hop revocation)

**Week 3: Integration**
- Task 1.1 (Inbox validation hook)
- Task 1.2 (Localhost binding)
- Task 7.1 (HTTP signature enforcement)

**Week 4: Deployment**
- Task 8.1 (Docker)
- Task 8.2 (Env configuration)
- Task 9.1 (Directory restructure)

**Week 5: Security & Documentation**
- Task 10.1 (Trust model doc)
- Task 10.2 (Code enforcement)
- Task 9.3 (Documentation)

---

## Risk Assessment

### High Risk
- **Task 4.1:** Replacing file-based storage; requires migration script and careful testing
- **Task 5.1:** Verification pipeline changes; may reject previously valid VCs
- **Task 1.1:** Server inbox integration; bidirectional dependency on bridge

### Medium Risk
- **Task 2.1:** User key ownership shift; requires client-side tooling
- **Task 7.1:** HTTP signature enforcement; may break existing federation peers
- **Task 9.1:** Directory restructure; requires updating all relative imports

### Low Risk
- **Task 8.1:** Docker configs; optional, can coexist with existing deployment
- **Task 10.1:** Documentation; no code impact
- **Task 3.1:** Client workflow doc; no code impact

---

## Success Criteria

✅ Bridge operates as sidecar (localhost-only, port 4000)
✅ Server validates all Move activities via bridge before migration
✅ Users own private keys; bridge/server never sign VCs
✅ All state externalized to Redis; no in-memory caches
✅ Verification splits into 5 explicit stages with error codes
✅ Lineage resolution detects cycles, forks, hop-limits, revocation per hop
✅ All outbound federation requests signed via FEP-521
✅ All inbound requests verified before processing
✅ Docker Compose enables rapid local testing
✅ Trust model is documented and code-enforced
✅ No dead code, clear separation of concerns (core vs. experiments)

---

## Non-Goals Confirmation

The following are explicitly OUT OF SCOPE:

- ❌ Blockchain integration
- ❌ Gossip protocols
- ❌ Revocation registries beyond HTTP status check
- ❌ UI / wallet implementation
- ❌ Speculative features
- ❌ Fallback to P-521 crypto (Ed25519 only)
- ❌ Centralized identity provider

---

## Questions for Stakeholders

1. **Redis Deployment:** Should Redis run as sidecar container or external service?
2. **TTL Strategy:** Are 24h (VC) / 7d (DID) TTLs appropriate for your use case?
3. **Client Tooling:** Will you provide client signing libraries, or leave to integrators?
4. **Monitoring:** What metrics matter most (latency, revocation frequency, chain depth)?
5. **Backward Compatibility:** Can we break existing API (v0.x → v1.0)?

---

**End of Implementation Plan**
