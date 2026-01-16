#!/usr/bin/env node
// test_endpoints.js — Test bridge endpoints with migrated data

const vcs = require('./registry/vc_registry.json');
const dids = require('./registry/did_registry.json');

const BASE = 'http://localhost:4000';

async function test() {
  console.log('=== TESTING BRIDGE ENDPOINTS ===\n');

  // Test 1: /register (register a test DID if needed)
  console.log('1. Testing POST /register...');
  try {
    const testDid = Object.keys(dids)[0];
    const res = await fetch(`${BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        did: testDid,
        publicKey: dids[testDid]
      })
    });
    const data = await res.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    console.log('   ✓ /register OK\n');
  } catch (e) {
    console.log('   ✗ /register failed:', e.message, '\n');
  }

  // Test 2: /verify
  console.log('2. Testing POST /verify...');
  try {
    const vc = vcs[0];
    const res = await fetch(`${BASE}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vc })
    });
    const data = await res.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    console.log('   ✓ /verify OK\n');
  } catch (e) {
    console.log('   ✗ /verify failed:', e.message, '\n');
  }

  // Test 3: /resolve/:did
  console.log('3. Testing GET /resolve/:did...');
  try {
    const did = Object.keys(dids)[0];
    const res = await fetch(`${BASE}/resolve/${encodeURIComponent(did)}`);
    const data = await res.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    console.log('   ✓ /resolve OK\n');
  } catch (e) {
    console.log('   ✗ /resolve failed:', e.message, '\n');
  }

  // Test 4: /lineage/actor?url=
  console.log('4. Testing GET /lineage/actor with url param...');
  try {
    const res = await fetch(`${BASE}/lineage/actor?url=http://localhost:3000/actor/alice`);
    const data = await res.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    console.log('   ✓ /lineage/actor OK\n');
  } catch (e) {
    console.log('   ✗ /lineage/actor failed:', e.message, '\n');
  }

  // Test 5: /lineage/did/:d
  console.log('5. Testing GET /lineage/did/:did...');
  try {
    const did = Object.keys(dids)[0];
    const res = await fetch(`${BASE}/lineage/did/${encodeURIComponent(did)}`);
    const data = await res.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    console.log('   ✓ /lineage/did OK\n');
  } catch (e) {
    console.log('   ✗ /lineage/did failed:', e.message, '\n');
  }

  console.log('=== TESTS COMPLETED ===');
}

test().catch(console.error);
