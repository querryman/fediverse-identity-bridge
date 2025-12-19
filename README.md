# Fediverse Identity Bridge Prototype

This repository demonstrates a small prototype that uses DIDs and Verifiable Credentials (VCs) to migrate identities across ActivityPub-compatible nodes without blockchain dependencies.

Quick start

1. Install dependencies:

```powershell
npm install
```

2. Run the demo (starts two ActivityPub nodes and the bridge):

```powershell
node spawn_nodes.js
```

3. Or run tests:

```powershell
npm test
```

Architecture (ASCII)

Actor Node A (3000)  <--signed HTTP-- Bridge (4000) --verify VC--> Node B (3001)

Files created

- `spawn_nodes.js` : launches two nodes and the bridge, and runs a simple follow/migration simulation.
- `bridge.js` : bridge microservice exposing `/link`, `/migrate`, `/verify`, `/resolve/:did`.
- `lib/*` : crypto, did, vc, storage helpers.
- `migration_credential.js` : wrapper for VC creation.
- `identity_bridge_api.js` : client helpers for bridge endpoints.
- `fep_extensions.js` : helpers for HTTP signing and DID resolution.
- `metrics_logger.js` : CSV logger for events.
- `tests/migration_test.js` : integration test that issues and verifies a migration VC.

Notes

- Keys use Ed25519. Credentials are signed with Ed25519Signature2020-like JWS (base64) stored in `vc.proof.jws`.
- Persistence is filesystem JSON in `registry/`.

# fediverse-identity-bridge

Prototype of a decentralized identity bridge for federated social networks.

This repository contains a minimal prototype that demonstrates DID issuance, Ed25519 signing, and issuance/verification of migration Verifiable Credentials (MigrationCredential) for identity portability between federated nodes.

Highlights
- Generates Ed25519 keypairs per user and derives `did:key:z...` identifiers.
- Issues MigrationCredentials signed with Ed25519Signature2020.
- Demonstrates signed HTTP messages using Ed25519 (FEP-8b32/FEP-521a compatible).

Quick run

1. Install dependencies

   npm install

2. Start the bridge service

   node bridge.js &

3. Spawn two local nodes and run the demo flow

   node spawn_nodes.js

What this demonstrates
- FEP-521a–compliant signatures: uses Ed25519 for message and credential signatures.
- Migration credentials: a signed Verifiable Credential (MigrationCredential) linking an old actor to a new actor under DID-based identifiers.

Notes
- This is a prototype/skeleton intended for experimentation. It uses on-disk JSON files in `registry/` for storage and PEM files in `keys/` for keys.
- For production use, replace the simple registry and signature transport with hardened implementations (secure key storage, HTTP Signatures, persistent DB, authentication).

## Deviations from Spec

- **DID Encoding**: The `did:key` encoding uses the standard multicodec prefix for Ed25519 (0xed), then multibase base58btc-encoded (z-prefix).
- **VC Structure**: MigrationCredential VCs are issued as plain JSON objects with a `proof` property containing a JWS signature. No JSON-LD processing or context validation is performed.
- **HTTP Signatures**: Only a minimal subset of HTTP Signature headers is implemented for ActivityPub delivery.

## DID:key Compliance

This prototype uses `did:key` identifiers for Ed25519 public keys. The public key is encoded using the multicodec prefix for Ed25519 (0xed), then multibase base58btc-encoded (z-prefix) as per the [did:key method spec](https://w3c-ccg.github.io/did-method-key/).

## Inbox HTTP Signature Verification

All incoming ActivityPub messages to `/actor/:username/inbox` are now verified using FEP-521a–style HTTP Signatures. The server checks the `Signature` header, resolves the sender's public key, and verifies the Ed25519 signature over the canonical signing string. Requests missing or with invalid signatures are rejected with HTTP 401.

## Configuration Steps

- Ensure ports 3000, 3001, and 4000 are free before running the demo.
- Keys are auto-generated for each user in `keys/<username>/`.
- DIDs and credentials are stored in `registry/` as JSON files.

## Testing

Run `npm test` to verify:
- Migration VC issuance and verification
- Inbox HTTP signature acceptance (valid signature)
- Inbox HTTP signature rejection (missing/invalid signature)
- Metrics are logged to `metrics.csv`

## Demo Output

When running `node spawn_nodes.js`, you should see logs including:
- "Migration credential verified successfully"
- Inbox acceptance/rejection based on signature validity

Files of interest

- `server.js` - node server that generates keys per user and exposes actor endpoints
- `bridge.js` - credential-issuing bridge service
- `spawn_nodes.js` - spawns multiple local server instances and performs signed Follow requests between them
- `lib/` - crypto, DID, VC, and storage helpers
- `keys/` - generated PEM files per user
- `registry/` - local JSON registries for DIDs and credentials

