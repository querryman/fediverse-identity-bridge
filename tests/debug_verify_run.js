(async () => {
  const fetch = require('node-fetch');
  const bridge = require('../bridge');
  const crypto = require('../lib/crypto');
  const vcLib = require('../lib/vc');
  const did = require('../lib/did');
  const storage = require('../lib/storage');

  // Start bridge
  const srv = await bridge.listen(4000);

  // Generate Ed25519 keypair
  const kp = await crypto.generateKeypairEd25519();
  console.log('Generated keypair:', { publicKeyB64: kp.publicKey });

  // Derive DID and store
  const myDid = await did.getDidFromPublicKey(kp.publicKey);
  await storage.putDid(myDid, kp.publicKey);
  console.log('Stored DID for issuer:', myDid);

  // Create a migration VC
  const vc = await vcLib.createMigrationVC({
    issuerDid: myDid,
    subjectDid: myDid,
    oldActor: 'https://example.org/oldActor',
    newActor: 'https://example.org/newActor',
    issuerPrivatePem: kp.privateKey // note: vc.create expects base64 private key for Ed25519
  });

  console.log('VC created, posting to bridge /verify...');
  const port = srv.address().port;

  const r = await fetch(`http://localhost:${port}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vc })
  });

  const json = await r.json();
  console.log('Bridge response:', json);

  // Close server
  srv.close();
})();
