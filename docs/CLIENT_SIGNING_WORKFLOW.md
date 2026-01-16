# Client-Side Signing Workflow (Task 3.1)

## Overview

The Fediverse Identity Bridge supports a **user-centric key ownership model** where clients (users/devices) retain full control over their Ed25519 private keys. The bridge never handles private keys—it only verifies signatures and manages identity state.

This document describes the complete client-side signing workflow for migration credentials.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (User Device)                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 1. Generate Ed25519 keypair (or load from storage)  │    │
│  │ 2. Derive DID from public key                       │    │
│  │ 3. Request unsigned VC from server                  │    │
│  │ 4. Sign VC locally with private key                 │    │
│  │ 5. Submit signed VC to bridge for verification      │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
              ↓ (unsigned VC)        ↑ (signed VC)
┌──────────────────────────┐    ┌──────────────────────────┐
│    Server/Node A         │    │   Bridge Service         │
│  GET /actor/:user/       │    │ POST /verify             │
│      migrate             │    │ POST /store              │
│  Returns unsigned VC     │    │ Verifies signatures      │
│  Stores Move activity    │    │ Manages state            │
└──────────────────────────┘    └──────────────────────────┘
```

---

## Step 1: Generate or Load Keypair

### Generate New Ed25519 Keypair

```javascript
const { generateKeypairEd25519 } = require('./lib/crypto');

async function createNewKeypair() {
  const keypair = await generateKeypairEd25519();
  return {
    privateKeyBase64: keypair.privateKeyBase64,  // Keep secret!
    publicKeyBase64: keypair.publicKeyBase64     // Share this
  };
}
```

**Important:** Store the private key securely (encrypted local storage, hardware wallet, etc.). Never transmit it over the network.

### Load Existing Keypair

```javascript
const fs = require('fs');
const path = require('path');

function loadKeypairFromStorage(username) {
  const privPath = path.join('keys', username, 'private.key');
  const pubPath = path.join('keys', username, 'public.key');
  
  return {
    privateKeyBase64: fs.readFileSync(privPath, 'utf8').trim(),
    publicKeyBase64: fs.readFileSync(pubPath, 'utf8').trim()
  };
}
```

---

## Step 2: Derive DID from Public Key

```javascript
const { getDidFromPublicKey } = require('./lib/did');

async function deriveDidFromPublicKey(publicKeyBase64) {
  const did = await getDidFromPublicKey(publicKeyBase64);
  // Returns: did:key:z6Mk... (multicodec-encoded)
  return did;
}

// Example usage:
const did = await deriveDidFromPublicKey(keypair.publicKeyBase64);
console.log('Your DID:', did);
// Your DID: did:key:z6MkhaXgBZDvotXY9aXKmLF2RFk1v1r4YmHdXrY9jqYkNE85
```

---

## Step 3: Request Unsigned VC from Server

```javascript
const fetch = require('node-fetch');

async function requestUnsignedVC(serverUrl, username, newActorUrl) {
  const response = await fetch(`${serverUrl}/actor/${username}/migrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newActor: newActorUrl  // Where you're migrating to
    })
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.unsignedVc;  // VC without proof field
}

// Example usage:
const unsignedVc = await requestUnsignedVC(
  'http://localhost:3000',
  'alice',
  'https://mastodon.social/@alice'
);

console.log('Unsigned VC:', JSON.stringify(unsignedVc, null, 2));
/*
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": "VerifiableCredential",
  "issuer": "did:key:z6Mk...",
  "credentialSubject": {
    "id": "did:key:z6Mk...",
    "oldActor": "http://localhost:3000/actor/alice",
    "newActor": "https://mastodon.social/@alice"
  },
  "issuanceDate": "2026-01-16T12:34:56Z"
  // Note: No "proof" field yet
}
*/
```

---

## Step 4: Sign VC Locally

```javascript
const { signEd25519 } = require('./lib/crypto');
const { getDidFromPublicKey } = require('./lib/did');

async function signVCLocally(unsignedVc, privateKeyBase64, publicKeyBase64) {
  // Get canonical JSON of credentialSubject
  const subject = unsignedVc.credentialSubject;
  const canonicalJson = JSON.stringify(subject, Object.keys(subject).sort());
  
  // Sign with private key
  const signature = await signEd25519(canonicalJson, privateKeyBase64);
  
  // Get public key DID
  const did = await getDidFromPublicKey(publicKeyBase64);
  
  // Attach proof to VC
  const signedVc = {
    ...unsignedVc,
    proof: {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: `${did}#z6Mk...`,  // Public key identifier
      signatureValue: signature  // Base64-encoded signature
    }
  };
  
  return signedVc;
}

// Example usage:
const keypair = loadKeypairFromStorage('alice');
const signedVc = await signVCLocally(
  unsignedVc,
  keypair.privateKeyBase64,
  keypair.publicKeyBase64
);

console.log('Signed VC:', JSON.stringify(signedVc, null, 2));
/*
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": "VerifiableCredential",
  "issuer": "did:key:z6Mk...",
  "credentialSubject": { ... },
  "issuanceDate": "2026-01-16T12:34:56Z",
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-01-16T12:34:56Z",
    "verificationMethod": "did:key:z6Mk...#z6Mk...",
    "signatureValue": "MEQCIDf7..." // Ed25519 signature
  }
}
*/
```

---

## Step 5: Submit Signed VC to Bridge

### Option A: POST to `/verify` (Read-Only)

```javascript
async function verifyVCWithBridge(bridgeUrl, signedVc) {
  const response = await fetch(`${bridgeUrl}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vc: signedVc })
  });

  const result = await response.json();
  return result;
  /*
  {
    "valid": true,
    "reason": "Signature verified successfully",
    "id": "urn:uuid:...",
    "issuer": "did:key:z6Mk...",
    "subject": "did:key:z6Mk...",
    "timestamp": "2026-01-16T12:34:56Z"
  }
  */
}

// Example usage:
const verifyResult = await verifyVCWithBridge('http://localhost:4000', signedVc);
if (verifyResult.valid) {
  console.log('✅ VC is valid!');
} else {
  console.log('❌ VC verification failed:', verifyResult.reason);
}
```

### Option B: POST to `/store` (Persistent Storage)

```javascript
async function storeVCWithBridge(bridgeUrl, signedVc) {
  const response = await fetch(`${bridgeUrl}/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vc: signedVc })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Storage failed: ${error.error}`);
  }

  const result = await response.json();
  return result;
  /*
  {
    "id": "urn:uuid:...",
    "stored": true,
    "expiresAt": "2026-01-23T12:34:56Z"  // TTL set by bridge
  }
  */
}

// Example usage:
const storeResult = await storeVCWithBridge('http://localhost:4000', signedVc);
console.log('✅ VC stored in bridge:', storeResult.id);
```

---

## Complete Workflow Example

```javascript
const { generateKeypairEd25519, signEd25519 } = require('./lib/crypto');
const { getDidFromPublicKey } = require('./lib/did');
const fetch = require('node-fetch');

async function completeMigrationFlow(options = {}) {
  const {
    serverUrl = 'http://localhost:3000',
    bridgeUrl = 'http://localhost:4000',
    username = 'alice',
    newActorUrl = 'https://mastodon.social/@alice'
  } = options;

  console.log('=== Client-Side Migration Workflow ===\n');

  // Step 1: Generate keypair
  console.log('1️⃣  Generating Ed25519 keypair...');
  const keypair = await generateKeypairEd25519();
  console.log(`   Public Key: ${keypair.publicKeyBase64.substring(0, 20)}...`);
  
  // Step 2: Derive DID
  console.log('\n2️⃣  Deriving DID from public key...');
  const did = await getDidFromPublicKey(keypair.publicKeyBase64);
  console.log(`   DID: ${did}`);

  // Step 3: Request unsigned VC
  console.log('\n3️⃣  Requesting unsigned VC from server...');
  const response1 = await fetch(`${serverUrl}/actor/${username}/migrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newActor: newActorUrl })
  });
  const { unsignedVc } = await response1.json();
  console.log(`   VC ID: ${unsignedVc.id || 'generated'}`);
  console.log(`   Status: No proof field (unsigned)`);

  // Step 4: Sign locally
  console.log('\n4️⃣  Signing VC with private key (never transmitted)...');
  const subject = unsignedVc.credentialSubject;
  const canonicalJson = JSON.stringify(subject, Object.keys(subject).sort());
  const signature = await signEd25519(canonicalJson, keypair.privateKeyBase64);
  
  const signedVc = {
    ...unsignedVc,
    proof: {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      verificationMethod: `${did}#z6Mk...`,
      signatureValue: signature
    }
  };
  console.log(`   Signature: ${signature.substring(0, 20)}...`);
  console.log(`   Status: VC now has proof field`);

  // Step 5: Submit to bridge
  console.log('\n5️⃣  Submitting signed VC to bridge...');
  const response2 = await fetch(`${bridgeUrl}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vc: signedVc })
  });
  const verifyResult = await response2.json();
  console.log(`   Valid: ${verifyResult.valid}`);
  console.log(`   Reason: ${verifyResult.reason}`);

  console.log('\n✅ Migration workflow complete!\n');
  
  return {
    keypair,
    did,
    unsignedVc,
    signedVc,
    verifyResult
  };
}

// Run the workflow
completeMigrationFlow().catch(console.error);
```

---

## Security Considerations

### ✅ Do's
- **Store private keys securely**: Use encrypted storage, hardware wallets, or secure enclaves
- **Sign locally**: Always perform signing on the client device
- **Validate server responses**: Check that DIDs and actor URLs match expectations
- **Use HTTPS**: All communication should use TLS/SSL in production
- **Rotate keys regularly**: Implement key rotation protocols
- **Audit logs**: Log all signing operations for security review

### ❌ Don'ts
- **Never transmit private keys**: Not even to the bridge
- **Don't hardcode keys**: Use secure configuration management
- **Don't trust unsigned VCs**: Always verify signatures before accepting identity claims
- **Don't skip bridge verification**: Always verify signatures with the bridge
- **Don't expose keypairs in logs**: Mask sensitive key material in debug output
- **Don't use HTTP**: Always use HTTPS in production

---

## Error Handling

```javascript
async function robustSigningWorkflow(options) {
  try {
    // Step 1: Keypair generation
    let keypair;
    try {
      keypair = loadKeypairFromStorage(options.username);
      console.log('Loaded keypair from storage');
    } catch (e) {
      console.log('Generating new keypair...');
      keypair = await generateKeypairEd25519();
    }

    // Step 2: DID derivation
    const did = await getDidFromPublicKey(keypair.publicKeyBase64);

    // Step 3: Request unsigned VC with timeout
    let unsignedVc;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${options.serverUrl}/actor/${options.username}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newActor: options.newActorUrl }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      unsignedVc = (await response.json()).unsignedVc;
    } catch (e) {
      console.error('Failed to request unsigned VC:', e.message);
      throw new Error('Server unreachable or invalid response');
    }

    // Step 4: Sign locally (should not fail)
    const subject = unsignedVc.credentialSubject;
    const canonicalJson = JSON.stringify(subject, Object.keys(subject).sort());
    const signature = await signEd25519(canonicalJson, keypair.privateKeyBase64);

    const signedVc = {
      ...unsignedVc,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${did}#z6Mk...`,
        signatureValue: signature
      }
    };

    // Step 5: Submit with retry logic
    let retries = 3;
    let verifyResult = null;
    
    while (retries > 0) {
      try {
        const response = await fetch(`${options.bridgeUrl}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vc: signedVc })
        });

        verifyResult = await response.json();
        
        if (verifyResult.valid) {
          return { success: true, result: verifyResult };
        } else {
          throw new Error(verifyResult.reason);
        }
      } catch (e) {
        retries--;
        if (retries === 0) {
          throw new Error(`Bridge verification failed after 3 attempts: ${e.message}`);
        }
        console.warn(`Retry ${4 - retries}/3: ${e.message}`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: error.stack
    };
  }
}
```

---

## Language Examples

### Node.js
See complete example in `examples/actor_integration_example.js`.

### Python
```python
import requests
import json
from lib_ed25519 import sign_ed25519, generate_keypair
from lib_did import get_did_from_public_key

def client_signing_workflow(server_url, bridge_url, username, new_actor_url):
    # 1. Generate keypair
    keypair = generate_keypair()
    
    # 2. Derive DID
    did = get_did_from_public_key(keypair['public_key'])
    
    # 3. Request unsigned VC
    response = requests.post(
        f"{server_url}/actor/{username}/migrate",
        json={"newActor": new_actor_url}
    )
    unsigned_vc = response.json()['unsignedVc']
    
    # 4. Sign locally
    subject = unsigned_vc['credentialSubject']
    canonical_json = json.dumps(subject, sort_keys=True)
    signature = sign_ed25519(canonical_json, keypair['private_key'])
    
    signed_vc = {
        **unsigned_vc,
        "proof": {
            "type": "Ed25519Signature2020",
            "created": datetime.now().isoformat() + "Z",
            "verificationMethod": f"{did}#z6Mk...",
            "signatureValue": signature
        }
    }
    
    # 5. Submit to bridge
    response = requests.post(
        f"{bridge_url}/verify",
        json={"vc": signed_vc}
    )
    return response.json()
```

---

## Testing

To test the client-signing workflow:

```bash
# Start Redis and bridge
redis-server &
REDIS_HOST=localhost node bridge.js &

# Start server (new terminal)
node server.js &

# Run client workflow example
node examples/actor_integration_example.js

# Or run full test suite
npm test
```

---

## Next Steps

1. **Implement client library** for your platform (Node.js, Python, Go, etc.)
2. **Securely store keypairs** (encrypted local storage, hardware wallet, etc.)
3. **Integrate with UI** (UI components for signing, key management)
4. **Test federation** between multiple actors and servers
5. **Monitor verification failures** and debug issues

See [docs/ACTOR_INTEGRATION.md](ACTOR_INTEGRATION.md) for additional details on actor integration and key rotation.
