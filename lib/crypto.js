// crypto.js — Dual P-521 + Ed25519 support with safe dynamic imports.
// Fully CommonJS-compatible. No ESM errors.

const crypto = require("crypto");

// Polyfill for @noble/ed25519: ensure crypto.subtle is available
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.subtle) {
  global.crypto.subtle = crypto.webcrypto.subtle;
}

// ------------------------------------------------------------
// P-521 (default, FEP-521a compliant)
// ------------------------------------------------------------
function generateKeypairP521() {
  return crypto.generateKeyPairSync("ec", {
    namedCurve: "secp521r1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });
}

function signP521(privatePem, msg) {
  const sign = crypto.createSign("sha512");
  sign.update(msg);
  sign.end();
  return sign.sign(privatePem).toString("base64");
}

function verifyP521(publicPem, msg, sigB64) {
  const verify = crypto.createVerify("sha512");
  verify.update(msg);
  verify.end();
  return verify.verify(publicPem, Buffer.from(sigB64, "base64"));
}

// ------------------------------------------------------------
// Ed25519 (lazy-loaded using dynamic import)
// ------------------------------------------------------------
let ed25519Module = null;

async function getEd25519() {
  if (ed25519Module) return ed25519Module;

  const ed = await import("@noble/ed25519");

  // Ensure noble has a SHA-512 implementation available.
  const sha512 = (msg) => {
    const hash = crypto.createHash("sha512");
    hash.update(msg);
    return hash.digest();
  };

  // Cover both possible hook names used by different noble versions.
  if (!ed.utils) ed.utils = {};
  ed.utils.sha512 = ed.utils.sha512 || sha512;
  ed.utils.sha512Sync = ed.utils.sha512Sync || sha512;
  ed.utils.sha512Async = ed.utils.sha512Async || sha512;
  // Some noble versions expect a `hashes` object
  if (!ed.hashes) ed.hashes = {};
  ed.hashes.sha512 = ed.hashes.sha512 || sha512;

  ed25519Module = ed;
  return ed;
}

async function generateKeypairEd25519() {
  const ed = await getEd25519();
  const priv = crypto.randomBytes(32);
  const getPub = ed.getPublicKey ?? ed.getPublicKeyAsync;
  const pub = await getPub(priv);

  return {
    type: "ed25519",
    publicKey: Buffer.from(pub).toString("base64"),
    privateKey: priv.toString("base64")
  };
}

async function signEd25519(privateKeyB64, msg) {
  const ed = await getEd25519();
  const priv = Buffer.from(privateKeyB64, "base64");
  const signFn = ed.sign ?? ed.signAsync;
  const msgBytes = Buffer.isBuffer(msg) ? msg : Buffer.from(String(msg));
  const sig = await signFn(msgBytes, priv);
  return Buffer.from(sig).toString("base64");
}

async function verifyEd25519(publicKeyB64, msg, sigB64) {
  const ed = await getEd25519();
  const pub = Buffer.from(publicKeyB64, "base64");
  const sig = Buffer.from(sigB64, "base64");
  const verifyFn = ed.verify ?? ed.verifyAsync;
  const msgBytes = Buffer.isBuffer(msg) ? msg : Buffer.from(String(msg));
  return await verifyFn(sig, msgBytes, pub);
}

/*
 * Backwards-compatible signString / verifyString wrappers
 * - If the key looks like PEM (starts with -----BEGIN), use P-521 (sha512)
 * - Otherwise assume base64 Ed25519 key and use Ed25519 routines
 */
async function signString(privateKeyOrPem, msg) {
  if (typeof privateKeyOrPem === 'string' && privateKeyOrPem.trim().startsWith('-----BEGIN')) {
    // P-521 private key in PEM format
    return signP521(privateKeyOrPem, msg);
  }
  // Ed25519: privateKeyOrPem is base64 raw 32 bytes
  return await signEd25519(privateKeyOrPem, msg);
}

async function verifyString(publicKeyOrPem, msg, sigB64) {
  if (typeof publicKeyOrPem === 'string' && publicKeyOrPem.trim().startsWith('-----BEGIN')) {
    return verifyP521(publicKeyOrPem, msg, sigB64);
  }
  return await verifyEd25519(publicKeyOrPem, msg, sigB64);
}

// ------------------------------------------------------------
// Export unified API
// ------------------------------------------------------------
module.exports = {
  // P-521
  generateKeypairP521,
  signP521,
  verifyP521,

  // Ed25519
  generateKeypairEd25519,
  signEd25519,
  verifyEd25519
  ,
  // Backwards-compatible
  signString,
  verifyString
};
