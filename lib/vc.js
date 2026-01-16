// lib/vc.js — Final Ed25519-only Migration VC
// Verified against FEP-390 requirements
// Uses Ed25519 crypto exclusively (P-521 removed in Task 9.2)

const { signEd25519, verifyEd25519 } = require("./crypto");

/* -------------------------------------------------------
 * Canonical JSON with stable key sorting
 * ----------------------------------------------------- */
function canonicalize(obj) {
  return JSON.stringify(sortObject(obj));
}

function sortObject(o) {
  if (Array.isArray(o)) return o.map(sortObject);

  if (o && typeof o === "object") {
    const out = {};
    for (const k of Object.keys(o).sort()) {
      out[k] = sortObject(o[k]);
    }
    return out;
  }

  return o;
}

/* -------------------------------------------------------
 * Create Migration VC (Ed25519Signature2020)
 * ----------------------------------------------------- */
async function createMigrationVC({
  issuerDid,
  subjectDid,
  oldActor,
  newActor,
  issuerPrivatePem // Actually: base64 private key (32 bytes)
}) {
  const issuanceDate = new Date().toISOString();

  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `${oldActor}/credentials/migration/${Date.now()}`,
    type: ["VerifiableCredential", "MigrationCredential"],
    issuer: issuerDid,
    issuanceDate,
    credentialSubject: {
      id: subjectDid,
      oldActor,
      newActor
    }
  };

  // Canonical JSON *without* proof
  const toSign = canonicalize(vc);

  // Ed25519 signature (base64) - issuerPrivatePem is actually a base64 key
  const signature = await signEd25519(issuerPrivatePem, toSign);

  // Build proof
  vc.proof = {
    type: "Ed25519Signature2020",
    created: issuanceDate,
    proofPurpose: "assertionMethod",
    verificationMethod: `${issuerDid}#owner`,
    signature
  };

  return vc;
}

/* -------------------------------------------------------
 * Create Migration VC Unsigned (returns VC without proof)
 * Payload for actors to sign locally
 * ----------------------------------------------------- */
async function createMigrationVCUnsigned({
  issuerDid,
  subjectDid,
  oldActor,
  newActor
}) {
  const issuanceDate = new Date().toISOString();

  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `${oldActor}/credentials/migration/${Date.now()}`,
    type: ["VerifiableCredential", "MigrationCredential"],
    issuer: issuerDid,
    issuanceDate,
    credentialSubject: {
      id: subjectDid,
      oldActor,
      newActor
    }
  };

  // Return unsigned VC (no proof field)
  return vc;
}

/* -------------------------------------------------------
 * Verify Migration VC (Ed25519)
 * ----------------------------------------------------- */
async function verifyMigrationVC(vc, publicKeyBase64) {
  if (!vc?.proof?.signature) return false;

  const signature = vc.proof.signature;

  // Canonical JSON without proof
  const stripped = { ...vc };
  delete stripped.proof;
  const canonical = canonicalize(stripped);

  try {
    return await verifyEd25519(publicKeyBase64, canonical, signature);
  } catch {
    return false;
  }
}

module.exports = {
  createMigrationVC,
  createMigrationVCUnsigned,
  verifyMigrationVC,
  canonicalJson: canonicalize
};
