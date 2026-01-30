// experiments/simulate_migration_local.js
// Simulate migration without requiring the old server: create signed migration VC locally
// Usage: node experiments/simulate_migration_local.js

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const { createMigrationVC } = require('../lib/vc');
const { getDidFromPublicKey } = require('../lib/did');
const { createHttpSignature } = require('../fep_extensions');

const BRIDGE = process.env.BRIDGE_URL || 'http://127.0.0.1:4000';
const OLD_ACTOR_URL = process.env.OLD_ACTOR_URL || 'http://127.0.0.1:3000/actor/alice';
const NEW_ACTOR_URL = process.env.NEW_ACTOR_URL || 'http://127.0.0.1:3001/actor/alice_new';

async function main() {
  const OUTDIR = path.join(__dirname, 'results', `simulate_migration_${Date.now()}`);
  fs.mkdirSync(OUTDIR, { recursive: true });

  // Load local keys (alice)
  const privPath = path.join(__dirname, '..', 'keys', 'alice', 'private.key');
  const pubPath = path.join(__dirname, '..', 'keys', 'alice', 'public.key');

  if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
    console.error('Missing keys for alice. Ensure keys/alice exists with private.key and public.key');
    process.exit(1);
  }

  const privateKey = fs.readFileSync(privPath, 'utf8').trim();
  const publicKey = fs.readFileSync(pubPath, 'utf8').trim();

  const did = await getDidFromPublicKey(publicKey);
  console.log('Using DID:', did);

  // Create signed migration VC locally
  const vc = await createMigrationVC({
    issuerDid: did,
    subjectDid: did,
    oldActor: OLD_ACTOR_URL,
    newActor: NEW_ACTOR_URL,
    issuerPrivatePem: privateKey
  });

  fs.writeFileSync(path.join(OUTDIR, 'migration_vc.json'), JSON.stringify(vc, null, 2));
  console.log('Migration VC created:', vc.id);

  // Clean local registry for this DID to avoid ambiguous lineage from prior runs
  console.log('Cleaning local registry for DID to avoid ambiguous lineage...');
  const VC_FILE = require('path').join(__dirname, '..', 'registry', 'vc_registry.json');
  try {
    if (fs.existsSync(VC_FILE)) {
      const all = JSON.parse(fs.readFileSync(VC_FILE, 'utf8') || '{}');
      let removed = 0;
      for (const k of Object.keys(all)) {
        const v = all[k];
        const subj = v?.credentialSubject?.id;
        const issuer = v?.issuer;
        const oldActorField = v?.credentialSubject?.oldActor;
        const newActorField = v?.credentialSubject?.newActor;
        if (subj === did || issuer === did || oldActorField === OLD_ACTOR_URL || newActorField === NEW_ACTOR_URL) {
          delete all[k];
          removed++;
        }
      }
      if (removed > 0) fs.writeFileSync(VC_FILE, JSON.stringify(all, null, 2));
      console.log(`  Cleaned ${removed} existing VC(s) related to DID/actors`);
    }
  } catch (e) {
    console.warn('  Failed to clean VC registry:', e.message || e);
  }

  // Store VC in Bridge
  console.log('Storing VC in bridge...');
  const storeRes = await fetch(`${BRIDGE}/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vc })
  });
  console.log('Store response:', storeRes.status);
  console.log(await storeRes.text());

  // Verify VC
  console.log('Verifying VC via bridge...');
  const verifyRes = await fetch(`${BRIDGE}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vc })
  });
  const verifyJson = await verifyRes.json().catch(() => null);
  console.log('Verify result:', verifyJson);
  fs.writeFileSync(path.join(OUTDIR, 'migration_vc_verify_result.json'), JSON.stringify(verifyJson, null, 2));

  // Lineage by DID
  console.log('Querying lineage by DID...');
  const linResDid = await fetch(`${BRIDGE}/lineage/did/${encodeURIComponent(did)}`);
  const linJsonDid = await linResDid.json().catch(() => null);
  console.log('Lineage (by DID):', linJsonDid);
  fs.writeFileSync(path.join(OUTDIR, 'lineage_by_did.json'), JSON.stringify(linJsonDid, null, 2));

  // Lineage by actor URL (may be clearer)
  console.log('Querying lineage by actor URL...');
  const linResActor = await fetch(`${BRIDGE}/lineage/actor?url=${encodeURIComponent(OLD_ACTOR_URL)}`);
  const linJsonActor = await linResActor.json().catch(() => null);
  console.log('Lineage (by actor):', linJsonActor);
  fs.writeFileSync(path.join(OUTDIR, 'lineage_by_actor.json'), JSON.stringify(linJsonActor, null, 2));

  if (linJsonActor && Array.isArray(linJsonActor.issues) && linJsonActor.issues.some(x => x.includes('Fork detected') || x.includes('Multiple VCs'))) {
    console.warn('\n⚠️  Fork/Multiple VC issue detected for this actor.');
    console.warn('To demonstrate a clean migration, stop the Bridge, move or delete registry/vc_registry.json, and restart the Bridge, then re-run this script.');
  }

  // Deliver Move activity to new instance inbox (wait for the actor to be reachable)
  const inbox = `${NEW_ACTOR_URL}/inbox`;
  console.log('Waiting for new instance actor to be reachable at:', NEW_ACTOR_URL);

  async function waitForActor(url, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const r = await fetch(url, { method: 'GET', timeout: 1000 });
        if (r.ok) return true;
      } catch (e) {
        // ignore
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  const reachable = await waitForActor(NEW_ACTOR_URL, 10000);
  if (!reachable) {
    console.error('New instance not reachable; skipping move delivery');
  } else {
    console.log('Delivering Move activity to new instance inbox:', inbox);

    const activity = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `${OLD_ACTOR_URL}/activity/move/${Date.now()}`,
      type: 'Move',
      actor: OLD_ACTOR_URL,
      object: vc
    };

    const url = new URL(inbox);
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
      `${OLD_ACTOR_URL}#main-key`
    );

    try {
      const resp = await fetch(inbox, {
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

      console.log('Move delivery status:', resp.status);
      console.log(await resp.text());
    } catch (e) {
      console.error('Move delivery failed:', e.message || e);
    }
  }

  console.log('Done — outputs saved to', OUTDIR);
}

main().catch(e => {
  console.error('Simulation failed:', e && e.stack ? e.stack : e);
  process.exit(1);
});