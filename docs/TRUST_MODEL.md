# Trust Model Documentation (Task 10.1)

Explicit documentation of all trust assumptions in the Fediverse Identity Bridge.

---

## Overview

This document defines:
1. **What we trust** - Cryptographic primitives, identifiers, protocols
2. **What we don't trust** - Unreliable systems, gossip, external registries
3. **Who can act** - Permissions model for issuance and verification
4. **Verification guarantees** - What constitutes a valid identity claim
5. **Failure modes** - What happens when trust breaks

---

## What We Trust

### 1. Ed25519 Cryptography

**Assumption:** Ed25519 is cryptographically secure and collision-resistant.

**What this means:**
- Signatures created with a private key can ONLY be verified by the corresponding public key
- Forging a signature without the private key is computationally infeasible (< 2^-128 probability)
- Ed25519 random number generation uses OS entropy (cryptographically secure)

**Dependencies:**
- `@noble/ed25519` package (peer-reviewed, no native dependencies)
- Node.js `crypto.webcrypto.subtle` for SHA-512

**Risk:**
- Quantum computers could break Ed25519 (not near-term risk)
- CSPRNG compromise would enable signature forgery (catastrophic)

**Mitigation:**
- Monitor NIST post-quantum cryptography standardization
- Use OS-provided CSPRNG (not user-supplied randomness)
- Regular security audits of @noble/ed25519

---

### 2. DID:key Self-Certification

**Assumption:** A public key encoded in `did:key:z...` format is self-certifying and cannot be forged.

**What this means:**
- The DID value is derived directly from the Ed25519 public key using multibase/multicodec encoding
- No external registry needed (no DDNS, blockchain, or trusted authority required)
- Anyone can verify that a DID belongs to a specific public key

**Encoding:**
```
did:key:z6Mk + [multibase-encoded public key]
       ↑         ↑
    prefix     ed25519 public key (32 bytes) in base58btc
```

**Example:**
```
Public Key (base64): dh5cNKp25TorVRJEVzpcuz0qJ4l+0o+4pH4MsfvoXGQ=
Public Key (hex):   761e5c34aa76e53a2b55124455ce5c3b3d2a2788...
Multicodec prefix:  0xED 0x01 (Ed25519)
DID:                did:key:z6MkhaXgBZDvotXY9aXKmLF2RFk1v1r4YmHdXrY9jqYkNE85
```

**Risk:**
- Multibase/multicodec encoding mistakes could create invalid DIDs
- Implementation bugs in encoding could break linkage

**Mitigation:**
- Use tested implementation (`lib/did.js` uses @noble libraries)
- Unit tests verify round-trip encoding/decoding
- DID format validated before use

---

### 3. HTTP Signatures (FEP-521)

**Assumption:** HTTP Signature headers prevent man-in-the-middle attacks when transmitted over HTTPS.

**What this means:**
- A signature over the request path, host, date, and digest cannot be forged without private key
- Changing any signed header invalidates the signature
- Signature proves the request originated from the claimed actor

**Signature Components (FEP-521 format):**
```
Signature: keyId="http://example.com/actor/alice#ed25519",
           algorithm="ed25519-sha512",
           headers="(request-target) host date digest",
           signature="MEQCIDf7..."

// Signed string:
(request-target): post /actor/bob/inbox
host: bob.example.com
date: Thu, 16 Jan 2026 12:00:00 GMT
digest: SHA-256=9f86d081884c7d6d9ffd84d2b5b4c0a4e9c0e0c3e8f7e1d0c0c1d5c1c1c4e9
```

**Risk:**
- HTTPS intercept (compromised CA) bypasses signature protection
- Clock skew attacks (forge old date headers)
- Signature header manipulation in insecure channels

**Mitigation:**
- Use HTTPS everywhere (no HTTP support)
- Validate date headers against current time (reject if >60s old)
- Pin TLS certificates in client implementations
- Use certificate transparency logging

---

### 4. Actor URL Authority

**Assumption:** An HTTP(S) endpoint at `http://example.com/actor/alice` is controlled by the actor "alice" at example.com.

**What this means:**
- The actor document is authoritative for that actor's identity
- We can resolve the actor's public key from `/actor/alice`
- The actor's migration endpoint at `/actor/alice/migrate` is authoritative

**We trust:**
- DNS resolution (with DNSSEC optional but recommended)
- TLS certificate validation
- HTTP endpoint ownership (no delegation model)

**We DON'T trust:**
- The actor document's content being authenticated (only that we got it from the right URL)
- Historical actor documents (we fetch fresh)
- Actor self-claims about identity (we only verify what they signed)

**Risk:**
- DNS hijacking could point to attacker's server
- TLS certificate compromise (compromised CA, key theft)
- HTTP Strict-Transport-Security (HSTS) bypass

**Mitigation:**
- Verify HTTPS only (never fallback to HTTP)
- Validate TLS certificates strictly
- Recommend DNS monitoring for domain changes
- Consider certificate pinning for federation partners

---

## What We DON'T Trust

### 1. Blockchain / Distributed Ledger

**We make NO assumptions about:**
- Blockchain immutability or finality
- Consensus mechanism security (Proof of Work, Proof of Stake, etc.)
- Smart contract correctness

**Why:**
- Identity bridge is independent of any blockchain
- No on-chain registry for DIDs, VCs, or revocation
- Bridge does NOT verify identity claims via blockchain

**Implication:**
- Do NOT store sensitive identity data on blockchain
- Do NOT assume blockchain provides global synchronization
- Do NOT trust blockchain-based revocation lists

---

### 2. Gossip Protocols / Transitive Trust

**We make NO assumptions about:**
- Peer-reported identity claims
- "Trust chains" through multiple actors
- Transitive verification (if A trusts B, B trusts C → A trusts C)

**Why:**
- Gossip is unreliable (lossy, out-of-order, Byzantine)
- No global consensus on trust relationships
- Single failure point: if one peer compromised, entire chain breaks

**Implication:**
- All identity claims must be verified end-to-end
- No "trust by association"
- Each actor independently verifies each claim

---

### 3. Centralized Revocation Registries

**We make NO assumptions about:**
- Global synchronization of revocation status
- Authoritative revocation servers
- Revocation list completeness

**Why:**
- No centralized authority (permissionless system)
- Revocation status can be cached and stale
- No guarantees of universal knowledge

**What we DO check:**
- Revocation status at time of verification (best-effort)
- Actor's own revocation endpoint (`/migration/status`)
- Redis cache of known revocations (up to TTL)

**Implication:**
- Newly-revoked identities may be accepted for up to TTL (default 24h)
- Recommend short TTL (1h) for high-security deployments
- Implement out-of-band revocation notification if needed

---

## Who Can Act

### Issuance (Creating VCs)

**Question:** Who is allowed to issue migration VCs?

**Answer:** Anyone with an Ed25519 keypair and DID:key

**Model:** Open/Permissionless
- No issuer registry or allow-list
- No credential authority
- Any actor can claim to migrate to any URL

**Implication:**
- **Fraudulent claims possible** (malicious actor issues fake migration VC)
- **Verification required** (always verify signature, never trust issuer metadata)
- **Transparent to end-user** (user's client checks signatures, not bridge)

### Verification

**Question:** Who is allowed to verify migration VCs?

**Answer:** Anyone who can fetch the issuer's public key from their DID

**Model:** Open/Permissionless
- No verifier registry
- No permission required
- Multiple independent verifiers can reach same conclusion (deterministic)

**Implication:**
- Verification is reproducible (given same input, same result)
- No single point of failure for verification
- Verifiers can be offline for some operations

### Subject Identity

**Question:** Can actor A issue a migration VC for actor B?

**Answer:** Yes, but B's verification will reveal the fraud

**How?**
- If A issues VC claiming "B is migrating", but doesn't have B's private key:
  - A can create VC with `issuer: A`, `subject: B`
  - Verifier will check: "Does B's public key verify this signature?"
  - Answer: **NO** (A signed it, not B)
  - Verification fails with `reason: "Signature verification failed"`

**Implication:**
- Only the subject can prove their own migration
- False claims are cryptographically unprovable
- Subject must sign any migration VC about themselves

---

## Verification Guarantees

### What Constitutes a Valid Migration VC

For a VC to be considered **VALID**, it must pass all 5 stages:

#### Stage 1: Schema Validation ✓
- VC has required fields: `@context`, `type`, `issuer`, `credentialSubject`, `issuanceDate`, `proof`
- `type` includes `"MigrationCredential"`
- `credentialSubject` has: `oldActor`, `newActor` (URL fields)
- `proof` has: `type: "Ed25519Signature2020"`, `signatureValue` (base64)

**Failure:** `INVALID_SCHEMA` (400) - VC structure malformed

#### Stage 2: Issuer Resolution ✓
- `issuer` is valid `did:key:z...` format
- Resolve issuer's public key from DID (decode multibase)
- Public key is 32 bytes (Ed25519)

**Failure:** `INVALID_DID` (400) - DID format wrong
**Failure:** `KEY_NOT_FOUND` (404) - Can't decode public key from DID

#### Stage 3: Signature Verification ✓
- Canonical JSON of `credentialSubject` (sorted keys, no whitespace)
- Ed25519 signature with issuer's public key
- Signature must verify successfully

**Failure:** `SIGNATURE_INVALID` (401) - Signature doesn't match

#### Stage 4: Revocation Check ✓
- Check if issuer DID is revoked (Redis revocation set)
- Check if subject DID (if different from issuer) is revoked

**Failure:** `REVOKED` (403) - Actor is revoked

#### Stage 5: Lineage Resolution ✓ (if `/newActor` present)
- Follow chain of migrations from old actor → new actor
- Maximum depth: 10 hops (configurable)
- No cycles (same actor appears twice)
- No forks (one actor has multiple `/newActor` targets)
- Verify each intermediate VC

**Failure:** `CHAIN_DEPTH_EXCEEDED` (403) - Too many hops
**Failure:** `CYCLE_DETECTED` (403) - Circular chain
**Failure:** `FORK_DETECTED` (403) - Multiple migration paths

### Verification Result

If ANY stage fails → verification returns `false`

```json
{
  "valid": false,
  "reason": "Signature verification failed",
  "stage": "signature_verification"
}
```

If ALL stages pass → verification returns `true` with full details

```json
{
  "valid": true,
  "issuer": "did:key:z6Mk...",
  "subject": "did:key:z6Mk...",
  "chain": {
    "start": "http://example.com/actor/alice",
    "end": "https://final.example.com/@alice",
    "hops": 3,
    "verified": true
  }
}
```

---

## Failure Modes

### Scenario 1: Compromised Private Key

**What happens:**
- Attacker has actor A's private key
- Attacker creates fake migration VC: "A is migrating to attacker's server"
- Attacker signs with A's private key (signature IS valid)

**Detection:**
- Chain resolution reaches attacker's server
- Out-of-band verification: "Did you really migrate?"
- Early revocation: Actor A can revoke their DID

**Mitigation:**
- Immediate revocation (bridge stops accepting migrations from A)
- Notify federation partners
- Issue new keypair, new DID for actor A

**Bridge role:** None (signature is valid). User/Admin must detect and revoke.

---

### Scenario 2: Certificate Authority Compromise

**What happens:**
- Attacker compromises CA, obtains certificate for `alice.example.com`
- Attacker redirects DNS to their server
- Attacker serves fake actor document from `/actor/alice`

**Detection:**
- Bridge validates HTTPS certificate (certificate is fake for `alice.example.com`)
- Certificate mismatch causes rejection

**Bridge blocks:** Connection fails at TLS layer (HTTPS validation)

**Mitigation:**
- Use certificate pinning in client implementations
- Monitor Certificate Transparency logs
- Implement HSTS for domain

---

### Scenario 3: DNS Hijacking

**What happens:**
- Attacker redirects `alice.example.com` to `attacker.com`
- Bridge attempts to verify signature
- Bridge fetches public key from attacker's server

**Detection:**
- Bridge gets different public key than expected
- Signature verification fails
- VC is marked invalid

**Bridge blocks:** Signature verification fails

**Mitigation:**
- Recommend DNSSEC
- Monitor DNS changes
- Consider key pinning

---

### Scenario 4: Stale Revocation Cache

**What happens:**
- Actor A's DID is revoked (set to revoked in Redis)
- But TTL expired, Redis evicted the revocation
- New VC from A arrives

**Detection:**
- Revocation check hits "unknown" (not in Redis, not fresh fetched)
- Conservative behavior: Accept VC (can't prove it's revoked)

**Bridge accepts:** VC is valid (revocation unknown)

**Mitigation:**
- Use short TTL for revocation cache (default 24h, recommend 1h for high-security)
- Out-of-band revocation notification (webhook when revoked)
- Implement revocation transparency logs

---

## Summary Table

| What | Trust? | Why | Risk | Mitigation |
|------|--------|-----|------|-----------|
| Ed25519 crypto | ✅ YES | Peer-reviewed algorithm | Quantum, CSPRNG fail | Monitor standards, use OS entropy |
| DID:key encoding | ✅ YES | Self-certifying, no external deps | Encoding bugs | Unit tests, round-trip validation |
| HTTP Signatures | ✅ YES | FEP-521 standard | HTTPS bypass | TLS enforcement, cert pinning |
| Actor URL control | ✅ YES | Domain/HTTPS ownership | DNS/CA compromise | DNSSEC, cert transparency |
| Blockchain | ❌ NO | Not part of system | Centralization risk | N/A (not used) |
| Gossip protocols | ❌ NO | Unreliable, unverifiable | Byzantine failure | End-to-end verification |
| Revocation registries | ❌ NO | No global sync | Stale revocation | Short TTL, out-of-band notify |
| Cached data | ❌ NO | Can be stale | Revocation delay | Check freshness, re-verify |

---

## Recommendations for Implementers

### For Clients

1. **Never trust bridge without verification**
   - Always verify signatures locally
   - Fetch public keys from DID, not bridge

2. **Secure key storage**
   - Store private keys encrypted
   - Use hardware security module (HSM) if possible
   - Never transmit private keys

3. **Implement key rotation**
   - Generate new keypair periodically
   - Revoke old DID when new one ready
   - Notify federation partners

### For Server Operators

1. **Validate all Move activities via bridge**
   - Never accept migration without verification
   - Use `/verify` endpoint before state changes
   - Log all verification results

2. **Monitor revocation status**
   - Check revocation in background
   - Alert if actor becomes revoked
   - Undo migrations from revoked actors

3. **Use TLS everywhere**
   - HTTPS only (no HTTP)
   - Valid certificates from trusted CA
   - Consider HSTS and certificate pinning

### For Bridge Operators

1. **Keep Redis backed up**
   - Regular snapshots of DID/VC registry
   - Disaster recovery plan
   - Monitor data integrity

2. **Monitor verification failures**
   - Log all signature verification failures
   - Alert on unusual patterns
   - Track revocation events

3. **Security hardening**
   - Rate limiting on `/verify`
   - DDoS protection
   - Regular security audits

---

## Conclusion

The Fediverse Identity Bridge uses **strong cryptographic assumptions** (Ed25519) and **distributed trust model** (no central authority). This enables:

- ✅ Permissionless identity migration
- ✅ Self-sovereign key ownership
- ✅ Deterministic verification
- ✅ Transparent trust assumptions

But requires:

- ⚠️ Careful key management by users
- ⚠️ Verification by all parties
- ⚠️ Proper revocation procedures
- ⚠️ HTTPS infrastructure

See [CONFIGURATION.md](CONFIGURATION.md) for deployment guidance and [API.md](API.md) for verification details.
