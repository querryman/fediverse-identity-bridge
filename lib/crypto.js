// crypto.js — Ed25519-only cryptographic operations
// FEP-521 compliant signing using @noble/ed25519
// Fully CommonJS-compatible

const crypto = require("crypto");

// Polyfill for @noble/ed25519: ensure crypto.subtle is available
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.subtle) {
  global.crypto.subtle = crypto.webcrypto.subtle;
}

// NOTE: P-521 support removed (Task 9.2)
// This module now exports Ed25519 functions only
// Migration from P-521 complete; no fallback

// ============================================================
// Ed25519 (Primary, only algorithm)
// ============================================================
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

// Ed25519-only exports (P-521 deprecated and removed in Task 9.2)
module.exports = {
  // Ed25519 (only algorithm)
  generateKeypairEd25519,
  signEd25519,
  verifyEd25519
};
