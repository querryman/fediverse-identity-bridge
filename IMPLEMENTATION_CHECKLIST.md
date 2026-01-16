# Implementation Roadmap & Checklist

## Quick Navigation

- **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** — Detailed task breakdown, sequencing, risk assessment
- **This file** — Quick checklist for progress tracking

---

## Phase 1: Architecture Shifts (Foundation)

### Sidecar Integration & Server Coupling

- [ ] **Task 1.1** — Inbox validation hook in server.js
  - [ ] Detect Move activities
  - [ ] POST to bridge /verify
  - [ ] Reject if verification fails
  - [ ] Log failures

- [ ] **Task 1.2** — Bridge localhost-only binding
  - [ ] Change listen to 127.0.0.1:4000
  - [ ] Add BRIDGE_NETWORK env var
  - [ ] Document network isolation

- [ ] **Task 1.3** — Environment-based server-bridge coupling
  - [ ] Add BRIDGE_URL env var to server.js
  - [ ] Add BRIDGE_PORT env var to bridge.js
  - [ ] Document deployment patterns in README

### User-Centric Key Ownership

- [ ] **Task 2.1** — Refactor /migrate → unsigned VC payload
  - [ ] Create lib/vc.js:createMigrationVCUnsigned()
  - [ ] Update bridge.js /migrate endpoint
  - [ ] Update server.js /actor/:username/migrate endpoint
  - [ ] Add bridge.js /store endpoint for signed VCs
  - [ ] Add redis dependency (package.json)

- [ ] **Task 2.2** — Actor document with migration endpoint
  - [ ] Add `did` field to actor document
  - [ ] Add `credentialEndpoint` field
  - [ ] Add `migrationEndpoint` field

### User-Centric VC Submission Workflow

- [ ] **Task 3.1** — Client-signing workflow documentation
  - [ ] Create docs/CLIENT_SIGNING.md
  - [ ] Document /migrate → sign locally → /verify flow
  - [ ] Provide example client code

---

## Phase 2: Storage Layer (Externalization)

### Redis-Based Stateless Storage

- [ ] **Task 4.1** — Introduce Redis client abstraction
  - [ ] Create lib/storage-redis.js
  - [ ] Implement putVC, getVC, putDid, getDid
  - [ ] Implement getVCsByIssuer, getVCsByOldActor, getVCsByNewActor
  - [ ] Remove Map caches from bridge.js (VC_CACHE, REMOTE_CACHE, STATUS_CACHE)
  - [ ] Update getCached/putCached to use Redis
  - [ ] Add redis to package.json dependencies

- [ ] **Task 4.2** — Data migration script (file → Redis)
  - [ ] Create scripts/migrate-to-redis.js
  - [ ] Bulk load from registry/*.json
  - [ ] Test migration

- [ ] **Task 4.3** — Redis persistence & backup strategy
  - [ ] Create docs/REDIS_OPERATIONS.md
  - [ ] Document Redis config (RDB/AOF)
  - [ ] Document backup procedure
  - [ ] Document TTL settings per data type

---

## Phase 3: Verification Pipeline (Hardening)

### Deterministic Verification Stages

- [ ] **Task 5.1** — Split verification into explicit stages
  - [ ] Create lib/verification-pipeline.js
  - [ ] Implement verifyWithStages() function
  - [ ] Define 5 stages: schema, issuer, signature, revocation, lineage
  - [ ] Update bridge.js /verify to use pipeline
  - [ ] Add bridge.js /verify/detailed endpoint
  - [ ] Return structured stage results with error codes

- [ ] **Task 5.2** — Structured error code system
  - [ ] Create lib/error-codes.js
  - [ ] Define error codes (SCHEMA_INVALID, ISSUER_NOT_FOUND, etc.)
  - [ ] Include http status codes and recoverability flags
  - [ ] Update verification pipeline to use error codes

- [ ] **Task 5.3** — Verification latency & outcome logging
  - [ ] Update metrics_logger.js with verification_metrics.csv
  - [ ] Log per-stage latency
  - [ ] Log per-stage pass/fail
  - [ ] Log overall verification latency

### Lineage Resolution Hardening

- [ ] **Task 6.1** — Separate authoritative vs. cached VC resolution
  - [ ] Create lib/vc-resolution.js
  - [ ] Implement fetchAuthoritativeVC()
  - [ ] Implement getCachedVC()
  - [ ] Implement resolveVC(id, strategy)
  - [ ] Update lib/lineage.js to use new module
  - [ ] Enforce hop limit in chain traversal

- [ ] **Task 6.2** — Per-hop revocation enforcement
  - [ ] Add getRevocationStatus() to vc-resolution.js
  - [ ] Check revocation at each hop
  - [ ] Stop chain traversal if VC revoked
  - [ ] Log revocation at each hop

- [ ] **Task 6.3** — Lineage API endpoint (/resolve/:did)
  - [ ] Add GET /resolve/:did endpoint to bridge.js
  - [ ] Return full chain with hop count
  - [ ] Return any lineage issues (cycles, forks)
  - [ ] Document in API reference

---

## Phase 4: Federation & Signatures (Integration)

### FEP-521 HTTP Signature Enforcement

- [ ] **Task 7.1** — Centralize HTTP signature handling
  - [ ] Create signature middleware in server.js
  - [ ] Wrap all outbound federation requests
  - [ ] Add signature verification to inbox handler
  - [ ] Reject unsigned inbound requests
  - [ ] Test with federated nodes

- [ ] **Task 7.2** — FEP-521 compliance documentation
  - [ ] Create docs/FEP_521_COMPLIANCE.md
  - [ ] Document signature header format
  - [ ] Document signing string construction
  - [ ] Provide examples

---

## Phase 5: Deployment & Cleanup (Operations)

### Sidecar Deployment Model

- [ ] **Task 8.1** — Docker configuration
  - [ ] Create Dockerfile for bridge
  - [ ] Create docker-compose.yml with bridge + redis
  - [ ] Test build and run
  - [ ] Document sidecar deployment pattern

- [ ] **Task 8.2** — Environment variable framework
  - [ ] Create .env.example
  - [ ] Create docs/CONFIGURATION.md
  - [ ] Document all env vars
  - [ ] Provide development and production examples

### Artifact Cleanup

- [ ] **Task 9.1** — Separate core from experiments
  - [ ] Create /core directory structure
  - [ ] Move production code to /core
  - [ ] Keep experiments/ as-is
  - [ ] Create /deployment directory
  - [ ] Update all imports
  - [ ] Update package.json scripts

- [ ] **Task 9.2** — Remove dead code paths
  - [ ] Audit for test-only code
  - [ ] Remove // TODO: / // DEBUG: / // TEST: sections
  - [ ] Remove unused functions
  - [ ] Remove old crypto fallbacks

- [ ] **Task 9.3** — Documentation cleanup
  - [ ] Create docs/ARCHITECTURE.md
  - [ ] Create docs/API.md
  - [ ] Create docs/DEPLOYMENT.md
  - [ ] Update main README.md
  - [ ] Consolidate from multiple sources

---

## Phase 6: Security & Trust Model (Finalization)

### Trust Model Formalization

- [ ] **Task 10.1** — Trust model documentation
  - [ ] Create docs/TRUST_MODEL.md
  - [ ] Document what is trusted
  - [ ] Document what is NOT trusted
  - [ ] Document issuer/verifier responsibilities
  - [ ] Document verification guarantee

- [ ] **Task 10.2** — Code-enforced trust model
  - [ ] Ensure /verify rejects if ANY stage fails
  - [ ] Ensure lineage stops on cycle/fork
  - [ ] Ensure revocation always checked
  - [ ] Ensure HTTP signatures verified on inbound
  - [ ] No exceptions or bypasses

---

## Cross-Cutting Concerns

### Testing
- [ ] Unit tests for verification pipeline stages
- [ ] Integration tests for server-bridge flow
- [ ] Lineage resolution tests (cycles, forks, revocation)
- [ ] HTTP signature tests

### Documentation
- [ ] Update README.md with new architecture
- [ ] Add deployment section to README
- [ ] Add API reference
- [ ] Add troubleshooting guide

### Dependencies
- [ ] Add redis to package.json
- [ ] Verify all async/await patterns
- [ ] Check for breaking changes in dependencies

---

## Dependency Graph

```
Week 1 (Foundation):
  4.1 (Redis) ← blocks 6.1, 5.1, 2.1
  2.1 (Unsigned VC) ← depends on 4.1
  6.1 (VC Resolution) ← depends on 4.1

Week 2 (Verification):
  5.1 (Pipeline) ← depends on 4.1, blocks 1.1
  5.2 (Error Codes) ← depends on 5.1
  5.3 (Logging) ← depends on 5.1
  6.2 (Revocation per-hop) ← depends on 6.1
  6.3 (Lineage API) ← depends on 6.1

Week 3 (Integration):
  1.1 (Inbox Hook) ← depends on 5.1
  1.2 (Localhost) ← no deps
  1.3 (Env Config) ← no deps
  7.1 (HTTP Sigs) ← no deps

Week 4 (Deployment):
  8.1 (Docker) ← depends on 4.1
  8.2 (Env Framework) ← depends on 1.3
  9.1 (Directory) ← no deps, but affects all imports

Week 5 (Security):
  10.1 (Trust Doc) ← depends on all verification tasks
  10.2 (Code Enforce) ← depends on 5.1, 6.1, 7.1
  9.3 (Doc Cleanup) ← depends on all docs
```

---

## Risk Checklist

### High Risk Items
- [ ] Test Task 4.1 migration thoroughly (file → Redis)
- [ ] Test Task 5.1 against existing VCs (may reject some)
- [ ] Test Task 1.1 server-bridge integration (bidirectional)
- [ ] Verify no data loss during migration

### Medium Risk Items
- [ ] Test Task 2.1 client signing workflow (new UX)
- [ ] Test Task 7.1 with external federation peers
- [ ] Test Task 9.1 directory restructure (imports)
- [ ] Ensure all relative paths updated

### Low Risk Items
- [ ] Task 8.1 Docker configuration
- [ ] Task 10.1 documentation
- [ ] Task 3.1 client workflow docs

---

## Success Criteria

- [ ] Bridge listens on localhost:4000 only
- [ ] Server validates all Move via bridge before migration
- [ ] Users own private keys (server never signs)
- [ ] All state in Redis (no in-memory caches)
- [ ] Verification has 5 explicit stages
- [ ] Lineage resolution enforces hop limit, cycle/fork detection, per-hop revocation
- [ ] All outbound requests signed via FEP-521
- [ ] All inbound requests verified
- [ ] Docker Compose enables local testing
- [ ] Trust model documented and code-enforced
- [ ] No dead code, clear core/experiments/deployment separation

---

## Questions Before Starting

1. **Redis:** Sidecar container or external service?
2. **TTLs:** Are 24h (VC) / 7d (DID) TTLs acceptable?
3. **Client Tooling:** Will you provide signing libraries?
4. **Monitoring:** What metrics matter most?
5. **Compatibility:** Can we break existing API (v0.x → v1.0)?

---

**Last Updated:** January 15, 2026  
**Status:** Planning / Blueprint Phase  
**Target Completion:** 5 weeks
