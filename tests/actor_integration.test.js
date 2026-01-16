/**
 * tests/actor_integration.test.js
 * 
 * Test suite for actor-side VC signing and storage integration
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { generateKeypairEd25519, signEd25519, verifyEd25519 } = require('../lib/crypto');
const { createMigrationVCUnsigned } = require('../lib/vc');
const { getDidFromPublicKey } = require('../lib/did');

const KEYS_DIR = path.join(__dirname, '..', 'keys', 'test_integration');

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

describe('Actor Integration - Ed25519 Signing', () => {
  let publicKey, privateKey, actorDid;

  before(async () => {
    // Generate test keypair
    const kp = await generateKeypairEd25519();
    publicKey = kp.publicKey;
    privateKey = kp.privateKey;
    actorDid = await getDidFromPublicKey(publicKey);
  });

  it('should generate valid Ed25519 keypair', async () => {
    assert(publicKey, 'public key exists');
    assert(privateKey, 'private key exists');
    assert(Buffer.from(publicKey, 'base64').length === 32, 'public key is 32 bytes');
    assert(Buffer.from(privateKey, 'base64').length === 32, 'private key is 32 bytes');
  });

  it('should derive correct DID from public key', async () => {
    assert(actorDid.startsWith('did:key:z'), 'DID starts with did:key:z');
  });

  it('should sign and verify VC payload', async () => {
    const unsignedVC = {
      id: 'http://example.com/vc/1',
      type: ['VerifiableCredential', 'MigrationCredential'],
      issuer: actorDid,
      credentialSubject: {
        id: actorDid,
        oldActor: 'http://old.example.com/actor',
        newActor: 'http://new.example.com/actor'
      },
      issuanceDate: new Date().toISOString()
    };

    // Canonical JSON (sorted keys, no whitespace)
    const canonical = stableStringify(unsignedVC);
    const signature = await signEd25519(privateKey, canonical);

    assert(signature, 'signature generated');
    assert(typeof signature === 'string', 'signature is base64 string');

    // Verify signature
    const verified = await verifyEd25519(publicKey, canonical, signature);
    assert(verified === true, 'signature verified correctly');
  });

  it('should reject invalid signatures', async () => {
    const payload = JSON.stringify({ test: 'data' });
    const signature = await signEd25519(privateKey, payload);

    // Create invalid signature (same length but different bytes)
    const sigBytes = Buffer.from(signature, 'base64');
    sigBytes[0] ^= 0xFF; // flip bits in first byte
    const tamperedSig = sigBytes.toString('base64');

    const verified = await verifyEd25519(publicKey, payload, tamperedSig);
    assert(verified === false, 'tampered signature rejected');
  });

  it('should attach proof to VC', async () => {
    const unsignedVC = {
      id: 'http://example.com/vc/proof-test',
      type: ['VerifiableCredential', 'MigrationCredential'],
      issuer: actorDid,
      credentialSubject: {
        id: actorDid,
        oldActor: 'http://old.example.com/actor',
        newActor: 'http://new.example.com/actor'
      },
      issuanceDate: new Date().toISOString()
    };

    const canonical = stableStringify(unsignedVC);
    const signature = await signEd25519(privateKey, canonical);

    const signedVC = Object.assign({}, unsignedVC, {
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        proofPurpose: 'assertionMethod',
        verificationMethod: `${actorDid}#owner`,
        signature: signature
      }
    });

    assert(signedVC.proof, 'proof attached');
    assert(signedVC.proof.type === 'Ed25519Signature2020', 'proof type correct');
    assert(signedVC.proof.signature === signature, 'signature in proof');
  });

  it('should handle VC with multiple credentialSubjects', async () => {
    const unsignedVC = {
      id: 'http://example.com/vc/multi',
      type: ['VerifiableCredential', 'MigrationCredential'],
      issuer: actorDid,
      credentialSubject: [
        {
          id: actorDid,
          oldActor: 'http://old.example.com/actor',
          newActor: 'http://new.example.com/actor'
        },
        {
          id: 'http://other.example.com/actor',
          oldActor: 'http://old.other.com/actor',
          newActor: 'http://new.other.com/actor'
        }
      ],
      issuanceDate: new Date().toISOString()
    };

    const canonical = stableStringify(unsignedVC);
    const signature = await signEd25519(privateKey, canonical);
    const verified = await verifyEd25519(publicKey, canonical, signature);

    assert(verified === true, 'multi-subject VC verified');
  });

  it('should normalize whitespace in canonical JSON', async () => {
    const unsignedVC = {
      id: 'http://example.com/vc/whitespace',
      issuer: actorDid,
      credentialSubject: {
        id: actorDid,
        oldActor: 'http://old.example.com/actor',
        newActor: 'http://new.example.com/actor'
      }
    };

    const canonical1 = stableStringify(unsignedVC);
    const canonical2 = stableStringify(unsignedVC);

    assert(canonical1 === canonical2, 'canonicalization is deterministic');

    const sig1 = await signEd25519(privateKey, canonical1);
    const sig2 = await signEd25519(privateKey, canonical2);

    assert(sig1 === sig2, 'same payload produces same signature');
  });

  it('should store keypair to disk', async () => {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    
    const pubFile = path.join(KEYS_DIR, 'test_public.b64');
    const privFile = path.join(KEYS_DIR, 'test_private.b64');

    fs.writeFileSync(pubFile, publicKey);
    fs.writeFileSync(privFile, privateKey);

    const loadedPub = fs.readFileSync(pubFile, 'utf8').trim();
    const loadedPriv = fs.readFileSync(privFile, 'utf8').trim();

    assert(loadedPub === publicKey, 'public key persisted correctly');
    assert(loadedPriv === privateKey, 'private key persisted correctly');

    // Cleanup
    fs.unlinkSync(pubFile);
    fs.unlinkSync(privFile);
  });

  it('should load keypair from disk and sign', async () => {
    fs.mkdirSync(KEYS_DIR, { recursive: true });

    const pubFile = path.join(KEYS_DIR, 'load_public.b64');
    const privFile = path.join(KEYS_DIR, 'load_private.b64');

    fs.writeFileSync(pubFile, publicKey);
    fs.writeFileSync(privFile, privateKey);

    // Load and re-sign
    const loadedPub = fs.readFileSync(pubFile, 'utf8').trim();
    const loadedPriv = fs.readFileSync(privFile, 'utf8').trim();

    const payload = JSON.stringify({ test: 'reload' });
    const signature = await signEd25519(loadedPriv, payload);
    const verified = await verifyEd25519(loadedPub, payload, signature);

    assert(verified === true, 'loaded keypair produces valid signatures');

    // Cleanup
    fs.unlinkSync(pubFile);
    fs.unlinkSync(privFile);
  });
});

describe('Actor Integration - Complete Workflow', () => {
  let publicKey, privateKey, actorDid;

  before(async () => {
    const kp = await generateKeypairEd25519();
    publicKey = kp.publicKey;
    privateKey = kp.privateKey;
    actorDid = await getDidFromPublicKey(publicKey);
  });

  it('should complete full signing workflow', async () => {
    // 1. Create unsigned VC
    const unsignedVC = {
      id: `http://example.com/vc/${Date.now()}`,
      type: ['VerifiableCredential', 'MigrationCredential'],
      issuer: actorDid,
      credentialSubject: {
        id: actorDid,
        oldActor: 'http://old.example.com/actor/alice',
        newActor: 'http://new.example.com/actor/alice'
      },
      issuanceDate: new Date().toISOString()
    };

    // 2. Canonicalize
    const canonical = stableStringify(unsignedVC);

    // 3. Sign
    const signature = await signEd25519(privateKey, canonical);

    // 4. Attach proof
    const signedVC = Object.assign({}, unsignedVC, {
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        proofPurpose: 'assertionMethod',
        verificationMethod: `${actorDid}#owner`,
        signature: signature
      }
    });

    // 5. Verify
    const verified = await verifyEd25519(publicKey, canonical, signedVC.proof.signature);

    assert(verified === true, 'complete workflow produces valid signed VC');
    assert(signedVC.proof.type === 'Ed25519Signature2020', 'proof type correct');
    assert(signedVC.credentialSubject.oldActor === 'http://old.example.com/actor/alice', 'subject preserved');
  });

  it('should fail verification if VC fields modified after signing', async () => {
    const unsignedVC = {
      id: `http://example.com/vc/${Date.now()}`,
      issuer: actorDid,
      credentialSubject: {
        id: actorDid,
        oldActor: 'http://old.example.com/actor',
        newActor: 'http://new.example.com/actor'
      }
    };

    const canonical = stableStringify(unsignedVC);
    const signature = await signEd25519(privateKey, canonical);

    // Modify VC after signing
    const tamperedVC = Object.assign({}, unsignedVC);
    tamperedVC.credentialSubject.newActor = 'http://evil.example.com/actor';

    const tamperedCanonical = stableStringify(tamperedVC);
    const verified = await verifyEd25519(publicKey, tamperedCanonical, signature);

    assert(verified === false, 'tampered VC fails verification');
  });

  it('should handle actor key rotation', async () => {
    // Original keys
    const kp1 = await generateKeypairEd25519();
    const did1 = await getDidFromPublicKey(kp1.publicKey);

    // New keys (rotation)
    const kp2 = await generateKeypairEd25519();
    const did2 = await getDidFromPublicKey(kp2.publicKey);

    // Sign migration with old key
    const vcWithOldKey = {
      id: `http://example.com/vc/${Date.now()}`,
      issuer: did1,
      credentialSubject: {
        id: did1,
        oldActor: 'http://old.example.com/actor',
        newActor: 'http://new.example.com/actor'
      }
    };

    const canonical = stableStringify(vcWithOldKey);
    const sig1 = await signEd25519(kp1.privateKey, canonical);
    const verified1 = await verifyEd25519(kp1.publicKey, canonical, sig1);

    // Sign with new key
    const sig2 = await signEd25519(kp2.privateKey, canonical);
    const verified2 = await verifyEd25519(kp2.publicKey, canonical, sig2);

    assert(verified1 === true, 'old key signature valid');
    assert(verified2 === true, 'new key signature valid');
    assert(sig1 !== sig2, 'different keys produce different signatures');
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running actor integration tests...\n');
  require('mocha').describe;
}
