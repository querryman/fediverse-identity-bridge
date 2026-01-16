#!/usr/bin/env node
/**
 * examples/actor_integration_example.js
 * 
 * Complete actor-side integration example showing:
 * 1. Generate keypair for actor
 * 2. Request unsigned VC from bridge /migrate
 * 3. Sign VC locally using Ed25519
 * 4. Store signed VC back to bridge /store
 * 
 * Usage:
 *   node examples/actor_integration_example.js \
 *     --actor alice \
 *     --old-url http://localhost:3000/actor/alice \
 *     --new-url http://localhost:3001/actor/alice \
 *     --issuer did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6 \
 *     --bridge http://localhost:4000
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const { generateKeypairEd25519, signEd25519 } = require('../lib/crypto');

const KEYS_DIR = path.join(__dirname, '..', 'keys');
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:4000';

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

async function main() {
  try {
    // Parse arguments
    const args = process.argv.slice(2);
    const opts = {};
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].replace(/^--/, '');
      opts[key] = args[i + 1];
    }

    const actorId = opts.actor || 'test_actor';
    const oldActorUrl = opts['old-url'] || `http://localhost:3000/actor/${actorId}`;
    const newActorUrl = opts['new-url'] || `http://localhost:3001/actor/${actorId}`;
    const issuerDid = opts.issuer || 'did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6';
    const bridgeUrl = opts.bridge || BRIDGE_URL;

    console.log('\n=== ACTOR-SIDE INTEGRATION EXAMPLE ===\n');
    console.log(`Actor: ${actorId}`);
    console.log(`Old URL: ${oldActorUrl}`);
    console.log(`New URL: ${newActorUrl}`);
    console.log(`Issuer DID: ${issuerDid}`);
    console.log(`Bridge: ${bridgeUrl}\n`);

    // Step 1: Generate or load actor keypair
    console.log('Step 1: Generate keypair for actor...');
    const actorKeyDir = path.join(KEYS_DIR, actorId);
    fs.mkdirSync(actorKeyDir, { recursive: true });

    let publicKey, privateKey;
    const pubFile = path.join(actorKeyDir, 'public.b64');
    const privFile = path.join(actorKeyDir, 'private.b64');

    if (fs.existsSync(pubFile) && fs.existsSync(privFile)) {
      publicKey = fs.readFileSync(pubFile, 'utf8').trim();
      privateKey = fs.readFileSync(privFile, 'utf8').trim();
      console.log('  ✓ Loaded existing keypair\n');
    } else {
      const kp = await generateKeypairEd25519();
      publicKey = kp.publicKey;
      privateKey = kp.privateKey;
      fs.writeFileSync(pubFile, publicKey);
      fs.writeFileSync(privFile, privateKey);
      console.log('  ✓ Generated new keypair\n');
    }

    // Step 2: Request unsigned VC from bridge
    console.log('Step 2: Request unsigned VC from bridge /migrate...');
    let unsignedVC;
    try {
      const res = await fetch(`${bridgeUrl}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issuerDid,
          subjectDid: issuerDid,
          oldActor: oldActorUrl,
          newActor: newActorUrl
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      unsignedVC = await res.json();
      console.log('  ✓ Received unsigned VC (no proof field)\n');
    } catch (e) {
      console.log(`  ⚠ Bridge not available: ${e.message}`);
      console.log('  Using local unsigned VC generation...\n');
      // Fallback: create locally
      unsignedVC = {
        id: `http://localhost:3000/credential/${Date.now()}`,
        type: ['VerifiableCredential', 'MigrationCredential'],
        issuer: issuerDid,
        credentialSubject: {
          id: issuerDid,
          oldActor: oldActorUrl,
          newActor: newActorUrl
        },
        issuanceDate: new Date().toISOString()
      };
    }

    // Step 3: Sign the VC locally
    console.log('Step 3: Sign VC locally using Ed25519...');
    const canonical = stableStringify(unsignedVC);
    const signature = await signEd25519(privateKey, canonical);

    const signedVC = Object.assign({}, unsignedVC, {
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        proofPurpose: 'assertionMethod',
        verificationMethod: `${issuerDid}#owner`,
        signature: signature
      }
    });

    console.log('  ✓ VC signed successfully\n');

    // Step 4: Store signed VC back to bridge
    console.log('Step 4: Store signed VC to bridge /store...');
    try {
      const res = await fetch(`${bridgeUrl}/store`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vc: signedVC })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      console.log('  ✓ Stored to bridge\n');
      console.log('  Response:', JSON.stringify(result, null, 2), '\n');
    } catch (e) {
      console.log(`  ⚠ Bridge /store not available: ${e.message}`);
      console.log('  Saving locally instead...\n');
      const outFile = path.join(KEYS_DIR, actorId, `signed_vc_${Date.now()}.json`);
      fs.writeFileSync(outFile, JSON.stringify(signedVC, null, 2));
      console.log(`  Saved to: ${outFile}\n`);
    }

    console.log('=== SUCCESS ===\n');
    console.log('Signed VC ready for migration:\n');
    console.log(JSON.stringify(signedVC, null, 2), '\n');

  } catch (err) {
    console.error('\n❌ ERROR:', err.message, '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { stableStringify };
