// scripts/migrate-to-redis.js — Migrate file-based storage to Redis
//
// Usage: node scripts/migrate-to-redis.js
//
// This script:
// 1. Loads VCs from registry/vc_registry.json
// 2. Loads DIDs from registry/did_registry.json
// 3. Migrates all data to Redis
// 4. Verifies data in Redis
// 5. Creates backup of old files
//

const fs = require('fs');
const path = require('path');
const storageRedis = require('../lib/storage-redis');

const REG_DIR = path.join(__dirname, '..', 'registry');
const VC_FILE = path.join(REG_DIR, 'vc_registry.json');
const DID_FILE = path.join(REG_DIR, 'did_registry.json');
const BACKUP_DIR = path.join(REG_DIR, `backup-${Date.now()}`);

async function main() {
  console.log('[migrate] Starting migration from file to Redis...\n');

  try {
    // Initialize Redis client
    console.log('[migrate] Initializing Redis connection...');
    await storageRedis.initClient();
    console.log('[migrate] ✓ Connected to Redis\n');

    // Load file-based data
    console.log('[migrate] Loading file-based data...');
    let vcData = {};
    let didData = {};

    if (fs.existsSync(VC_FILE)) {
      try {
        vcData = JSON.parse(fs.readFileSync(VC_FILE, 'utf8') || '{}');
        console.log(`[migrate] ✓ Loaded ${Object.keys(vcData).length} VCs from file`);
      } catch (e) {
        console.error(`[migrate] ✗ Failed to load VC file: ${e.message}`);
      }
    } else {
      console.log('[migrate] ℹ No VC file found (skipping)');
    }

    if (fs.existsSync(DID_FILE)) {
      try {
        didData = JSON.parse(fs.readFileSync(DID_FILE, 'utf8') || '{}');
        console.log(`[migrate] ✓ Loaded ${Object.keys(didData).length} DIDs from file\n`);
      } catch (e) {
        console.error(`[migrate] ✗ Failed to load DID file: ${e.message}`);
      }
    } else {
      console.log('[migrate] ℹ No DID file found (skipping)\n');
    }

    // Migrate VCs
    console.log('[migrate] Migrating VCs to Redis...');
    let vcCount = 0;
    for (const [vcId, vc] of Object.entries(vcData)) {
      try {
        await storageRedis.saveCredential(vc);
        vcCount++;
        if (vcCount % 10 === 0) {
          process.stdout.write(`\r[migrate] Migrated ${vcCount} VCs...`);
        }
      } catch (e) {
        console.error(`\n[migrate] ✗ Failed to migrate VC ${vcId}: ${e.message}`);
      }
    }
    console.log(`\n[migrate] ✓ Migrated ${vcCount} VCs to Redis\n`);

    // Migrate DIDs
    console.log('[migrate] Migrating DIDs to Redis...');
    let didCount = 0;
    for (const [did, pubKey] of Object.entries(didData)) {
      try {
        await storageRedis.putDid(did, pubKey);
        didCount++;
        if (didCount % 10 === 0) {
          process.stdout.write(`\r[migrate] Migrated ${didCount} DIDs...`);
        }
      } catch (e) {
        console.error(`\n[migrate] ✗ Failed to migrate DID ${did}: ${e.message}`);
      }
    }
    console.log(`\n[migrate] ✓ Migrated ${didCount} DIDs to Redis\n`);

    // Verify data
    console.log('[migrate] Verifying migrated data...');
    let verified = 0;
    for (const vcId of Object.keys(vcData)) {
      try {
        const vc = await storageRedis.getCredential(vcId);
        if (vc && vc.id === vcId) {
          verified++;
        } else {
          console.warn(`[migrate] ✗ Verification failed for VC ${vcId}`);
        }
      } catch (e) {
        console.error(`[migrate] ✗ Verification error for VC ${vcId}: ${e.message}`);
      }
    }
    console.log(`[migrate] ✓ Verified ${verified}/${vcCount} VCs\n`);

    // Create backup
    console.log('[migrate] Creating backup of original files...');
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    if (fs.existsSync(VC_FILE)) {
      fs.copyFileSync(VC_FILE, path.join(BACKUP_DIR, 'vc_registry.json'));
      console.log(`[migrate] ✓ Backed up VC registry to ${BACKUP_DIR}`);
    }
    
    if (fs.existsSync(DID_FILE)) {
      fs.copyFileSync(DID_FILE, path.join(BACKUP_DIR, 'did_registry.json'));
      console.log(`[migrate] ✓ Backed up DID registry to ${BACKUP_DIR}\n`);
    }

    // Summary
    console.log('═════════════════════════════════════════');
    console.log('[migrate] ✓ MIGRATION COMPLETE!');
    console.log('═════════════════════════════════════════');
    console.log(`Total VCs migrated:   ${vcCount}`);
    console.log(`Total DIDs migrated:  ${didCount}`);
    console.log(`Backup location:      ${BACKUP_DIR}`);
    console.log('\nNext steps:');
    console.log('  1. Verify data in Redis: redis-cli KEYS "identity_bridge:*"');
    console.log('  2. Start bridge with: REDIS_HOST=localhost node bridge.js');
    console.log('  3. Test endpoints: POST /verify, GET /actor/:username/migrate');
    console.log('\nYou can safely delete the backup directory once verified.\n');

    process.exit(0);
  } catch (err) {
    console.error('\n[migrate] ✗ MIGRATION FAILED!');
    console.error(err);
    process.exit(1);
  }
}

main();
