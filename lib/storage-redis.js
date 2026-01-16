// storage-redis.js — Redis-backed Ed25519 compatible DID + VC registry
//
// Replaces file-based storage.js with Redis for:
//   - Horizontal scaling (stateless bridge)
//   - Persistence across restarts
//   - Automatic TTL management
//   - Better performance at scale
//
// Maintains same interface as storage.js for drop-in compatibility.
// Uses Redis v4 API with native async/await support.
//

const { createClient } = require('redis');

/* -------------------------------------------------------
 * Redis Client Setup (Redis v4 API - native async)
 * ------------------------------------------------------- */
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || 6379);
const REDIS_DB = parseInt(process.env.REDIS_DB || 0);
const NS = process.env.REDIS_NAMESPACE || 'identity_bridge';

// TTLs (in seconds)
const VC_TTL = parseInt(process.env.REDIS_VC_TTL || 86400);    // 24h
const DID_TTL = parseInt(process.env.REDIS_DID_TTL || 604800);  // 7d

let client = null;

async function initClient() {
  if (client) return client;

  client = createClient({
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT,
      reconnectStrategy: (retries, cause) => {
        if (retries > 10) {
          console.error('[storage-redis] Max retries reached');
          return new Error('Max retries');
        }
        return Math.min(retries * 50, 500);
      }
    },
    database: REDIS_DB
  });

  client.on('error', (err) => {
    console.error('[storage-redis] Client error:', err.message);
  });

  client.on('connect', () => {
    console.log(`[storage-redis] Connected to ${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}`);
  });

  try {
    await client.connect();
    console.log('[storage-redis] Ready');
    return client;
  } catch (err) {
    console.error('[storage-redis] Failed to connect:', err.message);
    throw err;
  }
}

/* -------------------------------------------------------
 * Helper: ensure client is ready
 * ------------------------------------------------------- */
async function ensureClient() {
  if (!client) {
    await initClient();
  }
  return client;
}

/* -------------------------------------------------------
 * DID Registry: putDid(did, base64PubKey)
 * ------------------------------------------------------- */
async function putDid(did, base64PubKey) {
  try {
    const c = await ensureClient();
    const key = `${NS}:did:${did}`;
    await c.setEx(key, DID_TTL, base64PubKey);
  } catch (err) {
    console.error(`[storage-redis] putDid failed: ${err.message}`);
    throw err;
  }
}

/* -------------------------------------------------------
 * DID Registry: getDid(did) → base64PubKey
 * ------------------------------------------------------- */
async function getDid(did) {
  try {
    const c = await ensureClient();
    const key = `${NS}:did:${did}`;
    const val = await c.get(key);
    return val || null;
  } catch (err) {
    console.error(`[storage-redis] getDid failed: ${err.message}`);
    throw err;
  }
}

/* -------------------------------------------------------
 * VC Registry: saveCredential(vc)
 * Indexes VC by: id, issuer, subject.id, oldActor, newActor
 * ------------------------------------------------------- */
async function saveCredential(vc) {
  if (!vc || !vc.id) {
    throw new Error('VC must have an id');
  }

  try {
    const c = await ensureClient();
    const key = `${NS}:vc:${vc.id}`;
    const json = JSON.stringify(vc);

    // Store VC with TTL
    await c.setEx(key, VC_TTL, json);

    // Index by issuer
    if (vc.issuer) {
      const issuerKey = `${NS}:vc:issuer:${vc.issuer}`;
      await c.sAdd(issuerKey, vc.id);
      await c.expire(issuerKey, VC_TTL);
    }

    // Index by subject DID (credentialSubject.id)
    const cs = vc.credentialSubject || {};
    if (cs.id) {
      const subjectKey = `${NS}:vc:subject:${cs.id}`;
      await c.sAdd(subjectKey, vc.id);
      await c.expire(subjectKey, VC_TTL);
    }

    // Index by oldActor
    if (cs.oldActor) {
      const oldKey = `${NS}:vc:old_actor:${cs.oldActor}`;
      await c.sAdd(oldKey, vc.id);
      await c.expire(oldKey, VC_TTL);
    }

    // Index by newActor
    if (cs.newActor) {
      const newKey = `${NS}:vc:new_actor:${cs.newActor}`;
      await c.sAdd(newKey, vc.id);
      await c.expire(newKey, VC_TTL);
    }
  } catch (err) {
    console.error(`[storage-redis] saveCredential failed: ${err.message}`);
    throw err;
  }
}

/* -------------------------------------------------------
 * VC Registry: getCredential(id) → VC
 * ------------------------------------------------------- */
async function getCredential(id) {
  try {
    const c = await ensureClient();
    const key = `${NS}:vc:${id}`;
    const json = await c.get(key);
    if (!json) return null;
    return JSON.parse(json);
  } catch (err) {
    console.error(`[storage-redis] getCredential failed: ${err.message}`);
    throw err;
  }
}

/* -------------------------------------------------------
 * VC Queries: getVCsByIssuer(issuerDid) → [VC]
 * ------------------------------------------------------- */
async function getVCsByIssuer(issuerDid) {
  if (!issuerDid) return [];
  
  try {
    const c = await ensureClient();
    const indexKey = `${NS}:vc:issuer:${issuerDid}`;
    const ids = await c.sMembers(indexKey);
    
    if (!ids || ids.length === 0) return [];
    
    const vcs = await Promise.all(
      ids.map(id => getCredential(id).catch(() => null))
    );
    return vcs.filter(Boolean);
  } catch (err) {
    console.error(`[storage-redis] getVCsByIssuer failed: ${err.message}`);
    throw err;
  }
}

/* -------------------------------------------------------
 * VC Queries: getVCsBySubject(subjectDid) → [VC]
 * ------------------------------------------------------- */
async function getVCsBySubject(subjectDid) {
  if (!subjectDid) return [];
  
  try {
    const c = await ensureClient();
    const indexKey = `${NS}:vc:subject:${subjectDid}`;
    const ids = await c.sMembers(indexKey);
    
    if (!ids || ids.length === 0) return [];
    
    const vcs = await Promise.all(
      ids.map(id => getCredential(id).catch(() => null))
    );
    return vcs.filter(Boolean);
  } catch (err) {
    console.error(`[storage-redis] getVCsBySubject failed: ${err.message}`);
    throw err;
  }
}

/* -------------------------------------------------------
 * VC Queries: getVCsByOldActor(oldActor) → [VC]
 * ------------------------------------------------------- */
async function getVCsByOldActor(oldActor) {
  if (!oldActor) return [];
  
  try {
    const c = await ensureClient();
    const indexKey = `${NS}:vc:old_actor:${oldActor}`;
    const ids = await c.sMembers(indexKey);
    
    if (!ids || ids.length === 0) return [];
    
    const vcs = await Promise.all(
      ids.map(id => getCredential(id).catch(() => null))
    );
    return vcs.filter(Boolean);
  } catch (err) {
    console.error(`[storage-redis] getVCsByOldActor failed: ${err.message}`);
    throw err;
  }
}

/* -------------------------------------------------------
 * VC Queries: getVCsByNewActor(newActor) → [VC]
 * ------------------------------------------------------- */
async function getVCsByNewActor(newActor) {
  if (!newActor) return [];
  
  try {
    const c = await ensureClient();
    const indexKey = `${NS}:vc:new_actor:${newActor}`;
    const ids = await c.sMembers(indexKey);
    
    if (!ids || ids.length === 0) return [];
    
    const vcs = await Promise.all(
      ids.map(id => getCredential(id).catch(() => null))
    );
    return vcs.filter(Boolean);
  } catch (err) {
    console.error(`[storage-redis] getVCsByNewActor failed: ${err.message}`);
    throw err;
  }
}

/* -------------------------------------------------------
 * Health check
 * ------------------------------------------------------- */
async function healthCheck() {
  try {
    const c = await ensureClient();
    const reply = await c.ping();
    return reply === 'PONG';
  } catch {
    return false;
  }
}

/* -------------------------------------------------------
 * Exports (same interface as storage.js)
 * ------------------------------------------------------- */
module.exports = {
  putDid,
  getDid,
  saveCredential,
  getCredential,
  getVCsByIssuer,
  getVCsBySubject,
  getVCsByOldActor,
  getVCsByNewActor,
  healthCheck,
  initClient
};