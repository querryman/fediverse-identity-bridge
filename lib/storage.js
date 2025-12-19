// storage.js — Ed25519 compatible DID + VC registry
//
// Stores:
//   - DID → base64 Ed25519 public key
//   - VC ID → VC object
//
// Provides:
//   saveCredential(vc)
//   getCredential(id)
//   putDid(did, base64Key)
//   getDid(did)
//   getVCsByIssuer / Subject / OldActor / NewActor
//
// Fully compatible with FEP-390 lineage resolution.
//

const fs = require('fs');
const path = require('path');

/* ---------------------------------------------------------------------
 * FILE LOCATIONS
 * ------------------------------------------------------------------- */
const REG_DIR = path.join(__dirname, '..', 'registry');
if (!fs.existsSync(REG_DIR)) fs.mkdirSync(REG_DIR, { recursive: true });

const DID_FILE  = path.join(REG_DIR, 'did_registry.json');
const VC_FILE   = path.join(REG_DIR, 'vc_registry.json');

/* ---------------------------------------------------------------------
 * IN-MEMORY REGISTERS
 * ------------------------------------------------------------------- */
let didCache = {};     // did → base64 pubkey
let vcCache  = {};     // vc.id → VC

/* ---------------------------------------------------------------------
 * INDEX TABLES
 * ------------------------------------------------------------------- */
const idxIssuer   = new Map(); // issuerDid → [vcId]
const idxSubject  = new Map(); // subjectDid → [vcId]
const idxOld      = new Map(); // oldActor → [vcId]
const idxNew      = new Map(); // newActor → [vcId]

/* ---------------------------------------------------------------------
 * UTIL: safe load + write
 * ------------------------------------------------------------------- */
function loadJSON(file) {
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{}');
  } catch (e) {
    console.error('[storage] Failed load:', file, e);
    return {};
  }
}

function writeJSON(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('[storage] Failed write:', file, e);
  }
}

/* ---------------------------------------------------------------------
 * INDEX HELPERS
 * ------------------------------------------------------------------- */
function pushIndex(map, key, vcId) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(vcId);
}

function indexVC(vc) {
  const id  = vc.id;
  const cs  = vc.credentialSubject || {};

  pushIndex(idxIssuer,  vc.issuer, id);
  pushIndex(idxSubject, cs.id, id);
  pushIndex(idxOld,     cs.oldActor, id);
  pushIndex(idxNew,     cs.newActor, id);
}

/* ---------------------------------------------------------------------
 * INITIAL LOAD
 * ------------------------------------------------------------------- */
didCache = loadJSON(DID_FILE);
vcCache  = loadJSON(VC_FILE);

// Rebuild indexes
for (const vcId of Object.keys(vcCache)) {
  indexVC(vcCache[vcId]);
}

/* ---------------------------------------------------------------------
 * DID REGISTRY
 * ------------------------------------------------------------------- */
async function putDid(did, base64PubKey) {
  didCache[did] = base64PubKey;
  writeJSON(DID_FILE, didCache);
}

async function getDid(did) {
  return didCache[did] || null;
}

/* ---------------------------------------------------------------------
 * VC REGISTRY
 * ------------------------------------------------------------------- */
async function saveCredential(vc) {
  if (!vc || !vc.id) return;

  vcCache[vc.id] = vc;
  indexVC(vc);
  writeJSON(VC_FILE, vcCache);
}

async function getCredential(id) {
  return vcCache[id] || null;
}

/* ---------------------------------------------------------------------
 * QUERY FUNCTIONS
 * ------------------------------------------------------------------- */
function _fetchAll(map, key) {
  const arr = map.get(key) || [];
  return arr.map(id => vcCache[id]).filter(Boolean);
}

function getVCsByIssuer(issuerDid) {
  return _fetchAll(idxIssuer, issuerDid);
}

function getVCsBySubject(subjectDid) {
  return _fetchAll(idxSubject, subjectDid);
}

function getVCsByOldActor(oldActor) {
  return _fetchAll(idxOld, oldActor);
}

function getVCsByNewActor(newActor) {
  return _fetchAll(idxNew, newActor);
}

/* ---------------------------------------------------------------------
 * EXPORTS
 * ------------------------------------------------------------------- */
module.exports = {
  putDid,
  getDid,

  saveCredential,
  getCredential,

  getVCsByIssuer,
  getVCsBySubject,
  getVCsByOldActor,
  getVCsByNewActor,
};
