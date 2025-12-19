/**
 * bench_chain_depth.js
 * Measures verification latency across VC chain depths.
 * Writes results into results/chain_<timestamp>/
 */

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { generateMultiHopChain } = require("./helpers/chain_utils");

function nowFolder() {
  return `chain_${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

async function main() {
  console.log("=== Chain Depth Benchmark ===\n");

  const OUTDIR = path.join(__dirname, "results", nowFolder());
  fs.mkdirSync(OUTDIR, { recursive: true });

  const CSV = path.join(OUTDIR, "chain_raw.csv");
  fs.writeFileSync(CSV, "depth,latency_ms,valid\n");

  const depths = [1, 2, 4, 8, 16, 32];
  const { spawn } = require("child_process");
  const BRIDGE_PATH = path.join(__dirname, "../bridge.js");
  const BRIDGE_PORT = 5000; // Use unique port to avoid conflicts

  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  for (const depth of depths) {
    console.log(`Building synthetic chain of depth ${depth}...`);
    // This writes DIDs and VCs to disk (registry/)
    const firstVC = await generateMultiHopChain(depth);

    // Wait for filesystem to fully commit writes
    await sleep(1500);

    // Spawn bridge (loads registry from disk)
    console.log("Starting bridge...");
    const bridge = spawn("node", [BRIDGE_PATH], {
      env: {
        ...process.env,
        BRIDGE_PORT: BRIDGE_PORT.toString(),
        BRIDGE_OFFLINE: "true"
      },
      stdio: "ignore",
      shell: false
    });

    // Wait for bridge to be ready AND fully load storage
    await sleep(5000);

    console.log(`Verifying first VC in ${depth}-hop chain...`);

    const start = Date.now();
    let valid = false;
    try {
      const resp = await fetch(`http://localhost:${BRIDGE_PORT}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vc: firstVC })
      });
      const json = await resp.json();
      valid = json.valid === true;
    } catch (e) {
      console.log("Fetch error:", e.message);
    }

    const latency = Date.now() - start;
    console.log(`Depth ${depth} → ${latency} ms (valid=${valid})\n`);
    fs.appendFileSync(CSV, `${depth},${latency},${valid}\n`);

    // Kill bridge
    bridge.kill();
    await sleep(1000); // wait for port release
  }

  const summary = {
    depths,
    note: "Higher depths simulate long-lived identity migrations"
  };

  fs.writeFileSync(
    path.join(OUTDIR, "chain_summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log("Results saved to:", OUTDIR);
}

main();
