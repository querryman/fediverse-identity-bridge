#!/usr/bin/env node
/**
 * run_experiments.js
 * Simple script to run experiments with an already-running bridge
 * Usage: node run_experiments.js [output_dir]
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const OUTPUT_DIR = process.argv[2] || path.join(__dirname, "results", `run_${Date.now()}`);
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const experiments = [
  "experiment_concurrency_sweep.js",
  "experiment_scaling.js",
  "bench_chain_depth.js"
];

let completedCount = 0;

async function runExperiment(name) {
  return new Promise((resolve) => {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Running: ${name}`);
    console.log(`${"=".repeat(60)}\n`);

    const proc = spawn("node", [path.join(__dirname, name)], {
      stdio: "inherit",
      cwd: __dirname
    });

    proc.on("close", (code) => {
      completedCount++;
      const status = code === 0 ? "✓ PASS" : "✗ FAIL";
      console.log(`\n[${completedCount}/${experiments.length}] ${status}: ${name}\n`);
      resolve(code);
    });

    proc.on("error", (err) => {
      console.error(`Error running ${name}:`, err.message);
      completedCount++;
      resolve(1);
    });
  });
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║         Fediverse Identity Bridge - Experiment Suite      ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Verify bridge is running
  console.log("Verifying bridge is running on 127.0.0.1:4000...");
  let bridgeReady = false;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch("http://127.0.0.1:4000/resolve/test", { timeout: 1000 });
      bridgeReady = true;
      console.log("✓ Bridge is ready!\n");
      break;
    } catch {
      if (i < 4) {
        console.log(`  Attempt ${i + 1}/5 - retrying...`);
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  if (!bridgeReady) {
    console.error("✗ Bridge is not running on localhost:4000");
    console.error("Start the bridge with: node bridge.js");
    process.exit(1);
  }

  // Run experiments sequentially
  const results = [];
  for (const exp of experiments) {
    const code = await runExperiment(exp);
    results.push({ experiment: exp, exitCode: code });
  }

  // Summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                      SUMMARY                              ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.exitCode === 0 ? "✓" : "✗";
    console.log(`${status} ${result.experiment}`);
    if (result.exitCode === 0) passed++;
    else failed++;
  }

  console.log(`\nTotal: ${passed} passed, ${failed} failed out of ${experiments.length} experiments`);
  console.log(`Results directory: ${OUTPUT_DIR}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
