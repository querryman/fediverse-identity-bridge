/**
 * helpers/chain_utils.js
 *
 * Utility to generate synthetic multi-hop migration chains
 * usable by bench_chain_depth.js.
 *
 * Depth N chain:
 *   actor0 → actor1 → actor2 → ... → actorN
 *
 * Returns the *first* VC (actor0 → actor1) which the benchmark
 * will verify and allow the bridge to follow the entire chain.
 */

const crypto = require("crypto");
const fetch = require("node-fetch");
const { generateKeypair } = require("../../lib/crypto");
const { getDidFromPublicPem } = require("../../lib/did");
const { createMigrationVC } = require("../../lib/vc");
const storage = require("../../lib/storage");

// Create a VC using the shared library helper
function createVC({ issuerDid, subjectDid, oldActor, newActor, privatePem }) {
  return createMigrationVC({
    issuerDid,
    subjectDid,
    oldActor,
    newActor,
    issuerPrivatePem: privatePem
  });
}

async function storeVCInBridge(vc) {
  // Write directly to the shared storage file.
  // The bridge will load this on startup.
  await storage.saveCredential(vc);
}

/**
 * Generate a synthetic chain:
 *
 * depth=4 → A → B → C → D → E
 *
 * Returns the FIRST VC (A→B)
 */
async function generateMultiHopChain(depth) {
  if (depth < 1) throw new Error("Depth must be >= 1");

  const actors = [];
  const keys = [];
  const dids = [];

  // Create actors A0..AN
  for (let i = 0; i <= depth; i++) {
    const actor = `http://example.org/actor/${crypto.randomUUID()}`;
    const pair = generateKeypair();
    const did = getDidFromPublicPem(pair.publicKey);

    actors.push(actor);
    keys.push(pair.privateKey);
    dids.push(did);

    // Register DID in the shared storage (assuming shared filesystem)
    await storage.putDid(did, pair.publicKey);
  }

  let firstVC = null;

  // Build and store VCs: A0→A1, A1→A2, ..., A{N-1}→AN
  for (let i = 0; i < depth; i++) {
    const vc = createVC({
      issuerDid: dids[i],
      subjectDid: dids[i + 1],
      oldActor: actors[i],
      newActor: actors[i + 1],
      privatePem: keys[i]
    });

    if (i === 0) firstVC = vc;

    await storeVCInBridge(vc);
  }

  // CRITICAL: Flush writes to disk before returning
  // This ensures spawned bridge processes can load the registry
  storage.flushSync();

  return firstVC;
}

module.exports = { generateMultiHopChain };
