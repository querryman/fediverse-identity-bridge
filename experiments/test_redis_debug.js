#!/usr/bin/env node
/**
 * Debug script to trace Redis calls during a single verify operation
 */

const redis = require('redis');

(async () => {
  const client = redis.createClient({
    socket: { host: 'localhost', port: 6379 }
  });

  await client.connect();
  
  // Monitor Redis commands in real-time
  const monitor = await client.sendCommand(['MONITOR']);
  
  console.log('Monitoring Redis commands (will show next 100 commands)...\n');
  
  // Send a verify request
  const fetch = require('node-fetch');
  
  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: "vc:test:" + Date.now(),
    type: ["VerifiableCredential", "MigrationCredential"],
    issuer: "did:key:z6MkhaXgBZDvotDkL5257faWxcqACjJGtUtaDzSJqw9dXjJ7",
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: "did:key:z6MkhaXgBZDvotDkL5257faWxcqACjJGtUtaDzSJqw9dXjJ7",
      oldActor: "http://example.org/old",
      newActor: "http://example.org/new"
    },
    proof: {
      type: "Ed25519Signature2020",
      created: new Date().toISOString(),
      proofPurpose: "assertionMethod",
      verificationMethod: "did:key:z6MkhaXgBZDvotDkL5257faWxcqACjJGtUtaDzSJqw9dXjJ7#owner",
      signature: "testSignature"
    }
  };

  const startTime = Date.now();
  
  try {
    const res = await fetch('http://127.0.0.1:4000/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vc })
    });
    
    const json = await res.json();
    const duration = Date.now() - startTime;
    
    console.log(`\n✓ Verify completed in ${duration}ms`);
    console.log(`  Response: valid=${json.valid}`);
  } catch (err) {
    console.error('Verify failed:', err.message);
  }
  
  await client.quit();
})().catch(console.error);
