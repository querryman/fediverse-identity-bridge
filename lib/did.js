// did.js — Ed25519 DID:key generation + parsing
//
// Compatible with:
//   - crypto.js  (base64 Ed25519 keys)
//   - vc.js      (Ed25519Signature2020)
//   - bridge.js  (migration VC verification)
//   - server.js  (actor documents expose base64 Ed25519 keys)
//   - FEP-390    (issuer/subject DID uses did:key)
//
// DID:key encoding rules:
//   DID = "did:key:z" + base58btc( 0xED 0x01 || <raw 32-byte public key> )
//
// Multicodec prefix for Ed25519 pubkeys: 0xED 0x01
//
// Reference: https://w3c-ccg.github.io/did-method-key/

const bs58 = require('bs58');

/* --------------------------------------------------------------------------
 * UTIL: Convert base64 → bytes  (raw 32 bytes)
 * -------------------------------------------------------------------------- */
function base64ToBytes(b64) {
  return Buffer.from(b64, 'base64');
}

/* --------------------------------------------------------------------------
 * UTIL: Construct DID:key from raw Ed25519 32-byte public key
 * -------------------------------------------------------------------------- */
function didFromRawPublicKey(rawBytes) {
  // Ed25519 multicodec prefix: 0xED 0x01
  const prefixed = Buffer.concat([
    Buffer.from([0xed, 0x01]),
    rawBytes
  ]);

  const mb = bs58.encode(prefixed);
  return "did:key:z" + mb;
}

/* --------------------------------------------------------------------------
 * PUBLIC: derive DID from base64 Ed25519 pubkey
 * -------------------------------------------------------------------------- */
async function getDidFromPublicKey(publicKeyBase64) {
  const raw = base64ToBytes(publicKeyBase64);
  return didFromRawPublicKey(raw);
}

/* --------------------------------------------------------------------------
 * PUBLIC: Extract raw Ed25519 public key from did:key
 * (Used during verification if needed)
 * -------------------------------------------------------------------------- */
function getRawFromDid(did) {
  if (!did.startsWith("did:key:z")) return null;

  try {
    const b58 = did.slice("did:key:z".length);
    const buf = Buffer.from(bs58.decode(b58));

    // Must start with multicodec [0xED, 0x01]
    if (buf[0] !== 0xed || buf[1] !== 0x01) return null;

    return buf.slice(2); // 32 bytes
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
 * PUBLIC: Return base64 Ed25519 key from DID:key
 * -------------------------------------------------------------------------- */
function getBase64FromDid(did) {
  const raw = getRawFromDid(did);
  if (!raw) return null;
  return raw.toString('base64');
}

module.exports = {
  getDidFromPublicKey,
  getRawFromDid,
  getBase64FromDid
};
