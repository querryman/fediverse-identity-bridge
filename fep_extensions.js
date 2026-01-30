// fep_extensions.js — Ed25519-compatible HTTP Signature helpers
// Uses crypto.js (async Ed25519) and did.js

const { signEd25519, verifyEd25519 } = require("./lib/crypto");
const { getBase64FromDid } = require("./lib/did");

/**
 * Build an HTTP Signature header (FEP-521 style)
 * USING Ed25519 instead of RSA/ECDSA.
 */
async function createHttpSignature(privateKeyBase64, method, path, host, date, digest, keyId) {
  const signingString =
    `(request-target): ${method.toLowerCase()} ${path}\n` +
    `host: ${host}\n` +
    `date: ${date}\n` +
    `digest: ${digest}`;

  const signature = await signEd25519(privateKeyBase64, signingString);

  return (
    `keyId="${keyId}",` +
    `algorithm="ed25519",` +
    `headers="(request-target) host date digest",` +
    `signature="${signature}"`
  );
}

/**
 * Verify an HTTP Signature.
 * Accepts either:
 *  - the whole Signature header
 *  - the raw base64 signature string
 */
async function verifyHttpSignature(publicKeyBase64, method, path, host, date, digest, signatureOrHeader) {
  let signature = signatureOrHeader;

  const match = String(signatureOrHeader).match(/signature="([^"]+)"/);
  if (match) signature = match[1];

  const signingString =
    `(request-target): ${method.toLowerCase()} ${path}\n` +
    `host: ${host}\n` +
    `date: ${date}\n` +
    `digest: ${digest}`;

  try {
    return await verifyEd25519(publicKeyBase64, signingString, signature);
  } catch {
    return false;
  }
}

/**
 * Resolve a DID to Ed25519 public key (base64).
 */
async function resolveDidDocument(did) {
  // Try to extract raw key from did:key locally
  const publicKey = getBase64FromDid(did);
  if (!publicKey) return null;

  return {
    id: did,
    publicKey: [
      {
        id: `${did}#owner`,
        type: "Ed25519VerificationKey2020",
        publicKeyBase64: publicKey
      }
    ]
  };
}

module.exports = {
  createHttpSignature,
  verifyHttpSignature,
  resolveDidDocument
};
