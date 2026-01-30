// experiments/experiment_migration_demo.js
// Demo: migration between two ActivityPub instances WITHOUT Redis (file-backed storage)
// Usage (all-in-one): node experiments/experiment_migration_demo.js
// Manual multi-shell demo: start `node bridge.js`, then start two servers:
//   node server.js (PORT=3000)  # will auto-create 'alice'
//   USERS=alice_new node server.js (PORT=3001)
// Then run the script with SKIP_START=1 to perform migration/verification only:
//   SKIP_START=1 node experiments/experiment_migration_demo.js
// On PowerShell (Windows):
//   $Env:SKIP_START = "1"; node experiments/experiment_migration_demo.js

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const OUTDIR = path.join(__dirname, "results", `migration_demo_${Date.now()}`);
fs.mkdirSync(OUTDIR, { recursive: true });

const BRIDGE_PORT = 4000;
const OLD_INSTANCE_PORT = 3000;
const NEW_INSTANCE_PORT = 3001;

const ALICE_OLD_USERNAME = "alice";
const ALICE_NEW_USERNAME = "alice_new";

async function waitForPort(port, timeout = 30000) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeout) {
    attempt++;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'GET', timeout: 1000 });
      // Treat any response (200/404/etc.) as the port being open; bridge has no root route by default
      if (res) {
        console.log(`  port ${port} responded (status ${res.status}) after ${attempt} attempts`);
        return true;
      }
    } catch (e) {
      // Log occasionally to avoid noisy output
      if (attempt % 4 === 0) console.log(`  waiting for port ${port}: ${e.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Port ${port} not open within ${timeout}ms`);
}

async function registerActor(baseUrl, username) {
  // Server auto-creates users from the USERS env var. Here we just fetch the actor document.
  console.log(`  Fetching actor ${username} from ${baseUrl}...`);
  const res = await fetch(`${baseUrl}/actor/${username}`);
  if (!res.ok) {
    throw new Error(`Actor ${username} not found on ${baseUrl} (status ${res.status})`);
  }
  const json = await res.json();
  console.log(`  Actor ${username} exists on ${baseUrl}: ${json.id}`);
  return { actorUrl: json.id, did: json.did, publicKey: json.publicKey?.publicKeyBase64 };
}

async function issueMigrationVC(oldInstanceUrl, oldUsername, newActorUrl) {
  console.log(`  Issuing migration VC from ${oldUsername} (old instance) to ${newActorUrl}...`);
  const res = await fetch(`${oldInstanceUrl}/actor/${oldUsername}/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      newActor: newActorUrl,
    }),
  });
  const json = await res.json();
  if (res.ok) {
    console.log(`  Migration VC issued: ${json.vc.id}`);
    return json.vc;
  } else {
    throw new Error(`Failed to issue migration VC: ${json.error || res.statusText}`);
  }
}

async function storeVC(bridgeUrl, vc) {
  console.log(`  Storing VC in bridge: ${vc.id}...`);
  const res = await fetch(`${bridgeUrl}/store`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vc }),
  });
  const json = await res.json();
  if (res.ok) {
    console.log(`  VC stored successfully.`);
  } else {
    throw new Error(`Failed to store VC: ${json.error || res.statusText}`);
  }
}

async function verifyVC(bridgeUrl, vc) {
  console.log(`  Verifying VC in bridge: ${vc.id}...`);
  const res = await fetch(`${bridgeUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vc }),
  });
  const json = await res.json();
  console.log(`  Verification result: valid=${json.valid}`);
  return json;
}

async function getLineageByDid(bridgeUrl, did) {
  console.log(`  Querying lineage for DID: ${did}...`);
  const res = await fetch(`${bridgeUrl}/lineage/did/${encodeURIComponent(did)}`);
  return res.json();
}

const { createHttpSignature } = require('../fep_extensions');

async function getActorCredentials(baseUrl, username) {
  const res = await fetch(`${baseUrl}/actor/${username}/credentials`);
  if (!res.ok) return null;
  return res.json();
}

async function sendMoveActivity(oldActorUrl, oldUsername, newActorInbox, migrationVc, newInstancePort) {
  // Build Move activity & sign with old actor's private key on disk
  const activity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${oldActorUrl}/activity/move/${Date.now()}`,
    type: 'Move',
    actor: oldActorUrl,
    object: migrationVc
  };

  // Read private key
  const privPath = path.join(__dirname, '..', 'keys', oldUsername, 'private.key');
  if (!fs.existsSync(privPath)) throw new Error(`Private key not found: ${privPath}`);
  const privateKey = fs.readFileSync(privPath, 'utf8').trim();

  const url = new URL(newActorInbox);
  const date = new Date().toUTCString();
  const digest = `SHA-256=${require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(activity))
    .digest('base64')}`;

  const signingHeader = await createHttpSignature(
    privateKey,
    'POST',
    url.pathname,
    url.host,
    date,
    digest,
    `${oldActorUrl}#main-key`
  );

  const resp = await fetch(newActorInbox, {
    method: 'POST',
    headers: {
      Host: url.host,
      Date: date,
      Digest: digest,
      Signature: signingHeader,
      'Content-Type': 'application/activity+json'
    },
    body: JSON.stringify(activity)
  });

  return resp;
}

async function main() {
  console.log("🔬 Identity Migration Demo");
  console.log(`   Output: ${OUTDIR}\n`);

  const children = [];
  const SKIP_START = process.env.SKIP_START;

  // Helper to start child processes and capture stdout/stderr to files for debugging
  function startChild(name, cmd, args = [], envVars = {}) {
    console.log(`▶ Starting ${name}...`);
    const child = spawn(cmd, args, {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, ...envVars },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    children.push(child);

    // Create log streams
    const outPath = path.join(OUTDIR, `${name}.stdout.log`);
    const errPath = path.join(OUTDIR, `${name}.stderr.log`);
    const outStream = fs.createWriteStream(outPath, { flags: 'a' });
    const errStream = fs.createWriteStream(errPath, { flags: 'a' });

    if (child.stdout) child.stdout.on('data', d => outStream.write(d));
    if (child.stderr) child.stderr.on('data', d => errStream.write(d));

    child.on('exit', (code, sig) => {
      const msg = `[${new Date().toISOString()}] exit code=${code} signal=${sig}\n`;
      errStream.write(msg);
    });

    child.on('error', e => {
      const msg = `[${new Date().toISOString()}] error ${e.message}\n`;
      errStream.write(msg);
    });

    return child;
  }

  try {
    // 1. Start Bridge (unless SKIP_START=1 for manual multi-shell demo)
    if (!SKIP_START) {
      const bridge = startChild('bridge', 'node', ['bridge.js']);
      await waitForPort(BRIDGE_PORT);
      console.log(`✓ Bridge listening on 127.0.0.1:${BRIDGE_PORT}\n`);

      // 2. Start Old Instance — use node -e wrapper to call listen() exported by server.js
      const oldScript = `require('./server').listen(process.env.PORT || ${OLD_INSTANCE_PORT}).then(()=>console.log('ActivityPub node listening on ${OLD_INSTANCE_PORT}')).catch(e=>console.error(e))`;
      const oldInstance = startChild('old-instance', 'node', ['-e', oldScript], { PORT: OLD_INSTANCE_PORT });
      await waitForPort(OLD_INSTANCE_PORT);
      console.log(`✓ Old Instance listening on 127.0.0.1:${OLD_INSTANCE_PORT}\n`);

      // 4. Start New Instance (configured to create ALICE_NEW_USERNAME)
      const newScript = `require('./server').listen(process.env.PORT || ${NEW_INSTANCE_PORT}).then(()=>console.log('ActivityPub node listening on ${NEW_INSTANCE_PORT}')).catch(e=>console.error(e))`;
      const newInstance = startChild('new-instance', 'node', ['-e', newScript], { PORT: NEW_INSTANCE_PORT, USERS: ALICE_NEW_USERNAME });
      await waitForPort(NEW_INSTANCE_PORT);
      console.log(`✓ New Instance listening on 127.0.0.1:${NEW_INSTANCE_PORT}\n`);
    } else {
      console.log('▶ SKIP_START=1 set — assuming Bridge and instances are started manually');
    }

    // 3. Discover Actor on Old Instance (server auto-creates 'alice' by default)
    const oldActor = await registerActor(
      `http://127.0.0.1:${OLD_INSTANCE_PORT}`,
      ALICE_OLD_USERNAME
    );
    const oldActorUrl = oldActor.actorUrl;
    const oldActorDid = oldActor.did;
    console.log(`  Old Actor DID: ${oldActorDid}\n`);

    // 5. Discover Actor on New Instance (the migration target)
    const newActor = await registerActor(
      `http://127.0.0.1:${NEW_INSTANCE_PORT}`,
      ALICE_NEW_USERNAME
    );
    const newActorUrl = newActor.actorUrl;
    const newActorDid = newActor.did;
    console.log(`  New Actor DID: ${newActorDid}\n`);

    // 6. Simulate Migration: Old instance issues VC pointing to new actor
    const migrationVc = await issueMigrationVC(
      `http://127.0.0.1:${OLD_INSTANCE_PORT}`,
      ALICE_OLD_USERNAME,
      newActorUrl
    );
    console.log(`  Migration VC for ${ALICE_OLD_USERNAME} -> ${ALICE_NEW_USERNAME}\n`);
    fs.writeFileSync(path.join(OUTDIR, 'migration_vc.json'), JSON.stringify(migrationVc, null, 2));

    // Show credentials on the old instance (should include the migration VC)
    console.log("--- Inspecting Old Instance Credentials ---");
    const oldCreds = await getActorCredentials(`http://127.0.0.1:${OLD_INSTANCE_PORT}`, ALICE_OLD_USERNAME);
    fs.writeFileSync(path.join(OUTDIR, 'old_instance_credentials.json'), JSON.stringify(oldCreds, null, 2));
    console.log(`  Old instance has ${Array.isArray(oldCreds) ? oldCreds.length : 0} credentials\n`);

    // 7. Check lineage (before bridge store)
    console.log("--- Lineage Check (before storing VC in bridge) ---");
    const lineageBefore = await getLineageByDid(`http://127.0.0.1:${BRIDGE_PORT}`, oldActorDid);
    fs.writeFileSync(path.join(OUTDIR, 'lineage_before.json'), JSON.stringify(lineageBefore, null, 2));
    console.log(`  Lineage before: ${JSON.stringify(lineageBefore)}\n`);

    // 8. Store Migration VC in the Bridge
    await storeVC(`http://127.0.0.1:${BRIDGE_PORT}`, migrationVc);
    console.log("\n");

    // 9. Verify Original (Migration) VC via Bridge (will verify signature + return terminal VC info)
    console.log("--- Verification Step 1: Verify the Migration VC (as issued by original actor) ---");
    const migratedVcResult = await verifyVC(`http://127.0.0.1:${BRIDGE_PORT}`, migrationVc);
    fs.writeFileSync(path.join(OUTDIR, 'migration_vc_verify_result.json'), JSON.stringify(migratedVcResult, null, 2));
    console.log("\n");

    // 9b. Optionally simulate sending a Move activity into the new instance's inbox
    console.log("--- Delivering Move activity to the new instance (signed by old actor) ---");
    try {
      const inboxUrl = `${newActorUrl}/inbox`;
      const resp = await sendMoveActivity(oldActorUrl, ALICE_OLD_USERNAME, inboxUrl, migrationVc, NEW_INSTANCE_PORT);
      console.log(`  New instance inbox response: ${resp.status} ${resp.statusText}`);
    } catch (e) {
      console.warn('  Move delivery failed:', e.message);
    }

    // 10. Lineage Check (after bridge has stored the VC)
    console.log("--- Lineage Check (after storing VC in bridge) ---");
    const lineageAfter = await getLineageByDid(`http://127.0.0.1:${BRIDGE_PORT}`, oldActorDid);
    fs.writeFileSync(path.join(OUTDIR, 'lineage_after.json'), JSON.stringify(lineageAfter, null, 2));
    console.log(`  Lineage after: ${JSON.stringify(lineageAfter)}\n`);

    if (lineageAfter && lineageAfter.end) {
      console.log(`  Terminal actor for DID ${oldActorDid} -> ${lineageAfter.end}`);
      console.log(`  Expected new actor URL: ${newActorUrl}\n`);
    }

    // 11. Inspect credentials on the NEW instance (should include a Move entry if delivery succeeded)
    console.log("--- Inspecting New Instance Credentials ---");
    const newCreds = await getActorCredentials(`http://127.0.0.1:${NEW_INSTANCE_PORT}`, ALICE_NEW_USERNAME);
    fs.writeFileSync(path.join(OUTDIR, 'new_instance_credentials.json'), JSON.stringify(newCreds, null, 2));
    console.log(`  New instance has ${Array.isArray(newCreds) ? newCreds.length : 0} credentials\n`);

    console.log("✅ Identity Migration Demo Complete!");
    console.log(`📊 Results and VCs saved to: ${OUTDIR}`);
  } finally {
    console.log("\n🛑 Cleaning up child processes...");
    children.forEach(child => child.kill());
    await new Promise(resolve => setTimeout(resolve, 1000)); // Give processes time to die
  }
}

main().catch(err => {
  console.error("❌ Demo failed:", err.message);
  process.exit(1);
});
