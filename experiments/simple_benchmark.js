#!/usr/bin/env node
/**
 * simple_benchmark.js
 * Quick benchmark using an existing bridge on localhost:4000
 */

const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const ITERATIONS = parseInt(process.argv[2] || "100");
const CONCURRENCY = parseInt(process.argv[3] || "5");
const BRIDGE_URL = "http://127.0.0.1:4000/verify";

// Create output directory
const OUTDIR = path.join(__dirname, "results", `simple_bench_${Date.now()}`);
fs.mkdirSync(OUTDIR, { recursive: true });

const CSV_FILE = path.join(OUTDIR, "results.csv");
const SUMMARY_FILE = path.join(OUTDIR, "summary.json");

// Write CSV header
fs.writeFileSync(CSV_FILE, "idx,latency_ms,status_code,valid\n");

// Create a simple synthetic VC for testing
const testVC = {
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  id: "urn:uuid:test-vc-" + Math.random().toString(36).substr(2, 9),
  type: ["VerifiableCredential"],
  issuer: "did:key:z6MkhaXgBZDvotDkL5257faWxcqACaFiG7G6RH72GKWDsBiU",
  issuanceDate: new Date().toISOString(),
  credentialSubject: {
    id: "did:key:z6MkhaXgBZDvotDkL5257faWxcqACaFiG7G6RH72GKWDsBiV",
    oldActor: "http://example.com/actor/alice",
    newActor: "http://example.com/actor/alice-new"
  },
  proof: {
    type: "Ed25519Signature2020",
    created: new Date().toISOString(),
    verificationMethod: "did:key:z6MkhaXgBZDvotDkL5257faWxcqACaFiG7G6RH72GKWDsBiU#z6MkhaXgBZDvotDkL5257faWxcqACaFiG7G6RH72GKWDsBiU",
    signatureValue: "test_signature_placeholder"
  }
};

async function sendRequest(vc) {
  const start = Date.now();
  try {
    const res = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vc }),
      timeout: 30000
    });
    const latency = Date.now() - start;
    const body = await res.json();
    return { latency, statusCode: res.status, valid: body.valid || false };
  } catch (err) {
    const latency = Date.now() - start;
    return { latency, statusCode: 0, valid: false, error: err.message };
  }
}

async function runConcurrentRequests(total, concurrency) {
  const results = [];
  let completed = 0;

  console.log(`\nRunning ${total} requests with concurrency=${concurrency}...\n`);

  for (let i = 0; i < total; i += concurrency) {
    const batch = [];
    const batchSize = Math.min(concurrency, total - i);

    for (let j = 0; j < batchSize; j++) {
      batch.push(
        sendRequest(testVC).then(result => {
          const idx = i + j;
          fs.appendFileSync(CSV_FILE, `${idx},${result.latency},${result.statusCode},${result.valid ? 1 : 0}\n`);
          results.push(result);
          completed++;

          if (completed % 10 === 0) {
            process.stdout.write(`\r  [${completed}/${total}] completed`);
          }
        })
      );
    }

    await Promise.all(batch);
  }

  console.log(`\r  [${completed}/${total}] completed\n`);
  return results;
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  Simple Bridge Benchmark - Verification Latency Test       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Check bridge is running
  console.log("\nChecking bridge on 127.0.0.1:4000...");
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("http://127.0.0.1:4000/resolve/test", { timeout: 1000 });
      console.log("✓ Bridge is ready!\n");
      break;
    } catch {
      if (i === 2) {
        console.error("✗ Bridge not responding. Start it with: node bridge.js");
        process.exit(1);
      }
      console.log(`  Attempt ${i + 1}/3...`);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Run benchmark
  const results = await runConcurrentRequests(ITERATIONS, CONCURRENCY);

  // Calculate statistics
  const latencies = results.map(r => r.latency).sort((a, b) => a - b);
  const validCount = results.filter(r => r.valid).length;
  const failureCount = results.filter(r => !r.valid).length;

  const stats = {
    total_requests: results.length,
    concurrency: CONCURRENCY,
    min_latency_ms: Math.min(...latencies),
    max_latency_ms: Math.max(...latencies),
    avg_latency_ms: (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2),
    p50_latency_ms: latencies[Math.floor(latencies.length * 0.50)],
    p95_latency_ms: latencies[Math.floor(latencies.length * 0.95)],
    p99_latency_ms: latencies[Math.floor(latencies.length * 0.99)],
    valid_responses: validCount,
    failed_responses: failureCount,
    throughput_rps: (results.length / (results.reduce((a, b) => a + b.latency, 0) / 1000)).toFixed(2)
  };

  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(stats, null, 2));

  // Print summary
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                       RESULTS                              ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log(`Total Requests:       ${stats.total_requests}`);
  console.log(`Concurrency:          ${stats.concurrency}`);
  console.log(`\nLatency (ms):`);
  console.log(`  Min:                ${stats.min_latency_ms}`);
  console.log(`  Avg:                ${stats.avg_latency_ms}`);
  console.log(`  P50:                ${stats.p50_latency_ms}`);
  console.log(`  P95:                ${stats.p95_latency_ms}`);
  console.log(`  P99:                ${stats.p99_latency_ms}`);
  console.log(`  Max:                ${stats.max_latency_ms}`);
  console.log(`\nValidity:`);
  console.log(`  Valid:              ${stats.valid_responses}`);
  console.log(`  Failed:             ${stats.failed_responses}`);
  console.log(`  Success Rate:       ${((stats.valid_responses / stats.total_requests) * 100).toFixed(1)}%`);
  console.log(`\nThroughput:           ${stats.throughput_rps} req/sec`);

  console.log(`\n✓ Results saved to:\n  ${OUTDIR}\n`);
}

main().catch(console.error);
