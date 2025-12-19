// tests/multi_federation.test.js
const { expect } = require('chai');
const fetch = require('node-fetch');
const { makeApp } = require('../server');
const bridgeModule = require('../bridge');
const storage = require('../lib/storage');
const { getDidFromPublicPem } = require('../lib/did');
const fs = require('fs');

const { listen: bridgeListen } = bridgeModule;

describe('Multi-Federation Robustness', function () {
    // Increase timeout for multi-step flow
    this.timeout(30000);

    // Use a different range to avoid conflicts with other tests or stuck processes
    const INITIAL_BRIDGE_PORT = 4100;
    const NODES = [
        { name: 'alice', port: 3100 },
        { name: 'bob', port: 3101 },
        { name: 'carol', port: 3102 }
    ];

    let servers = [];
    let bridgeServer;
    let bridgePort;

    before(async function () {
        // Start Bridge
        bridgeServer = await bridgeListen(INITIAL_BRIDGE_PORT);
        bridgePort = bridgeServer.address().port;
        console.log(`Bridge started on port ${bridgePort}`);

        // Start Nodes
        for (const node of NODES) {
            const app = makeApp({
                DOMAIN: `localhost:${node.port}`,
                USERS: node.name
            });

            const server = await new Promise((resolve, reject) => {
                const s = app.listen(node.port, () => resolve(s));
                s.on('error', (err) => {
                    if (err.code === 'EADDRINUSE') {
                        console.error(`Port ${node.port} is in use. Test might fail.`);
                        reject(err);
                    }
                });
            });
            servers.push(server);
        }

        // Short warm-up
        await new Promise(r => setTimeout(r, 500));
    });

    after(async function () {
        // Cleanup
        for (const s of servers) s.close();
        if (bridgeServer) bridgeServer.close();
    });

    it('performs circular migration (Alice -> Bob -> Carol -> Alice) and verifies VCs', async function () {
        const migrations = [
            { from: NODES[0], to: NODES[1] }, // Alice -> Bob
            { from: NODES[1], to: NODES[2] }, // Bob -> Carol
            { from: NODES[2], to: NODES[0] }  // Carol -> Alice
        ];

        const issuedVCs = [];

        // Pre-register DIDs for all actors so verification works
        for (const node of NODES) {
            // Updated key filename
            const pub = fs.readFileSync(`./keys/${node.name}/ed25519_public.pem`, 'utf8');
            const did = getDidFromPublicPem(pub);
            await storage.putDid(did, pub);
        }

        for (const m of migrations) {
            const fromActorUrl = `http://localhost:${m.from.port}/actor/${m.from.name}`;
            const toActorUrl = `http://localhost:${m.to.port}/actor/${m.to.name}`;

            console.log(`Migrating ${m.from.name} -> ${m.to.name}...`);

            const res = await fetch(`${fromActorUrl}/migrate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newActor: toActorUrl })
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Migration failed for ${m.from.name}: ${res.status} ${txt}`);
            }

            const json = await res.json();
            expect(json.vc).to.exist;
            issuedVCs.push(json.vc);

            // 2. Verify with Bridge
            const vRes = await fetch(`http://localhost:${bridgePort}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vc: json.vc })
            });
            const vJson = await vRes.json();

            expect(vJson.valid).to.equal(true, `Verification failed for ${m.from.name}->${m.to.name}: ${vJson.reason}`);
        }

        // 3. Mini Load Test
        console.log('Running verification load test (50 reqs)...');
        let successes = 0;
        for (let i = 0; i < 50; i++) {
            const vc = issuedVCs[i % issuedVCs.length];
            const res = await fetch(`http://localhost:${bridgePort}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vc })
            });
            const json = await res.json();
            if (json.valid) successes++;
        }
        expect(successes).to.equal(50);
    });
});
