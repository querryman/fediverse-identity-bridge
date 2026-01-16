// lib/vc-resolution.js — VC Resolution Strategies
//
// Separates authoritative (local) from cached (remote) VC resolution.
// Allows different strategies for different trust scenarios:
//
// 1. Authoritative: VC stored locally in bridge → trust without verification
// 2. Cached: VC fetched from remote actor → verify signature before using
// 3. Resolved: Follow chain with both local and remote VCs
//

const storage = require('./storage');
const { verifyMigrationVC } = require('./vc');
const { getBase64FromDid } = require('./did');
const fetch = require('node-fetch');

/* -------------------------------------------------------
 * Fetch remote JSON (no caching — let Redis TTL handle it)
 * ------------------------------------------------------- */
async function fetchJSON(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------
 * Fetch Authoritative VC
 * 
 * Authoritative VCs are those stored locally in the bridge's
 * Redis storage. They are already verified and trusted.
 * ------------------------------------------------------- */
async function fetchAuthoritativeVC(actorUrl) {
  // Query local storage for VCs issued by this actor
  const localVCs = await storage.getVCsByOldActor(actorUrl);
  
  // Return most recent (deterministic choice)
  if (localVCs.length > 0) {
    return localVCs[localVCs.length - 1];
  }
  
  return null;
}

/* -------------------------------------------------------
 * Get Cached VC (with verification)
 * 
 * Cached VCs are those fetched from remote actors.
 * Must be verified before trusting.
 * 
 * Does NOT cache in memory — Redis TTL and query indexes
 * handle caching automatically.
 * ------------------------------------------------------- */
async function getCachedVC(actorUrl) {
  // Fetch from remote actor's /migration endpoint
  const remoteVC = await fetchJSON(actorUrl + '/migration');
  
  if (!remoteVC) return null;
  
  // Verify signature before returning
  const issuerDid = remoteVC.issuer;
  let publicPem = await storage.getDid(issuerDid);
  
  // If issuer not cached, extract from did:key
  if (!publicPem && issuerDid.startsWith('did:key:z')) {
    const publicKeyBase64 = getBase64FromDid(issuerDid);
    if (publicKeyBase64) {
      publicPem = publicKeyBase64;
      // Cache for future requests
      await storage.putDid(issuerDid, publicKeyBase64);
    }
  }
  
  // Verify signature
  if (publicPem) {
    const valid = await verifyMigrationVC(remoteVC, publicPem);
    if (valid) {
      return remoteVC;
    }
  }
  
  return null;
}

/* -------------------------------------------------------
 * Resolve VC (try authoritative, fall back to cached)
 * 
 * Dual-strategy resolution:
 * 1. First, check local storage (authoritative)
 * 2. If not found, fetch from remote (cached)
 * 3. Return the most recent/verified option
 * ------------------------------------------------------- */
async function resolveVC(actorUrl) {
  // Strategy 1: Try authoritative (local)
  const authoritative = await fetchAuthoritativeVC(actorUrl);
  if (authoritative) {
    return {
      vc: authoritative,
      source: 'authoritative',
      verified: true
    };
  }
  
  // Strategy 2: Try cached (remote)
  const cached = await getCachedVC(actorUrl);
  if (cached) {
    return {
      vc: cached,
      source: 'cached',
      verified: true
    };
  }
  
  return null;
}

/* -------------------------------------------------------
 * Check Revocation Status
 * 
 * Queries remote /migration/status endpoint for revocation info.
 * Returns null if not revoked, revocation details if revoked.
 * ------------------------------------------------------- */
async function getRevocationStatus(actorUrl) {
  try {
    const status = await fetchJSON(actorUrl + '/migration/status');
    return status || null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------
 * Check if VC is revoked
 * ------------------------------------------------------- */
async function isVCRevoked(vc, actorUrl) {
  if (!vc.id) return false;
  
  const status = await getRevocationStatus(actorUrl);
  if (!status) return false;
  
  return status[vc.id]?.revoked === true;
}

/* -------------------------------------------------------
 * Resolve Full Chain (follow newActor links)
 * 
 * Uses dual strategy:
 * - Prefer authoritative VCs (local storage)
 * - Fall back to cached VCs (remote fetch)
 * - Follow chain up to 10 hops
 * - Detect and report cycles/forks
 * ------------------------------------------------------- */
async function resolveFullChain(startVC) {
  if (!startVC) return null;
  
  const chain = [];
  const visited = new Set();
  
  let current = startVC;
  let hops = 0;
  const MAX_HOPS = 10;
  
  while (current && hops < MAX_HOPS) {
    const vcId = current.id;
    
    // Detect cycles
    if (visited.has(vcId)) {
      return {
        chain,
        end: current,
        complete: false,
        error: 'Cycle detected'
      };
    }
    visited.add(vcId);
    
    chain.push(current);
    
    // Follow to next actor
    const nextActor = current.credentialSubject?.newActor;
    if (!nextActor) {
      // Reached terminal
      return {
        chain,
        end: current,
        complete: true,
        error: null
      };
    }
    
    // Check revocation
    if (await isVCRevoked(current, nextActor)) {
      return {
        chain,
        end: current,
        complete: false,
        error: 'VC revoked'
      };
    }
    
    // Resolve next VC
    const result = await resolveVC(nextActor);
    if (!result) {
      return {
        chain,
        end: current,
        complete: false,
        error: `Cannot resolve chain beyond ${nextActor}`
      };
    }
    
    current = result.vc;
    hops++;
  }
  
  return {
    chain,
    end: current,
    complete: hops < MAX_HOPS,
    error: hops >= MAX_HOPS ? 'Max chain depth exceeded' : null
  };
}

/* -------------------------------------------------------
 * Exports
 * ------------------------------------------------------- */
module.exports = {
  fetchAuthoritativeVC,
  getCachedVC,
  resolveVC,
  getRevocationStatus,
  isVCRevoked,
  resolveFullChain,
  // Helper for testing
  fetchJSON
};
