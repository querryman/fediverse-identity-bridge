// server.js — ActivityPub test node (Ed25519 edition)
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const { generateKeypair } = require('./lib/crypto');
const { getDidFromPublicKey } = require('./lib/did');
const { createMigrationVC } = require('./lib/vc');
const storage = require('./lib/storage');
const { createHttpSignature } = require('./fep_extensions');

// ------------------------------------------------------------
// Express setup
// ------------------------------------------------------------
function listen(port = 3000) {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(bodyParser.json({ type: ['application/activity+json', 'application/json'] }));
    app.use(express.json());

    const DOMAIN = process.env.DOMAIN || `localhost:${port}`;
    const PORT = Number(port);
    const USERS =
      process.env.USERS ? process.env.USERS.split(',').map(x => x.trim()) : ['alice'];

    const KEYS_DIR = path.join(__dirname, 'keys');
    if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });

    // --------------------------------------------------------
    // In-memory user table
    // --------------------------------------------------------
    const users = {};

    // --------------------------------------------------------
    // Load or create Ed25519 keypair
    // --------------------------------------------------------
    async function ensureUserKeys(username) {
      const dir = path.join(KEYS_DIR, username);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const privPath = path.join(dir, 'private.key');
      const pubPath = path.join(dir, 'public.key');

      let privateKey, publicKey;

      if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
        privateKey = fs.readFileSync(privPath, 'utf8').trim();
        publicKey = fs.readFileSync(pubPath, 'utf8').trim();
      } else {
        const kp = await generateKeypair();
        privateKey = kp.privateKeyBase64;
        publicKey = kp.publicKeyBase64;

        fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
        fs.writeFileSync(pubPath, publicKey);
      }

      return { privateKey, publicKey };
    }

    // --------------------------------------------------------
    // Create user entry
    // --------------------------------------------------------
    async function createUser(username) {
      const { privateKey, publicKey } = await ensureUserKeys(username);

      const did = await getDidFromPublicKey(publicKey);
      await storage.putDid(did, publicKey);

      const actorUrl = `http://${DOMAIN}/actor/${username}`;
      const inboxUrl = `${actorUrl}/inbox`;
      const outboxUrl = `${actorUrl}/outbox`;

      users[username] = {
        username,
        did,
        actorUrl,
        inboxUrl,
        outboxUrl,
        privateKey,
        publicKey,
        followers: [],
        notes: [],
        credentials: []
      };

      return users[username];
    }

    // Initialize all configured users
    (async () => {
      for (const u of USERS) await createUser(u);
    })();

    // --------------------------------------------------------
    // Health
    // --------------------------------------------------------
    app.get('/', (req, res) => res.json({ ok: true }));

    // --------------------------------------------------------
    // Actor document
    // --------------------------------------------------------
    app.get('/actor/:username', (req, res) => {
      const user = users[req.params.username];
      if (!user) return res.status(404).json({ error: 'not found' });

      res.json({
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: user.actorUrl,
        type: 'Person',
        preferredUsername: user.username,
        inbox: user.inboxUrl,
        outbox: user.outboxUrl,
        credentials: `${user.actorUrl}/credentials`,
        did: user.did,
        publicKey: {
          id: `${user.actorUrl}#main-key`,
          type: 'Ed25519VerificationKey2020',
          owner: user.actorUrl,
          publicKeyBase64: user.publicKey
        }
      });
    });

    // --------------------------------------------------------
    // Credentials endpoint
    // --------------------------------------------------------
    app.get('/actor/:username/credentials', (req, res) => {
      const user = users[req.params.username];
      if (!user) return res.status(404).json({ error: 'not found' });
      res.json(user.credentials);
    });

    // --------------------------------------------------------
    // Issue migration VC (FEP-390)
    // --------------------------------------------------------
    app.post('/actor/:username/migrate', async (req, res) => {
      const user = users[req.params.username];
      if (!user) return res.status(404).json({ error: 'not found' });

      const { newActor } = req.body;
      if (!newActor) return res.status(400).json({ error: 'newActor required' });

      const vc = await createMigrationVC({
        issuerDid: user.did,
        subjectDid: user.did,
        oldActor: user.actorUrl,
        newActor,
        issuerPrivateKey: user.privateKey
      });

      user.credentials.push(vc);
      await storage.saveCredential(vc);

      res.json({ vc });
    });

    // --------------------------------------------------------
    // Signed delivery (HTTP Signatures using Ed25519)
    // --------------------------------------------------------
    async function sendSigned(inboxUrl, body, privateKey, actorUrl) {
      const url = new URL(inboxUrl);
      const date = new Date().toUTCString();
      const digest = `SHA-256=${require('crypto')
        .createHash('sha256')
        .update(JSON.stringify(body))
        .digest('base64')}`;

      const signingHeader = await createHttpSignature(
        privateKey,
        'POST',
        url.pathname,
        url.host,
        date,
        digest,
        `${actorUrl}#main-key`
      );

      const resp = await fetch(inboxUrl, {
        method: 'POST',
        headers: {
          Host: url.host,
          Date: date,
          Digest: digest,
          Signature: signingHeader,
          'Content-Type': 'application/activity+json'
        },
        body: JSON.stringify(body)
      });

      return resp.ok || resp.status === 202;
    }

    // --------------------------------------------------------
    // Outbox → deliver Note to followers
    // --------------------------------------------------------
    app.post('/actor/:username/outbox', async (req, res) => {
      const user = users[req.params.username];
      if (!user) return res.status(404).json({ error: 'not found' });

      const content = req.body.content;
      if (!content) return res.status(400).json({ error: 'content required' });

      const noteId = `${user.actorUrl}/note/${Date.now()}`;

      const activity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: noteId + '#activity',
        type: 'Create',
        actor: user.actorUrl,
        object: {
          id: noteId,
          type: 'Note',
          content,
          attributedTo: user.actorUrl
        }
      };

      const results = [];
      for (const follower of user.followers) {
        const inbox = follower.endsWith('/inbox') ? follower : `${follower}/inbox`;
        const ok = await sendSigned(inbox, activity, user.privateKey, user.actorUrl);
        results.push({ inbox, ok });
      }

      user.notes.push(activity.object);
      res.json({ sent: results.length, results });
    });

    // --------------------------------------------------------
    // Inbox — Verifies HTTP signature + Move validation
    // --------------------------------------------------------
    const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:4000';

    app.post('/actor/:username/inbox', async (req, res) => {
      const user = users[req.params.username];
      if (!user) return res.status(404).json({ error: 'not found' });

      const sig = req.headers['signature'];
      if (!sig) return res.status(401).json({ error: 'no signature' });

      const match = sig.match(/keyId="([^"]+)"/);
      if (!match) return res.status(401).json({ error: 'bad signature header' });

      const keyId = match[1];
      const actorUrl = keyId.split('#')[0];

      // Pull actor public key
      try {
        const actor = await fetch(actorUrl).then(r => r.json());
        const publicKey = actor.publicKey?.publicKeyBase64;
        if (!publicKey) throw new Error('missing pubkey');

        const method = req.method;
        const pathUrl = req.originalUrl;
        const host = req.headers['host'];
        const date = req.headers['date'];
        const digest = req.headers['digest'];

        const ok = await require('./fep_extensions')
          .verifyHttpSignature(publicKey, method, pathUrl, host, date, digest, sig);

        if (!ok) return res.status(401).json({ error: 'invalid signature' });
      } catch {
        return res.status(401).json({ error: 'signature validation failed' });
      }

      // Process activity
      const activity = req.body;

      // Task 1.1: Validate Move activities with bridge
      if (activity.type === 'Move') {
        try {
          const verifyResp = await fetch(`${BRIDGE_URL}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vc: activity.object }),
            timeout: 5000
          });

          if (!verifyResp.ok) {
            const result = await verifyResp.json();
            return res.status(403).json({
              error: 'Migration verification failed',
              reason: result.reason || 'Invalid credential',
              details: result.details
            });
          }

          const result = await verifyResp.json();
          if (!result.valid) {
            return res.status(403).json({
              error: 'Migration verification failed',
              reason: result.reason || 'Verification returned false',
              details: result.details
            });
          }

          // Migration verified — proceed with state change
          user.credentials.push({
            type: 'Move',
            vc: activity.object,
            timestamp: new Date().toISOString(),
            verified: true
          });

          console.log(`[${user.username}] Move activity verified and stored`);
        } catch (e) {
          console.error(`[${user.username}] Bridge verification error:`, e.message);
          return res.status(503).json({
            error: 'Bridge unreachable',
            details: e.message
          });
        }
      } else if (activity.type === 'Follow') {
        if (!user.followers.includes(activity.actor)) {
          user.followers.push(activity.actor);
        }
      } else if (activity.type === 'Create') {
        if (activity.object?.type === 'Note') {
          user.notes.push(activity.object);
        }
      }

      res.status(202).end();
    });

    // --------------------------------------------------------
    // Start server
    // --------------------------------------------------------
    const server = app
      .listen(PORT, () => {
        console.log('ActivityPub node listening on', PORT);
        resolve(server);
      })
      .on('error', err => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${PORT} in use, trying ${PORT + 1}`);
          return listen(PORT + 1).then(resolve).catch(reject);
        }
        reject(err);
      });
  });
}

module.exports = { listen };
