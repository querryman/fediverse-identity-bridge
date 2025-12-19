/**
 * experiment_scaling.js
 *
 * Scaling experiment with timestamped result folder:
 *   experiments/results/scaling_<timestamp>/
 */

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const { generateVC, runLoadTest } = require("./helpers/bench_utils");
const { ProcessMonitor } = require("./helpers/process_monitor");
const plot = require("./plot_results");

// --------------------------------------------------
// Timestamped output directory
// --------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const OUTDIR = path.join(__dirname, "results", `scaling_${stamp}`);
fs.mkdirSync(OUTDIR, { recursive: true });

// Bridge path
const BRIDGE_PATH = path.join(__dirname, "../bridge.js");

// Experiment settings
const REQUESTS = 1000;
const CONCURRENCY = 20;
const SAMPLE_INTERVAL = 200;
const BRIDGE_PORT = 4000;

const CSV = path.join(OUTDIR, "scaling_raw.csv");
const SUMMARY_JSON = path.join(OUTDIR, "scaling_summary.json");

// CSV header
fs.writeFileSync(
  CSV,
  "i,latency_ms,valid,bridge_cpu,bridge_ram_mb,sys_cpu,sys_ram_mb\n"
);

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function main() {
  console.log("=== SCALING EXPERIMENT STARTING ===");
  console.log("Result output folder:", OUTDIR);

  console.log("Starting bridge...");
  const bridge = spawn("node", [BRIDGE_PATH], {
    stdio: "inherit",
    shell: false
  });

  await sleep(1500);
  const bridgePid = bridge.pid;
  console.log("Bridge PID:", bridgePid);

  const monitor = new ProcessMonitor(bridgePid, SAMPLE_INTERVAL);
  monitor.start();

  console.log("Generating synthetic VC...");
  const { vc, issuerDid, publicKey } = await generateVC();

  console.log("Running load test...");
  const results = await runLoadTest({
    vc,
    total: REQUESTS,
    concurrency: CONCURRENCY,
    csvPath: CSV,
    monitor
  });
  // ----------------------------------------------------------
// WARM-UP PHASE (Ensures no 400/false at test start)
// ----------------------------------------------------------
console.log("Running warm-up phase...");

let warmOk = false;
let attempts = 0;

while (!warmOk && attempts < 20) {
  attempts++;

  try {
    const resp = await fetch(`http://localhost:${BRIDGE_PORT}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vc })
    });

    const json = await resp.json().catch(() => ({}));
    if (json.valid === true) {
      warmOk = true;
      console.log(`Warm-up complete after ${attempts} attempts.`);
      break;
    } else {
      console.log(`Warm-up attempt ${attempts}: not ready yet...`);
    }
  } catch (e) {
    console.log(`Warm-up attempt ${attempts}: bridge unreachable...`);
  }

  // short wait between attempts
  await new Promise(res => setTimeout(res, 150));
}

if (!warmOk) {
  console.log("⚠ Warm-up did NOT complete successfully — continuing anyway...");
}


  monitor.stop();

  const summary = {
    requests: REQUESTS,
    concurrency: CONCURRENCY,
    avg_latency_ms: results.avgLatency,
    p95_latency_ms: results.p95,
    p99_latency_ms: results.p99,
    max_bridge_ram_mb: monitor.maxBridgeRam
  };
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2));

  console.log("Generating PNG plots...");
  await plot(CSV, OUTDIR);

  console.log("\n=== Experiment Complete ===");
  console.log("Results saved:", OUTDIR);

  bridge.kill("SIGINT");
}

main();
