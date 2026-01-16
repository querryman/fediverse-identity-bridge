#!/usr/bin/env node
/**
 * scripts/validate-migration.js
 * 
 * Validates that Redis migration completed successfully by:
 * 1. Checking Redis connectivity
 * 2. Counting DIDs and VCs in Redis
 * 3. Testing specific queries
 * 4. Comparing file vs Redis counts
 */

const fs = require('fs');
const path = require('path');
const storageRedis = require('../lib/storage-redis');

const REG_DIR = path.join(__dirname, '..', 'registry');
const VC_FILE = path.join(REG_DIR, 'vc_registry.json');
const DID_FILE = path.join(REG_DIR, 'did_registry.json');

async function loadFileData() {
  const result = { vcs: {}, dids: {} };

  if (fs.existsSync(VC_FILE)) {
    try {
      result.vcs = JSON.parse(fs.readFileSync(VC_FILE, 'utf8') || '{}');
    } catch (e) {
      console.error(`Error loading VC file: ${e.message}`);
    }
  }

  if (fs.existsSync(DID_FILE)) {
    try {
      result.dids = JSON.parse(fs.readFileSync(DID_FILE, 'utf8') || '{}');
    } catch (e) {
      console.error(`Error loading DID file: ${e.message}`);
    }
  }

  return result;
}

async function main() {
  console.log('\n=== REDIS MIGRATION VALIDATION ===\n');

  try {
    // Load file data
    console.log('📁 Loading file-based data...');
    const fileData = await loadFileData();
    const fileVcCount = Object.keys(fileData.vcs).length;
    const fileDidsCount = Object.keys(fileData.dids).length;
    console.log(`  ✓ File contains ${fileVcCount} VCs and ${fileDidsCount} DIDs\n`);

    // Connect to Redis
    console.log('🔄 Connecting to Redis...');
    await storageRedis.initClient();
    console.log('  ✓ Connected to Redis\n');

    // Check health
    console.log('🏥 Checking Redis health...');
    const health = await storageRedis.healthCheck();
    const isConnected = health && health.connected;
    console.log(`  ${isConnected ? '✓' : '✗'} Connected: ${isConnected}`);
    console.log(`  ✓ Redis version: ${(health && health.version) || 'unknown'}\n`);

    // Count data in Redis
    console.log('📊 Counting data in Redis...');
    
    // For each DID in file, try to get it from Redis
    let didCount = 0;
    let vcCount = 0;

    for (const did of Object.keys(fileData.dids)) {
      const stored = await storageRedis.getDid(did);
      if (stored) didCount++;
    }

    // For each VC in file, try to get it from Redis (use vc.id not array index)
    const vcs = Array.isArray(fileData.vcs) ? fileData.vcs : Object.values(fileData.vcs);
    for (const vc of vcs) {
      if (vc && vc.id) {
        const stored = await storageRedis.getCredential(vc.id);
        if (stored) vcCount++;
      }
    }
    
    console.log(`  ✓ DIDs in Redis: ${didCount}`);
    console.log(`  ✓ VCs in Redis: ${vcCount}\n`);

    // Spot checks
    console.log('🔍 Spot-checking samples...');
    let didsVerified = 0;
    let vcsVerified = 0;

    // Check a few DIDs
    for (const did of Object.keys(fileData.dids).slice(0, 3)) {
      const stored = await storageRedis.getDid(did);
      if (stored) {
        didsVerified++;
        console.log(`  ✓ DID found: ${did.substring(0, 20)}...`);
      } else {
        console.log(`  ✗ DID missing: ${did.substring(0, 20)}...`);
      }
    }

    // Check a few VCs (use vc.id not array index)
    const vcList = Array.isArray(fileData.vcs) ? fileData.vcs : Object.values(fileData.vcs);
    for (const vc of vcList.slice(0, 3)) {
      if (vc && vc.id) {
        const stored = await storageRedis.getCredential(vc.id);
        if (stored) {
          vcsVerified++;
          console.log(`  ✓ VC found: ${vc.id.substring(0, 20)}...`);
        } else {
          console.log(`  ✗ VC missing: ${vc.id.substring(0, 20)}...`);
        }
      }
    }

    console.log('');

    // Summary
    console.log('📈 VALIDATION SUMMARY');
    console.log('─'.repeat(40));
    console.log(`File DIDs:        ${fileDidsCount}`);
    console.log(`Redis DIDs:       ${didCount}`);
    console.log(`Match:            ${fileDidsCount === didCount ? '✓ YES' : '✗ NO'}`);
    console.log('');
    console.log(`File VCs:         ${fileVcCount}`);
    console.log(`Redis VCs:        ${vcCount}`);
    console.log(`Match:            ${fileVcCount === vcCount ? '✓ YES' : '✗ NO'}`);
    console.log('');
    console.log(`Spot checks:      ${didsVerified}/${Math.min(3, Object.keys(fileData.dids).length)} DIDs verified`);
    console.log(`                  ${vcsVerified}/${Math.min(3, vcs.length)} VCs verified`);
    console.log('─'.repeat(40));

    // Determine pass/fail
    const allMatch = fileVcCount === vcCount && fileDidsCount === didCount;
    const spottedOk = didsVerified > 0 && vcsVerified > 0;

    if (allMatch && spottedOk) {
      console.log('\n✅ MIGRATION VALIDATED SUCCESSFULLY\n');
      process.exit(0);
    } else {
      console.log('\n⚠️  MIGRATION VALIDATION INCOMPLETE\n');
      process.exit(1);
    }

  } catch (err) {
    console.error(`\n❌ VALIDATION FAILED: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { loadFileData };
