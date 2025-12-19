(async () => {
  const { generateVC, runLoadTest } = require('../experiments/helpers/bench_utils');
  const bridge = require('../bridge');
  const fetch = require('node-fetch');

  // Start bridge
  const srv = await bridge.listen(4000);
  const port = srv.address().port;
  console.log('Bridge on port:', port);

  // Generate VC using bench_utils
  console.log('Generating VC...');
  const { vc, issuerDid, publicKey } = await generateVC();
  console.log('VC:', JSON.stringify(vc, null, 2).slice(0, 500) + '...');
  console.log('Issuer DID:', issuerDid);
  console.log('Issuer publicKey (base64):', publicKey.slice(0, 40) + '...');

  // Send to bridge
  console.log('\nPosting to /verify...');
  const res = await fetch(`http://localhost:${port}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vc })
  });

  const json = await res.json();
  console.log('\nBridge response:', json);

  srv.close();
})();
