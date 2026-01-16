# API Reference (Task 9.3)

Complete reference for the Fediverse Identity Bridge API endpoints.

---

## Base URL

```
http://127.0.0.1:4000  # Sidecar (default, localhost-only)
https://bridge.example.com  # Federation (if publicly exposed)
```

---

## Endpoints

### 1. POST /migrate

**Purpose:** Generate unsigned VC template for client signing

**Request:**
```json
{
  "issuerDid": "did:key:z6Mk...",
  "subjectDid": "did:key:z6Mk...",
  "oldActor": "http://example.com/actor/alice",
  "newActor": "https://mastodon.social/@alice"
}
```

**Response (200 OK):**
```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "id": "vc:migration:uuid",
  "type": ["VerifiableCredential", "MigrationCredential"],
  "issuer": "did:key:z6Mk...",
  "issuanceDate": "2026-01-16T12:00:00Z",
  "credentialSubject": {
    "id": "did:key:z6Mk...",
    "oldActor": "http://example.com/actor/alice",
    "newActor": "https://mastodon.social/@alice"
  }
}
```

**Error Responses:**
- `400 Bad Request` - Missing required fields
- `503 Service Unavailable` - Backend error (Redis, etc.)

**Notes:**
- Response has NO `proof` field (client must sign)
- Actor can add custom fields to `credentialSubject` if needed
- Date is UTC ISO 8601 format

---

### 2. POST /store

**Purpose:** Submit signed VC for persistent storage

**Request:**
```json
{
  "vc": {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "id": "vc:migration:uuid",
    "type": ["VerifiableCredential", "MigrationCredential"],
    "issuer": "did:key:z6Mk...",
    "issuanceDate": "2026-01-16T12:00:00Z",
    "credentialSubject": {
      "id": "did:key:z6Mk...",
      "oldActor": "http://example.com/actor/alice",
      "newActor": "https://mastodon.social/@alice"
    },
    "proof": {
      "type": "Ed25519Signature2020",
      "created": "2026-01-16T12:00:00Z",
      "verificationMethod": "did:key:z6Mk...#z6Mk...",
      "signatureValue": "MEQCIDf7..."
    }
  }
}
```

**Response (200 OK):**
```json
{
  "id": "vc:migration:uuid",
  "stored": true,
  "expiresAt": "2026-01-23T12:00:00Z"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid VC structure
- `401 Unauthorized` - Signature verification failed
- `403 Forbidden` - Revocation check failed
- `503 Service Unavailable` - Backend error

**Notes:**
- Triggers full verification pipeline (see `/verify`)
- Stores VC in Redis with TTL (default 24h)
- Returns expiration time

---

### 3. POST /verify

**Purpose:** Verify signed VC without storing

**Request:**
```json
{
  "vc": {
    ...complete signed VC...
  }
}
```

**Response (200 OK - Valid):**
```json
{
  "valid": true,
  "id": "vc:migration:uuid",
  "issuer": "did:key:z6Mk...",
  "subject": "did:key:z6Mk...",
  "timestamp": "2026-01-16T12:00:00Z",
  "chain": {
    "start": "http://example.com/actor/alice",
    "end": "https://mastodon.social/@alice",
    "hops": 1,
    "verified": true
  }
}
```

**Response (200 OK - Invalid):**
```json
{
  "valid": false,
  "reason": "Signature verification failed",
  "details": "ECDSA signature invalid for issuer public key"
}
```

**Error Responses:**
- `400 Bad Request` - Malformed VC
- `503 Service Unavailable` - Backend error

**Verification Pipeline:**
1. ✅ Schema validation (required fields present)
2. ✅ Issuer DID resolution (fetch public key)
3. ✅ Signature verification (Ed25519)
4. ✅ Subject revocation check
5. ✅ Chain resolution (if `/newActor` present)

---

### 4. GET /resolve/:did

**Purpose:** Resolve a DID to public key and metadata

**Request:**
```
GET /resolve/did:key:z6MkhaXgBZDvotXY9aXKmLF2RFk1v1r4YmHdXrY9jqYkNE85
```

**Response (200 OK):**
```json
{
  "did": "did:key:z6MkhaXgBZDvotXY9aXKmLF2RFk1v1r4YmHdXrY9jqYkNE85",
  "publicKey": "dh5cNKp25TorVRJEVzpcuz0qJ4l+0o+4pH4Msfvo...",
  "method": "key",
  "publicKeyEncoding": "base64"
}
```

**Error Responses:**
- `400 Bad Request` - Invalid DID format
- `404 Not Found` - DID not found in registry
- `503 Service Unavailable` - Backend error

**Notes:**
- DIDs use `did:key` multibase encoding
- Public keys returned in base64 (Ed25519 raw 32 bytes)
- Cached in Redis (default TTL: 7 days)

---

### 5. GET /lineage/actor?url=:actor_url

**Purpose:** Resolve identity chain from actor URL

**Request:**
```
GET /lineage/actor?url=http://example.com/actor/alice
```

**Response (200 OK - Simple Chain):**
```json
{
  "start": "http://example.com/actor/alice",
  "end": "https://mastodon.social/@alice",
  "chain": [
    {
      "oldActor": "http://example.com/actor/alice",
      "newActor": "https://mastodon.social/@alice",
      "vc": { ...VC details... },
      "verified": true
    }
  ],
  "issues": []
}
```

**Response (200 OK - With Issues):**
```json
{
  "start": "http://example.com/actor/alice",
  "end": "http://example.com/actor/alice",
  "chain": [],
  "issues": [
    "Max chain depth exceeded (10) at actor: https://actor15.example.com/",
    "Cycle detected: https://actor3.example.com/ → https://actor3.example.com/",
    "Fork detected at: https://actor5.example.com/ (multiple newActor values)"
  ]
}
```

**Error Responses:**
- `400 Bad Request` - Invalid URL
- `503 Service Unavailable` - Backend error

**Query Parameters:**
- `url` (required) - Actor URL to resolve from
- `maxDepth` (optional) - Max chain hops (default: 10)

**Resolution Rules:**
1. Fetch VC from actor's `/migration` endpoint
2. Follow `/newActor` links up to `maxDepth` hops
3. Verify signature at each hop
4. Detect cycles, forks, revocation
5. Return terminal actor and chain

---

### 6. GET /lineage/did/:did

**Purpose:** Resolve identity chain from DID

**Request:**
```
GET /lineage/did/did:key:z6MkhaXgBZDvotXY9aXKmLF2RFk1v1r4YmHdXrY9jqYkNE85
```

**Response:** (Same as `/lineage/actor`)

**Error Responses:**
- `400 Bad Request` - Invalid DID format
- `503 Service Unavailable` - Backend error

**Query Parameters:**
- `maxDepth` (optional) - Max chain hops (default: 10)

---

## Error Codes

All errors follow this format:

```json
{
  "error": "Error code",
  "reason": "Human-readable explanation",
  "details": "Optional technical details"
}
```

### Common Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `MISSING_FIELDS` | 400 | Required fields missing from request |
| `INVALID_FORMAT` | 400 | Malformed request (JSON, URL, etc.) |
| `INVALID_SCHEMA` | 400 | VC structure invalid |
| `INVALID_DID` | 400 | DID format not `did:key:z...` |
| `SIGNATURE_INVALID` | 401 | Ed25519 signature failed verification |
| `KEY_NOT_FOUND` | 404 | Issuer public key not in registry |
| `REVOKED` | 403 | Subject or issuer is revoked |
| `CHAIN_DEPTH_EXCEEDED` | 403 | Chain longer than maxDepth |
| `CYCLE_DETECTED` | 403 | Circular identity chain detected |
| `FORK_DETECTED` | 403 | Actor has multiple newActor values |
| `BACKEND_ERROR` | 503 | Redis or external service error |
| `TIMEOUT` | 504 | Request took too long |

---

## Request/Response Format

### Content-Type
- **Request:** `application/json`
- **Response:** `application/json` (always)

### Status Codes
- `200 OK` - Success (check `valid` field in body)
- `400 Bad Request` - Malformed request
- `401 Unauthorized` - Authentication/signature failed
- `403 Forbidden` - Verification failed (revoked, depth limit, etc.)
- `404 Not Found` - Resource not found
- `503 Service Unavailable` - Backend error
- `504 Gateway Timeout` - Request too slow

### Timeouts
- Default timeout: 30 seconds
- Individual remote fetches: 5 seconds each

---

## Examples

### Complete Signing Workflow

```bash
# 1. Request unsigned VC
curl -X POST http://127.0.0.1:4000/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "issuerDid": "did:key:z6Mk...",
    "subjectDid": "did:key:z6Mk...",
    "oldActor": "http://example.com/actor/alice",
    "newActor": "https://mastodon.social/@alice"
  }'

# 2. Sign locally (on client device)
# ... Ed25519 signing happens here ...

# 3. Submit signed VC
curl -X POST http://127.0.0.1:4000/store \
  -H "Content-Type: application/json" \
  -d '{"vc": {...signed VC...}}'

# Response:
# {"id": "vc:...", "stored": true, "expiresAt": "2026-01-23T..."}
```

### Verification Without Storage

```bash
# Verify VC without storing
curl -X POST http://127.0.0.1:4000/verify \
  -H "Content-Type: application/json" \
  -d '{"vc": {...signed VC...}}'

# Response (if valid):
# {"valid": true, "id": "vc:...", "issuer": "did:key:z...", ...}

# Response (if invalid):
# {"valid": false, "reason": "Signature verification failed"}
```

### Chain Resolution

```bash
# Resolve identity chain from old actor
curl "http://127.0.0.1:4000/lineage/actor?url=http://example.com/actor/alice&maxDepth=20"

# Response:
# {
#   "start": "http://example.com/actor/alice",
#   "end": "https://final.actor.example.com/users/alice",
#   "chain": [...],
#   "issues": []
# }
```

---

## Rate Limiting

Currently **no rate limiting** implemented. For production:

- Recommend: 100 requests/second per IP
- Burst: 1000 requests/second
- Use reverse proxy (nginx) for enforcement

---

## Security Considerations

### HTTPS Required
- Bridge should run behind reverse proxy with TLS
- Never expose on HTTP in production
- Use TLS certificate pinning in clients if possible

### DDoS Protection
- Implement rate limiting on reverse proxy
- Monitor for recursive chain resolution attacks
- Set reasonable `maxDepth` defaults

### Key Management
- Private keys never transmitted to bridge
- Bridge stores only public keys (from DIDs)
- Revocation status checked on verification

---

## Versioning

Current API version: `1.0`

Breaking changes will increment major version. Add `/v1/` prefix when breaking changes occur:
```
POST /v1/verify
POST /v2/verify  (future)
```

---

## Support

For issues or questions:
1. Check docs in [CLIENT_SIGNING_WORKFLOW.md](CLIENT_SIGNING_WORKFLOW.md)
2. See [CONFIGURATION.md](CONFIGURATION.md) for setup
3. Review [TRUST_MODEL.md](TRUST_MODEL.md) for security assumptions
