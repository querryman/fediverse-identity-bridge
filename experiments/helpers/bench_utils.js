// helpers/bench_utils.js
// Unified helper utilities for experiments
// Uses ONLY Ed25519 (matching crypto.js)

const fetch = require("node-fetch");
const {
  generateKeypairEd25519,
  signEd25519
} = require("../../lib/crypto");   // ← matches your crypto.js exports
const { getDidFromPublicKey } = require("../../lib/did");
const storage = require("../../lib/storage");

/* --------------------------------------------------------------------------
 * Canonical JSON (matching lib/vc.js)
 * -------------------------------------------------------------------------- */
function canonicalizeJson(obj) {
  return JSON.stringify(sortObject(obj));
}

function sortObject(o) {
  if (Array.isArray(o)) return o.map(sortObject);
  if (o && typeof o === "object") {
    const out = {};
    for (const k of Object.keys(o).sort()) {
      out[k] = sortObject(o[k]);
    }
    return out;
  }
  return o;
}

// ------------------------------------------------------------
// Generate a synthetic Ed25519 VC for load testing
// ------------------------------------------------------------
async function generateVC() {
  try {
    const kp = await generateKeypairEd25519();
    if (!kp || !kp.publicKey || !kp.privateKey) {
      throw new Error("Failed to generate Ed25519 keypair: invalid structure");
    }

    // Derive proper DID:key from the public key
    const issuerDid = await getDidFromPublicKey(kp.publicKey);
    const subjectDid = issuerDid;

    // Store the issuer DID and public key so bridge can verify (backing file)
    await storage.putDid(issuerDid, kp.publicKey);

  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: "vc:test:" + Date.now() + ":" + Math.random(),
    type: ["VerifiableCredential", "MigrationCredential"],
    issuer: issuerDid,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: subjectDid,
      oldActor: "http://example.org/old/" + Math.random(),
      newActor: "http://example.org/new/" + Math.random()
    }
  };

    // Canonical JSON: sorted keys, no whitespace
    const toSign = canonicalizeJson(vc);

    // Ed25519 signing
    const sig = await signEd25519(kp.privateKey, toSign);
    if (!sig) {
      throw new Error("Failed to sign VC: no signature returned");
    }

    vc.proof = {
      type: "Ed25519Signature2020",
      created: vc.issuanceDate,
      proofPurpose: "assertionMethod",
      verificationMethod: issuerDid + "#owner",
      signature: sig
    };

    // Return both vc and the issuer key so callers can register to running bridges
    return { vc, issuerDid, publicKey: kp.publicKey };
  } catch (err) {
    throw new Error(`generateVC failed: ${err.message}`);
  }
}

// ------------------------------------------------------------
// Worker-based load generator
// Accepts `baseUrl` so callers can point to the actual bridge port
// ------------------------------------------------------------
async function runLoadTest({ vc, total, concurrency, csvPath, monitor, baseUrl = "http://localhost:4000" }) {
  let completed = 0;
  const results = [];

  async function worker() {
    while (true) {
      const index = completed++;
      if (index >= total) break;

      const start = Date.now();
      let ok = false;

      try {
        const res = await fetch(`${baseUrl}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vc })
        });

        const json = await res.json().catch(() => null);
        ok = json && json.valid === true;
      } catch {
        ok = false;
      }

      const latency = Date.now() - start;
      const snap = monitor.lastSample();

      // Write CSV row
      const line = [
        index,
        latency,
        ok,
        snap.bridgeRAM,
        snap.systemRAM
      ].join(",") + "\n";

      require("fs").appendFileSync(csvPath, line);
      results.push(latency);
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  // Compute summary stats
  results.sort((a, b) => a - b);
  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  const p95 = results[Math.floor(results.length * 0.95)];
  const p99 = results[Math.floor(results.length * 0.99)];

  return { avgLatency: avg, p95, p99 };
}

module.exports = { generateVC, runLoadTest };
