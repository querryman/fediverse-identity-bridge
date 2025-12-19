// bridge.js — Final Ed25519-Only FEP-c390 Migration Verifier
// ----------------------------------------------------------

const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

const storage = require("./lib/storage");
const { verifyMigrationVC, createMigrationVC } = require("./lib/vc");
const { resolveLineage, resolveLineageByDid } = require("./lib/lineage");
const { getBase64FromDid } = require("./lib/did");

// ------------------------------------------------------------
// Simple in-memory caches
// ------------------------------------------------------------
const VC_CACHE = new Map();        // vc.id → validated terminal VC
const REMOTE_CACHE = new Map();    // url → VC JSON
const STATUS_CACHE = new Map();    // url → status JSON

const MAX_AGE = 5000;

// ------------------------------------------------------------
function getCached(map, key) {
  const e = map.get(key);
  if (!e) return null;
  if (Date.now() - e.t > MAX_AGE) return null;
  return e.v;
}
function putCached(map, key, value) {
  map.set(key, { v: value, t: Date.now() });
}

// ------------------------------------------------------------
// FETCH HELPERS (no http-signature enforcement)
// ------------------------------------------------------------

async function fetchJSONWithCache(url, cacheMap) {
  const c = getCached(cacheMap, url);
  if (c) return c;

  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const json = await r.json();
    putCached(cacheMap, url, json);
    return json;
  } catch {
    return null;
  }
}

async function fetchAuthoritativeVC(actorUrl) {
  const local = await storage.getVCsByOldActor(actorUrl);
  if (local.length > 0) {
    return local[local.length - 1];
  }
  return fetchJSONWithCache(actorUrl + "/migration", REMOTE_CACHE);
}

async function fetchRevocationStatus(actorUrl) {
  return fetchJSONWithCache(actorUrl + "/migration/status", STATUS_CACHE);
}

// ------------------------------------------------------------
// Chain follower
// ------------------------------------------------------------
async function followChain(vc) {
  let current = vc;
  for (let i = 0; i < 10; i++) {
    const next = current?.credentialSubject?.newActor;
    if (!next) break;

    const remote = await fetchAuthoritativeVC(next);
    if (!remote) break;

    const status = await fetchRevocationStatus(next);
    if (status?.[remote.id]?.revoked) break;

    current = remote;
  }
  return current;
}

// ------------------------------------------------------------
// Express setup
// ------------------------------------------------------------
const app = express();
app.use(bodyParser.json());

// ------------------------------------------------------------
// POST /link (unchanged)
// ------------------------------------------------------------
app.post("/link", async (req, res) => {
  const { oldDid, newDid } = req.body;
  if (!oldDid || !newDid)
    return res.status(400).json({ error: "oldDid and newDid required" });

  const mapping = {
    id: `link:${oldDid}:${newDid}`,
    type: "Link",
    oldDid,
    newDid,
    created: new Date().toISOString()
  };

  await storage.saveCredential(mapping);
  res.json({ ok: true, mapping });
});

// ------------------------------------------------------------
// POST /migrate (unchanged)
// ------------------------------------------------------------
app.post("/migrate", async (req, res) => {
  const { issuerDid, subjectDid, oldActor, newActor, issuerPrivatePem } = req.body;

  if (!issuerDid || !subjectDid || !oldActor || !newActor || !issuerPrivatePem) {
    return res.status(400).json({
      error: "issuerDid, subjectDid, oldActor, newActor, issuerPrivatePem required"
    });
  }

  const vc = createMigrationVC({
    issuerDid,
    subjectDid,
    oldActor,
    newActor,
    issuerPrivatePem
  });

  await storage.saveCredential(vc);
  res.json({ vc });
});

// ------------------------------------------------------------
// POST /verify (stable, Ed25519-only)
// ------------------------------------------------------------
app.post("/verify", async (req, res) => {
  try {
    const vc = req.body.vc || req.body;
    if (!vc) return res.json({ valid: false, reason: "missing_vc" });

    if (VC_CACHE.has(vc.id)) {
      return res.json({ valid: true, vc: VC_CACHE.get(vc.id) });
    }

    const issuerDid = vc.issuer;
    let publicPem = await storage.getDid(issuerDid);
    
    // If issuer not in storage and issuer is a did:key, extract public key from DID
    if (!publicPem && issuerDid.startsWith("did:key:z")) {
      const publicKeyBase64 = getBase64FromDid(issuerDid);
      if (publicKeyBase64) {
        publicPem = publicKeyBase64;
        // Cache it for future requests
        await storage.putDid(issuerDid, publicKeyBase64);
      }
    }
    
    if (!publicPem)
      return res.json({ valid: false, reason: "unknown_issuer" });

      const ok = await verifyMigrationVC(vc, publicPem);
    if (!ok)
      return res.json({ valid: false, reason: "invalid_signature" });

    const rev = await fetchRevocationStatus(vc.credentialSubject.oldActor);
    if (rev?.[vc.id]?.revoked)
      return res.json({ valid: false, reason: "revoked" });

    const terminal = await followChain(vc);

    VC_CACHE.set(vc.id, terminal);
    await storage.saveCredential(vc);

    res.json({ valid: true, vc: terminal });
  } catch (e) {
    console.error("VERIFY ERROR", e);
    res.status(500).json({ valid: false, reason: "internal" });
  }
});

// ------------------------------------------------------------
// Lineage
// ------------------------------------------------------------
app.get("/lineage/actor", async (req, res) => {
  if (!req.query.url)
    return res.status(400).json({ error: "missing ?url=" });
  res.json(await resolveLineage(req.query.url));
});

app.get("/lineage/did/:d", async (req, res) => {
  res.json(await resolveLineageByDid(req.params.d));
});

// ------------------------------------------------------------
// DID resolution
// ------------------------------------------------------------
app.get("/resolve/:did", async (req, res) => {
  const pem = await storage.getDid(req.params.did);
  if (!pem) return res.status(404).json({ error: "not_found" });
  res.json({ did: req.params.did, publicPem: pem });
});

// ------------------------------------------------------------
// POST /register — runtime registration of DID -> publicKey
// Accepts JSON: { did: "did:key:z...", publicKey: "<base64>" }
// This updates the in-memory registry so child bridge processes can be warmed
// without relying on file synchronization.
// ------------------------------------------------------------
app.post("/register", async (req, res) => {
  try {
    const { did, publicKey } = req.body || {};
    if (!did || !publicKey) return res.status(400).json({ error: "did and publicKey required" });

    await storage.putDid(did, publicKey);
    res.json({ ok: true, did, publicKey });
  } catch (e) {
    console.error("/register error", e);
    res.status(500).json({ error: "internal" });
  }
});

// ------------------------------------------------------------
// Startup
// ------------------------------------------------------------
function listen(port = process.env.BRIDGE_PORT || 4000) {
  return new Promise(resolve => {
    const srv = app
      .listen(port, () => {
        console.log("Bridge listening on", port);
        resolve(srv);
      })
      .on("error", err => {
        if (err.code === "EADDRINUSE") {
          return resolve(listen(port + 1));
        }
        throw err;
      });
  });
}

if (require.main === module) listen();

module.exports = { app, listen };
