// lineage.js — FEP-390 lineage resolver (Ed25519-compatible)
//
// Resolves full migration lineage from either:
//   - start actor URL
//   - subject DID
//
// This version is fully compatible with:
//   - optimized storage.js
//   - optimized bridge.js
//   - Ed25519 crypto (new vc.js / did.js)
//   - FEP-390 multi-hop chain semantics
//
// Returns a structure like:
// {
//    start: "http://.../actor/alice",
//    end:   "http://.../actor/carol",
//    chain: [
//       { id, issuerDid, subjectDid, oldActor, newActor },
//       ...
//    ],
//    issues: [
//       "Cycle detected",
//       "Fork detected for actor X",
//       ...
//    ]
// }

const storage = require('./storage');

/* --------------------------------------------------------------
 * Normalize an actor URL (canonical form)
 * ------------------------------------------------------------*/
function normalizeActor(url) {
  if (!url) return null;
  return String(url)
    .trim()
    .replace(/#.*$/, '')     // remove fragments
    .replace(/\/+$/, '');    // remove trailing slash
}

/* --------------------------------------------------------------
 * Extract relevant VC fields
 * ------------------------------------------------------------*/
function unpackVC(vc) {
  const cs = vc.credentialSubject || {};
  return {
    id: vc.id,
    issuerDid: vc.issuer,
    subjectDid: cs.id,
    oldActor: normalizeActor(cs.oldActor),
    newActor: normalizeActor(cs.newActor)
  };
}

/* --------------------------------------------------------------
 * Main chain resolver — actor→actor→actor…
 * ------------------------------------------------------------*/
async function resolveLineage(startActor) {
  const start = normalizeActor(startActor);

  const chain = [];
  const issues = [];

  const visited = new Set();
  let current = start;

  while (true) {
    if (!current) break;

    if (visited.has(current)) {
      issues.push(`Cycle detected involving: ${current}`);
      break;
    }
    visited.add(current);

    // Fetch all VCs where oldActor = current
    const vcs = storage.getVCsByOldActor(current);

    if (vcs.length === 0) {
      // Reached terminal node
      break;
    }

    if (vcs.length > 1) {
      // FEP-390 allows detection but not resolution of forks
      issues.push(`Fork detected: oldActor ${current} has ${vcs.length} VCs`);
    }

    // Deterministic choice: take most recent VC
    const vc = vcs[vcs.length - 1];
    const node = unpackVC(vc);

    chain.push(node);

    // Follow the chain to next hop
    current = node.newActor;
  }

  return {
    start,
    end: current,
    chain,
    issues
  };
}

/* --------------------------------------------------------------
 * DID-based resolver
 * ------------------------------------------------------------*/
async function resolveLineageByDid(subjectDid) {
  // Fetch all VCs where subjectDid matches
  const list = storage.getVCsBySubject(subjectDid);

  if (list.length === 0) {
    return {
      start: subjectDid,
      end: subjectDid,
      chain: [],
      issues: [ "No migration VCs found for this DID" ]
    };
  }

  if (list.length > 1) {
    return {
      start: subjectDid,
      end: subjectDid,
      chain: [],
      issues: [ "Multiple VCs found for same DID (ambiguous origin)" ]
    };
  }

  // Use its oldActor as the starting point
  const only = list[0];
  const u = unpackVC(only);

  return resolveLineage(u.oldActor);
}

/* --------------------------------------------------------------
 * EXPORTS
 * ------------------------------------------------------------*/
module.exports = {
  resolveLineage,
  resolveLineageByDid
};
