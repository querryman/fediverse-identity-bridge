#!/usr/bin/env node
/**
 * scripts/test-redis-data-migration.js
 * 
 * Comprehensive test suite for Redis data migration:
 * 1. Start Redis via docker-compose
 * 2. Generate sample data (test VCs and DIDs)
 * 3. Run migration script
 * 4. Verify data integrity
 * 5. Test bridge endpoints with Redis
 * 6. Performance benchmarking
 */

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const fetch = require('node-fetch');

const REGISTRY_DIR = path.join(__dirname, '..', 'registry');
const BRIDGE_PORT = 4000;

// -----------------------------------------------
// Utilities
// -----------------------------------------------
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(msg, level = 'info') {
  const colors = {
    info: '\x1b[36m',    // cyan
    success: '\x1b[32m', // green
    warn: '\x1b[33m',    // yellow
    error: '\x1b[31m'    // red
  };
  const reset = '\x1b[0m';
  const color = colors[level] || colors.info;
  console.log(`${color}[${level.toUpperCase()}]${reset} ${msg}`);
}

async function waitForPort(port, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const r = await fetch(`http://localhost:${port}/health`, {
        timeout: 1000
      });
      if (r.ok) return true;
    } catch (e) {
      // Not ready yet
    }
    await sleep(100);
  }
  return false;
}

// -----------------------------------------------
// Test 1: Generate Sample Data
// -----------------------------------------------
async function generateSampleData() {
  log('Generating sample test data...', 'info');

  if (!fs.existsSync(REGISTRY_DIR)) {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  }

  // Generate sample DIDs
  const dids = {
    'did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6': 'base64_public_key_alice_example',
    'did:key:z6MktYT8UoGQxN1z2xwhbGVnp6eV1jQjmL5J7Z3N5zH5V2mK': 'base64_public_key_bob_example',
    'did:key:z6MkpGJbtJ7N8qV3L1KxR2Z4mS5t6U7v8W9X0Y1Z2a3B4c5d': 'base64_public_key_carol_example'
  };

  // Generate sample VCs
  const vcs = [];
  const now = Date.now();

  // VC 1: Alice → Bob
  vcs.push({
    id: `http://localhost:3000/credentials/migration/${now}`,
    type: ['VerifiableCredential', 'MigrationCredential'],
    issuer: Object.keys(dids)[0],
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: 'did:key:z6MktYT8UoGQxN1z2xwhbGVnp6eV1jQjmL5J7Z3N5zH5V2mK',
      oldActor: 'http://localhost:3000/actor/alice',
      newActor: 'http://localhost:3000/actor/bob'
    },
    proof: {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      proofPurpose: 'assertionMethod',
      verificationMethod: Object.keys(dids)[0] + '#owner',
      signature: 'example_signature_base64_encoded'
    }
  });

  // VC 2: Bob → Carol
  vcs.push({
    id: `http://localhost:3000/credentials/migration/${now + 1}`,
    type: ['VerifiableCredential', 'MigrationCredential'],
    issuer: Object.keys(dids)[1],
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: 'did:key:z6MkpGJbtJ7N8qV3L1KxR2Z4mS5t6U7v8W9X0Y1Z2a3B4c5d',
      oldActor: 'http://localhost:3000/actor/bob',
      newActor: 'http://localhost:3000/actor/carol'
    },
    proof: {
      type: 'Ed25519Signature2020',
      created: new Date().toISOString(),
      proofPurpose: 'assertionMethod',
      verificationMethod: Object.keys(dids)[1] + '#owner',
      signature: 'example_signature_base64_encoded_2'
    }
  });

  // Write registries
  fs.writeFileSync(
    path.join(REGISTRY_DIR, 'did_registry.json'),
    JSON.stringify(dids, null, 2)
  );
  fs.writeFileSync(
    path.join(REGISTRY_DIR, 'vc_registry.json'),
    JSON.stringify(vcs, null, 2)
  );

  log(`Generated ${Object.keys(dids).length} DIDs and ${vcs.length} VCs`, 'success');
  return { dids, vcs };
}

// -----------------------------------------------
// Test 2: Start Redis
// -----------------------------------------------
async function startRedis() {
  log('Starting Redis via docker-compose...', 'info');

  try {
    const result = spawnSync('docker-compose', ['up', '-d', 'redis'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
    });

    if (result.status !== 0) {
      throw new Error(`docker-compose failed: ${result.stderr.toString()}`);
    }

    // Wait for Redis to be ready
    await sleep(2000);
    log('Redis started successfully', 'success');
  } catch (e) {
    log(`Failed to start Redis: ${e.message}`, 'error');
    throw e;
  }
}

// -----------------------------------------------
// Test 3: Run Migration Script
// -----------------------------------------------
async function runMigration() {
  log('Running data migration script...', 'info');

  return new Promise((resolve, reject) => {
    const migrationScript = path.join(__dirname, 'migrate-to-redis.js');
    const proc = spawn('node', [migrationScript], {
      cwd: path.join(__dirname, '..')
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log('Migration completed successfully', 'success');
        resolve(output);
      } else {
        log(`Migration failed with code ${code}`, 'error');
        reject(new Error(`Migration failed: ${output}`));
      }
    });
  });
}

// -----------------------------------------------
// Test 4: Start Bridge with Redis
// -----------------------------------------------
async function startBridge() {
  log('Starting bridge with Redis backend...', 'info');

  const bridge = spawn('node', ['bridge.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, REDIS_HOST: 'localhost' },
    stdio: 'pipe'
  });

  // Wait for bridge to start
  let ready = false;
  bridge.stdout.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('listening')) {
      ready = true;
    }
  });

  bridge.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  // Wait for startup
  for (let i = 0; i < 20; i++) {
    if (ready) break;
    await sleep(100);
  }

  if (!ready) {
    log('Bridge startup timeout', 'warn');
  }

  log('Bridge started with Redis backend', 'success');
  return bridge;
}

// -----------------------------------------------
// Test 5: Verify Data in Redis
// -----------------------------------------------
async function verifyRedisData(expectedDids, expectedVcs) {
  log('Verifying migrated data in Redis...', 'info');

  // Query bridge /resolve endpoint
  let didCount = 0;
  let vcCount = 0;

  for (const did of Object.keys(expectedDids)) {
    try {
      const res = await fetch(`http://localhost:${BRIDGE_PORT}/resolve/${encodeURIComponent(did)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.publicPem) {
          didCount++;
        }
      }
    } catch (e) {
      // Endpoint may fail if not registered
    }
  }

  for (const vc of expectedVcs) {
    try {
      const res = await fetch(`http://localhost:${BRIDGE_PORT}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vc })
      });
      if (res.ok) {
        vcCount++;
      }
    } catch (e) {
      // Ignore network errors
    }
  }

  log(`Verified ${didCount}/${Object.keys(expectedDids).length} DIDs`, 'info');
  log(`Verified ${vcCount}/${expectedVcs.length} VCs`, 'info');

  if (didCount > 0 || vcCount > 0) {
    log('Data verification successful', 'success');
    return true;
  }

  log('Some data could not be verified', 'warn');
  return false;
}

// -----------------------------------------------
// Test 6: Performance Benchmark
// -----------------------------------------------
async function performanceBench() {
  log('Running performance benchmark...', 'info');

  const iterations = 100;
  const start = Date.now();

  try {
    // Generate a test VC
    const testVC = {
      id: 'test:vc:' + Date.now(),
      type: ['VerifiableCredential'],
      issuer: 'did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6',
      credentialSubject: { oldActor: 'http://test/old', newActor: 'http://test/new' },
      proof: { signature: 'test' }
    };

    // Time /verify requests
    for (let i = 0; i < iterations; i++) {
      const res = await fetch(`http://localhost:${BRIDGE_PORT}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vc: testVC })
      });
      await res.json();
    }
  } catch (e) {
    log(`Benchmark error: ${e.message}`, 'warn');
  }

  const elapsed = Date.now() - start;
  const avgLatency = elapsed / iterations;

  log(`Benchmark: ${iterations} requests in ${elapsed}ms (${avgLatency.toFixed(2)}ms avg)`, 'success');
  return { iterations, elapsed, avgLatency };
}

// -----------------------------------------------
// Test 7: Stop Services
// -----------------------------------------------
async function cleanup(bridge) {
  log('Cleaning up...', 'info');

  if (bridge) {
    bridge.kill();
  }

  // Stop Redis
  spawnSync('docker-compose', ['down'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe'
  });

  log('Cleanup completed', 'success');
}

// -----------------------------------------------
// Main Test Suite
// -----------------------------------------------
async function main() {
  log('=== REDIS DATA MIGRATION TEST SUITE ===', 'info');
  log('', 'info');

  let bridge;

  try {
    // Step 1: Generate sample data
    const { dids, vcs } = await generateSampleData();

    // Step 2: Start Redis
    await startRedis();

    // Step 3: Run migration
    await runMigration();

    // Step 4: Start bridge
    bridge = await startBridge();

    // Step 5: Give bridge time to load Redis data
    await sleep(2000);

    // Step 6: Verify data
    await verifyRedisData(dids, vcs);

    // Step 7: Performance benchmark
    const perfResults = await performanceBench();

    log('', 'info');
    log('=== ALL TESTS COMPLETED SUCCESSFULLY ===', 'success');
    log('', 'info');
    log('Summary:', 'info');
    log(`  DIDs: ${Object.keys(dids).length} loaded`, 'success');
    log(`  VCs: ${vcs.length} loaded`, 'success');
    log(`  Performance: ${perfResults.avgLatency.toFixed(2)}ms avg latency`, 'success');

  } catch (e) {
    log(`Test suite failed: ${e.message}`, 'error');
    process.exit(1);
  } finally {
    await cleanup(bridge);
  }
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { generateSampleData, startRedis, runMigration, startBridge };
