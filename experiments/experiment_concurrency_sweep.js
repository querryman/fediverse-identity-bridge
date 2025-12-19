/**
 * experiment_concurrency_sweep.js
 *
 * Concurrency Sweep Experiment:
 *   - Runs verification at multiple concurrency levels
 *   - Measures latency, throughput, failures, RAM usage
 *   - Produces per-level CSVs + summary JSON
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const { generateVC, runLoadTest } = require("./helpers/bench_utils");
const { ProcessMonitor } = require("./helpers/process_monitor");

const CONCURRENCY_LEVELS = [1, 2, 5, 10, 20, 40, 80];
const REQUESTS_PER_LEVEL = 300;

// Output root
const OUTDIR = path.join(__dirname, "results", `sweep_${Date.now()}`);
fs.mkdirSync(OUTDIR, { recursive: true });

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

/* ---------------------------------------------------------------
 * Detect bridge port by trying 4000-4010
 * ---------------------------------------------------------------*/
async function detectBridgePort() {
  for (let port = 4000; port <= 4010; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/resolve/test`, { timeout: 500 });
      // Any response means bridge is listening
      console.log(`  Bridge detected on port ${port}`);
      return port;
    } catch {
      // port not responsive, try next
    }
  }
  throw new Error("Could not detect bridge port (tried 4000-4010)");
}

/* ---------------------------------------------------------------
 * Start bridge.js as a child and return its detected port
 * ---------------------------------------------------------------*/
async function startBridgeAndDetectPort() {
  const bridge = spawn("node", ["bridge.js"], {
    cwd: path.join(__dirname, ".."),
    stdio: "ignore"
  });
  
  // Wait for bridge to start and detect its port
  for (let i = 0; i < 20; i++) {
    await sleep(150);
    try {
      const port = await detectBridgePort();
      return { bridge, port };
    } catch {
      // not ready yet
    }
  }
  throw new Error("Bridge failed to start within timeout");
}

/* --------------------------------------------------------------
 * Warm-up: single request to avoid initial failures
 * -------------------------------------------------------------- */
async function warmUp(vc) {
  try {
    const res = await fetch("http://localhost:4000/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vc })
    });
    await res.json();
  } catch {
    // ignore warmup failure
  }
}

/* ---------------------------------------------------------------
 * Register issuer DID on bridge before running tests
 * ---------------------------------------------------------------*/
async function registerIssuerDid(issuerDid, publicKeyB64, bridgePort) {
  try {
    const payload = { did: issuerDid, publicKey: publicKeyB64 };
    console.log("  Calling /register with DID:", issuerDid);
    const res = await fetch(`http://localhost:${bridgePort}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    console.log("  /register response:", json);
  } catch (err) {
    console.error("Failed to pre-register issuer on bridge:", err.message);
  }
}

/* --------------------------------------------------------------
 * Run a single concurrency level
 * -------------------------------------------------------------- */
async function runLevel(level, vc, bridgePort) {
  console.log(`\n=== Running Level C=${level} ===`);

  const csvPath = path.join(OUTDIR, `level_${level}.csv`);
  fs.writeFileSync(
    csvPath,
    "i,latency_ms,valid,bridge_ram_mb,system_ram_mb\n"
  );

  const monitor = new ProcessMonitor(global.bridgePid, 150);
  monitor.start();

  await runLoadTest({
    vc,
    total: REQUESTS_PER_LEVEL,
    concurrency: level,
    csvPath,
    monitor,
    baseUrl: `http://localhost:${bridgePort}`
  });

  monitor.stop();

  // Parse CSV to compute stats
  const lines = fs.readFileSync(csvPath, "utf8").trim().split("\n").slice(1);
  const latencies = lines.map(l => Number(l.split(",")[1]));
  const failures = lines.filter(l => l.split(",")[2] === "0").length;

  latencies.sort((a, b) => a - b);

  return {
    concurrency: level,
    avgLatency: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p95: latencies[Math.floor(latencies.length * 0.95)],
    p99: latencies[Math.floor(latencies.length * 0.99)],
    failures,
    maxBridgeRam: monitor.maxBridgeRam
  };
}

async function main() {
  console.log("\n=== Concurrency Sweep Experiment ===\n");

  try {
    // 1. Start bridge and detect its port
    console.log("Starting bridge...");
    const { bridge, port: bridgePort } = await startBridgeAndDetectPort();
    global.bridgePid = bridge.pid;

    console.log("Bridge PID:", global.bridgePid);
    console.log("Bridge port:", bridgePort);

    // 2. Prepare synthetic VC
    console.log("Generating synthetic VC...");
    const { vc, issuerDid, publicKey } = await generateVC();
    console.log("VC generated successfully.");
    console.log("Issuer DID:", issuerDid);

    // 3. Register issuer DID on bridge so verification succeeds
    console.log("Registering issuer on bridge...");
    console.log("Public key (first 40 chars):", publicKey.slice(0, 40) + "...");
    await registerIssuerDid(issuerDid, publicKey, bridgePort);

    // 4. Warm-up with correct bridge port
    console.log("Performing warm-up request...");
    try {
      const res = await fetch(`http://localhost:${bridgePort}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vc })
      });
      const json = await res.json();
      console.log("  Warm-up result:", json.valid === true ? "valid" : "invalid");
    } catch (e) {
      console.error("  Warm-up failed:", e.message);
    }

    // 5. Run levels
    const summary = [];

    for (const level of CONCURRENCY_LEVELS) {
      const result = await runLevel(level, vc, bridgePort);
      summary.push(result);
    }

    // 6. Save summary JSON
    const summaryPath = path.join(OUTDIR, "sweep_summary.json");
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log("\n=== Sweep Complete ===");
    console.log("Summary saved to:", summaryPath);

    try { process.kill(global.bridgePid); } catch {}

    process.exit(0);
  } catch (err) {
    console.error("\n=== Sweep experiment FAILED ===");
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    
    try { process.kill(global.bridgePid); } catch {}
    
    process.exit(1);
  }
}

main();
