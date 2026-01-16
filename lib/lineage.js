// lineage.js — FEP-390 lineage resolver (Ed25519-compatible)
//
// Uses vc-resolution.js strategies for:
//   - Authoritative VC lookup (local storage)
//   - Cached VC resolution (remote fetch + verify)
//   - Chain following (both local and remote)
//
// Resolves full migration lineage from either:
//   - start actor URL
//   - subject DID
//
// This version is fully compatible with:
//   - optimized storage-redis.js
//   - bridge.js with Redis backend
//   - Ed25519 crypto (lib/vc.js / lib/did.js)
//   - FEP-390 multi-hop chain semantics
//   - Dual-strategy VC resolution (authoritative + cached)
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
const vcResolution = require('./vc-resolution');

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
async function resolveLineage(startActor, opts = {}) {
  const start = normalizeActor(startActor);
  const maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 10;

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

    // Fork detection: check if multiple VCs originate from this oldActor
    try {
      if (typeof storage.getVCsByOldActor === 'function') {
        const forks = await storage.getVCsByOldActor(current);
        if (Array.isArray(forks) && forks.length > 1) {
          issues.push(`Fork detected for actor: ${current} (multiple migration VCs)`);
          break;
        }
      }
    } catch (e) {
      // Non-fatal; continue resolution
    }

    // Use new vc-resolution strategy to get VC
    // Tries authoritative first, falls back to cached
    const resolved = await vcResolution.resolveVC(current);

    if (!resolved) {
      // Reached terminal node (no VC found)
      break;
    }

    const vc = resolved.vc;
    const node = unpackVC(vc);

    chain.push(node);

    // Check for revocation
    const revoked = await vcResolution.isVCRevoked(vc, current);
    if (revoked) {
      issues.push(`VC revoked for actor: ${current}`);
      break;
    }

    // Depth guard
    if (chain.length >= maxDepth) {
      issues.push(`Max chain depth exceeded (${maxDepth}) at actor: ${current}`);
      break;
    }

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
