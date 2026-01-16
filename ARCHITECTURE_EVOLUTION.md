# Architecture Evolution: Current → Target

## Current Architecture (Research Prototype)

```
┌─────────────────────────────────────────────────────────────┐
│  Fediverse Nodes (Multiple Instances)                       │
│  ┌─────────────────────┐  ┌─────────────────────┐           │
│  │  server.js:3000     │  │  server.js:3001     │           │
│  │  (Alice)            │  │  (Bob)              │           │
│  ├─────────────────────┤  ├─────────────────────┤           │
│  │ Actor: Alice        │  │ Actor: Bob          │           │
│  │ Keys: Ed25519       │  │ Keys: Ed25519       │           │
│  │ Inbox: /inbox       │  │ Inbox: /inbox       │           │
│  │ /migrate: SIGNS VC  │  │ /migrate: SIGNS VC  │           │
│  │ (PRIVATE KEY!)      │  │ (PRIVATE KEY!)      │           │
│  └─────────────────────┘  └─────────────────────┘           │
│         ↓                          ↓                         │
│  In-Memory Storage:          In-Memory Storage:             │
│  - Users table               - Users table                  │
│  - Notes                     - Notes                        │
│  - Followers                 - Followers                    │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│  Standalone Bridge Verifier (port 4000, PUBLIC)             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ bridge.js                                               ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ In-Memory Caches:                                       ││
│  │ - VC_CACHE (Map)                                        ││
│  │ - REMOTE_CACHE (Map)                                    ││
│  │ - STATUS_CACHE (Map)                                    ││
│  │                                                         ││
│  │ File-Based Storage:                                     ││
│  │ - registry/vc_registry.json                             ││
│  │ - registry/did_registry.json                            ││
│  │                                                         ││
│  │ Endpoints:                                              ││
│  │ POST /verify (schema, issuer, sig, revocation, chain)   ││
│  │ POST /link (test-only)                                  ││
│  │ POST /migrate (RETURNS SIGNED VC)                       ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Issues:                                                    │
│  ✗ Accepts private key from server (/migrate)              │
│  ✗ Verification is monolithic (no stages)                  │
│  ✗ In-memory caches lost on restart                        │
│  ✗ File storage not scalable                               │
│  ✗ Chain following loose (no cycle detect, fork detect)    │
│  ✗ Publicly exposed (0.0.0.0:4000)                         │
└─────────────────────────────────────────────────────────────┘
         ↑ (loose coupling)
```

---

## Target Architecture (Production-Ready Sidecar)

```
┌─────────────────────────────────────────────────────────────┐
│  Docker Sidecar Container Model                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  docker-compose.yml                                  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  redis:7-alpine                               │  │   │
│  │  │  ├─ Port: 6379 (internal only)                │  │   │
│  │  │  ├─ Persistence: RDB + AOF                    │  │   │
│  │  │  └─ Namespaced keys: identity_bridge:*       │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  bridge (Dockerfile)                           │  │   │
│  │  │  ├─ Port: 4000 → 127.0.0.1:4000 (localhost)  │  │   │
│  │  │  ├─ BRIDGE_URL=http://bridge:4000             │  │   │
│  │  │  ├─ REDIS_HOST=redis                          │  │   │
│  │  │  └─ Environment: dev, test, prod              │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  server (ActivityPub nodes)                    │  │   │
│  │  │  ├─ Port: 3000 (or 3001, 3002, ...)           │  │   │
│  │  │  ├─ BRIDGE_URL=http://bridge:4000             │  │   │
│  │  │  └─ Environment: dev, test, fed               │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│  ActivityPub Server (Sidecar Model)                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ server.js (Enhanced)                                    ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ Endpoints:                                              ││
│  │ POST /inbox                                             ││
│  │   ├─ Detect: activity.type === "Move"                  ││
│  │   ├─ VALIDATE: POST to bridge /verify (sync)           ││
│  │   ├─ BLOCK if invalid: reject with 403                 ││
│  │   └─ CONTINUE if valid: process migration              ││
│  │                                                         ││
│  │ GET /actor/:username/migrate                           ││
│  │   ├─ Request: ?newActor=<url> from client              ││
│  │   ├─ Forward to bridge /migrate                        ││
│  │   └─ Return UNSIGNED VC (JSON-LD)                      ││
│  │                                                         ││
│  │ GET /actor/:username                                   ││
│  │   └─ Add: did, credentialEndpoint fields               ││
│  │                                                         ││
│  │ User Data (Immutable Private Keys):                     ││
│  │   - users[username].privateKey (never sent!)           ││
│  │   - users[username].did                                ││
│  │   - Stored: keys/<username>/private.key                ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
         ↑ (tight coupling via REST)
         │ 
         │ POST /verify (VC object)
         │ Returns: { valid: bool, stages: [...], errorCode: "..." }
         │
┌─────────────────────────────────────────────────────────────┐│
│  Bridge Sidecar (Localhost:4000 Only)                       ││
│  ┌─────────────────────────────────────────────────────────┐││
│  │ bridge.js (Refactored)                                  │││
│  ├─────────────────────────────────────────────────────────┤││
│  │ Verification Pipeline (Explicit Stages):                │││
│  │ ┌──────────────────────────────────────────────────┐   │││
│  │ │ lib/verification-pipeline.js                     │   │││
│  │ ├──────────────────────────────────────────────────┤   │││
│  │ │ Stage 1: verifySchema()                          │   │││
│  │ │   └─ Check @context, type, credentialSubject    │   │││
│  │ │   └─ Error: SCHEMA_INVALID                      │   │││
│  │ │                                                  │   │││
│  │ │ Stage 2: resolveIssuer()                         │   │││
│  │ │   └─ Extract issuerDid from VC.issuer           │   │││
│  │ │   └─ Query Redis: identity_bridge:did:{did}     │   │││
│  │ │   └─ Return: publicKey (base64)                 │   │││
│  │ │   └─ Error: ISSUER_NOT_FOUND                    │   │││
│  │ │                                                  │   │││
│  │ │ Stage 3: verifySignature(vc, pubkey)            │   │││
│  │ │   └─ Call lib/vc.js:verifyMigrationVC()         │   │││
│  │ │   └─ Ed25519 signature verification only        │   │││
│  │ │   └─ Error: SIGNATURE_INVALID                   │   │││
│  │ │                                                  │   │││
│  │ │ Stage 4: checkRevocation(actor, vc)             │   │││
│  │ │   └─ Fetch: {actor}/migration/status            │   │││
│  │ │   └─ Check: status[vc.id].revoked               │   │││
│  │ │   └─ Error: REVOCATION_REVOKED                  │   │││
│  │ │                                                  │   │││
│  │ │ Stage 5: resolveLineage(oldActor)               │   │││
│  │ │   └─ Call lib/lineage.js:resolveLineage()       │   │││
│  │ │   └─ Returns: { chain, issues }                 │   │││
│  │ │   └─ Enforce: hop-limit, cycle-detect,         │   │││
│  │ │              fork-detect, per-hop revocation    │   │││
│  │ │   └─ Error: LINEAGE_CYCLE, LINEAGE_FORK, ...   │   │││
│  │ └──────────────────────────────────────────────────┘   │││
│  │                                                         │││
│  │ Error Codes (Structured):                              │││
│  │ ┌──────────────────────────────────────────────────┐   │││
│  │ │ lib/error-codes.js                               │   │││
│  │ ├──────────────────────────────────────────────────┤   │││
│  │ │ Each error has:                                  │   │││
│  │ │   - code (machine-readable)                      │   │││
│  │ │   - http status (400, 401, 403, 422, 503)       │   │││
│  │ │   - recoverable (true/false)                     │   │││
│  │ │                                                  │   │││
│  │ │ Example:                                         │   │││
│  │ │   SIGNATURE_INVALID:                             │   │││
│  │ │   { code: 'SIGNATURE_INVALID',                   │   │││
│  │ │     http: 401,                                   │   │││
│  │ │     recoverable: false }                         │   │││
│  │ └──────────────────────────────────────────────────┘   │││
│  │                                                         │││
│  │ VC Resolution (Separate Module):                       │││
│  │ ┌──────────────────────────────────────────────────┐   │││
│  │ │ lib/vc-resolution.js                             │   │││
│  │ ├──────────────────────────────────────────────────┤   │││
│  │ │ fetchAuthoritativeVC(actor)                      │   │││
│  │ │   └─ Fetch: {actor}/migration (origin of truth)  │   │││
│  │ │   └─ Store in Redis for future reference         │   │││
│  │ │                                                  │   │││
│  │ │ getVCById(id)                                    │   │││
│  │ │   └─ Query Redis: identity_bridge:vc:{id}       │   │││
│  │ │                                                  │   │││
│  │ │ resolveVC(id, strategy)                          │   │││
│  │ │   └─ strategy: 'cache-first' (default)           │   │││
│  │ │   └─ strategy: 'authoritative' (always fetch)    │   │││
│  │ └──────────────────────────────────────────────────┘   │││
│  │                                                         │││
│  │ Lineage Resolution (Enhanced):                         │││
│  │ ┌──────────────────────────────────────────────────┐   │││
│  │ │ lib/lineage.js (Refactored)                      │   │││
│  │ ├──────────────────────────────────────────────────┤   │││
│  │ │ resolveLineage(startActor)                       │   │││
│  │ │   └─ Loop through chain (newActor → newActor)    │   │││
│  │ │   ├─ Check: hop-limit (MAX_HOPS = 10)           │   │││
│  │ │   ├─ Check: cycle-detection (visited set)        │   │││
│  │ │   ├─ Check: fork-detection (multiple newActor)   │   │││
│  │ │   ├─ Check: revocation per hop                   │   │││
│  │ │   └─ Return: { chain, issues, end }              │   │││
│  │ └──────────────────────────────────────────────────┘   │││
│  │                                                         │││
│  │ Storage (Redis-Backed, Stateless):                     │││
│  │ ┌──────────────────────────────────────────────────┐   │││
│  │ │ lib/storage-redis.js                             │   │││
│  │ ├──────────────────────────────────────────────────┤   │││
│  │ │ Key Namespace: identity_bridge:*                 │   │││
│  │ │                                                  │   │││
│  │ │ putVC(vc)                                        │   │││
│  │ │   └─ Key: identity_bridge:vc:{vc.id}            │   │││
│  │ │   └─ TTL: 86400 (24h)                            │   │││
│  │ │                                                  │   │││
│  │ │ putDid(did, pubkey)                              │   │││
│  │ │   └─ Key: identity_bridge:did:{did}             │   │││
│  │ │   └─ Value: base64 Ed25519 public key           │   │││
│  │ │   └─ TTL: 604800 (7d)                            │   │││
│  │ │                                                  │   │││
│  │ │ getVCsByOldActor(actor)                          │   │││
│  │ │   └─ Key: identity_bridge:vc:old_actor:{actor}  │   │││
│  │ │   └─ Type: SET                                   │   │││
│  │ │                                                  │   │││
│  │ │ getRevocationStatus(actor)                       │   │││
│  │ │   └─ Cached fetch from {actor}/migration/status │   │││
│  │ └──────────────────────────────────────────────────┘   │││
│  │                                                         │││
│  │ Endpoints:                                              │││
│  │   POST /verify                                         │││
│  │     Body: { vc }                                       │││
│  │     Response: { valid, reason, stages }               │││
│  │                                                         │││
│  │   POST /verify/detailed                                │││
│  │     Body: { vc }                                       │││
│  │     Response: { stages: [...] } (all stages, no fail)  │││
│  │                                                         │││
│  │   POST /migrate (No longer signs)                       │││
│  │     Body: { issuerDid, subjectDid, oldActor, ... }     │││
│  │     Response: { vc (unsigned) }                        │││
│  │                                                         │││
│  │   POST /store (New: accepts signed VC)                  │││
│  │     Body: { vc (signed) }                              │││
│  │     Response: { id, stored: true }                     │││
│  │                                                         │││
│  │   GET /resolve/:did                                     │││
│  │     Response: { did, chain, issues, hopCount }         │││
│  │                                                         │││
│  │ Logging (Structured Metrics):                          │││
│  │ ┌──────────────────────────────────────────────────┐   │││
│  │ │ metrics_logger.js (Enhanced)                     │   │││
│  │ ├──────────────────────────────────────────────────┤   │││
│  │ │ CSV: verification_metrics.csv                    │   │││
│  │ │ Columns:                                         │   │││
│  │ │   ts, vc_id, stage, stage_latency_ms,           │   │││
│  │ │   stage_result, overall_latency_ms               │   │││
│  │ │                                                  │   │││
│  │ │ Logged per verification:                         │   │││
│  │ │   - Each stage duration                          │   │││
│  │ │   - Each stage pass/fail                         │   │││
│  │ │   - Total verification latency                   │   │││
│  │ │   - Timestamp                                    │   │││
│  │ └──────────────────────────────────────────────────┘   │││
│  │                                                         │││
│  │ HTTP Signature (FEP-521 Enforced):                     │││
│  │ ┌──────────────────────────────────────────────────┐   │││
│  │ │ fep_extensions.js (Unchanged)                    │   │││
│  │ ├──────────────────────────────────────────────────┤   │││
│  │ │ createHttpSignature(...)  (Already used)         │   │││
│  │ │ verifyHttpSignature(...)  (Already used)         │   │││
│  │ │                                                  │   │││
│  │ │ But now required on:                             │   │││
│  │ │   - All outbound federation requests             │   │││
│  │ │   - All inbound federation requests (verified)   │   │││
│  │ │   - No exceptions                                │   │││
│  │ └──────────────────────────────────────────────────┘   │││
│  └─────────────────────────────────────────────────────────┘││
└─────────────────────────────────────────────────────────────┘│

│ Remote Federated Nodes
│ ┌──────────────────────────────────────────────────────┐   │
│ │  server.js (Remote Instance)                         │   │
│ ├──────────────────────────────────────────────────────┤   │
│ │ GET /actor/alice                                     │   │
│ │ GET /actor/alice/migrate (returns migration VCs)     │   │
│ │ GET /actor/alice/migration/status (revocation info)  │   │
│ │ POST /inbox (signed requests only)                   │   │
│ │   ├─ Verify FEP-521 signature                        │   │
│ │   ├─ Verify Move activity VC                         │   │
│ │   └─ Process migration                               │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Client Workflow: User Key Ownership

```
┌──────────────────────────────────────────────────────────┐
│  CLIENT (Owns Ed25519 Private Key)                       │
│  ┌──────────────────────────────────────────────────────┐│
│  │ 1. LOCAL: User creates migration request             ││
│  │    ├─ privateKey (never sent anywhere)               ││
│  │    ├─ newActorUrl (destination)                      ││
│  │    └─ oldActorUrl (current location)                 ││
│  │                                                      ││
│  │ 2. FETCH: GET /actor/alice/migrate?newActor=...      ││
│  │    └─ Receives: { unsignedVc, instruction }          ││
│  │                                                      ││
│  │ 3. LOCAL SIGN:                                       ││
│  │    ├─ Add proof to VC using privateKey               ││
│  │    ├─ signedVc = {                                   ││
│  │    │   ...unsignedVc,                                ││
│  │    │   proof: {                                      ││
│  │    │     type: "Ed25519Signature2020",               ││
│  │    │     signature: "..." (Ed25519 sig)              ││
│  │    │   }                                             ││
│  │    │ }                                               ││
│  │    └─ Never transmitted to server/bridge             ││
│  │                                                      ││
│  │ 4. SUBMIT: POST /verify with signedVc                ││
│  │    └─ Bridge verifies signature against issuerDid    ││
│  │                                                      ││
│  │ 5. BROADCAST: POST /inbox (remote node)              ││
│  │    ├─ Create Move activity: {                        ││
│  │    │   type: "Move",                                 ││
│  │    │   actor: https://alice@old.com/actor/alice,     ││
│  │    │   object: signedVc (attached)                   ││
│  │    │ }                                               ││
│  │    ├─ Sign with FEP-521 HTTP Signature               ││
│  │    └─ POST to remote /inbox                          ││
│  │                                                      ││
│  │ 6. REMOTE: Recipient verifies:                       ││
│  │    ├─ HTTP signature (FEP-521)                       ││
│  │    ├─ Move activity structure                        ││
│  │    ├─ VC signature (Ed25519)                         ││
│  │    └─ Calls bridge /verify if needed                 ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

---

## Data Flow: Verification Request

```
SERVER INBOX HANDLER
      ↓
   Detect: activity.type === "Move"
      ↓
   Extract VC from activity.object
      ↓
   ┌──────────────────────────────────────┐
   │ BRIDGE VERIFICATION PIPELINE         │
   ├──────────────────────────────────────┤
   │                                      │
   │ STAGE 1: validateVCSchema(vc)        │
   │   Input: vc                          │
   │   Output: { ok, errorCode }          │
   │   ↓                                  │
   │   Error? → SCHEMA_INVALID            │
   │                                      │
   │ STAGE 2: resolveIssuer(issuerDid)    │
   │   Input: vc.issuer                   │
   │   Output: { ok, publicKey }          │
   │   ↓ Query Redis                      │
   │   identity_bridge:did:{issuerDid}    │
   │   ↓                                  │
   │   Error? → ISSUER_NOT_FOUND          │
   │                                      │
   │ STAGE 3: verifySignature(vc, pubkey) │
   │   Input: vc, publicKeyBase64         │
   │   ├─ Extract vc.proof.signature      │
   │   ├─ Remove proof from VC            │
   │   ├─ Canonical JSON                  │
   │   ├─ Ed25519 verify                  │
   │   └─ Output: { ok, errorCode }       │
   │   ↓                                  │
   │   Error? → SIGNATURE_INVALID         │
   │                                      │
   │ STAGE 4: checkRevocation(actor, vc)  │
   │   Input: oldActor, vc.id             │
   │   ├─ Fetch: {actor}/migration/status │
   │   ├─ Check: status[vc.id].revoked    │
   │   └─ Output: { ok, errorCode }       │
   │   ↓                                  │
   │   Error? → REVOCATION_REVOKED        │
   │                                      │
   │ STAGE 5: resolveLineage(oldActor)    │
   │   Input: vc.credentialSubject.oldActor
   │   ├─ Loop: current → newActor chain  │
   │   ├─ Check: hop-limit (10)           │
   │   ├─ Check: cycle-detection         │
   │   ├─ Check: fork-detection          │
   │   ├─ Check: revocation per hop       │
   │   └─ Output: { chain, issues }       │
   │   ↓                                  │
   │   Issues? → LINEAGE_CYCLE, etc       │
   │                                      │
   └──────────────────────────────────────┘
      ↓
   aggregate results
      ↓
   return {
     valid: bool,
     reason: first_error_code,
     stages: [
       { stage: "schema_validation", valid: bool, errorCode: "..." },
       { stage: "issuer_resolution", valid: bool, errorCode: "..." },
       { stage: "signature_verification", valid: bool, errorCode: "..." },
       { stage: "revocation_check", valid: bool, errorCode: "..." },
       { stage: "lineage_resolution", valid: bool, errorCode: "...", chain: [...] }
     ]
   }
      ↓
SERVER INBOX
   ├─ If valid === false: reject with 403 (or 410, 401, etc.)
   └─ If valid === true: process migration

```

---

## Key Changes Summary

| Aspect | Current | Target |
|--------|---------|--------|
| **User Key Ownership** | Server holds private key | User owns, never sent to server/bridge |
| **VC Signing** | Server signs at `/migrate` | Client signs locally |
| **Bridge Role** | Verifies and signs | Verifies only (stateless) |
| **Network Exposure** | Public 0.0.0.0:4000 | Localhost 127.0.0.1:4000 |
| **Storage** | In-memory + file JSON | Redis (externalized) |
| **Verification** | Monolithic endpoint | 5-stage pipeline with error codes |
| **Lineage** | Loose chain following | Strict: hop-limit, cycle/fork detect, revocation/hop |
| **Server Integration** | Loose (separate service) | Tight (validation gate in inbox) |
| **HTTP Signatures** | Ad-hoc | FEP-521 enforced on all federation |
| **Deployment** | Standalone | Docker Compose sidecar |
| **Trust Model** | Implicit | Explicit, documented, code-enforced |
| **Scalability** | Single instance | Horizontally scaled (stateless bridge) |

---

## Migration Path

```
PHASE 1: Storage Migration
  Old: File-based JSON → New: Redis
  - Data remains consistent
  - Use scripts/migrate-to-redis.js
  - Test with sample data first

PHASE 2: Verification Pipeline
  Old: Monolithic /verify → New: 5-stage pipeline
  - /verify response format changes (breaking)
  - Add /verify/detailed for debugging
  - Update server to handle new format

PHASE 3: User Key Ownership
  Old: Server signs → New: Client signs
  - /migrate endpoint returns unsigned VC
  - New /store endpoint accepts signed VCs
  - Clients must implement signing

PHASE 4: Integration
  Old: Loose coupling → New: Server-side validation gate
  - Inbox handler now calls bridge /verify
  - Move activities rejected if verification fails
  - Requires bridge to be running

PHASE 5: Deployment
  Old: Standalone services → New: Docker sidecar
  - docker-compose.yml defines topology
  - Environment variables configure coupling
  - Automated startup / shutdown
```

---

**This document is a reference for the architectural evolution outlined in IMPLEMENTATION_PLAN.md**
