# Implementation Plan: Quick Reference

## 📋 Overview

This repository contains a comprehensive, structured plan to evolve the Fediverse Identity Bridge from a research prototype to a production-ready, user-centric, sidecar-compatible service.

**Documents in this Plan:**

1. **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** ← START HERE
   - Detailed task breakdown (10 phases)
   - Dependency graph and sequencing
   - File modification matrix
   - Risk assessment

2. **[IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)**
   - Task checklist with sub-items
   - Quick status tracking
   - Success criteria
   - Cross-cutting concerns

3. **[ARCHITECTURE_EVOLUTION.md](ARCHITECTURE_EVOLUTION.md)**
   - Visual ASCII diagrams
   - Current vs. target architecture
   - Data flow diagrams
   - Client workflow

4. **This file** — Quick reference summary

---

## 🎯 High-Level Objectives

| Objective | Status | Key Tasks |
|-----------|--------|-----------|
| **Passive Verifier → Active Sidecar** | 10 tasks | 1.1, 1.2, 1.3, 8.1 |
| **User-Centric Key Ownership** | 3 tasks | 2.1, 2.2, 3.1 |
| **In-Memory/File → Redis Storage** | 3 tasks | 4.1, 4.2, 4.3 |
| **Lineage Resolution Hardening** | 3 tasks | 6.1, 6.2, 6.3 |
| **Verification Pipeline** | 3 tasks | 5.1, 5.2, 5.3 |
| **FEP-521 Enforcement** | 2 tasks | 7.1, 7.2 |
| **Trust Model Formalization** | 2 tasks | 10.1, 10.2 |
| **Cleanup & Documentation** | 3 tasks | 8.2, 9.1, 9.2, 9.3 |

**Total: 31 tasks across 5 weeks**

---

## 🚀 Execution Summary

### Week 1: Foundation (Storage + Key Ownership)
**Tasks:** 4.1, 2.1, 6.1 (blocker for all verification work)
**Output:**
- Redis storage layer (`lib/storage-redis.js`)
- Unsigned VC payload at `/migrate`
- VC resolution separation

**Risk:** HIGH (data migration, API format change)

### Week 2: Verification Pipeline
**Tasks:** 5.1, 5.2, 5.3, 6.2, 6.3
**Output:**
- 5-stage verification with error codes
- Enhanced lineage with cycle/fork/revocation detection
- Public `/resolve/:did` endpoint
- Latency logging

**Risk:** MEDIUM (may reject some previously valid VCs)

### Week 3: Integration
**Tasks:** 1.1, 1.2, 1.3, 7.1
**Output:**
- Server inbox validates Move via bridge
- Bridge listens on localhost only
- FEP-521 HTTP signatures enforced
- Sidecar-ready architecture

**Risk:** MEDIUM (server-bridge integration)

### Week 4: Deployment
**Tasks:** 8.1, 8.2, 9.1
**Output:**
- Dockerfile + docker-compose.yml
- Environment configuration framework
- Directory restructure (core/experiments/deployment)

**Risk:** LOW (optional, can coexist)

### Week 5: Finalization
**Tasks:** 10.1, 10.2, 9.2, 9.3
**Output:**
- Trust model documentation
- Code-enforced trust constraints
- Cleaned codebase
- Complete API/deployment documentation

**Risk:** LOW (documentation + cleanup)

---

## 🔄 Dependency Graph (Text Version)

```
Week 1 Blockers (must complete first):
  ✓ Task 4.1 (Redis) blocks: 5.1, 6.1, 8.1, 1.1
  ✓ Task 2.1 (Unsigned VC) blocks: 2.2, 3.1
  ✓ Task 6.1 (VC Resolution) blocks: 6.2, 6.3, 4.1

Week 2 Blockers (depends on Week 1):
  ✓ Task 5.1 (Pipeline) blocks: 5.2, 5.3, 1.1, 10.2
  ✓ Task 6.2 (Revocation) blocks: 6.3, 10.2
  ✓ Task 6.3 (Lineage API) blocked by 6.1, 6.2

Week 3 Integration (depends on Week 1-2):
  ✓ Task 1.1 (Inbox Hook) requires: 5.1, 4.1
  ✓ Task 7.1 (HTTP Sigs) independent
  ✓ Task 1.3 (Env) independent

Week 4+ (can run with minimal constraints):
  ✓ Task 8.1 (Docker) requires: 4.1
  ✓ Task 9.1 (Restructure) independent
  ✓ Task 10.2 (Code Enforce) requires: 5.1, 6.1, 7.1
```

---

## 📊 Critical Path

```
CRITICAL PATH (Minimum viable sidecar):
  4.1 (4d) → 2.1 (3d) → 1.1 (3d) → 5.1 (4d) → 8.1 (2d)
  ==========================================
  Total: ~16 days (3 weeks)

WITH HARDENING:
  4.1 (4d) → 2.1 (3d) → 6.1 (3d) → 6.2 (2d) → 5.1 (4d) → 1.1 (3d) → 7.1 (2d)
  ===============================================================
  Total: ~21 days (3+ weeks)

WITH FULL DEPLOYMENT:
  [Critical Path] + 8.1 (2d) + 9.1 (2d) + 10.1 (1d)
  ==============================================
  Total: ~26 days (4 weeks)

WITH DOCUMENTATION:
  [Full Deployment] + 9.3 (2d) + 10.2 (1d)
  ===========================================
  Total: ~29 days (5 weeks)
```

---

## 🔧 Files to Modify (Summary)

**Core Production Code:**
| File | Scope | Breaking? |
|------|-------|-----------|
| bridge.js | Major refactor | ✅ YES |
| server.js | Major refactor | ✅ YES |
| lib/storage.js | Replace backend | ✅ YES |
| lib/lineage.js | Major refactor | ✅ YES |
| lib/vc.js | Minor addition | ❌ NO |
| fep_extensions.js | No change | ❌ NO |
| metrics_logger.js | Extension | ❌ NO |
| package.json | Add redis | ❌ NO |

**Total Files Modified:** 8 (4 breaking, 4 non-breaking)

---

## 📁 Files to Create (Summary)

**New Core Modules:**
```
lib/
  ├─ storage-redis.js          (Redis backend)
  ├─ vc-resolution.js          (VC fetch strategies)
  ├─ verification-pipeline.js  (5-stage verifier)
  └─ error-codes.js            (Error definitions)

scripts/
  └─ migrate-to-redis.js       (Data migration)
```

**Deployment:**
```
├─ Dockerfile                  (Bridge container)
├─ docker-compose.yml          (Multi-service)
└─ .env.example               (Configuration template)
```

**Documentation:**
```
docs/
  ├─ ARCHITECTURE.md           (Overview)
  ├─ API.md                    (Endpoint reference)
  ├─ DEPLOYMENT.md             (Sidecar setup)
  ├─ TRUST_MODEL.md            (Trust assumptions)
  ├─ CONFIGURATION.md          (Env variables)
  ├─ CLIENT_SIGNING.md         (Client workflow)
  ├─ FEP_521_COMPLIANCE.md     (FEP spec)
  └─ REDIS_OPERATIONS.md       (Ops guide)

+ Top-level:
  ├─ IMPLEMENTATION_PLAN.md    (This plan)
  ├─ IMPLEMENTATION_CHECKLIST.md
  ├─ ARCHITECTURE_EVOLUTION.md
  └─ QUICK_REFERENCE.md        (This file)
```

**Total Files Created:** 18 (4 code, 1 config, 9 docs, 4 meta)

---

## 🛑 Breaking Changes

### API Changes

1. **`/migrate` endpoint response** (Task 2.1)
   - Before: `{ signed VC with proof }`
   - After: `{ unsigned VC, instruction }`
   - Impact: All clients must implement local signing

2. **`/verify` response format** (Task 5.1)
   - Before: `{ valid: bool, reason: string }`
   - After: `{ valid: bool, reason: string, stages: [...]}`
   - Impact: Clients must handle new error code format

3. **Server inbox behavior** (Task 1.1)
   - Before: Accept Move activities without bridge validation
   - After: Reject Move if bridge /verify returns invalid
   - Impact: Bridge must be running; Move activities may be rejected

### Data Storage

1. **Storage backend** (Task 4.1)
   - Before: File-based JSON (local, in-memory caches)
   - After: Redis (externalized, scalable)
   - Impact: Requires data migration script; data loss if migration fails

### Network

1. **Bridge exposure** (Task 1.2)
   - Before: Public on 0.0.0.0:4000
   - After: Localhost only 127.0.0.1:4000
   - Impact: External clients cannot reach bridge

### Verification

1. **Lineage resolution** (Task 6.1, 6.2)
   - Before: Loose chain following
   - After: Strict hop-limit, cycle/fork/revocation detection
   - Impact: Previously valid chains may now be rejected

2. **HTTP Signature enforcement** (Task 7.1)
   - Before: Ad-hoc, optional
   - After: FEP-521 required on all federation
   - Impact: External federation partners must sign requests

---

## ⚠️ High-Risk Tasks

### Task 4.1: Redis Storage Migration
**Risk:** Data loss if migration fails
**Mitigation:**
- Test migration with sample data first
- Keep file-based storage running in parallel (dual-write) temporarily
- Implement rollback procedure
- Verify Redis backups enabled before migration

### Task 5.1: Verification Pipeline Refactor
**Risk:** May reject previously valid VCs
**Mitigation:**
- Run pipeline in "audit mode" first (log all failures without rejecting)
- Collect metrics on rejection rate per stage
- Identify and document why VCs fail (are they actually invalid?)
- Gradually tighten enforcement

### Task 1.1: Server-Bridge Integration
**Risk:** Circular dependencies, coupling issues
**Mitigation:**
- Use async/await with timeouts
- Implement fallback behavior (log, don't block)
- Test with bridge down/slow/hung scenarios
- Document service discovery expectations

### Task 2.1: User Key Ownership Shift
**Risk:** Client-side signing is complex and error-prone
**Mitigation:**
- Provide client signing library (reference implementation)
- Document with examples
- Test with multiple client implementations
- Consider backwards compatibility window

---

## ✅ Success Criteria Checklist

Use this to validate implementation completion:

### Architecture
- [ ] Bridge listens on 127.0.0.1:4000 only
- [ ] Server inbox validates Move via bridge before migration
- [ ] Bridge returns structured error codes (SCHEMA_INVALID, etc.)
- [ ] No ad-hoc error messages

### Storage
- [ ] All VC data in Redis (identity_bridge:vc:*)
- [ ] All DID data in Redis (identity_bridge:did:*)
- [ ] No in-memory Map caches in bridge.js
- [ ] TTLs configured (24h VC, 7d DID)

### Verification
- [ ] 5-stage verification pipeline working
- [ ] Each stage has clear input/output
- [ ] Error codes match documented set
- [ ] Latency per stage logged

### Lineage
- [ ] Hop limit enforced (10 max)
- [ ] Cycle detection working
- [ ] Fork detection working
- [ ] Revocation checked per hop
- [ ] `/resolve/:did` endpoint functional

### User Keys
- [ ] `/migrate` returns unsigned VC
- [ ] Server never signs VCs
- [ ] Clients can sign locally and submit via `/verify`
- [ ] Documentation and examples provided

### Federation
- [ ] All outbound requests signed (FEP-521)
- [ ] All inbound requests verified
- [ ] Signature header format correct
- [ ] Middleware applied consistently

### Deployment
- [ ] Dockerfile builds successfully
- [ ] docker-compose.yml starts bridge + redis
- [ ] Environment variables work
- [ ] Logs indicate successful startup

### Trust Model
- [ ] Trust assumptions documented
- [ ] Trust model enforced in code
- [ ] No bypasses or exceptions
- [ ] Verification is deterministic

---

## 🔗 How to Use This Plan

### For Project Managers
1. Use [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) for tracking
2. Review critical path (3-5 weeks)
3. Monitor high-risk tasks (4.1, 5.1, 1.1, 2.1)
4. Plan stakeholder reviews after each phase

### For Engineers
1. Read [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for your task
2. Review [ARCHITECTURE_EVOLUTION.md](ARCHITECTURE_EVOLUTION.md) for context
3. Check dependencies before starting
4. Verify success criteria after completion
5. Update checklist as you go

### For Architects
1. Review full [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
2. Validate dependency graph
3. Assess risk areas (Week 1-2 are critical)
4. Plan integration points (Week 3)
5. Design migration strategy for existing users

### For Code Reviewers
1. Check breaking changes (11 items across 8 files)
2. Verify error codes used consistently
3. Validate Redis key namespacing (identity_bridge:*)
4. Ensure async/await on all crypto calls
5. Confirm no private keys in logs/responses

---

## 📞 Questions & Decisions

**Before starting, clarify:**

1. **Redis Deployment Model**
   - Sidecar container (same pod)?
   - Separate service (orchestrated)?
   - Managed service (AWS ElastiCache, etc.)?

2. **Backwards Compatibility**
   - Can we break existing API (v0.x → v1.0)?
   - Need compatibility layer for old clients?
   - Migration period for existing users?

3. **Client Tooling**
   - Will you provide signing library?
   - Reference implementation needed?
   - What programming languages?

4. **Monitoring & Alerting**
   - What metrics matter most?
   - Alert thresholds?
   - Log aggregation?

5. **Compliance & Audit**
   - Need immutable audit log?
   - Compliance requirements (GDPR, HIPAA)?
   - Key rotation policies?

---

## 📚 Reference Documents

**Generated as part of this plan:**

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — 500+ lines, detailed breakdown
- [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md) — 300+ lines, tracking
- [ARCHITECTURE_EVOLUTION.md](ARCHITECTURE_EVOLUTION.md) — 400+ lines, diagrams
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) — This file

**To create after plan approval:**

- docs/ARCHITECTURE.md
- docs/API.md
- docs/DEPLOYMENT.md
- docs/TRUST_MODEL.md
- docs/CONFIGURATION.md
- docs/CLIENT_SIGNING.md
- docs/FEP_521_COMPLIANCE.md
- docs/REDIS_OPERATIONS.md

---

## 🎬 Getting Started

1. **Read the plan** → [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
2. **Review architecture** → [ARCHITECTURE_EVOLUTION.md](ARCHITECTURE_EVOLUTION.md)
3. **Track progress** → [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md)
4. **Ask questions** → See "Questions & Decisions" above
5. **Start Week 1** → Tasks 4.1, 2.1, 6.1

---

**Status:** Blueprint / Planning Phase  
**Last Updated:** January 15, 2026  
**Target Start:** Upon stakeholder approval  
**Estimated Duration:** 5 weeks (including documentation)

---

## Appendix: Glossary

| Term | Definition |
|------|-----------|
| **VC** | Verifiable Credential (JSON-LD document with proof) |
| **DID** | Decentralized Identifier (did:key:z...) |
| **Ed25519** | Edwards curve cryptography (primary key type) |
| **Sidecar** | Service running alongside another service |
| **FEP** | Fediverse Enhancement Proposal |
| **HTTP Signature** | HTTP request authentication via FEP-521 |
| **Lineage** | Chain of migration credentials (chain of newActor links) |
| **Hop** | Single link in migration lineage |
| **Fork** | Multiple different newActor values for same actor |
| **Revocation** | Status indicating VC is no longer valid |
| **TTL** | Time-to-live (cache expiration) |
| **Namespace** | Redis key prefix (identity_bridge:*) |
| **Deterministic** | Always produces same result given same input |
| **Stage** | One step in verification pipeline |
| **Error Code** | Machine-readable error identifier |

---

**End of Quick Reference. Start implementing!**
