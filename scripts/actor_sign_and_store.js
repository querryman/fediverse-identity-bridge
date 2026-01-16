#!/usr/bin/env node
// scripts/actor_sign_and_store.js
// Actor-side integration example: generate keypair, create unsigned VC,
// sign it (Ed25519) using lib/crypto, and write signed VC to registry.

const fs = require('fs');
const path = require('path');

const { generateKeypairEd25519, signEd25519 } = require('../lib/crypto');
const { createMigrationVCUnsigned } = require('../lib/vc');

const REG_DIR = path.join(__dirname, '..', 'registry');
const KEYS_DIR = path.join(__dirname, '..', 'keys');

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

async function main() {
  try {
    if (!fs.existsSync(REG_DIR)) fs.mkdirSync(REG_DIR, { recursive: true });
    if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });

    // Use first two DIDs from registry if present, else fallback to generated sample
    let dids = {};
    const didFile = path.join(REG_DIR, 'did_registry.json');
    if (fs.existsSync(didFile)) {
      try { dids = JSON.parse(fs.readFileSync(didFile, 'utf8') || '{}'); } catch (e) { dids = {}; }
    }

    const didKeys = Object.keys(dids);
    const issuerDid = didKeys[0] || 'did:example:actor_test';
    const subjectDid = didKeys[1] || issuerDid;

    // Generate actor keypair
    const actorId = 'actor_test';
    const actorKeyDir = path.join(KEYS_DIR, actorId);
    fs.mkdirSync(actorKeyDir, { recursive: true });

    const kp = await generateKeypairEd25519();
    // generateKeypairEd25519() expected to return { publicKey: base64, privateKey: base64 }
    const publicKey = kp.publicKey;
    const privateKey = kp.privateKey;

    fs.writeFileSync(path.join(actorKeyDir, 'public.b64'), publicKey);
    fs.writeFileSync(path.join(actorKeyDir, 'private.b64'), privateKey);

    console.log('✓ Generated Ed25519 keypair for', actorId);

    // Create an unsigned migration VC
    const oldActor = 'http://localhost:3000/actor/' + actorId;
    const newActor = 'http://localhost:3001/actor/' + actorId;

    const unsignedVC = await createMigrationVCUnsigned({
      issuerDid,
      subjectDid,
      oldActor,
      newActor
    });

    // Canonicalize (sorted JSON keys, no whitespace)
    const canonical = stableStringify(unsignedVC);

    // Sign canonical payload (signEd25519(privateKeyB64, msg))
    const signature = await signEd25519(privateKey, canonical);

    const proof = {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      proofPurpose: 'assertionMethod',
      verificationMethod: issuerDid + '#owner',
      signature: signature
    };

    const signedVC = Object.assign({}, unsignedVC, { proof });

    // Write signed VC to registry for ingestion/testing
    const outPath = path.join(REG_DIR, `signed_vc_${actorId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(signedVC, null, 2));

    console.log('✓ Signed VC written to', outPath);

    // Optionally POST to bridge /store if bridge is running
    try {
      const fetch = require('node-fetch');
      const res = await fetch('http://localhost:4000/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vc: signedVC })
      });
      if (res.ok) {
        const json = await res.json();
        console.log('✓ Posted signed VC to bridge /store (response):', json);
      } else {
        console.log('ℹ Bridge /store responded with', res.status);
      }
    } catch (e) {
      console.log('ℹ Bridge not available or POST failed (skipping):', e.message);
    }

    process.exit(0);
  } catch (err) {
    console.error('✗ actor_sign_and_store failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) main();
