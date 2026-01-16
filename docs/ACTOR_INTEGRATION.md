# Actor-Side Integration Guide (Task 2.2)

## Overview

This guide explains how ActivityPub actor nodes integrate with the Fediverse Identity Bridge to perform identity migrations. Actors sign VCs locally using their Ed25519 keypair and submit them to the bridge for verification and storage.

## Architecture

```
┌─────────────────────┐
│   Actor Node        │
│  (ActivityPub)      │
│                     │
│  1. Generate keys   │
│  2. Create VC       │
│  3. Sign VC         │
│  4. Store to bridge │
└────────┬────────────┘
         │
         │ HTTP POST /store
         │ (signed VC)
         ▼
┌─────────────────────┐
│  Identity Bridge    │
│  (Port 4000)        │
│                     │
│  1. Verify signature│
│  2. Validate proof  │
│  3. Store in Redis  │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Redis Backend      │
│  (Port 6379)        │
│                     │
│  Persistent VC      │
│  storage & lookup   │
└─────────────────────┘
```

## Step-by-Step Workflow

### Step 1: Generate Actor Keypair

Each actor needs a unique Ed25519 keypair (32-byte private/public keys).

```javascript
const { generateKeypairEd25519 } = require('./lib/crypto');
const { getDidFromPublicKey } = require('./lib/did');

async function setupActor(actorName) {
  // Generate keypair
  const kp = await generateKeypairEd25519();
  const publicKey = kp.publicKey;   // base64 string (32 bytes)
  const privateKey = kp.privateKey; // base64 string (32 bytes)

  // Derive DID from public key
  const actorDid = await getDidFromPublicKey(publicKey);
  console.log(`Actor DID: ${actorDid}`);

  // Store keys securely
  fs.writeFileSync(`keys/${actorName}/public.b64`, publicKey);
  fs.writeFileSync(`keys/${actorName}/private.b64`, privateKey);

  return { publicKey, privateKey, actorDid };
}
```

**Key Format:**
- Public key: base64-encoded 32-byte Ed25519 public key
- Private key: base64-encoded 32-byte Ed25519 private key
- DID: `did:key:z6Mk...` (multibase-encoded public key)

### Step 2: Request Unsigned VC from Bridge

The actor can request a template unsigned VC from the bridge. This provides a standardized format with required fields.

```javascript
const fetch = require('node-fetch');

async function requestUnsignedVC(bridgeUrl, issuerDid, oldActorUrl, newActorUrl) {
  const response = await fetch(`${bridgeUrl}/migrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      issuerDid,        // Actor's DID
      subjectDid: issuerDid,
      oldActor: oldActorUrl,
      newActor: newActorUrl
    })
  });

  const unsignedVC = await response.json();
  return unsignedVC;
}
```

**Response format:**
```json
{
  "id": "http://localhost:3000/credentials/vc1",
  "type": ["VerifiableCredential", "MigrationCredential"],
  "issuer": "did:key:z6Mk...",
  "credentialSubject": {
    "id": "did:key:z6Mk...",
    "oldActor": "http://localhost:3000/actor/alice",
    "newActor": "http://localhost:3001/actor/alice"
  },
  "issuanceDate": "2024-01-15T10:00:00.000Z"
}
```

### Step 3: Sign VC Locally

The actor signs the unsigned VC using Ed25519. This requires:
1. **Canonical JSON** - deterministic serialization with sorted keys, no whitespace
2. **Private key** - 32-byte Ed25519 key
3. **Signature** - base64-encoded Ed25519 signature

```javascript
const { signEd25519 } = require('./lib/crypto');

// Canonical JSON serialization (sorted keys, no whitespace)
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

async function signVC(unsignedVC, privateKey, actorDid) {
  // Serialize to canonical JSON
  const canonical = stableStringify(unsignedVC);
  
  // Sign using Ed25519
  const signature = await signEd25519(privateKey, canonical);

  // Attach proof
  const signedVC = Object.assign({}, unsignedVC, {
    proof: {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      proofPurpose: 'assertionMethod',
      verificationMethod: `${actorDid}#owner`,
      signature: signature
    }
  });

  return signedVC;
}
```

### Step 4: Submit Signed VC to Bridge

Post the signed VC to the bridge `/store` endpoint for verification and storage.

```javascript
async function submitVC(bridgeUrl, signedVC) {
  const response = await fetch(`${bridgeUrl}/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vc: signedVC })
  });

  if (!response.ok) {
    throw new Error(`Bridge rejected VC: ${response.status}`);
  }

  const result = await response.json();
  console.log('VC stored successfully:', result);
  return result;
}
```

### Complete Example

See [examples/actor_integration_example.js](../examples/actor_integration_example.js) for a full working example.

**Usage:**
```bash
node examples/actor_integration_example.js \
  --actor alice \
  --old-url http://localhost:3000/actor/alice \
  --new-url http://localhost:3001/actor/alice \
  --issuer did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6 \
  --bridge http://localhost:4000
```

## Implementation Details

### Canonical JSON Format

Signatures are computed over canonical (deterministic) JSON:
- **Keys sorted** alphabetically
- **No whitespace** (no spaces, newlines, or indentation)
- **No optional fields** (all fields present)

Example:
```javascript
// NOT canonical (has whitespace):
{
  "issuer": "did:key:...",
  "id": "http://..."
}

// Canonical (sorted, no whitespace):
{"id":"http://...","issuer":"did:key:..."}
```

### Ed25519 Signature Verification

The bridge verifies signatures using:
1. Extract public key from issuer DID
2. Reconstruct canonical JSON from credential
3. Verify signature using Ed25519

```javascript
const { verifyEd25519 } = require('./lib/crypto');
const { getRawFromDid } = require('./lib/did');

async function verifyVC(signedVC) {
  // Extract public key from DID
  const publicKeyBase64 = await getRawFromDid(signedVC.issuer);

  // Get signature from proof
  const signature = signedVC.proof.signature;

  // Reconstruct canonical JSON (without proof field)
  const vcWithoutProof = Object.assign({}, signedVC);
  delete vcWithoutProof.proof;
  const canonical = stableStringify(vcWithoutProof);

  // Verify
  const valid = await verifyEd25519(publicKeyBase64, canonical, signature);
  return valid;
}
```

## Error Handling

### Common Issues

**Issue: Bridge connection refused**
- **Cause:** Bridge not running on port 4000
- **Solution:** `node bridge.js` in separate terminal, ensure `REDIS_HOST=localhost`

**Issue: Invalid signature**
- **Cause:** Canonical JSON changed before signing, or wrong private key used
- **Solution:** Ensure JSON is strictly canonicalized before signing

**Issue: Wrong DID in VC**
- **Cause:** Public key doesn't match DID
- **Solution:** Regenerate DID from public key: `await getDidFromPublicKey(pubKey)`

### Graceful Fallbacks

```javascript
// Fallback if bridge unavailable
async function submitVCWithFallback(bridgeUrl, signedVC, fallbackDir) {
  try {
    return await submitVC(bridgeUrl, signedVC);
  } catch (e) {
    console.log('Bridge unavailable, storing locally:', e.message);
    const filename = path.join(fallbackDir, `vc_${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(signedVC, null, 2));
    return { stored: 'local', filename };
  }
}
```

## Testing

Run the test suite:
```bash
npm test -- tests/actor_integration.test.js
```

Tests cover:
- Keypair generation and storage
- DID derivation from public key
- Canonical JSON serialization
- Ed25519 signing and verification
- Proof attachment to VC
- Complete end-to-end workflows
- Tampered VC rejection
- Key rotation scenarios

## Security Considerations

1. **Private Key Storage:**
   - Store in secure location (not in code repositories)
   - Use environment variables or encrypted key management
   - Restrict file permissions: `chmod 600 keys/actor/private.b64`

2. **Signature Verification:**
   - Bridge always verifies signatures before storing
   - Actor can verify their own VCs locally

3. **Key Rotation:**
   - Actors can generate new keypairs and sign migration VCs
   - Old VCs remain valid (signed with old key)
   - Both keys can be used during transition period

4. **Canonical JSON:**
   - Critical for deterministic signatures
   - Any deviation breaks signature verification
   - Must be strictly enforced

## Actor Node Integration

For ActivityPub servers (e.g., Mastodon, Pixelfed):

1. **Generate keypair on startup** (or load from storage)
2. **Store in actor profile** (optionally expose as public key)
3. **On migration request:**
   - Call bridge `/migrate` to get unsigned VC
   - Sign locally using private key
   - Submit to bridge `/store`
4. **Monitor migration status:**
   - Poll bridge `/resolve/:did` for verification status
   - Check `/lineage/actor?url=...` for chain status

## API Reference

### Bridge Endpoints (from Actor Perspective)

#### GET /health
Check bridge status.

```bash
curl http://localhost:4000/health
```

#### POST /migrate
Request unsigned VC template.

```bash
curl -X POST http://localhost:4000/migrate \
  -H 'Content-Type: application/json' \
  -d '{
    "issuerDid": "did:key:z...",
    "subjectDid": "did:key:z...",
    "oldActor": "http://old.example.com/actor",
    "newActor": "http://new.example.com/actor"
  }'
```

#### POST /store
Submit signed VC for verification and storage.

```bash
curl -X POST http://localhost:4000/store \
  -H 'Content-Type: application/json' \
  -d '{
    "vc": {
      "id": "...",
      "type": ["VerifiableCredential", "MigrationCredential"],
      "issuer": "did:key:z...",
      "credentialSubject": {...},
      "issuanceDate": "2024-01-15T10:00:00.000Z",
      "proof": {
        "type": "Ed25519Signature2020",
        "signature": "..."
      }
    }
  }'
```

#### GET /resolve/:did
Resolve DID to current actor URL.

```bash
curl http://localhost:4000/resolve/did%3Akey%3Az...
```

#### GET /lineage/actor?url=...
Get identity chain for actor URL.

```bash
curl 'http://localhost:4000/lineage/actor?url=http://old.example.com/actor'
```

## See Also

- [lib/crypto.js](../lib/crypto.js) - Cryptographic operations
- [lib/did.js](../lib/did.js) - DID encoding/decoding
- [lib/vc.js](../lib/vc.js) - VC structure and validation
- [bridge.js](../bridge.js) - Bridge API server
- [examples/actor_integration_example.js](../examples/actor_integration_example.js) - Working example
- [tests/actor_integration.test.js](../tests/actor_integration.test.js) - Test suite
