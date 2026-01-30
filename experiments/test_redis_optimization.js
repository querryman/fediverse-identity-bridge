#!/usr/bin/env node
/**
 * experiments/test_redis_optimization.js
 * 
 * Tests the MGET batch optimization by running concurrency sweep
 * with optimized storage-redis.js and comparing to file storage baseline.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { generateVC, runLoadTest } = require("./helpers/bench_utils");
const { ProcessMonitor } = require("./helpers/process_monitor");

const OUTDIR = path.join(__dirname, "results", `redis_optimization_${Date.now()}`);
fs.mkdirSync(OUTDIR, { recursive: true });

const PORT = 4000;
const CONCURRENCY_LEVELS = [1, 5, 10, 20];
const REQUESTS_PER_LEVEL = 100;

async function waitForBridge(port, timeout = 5000) {
  const fetch = require("node-fetch");
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/lineage/actor`, {
        method: "GET",
      });
      if (res.ok || res.status === 400) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Bridge did not respond on port ${port} within ${timeout}ms`);
}

async function main() {
  console.log("🔬 Redis MGET Optimization Test");
  console.log(`   Output: ${OUTDIR}`);
  console.log(`   Concurrency levels: ${CONCURRENCY_LEVELS.join(", ")}`);
  console.log(`   Requests per level: ${REQUESTS_PER_LEVEL}`);
  console.log("");

  // Start bridge with Redis
  console.log("▶ Starting bridge with optimized Redis storage...");
  const bridge = spawn("node", ["bridge.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      REDIS_HOST: "localhost",
      REDIS_PORT: "6379",
      NODE_ENV: "production"
    },
    stdio: "pipe"
  });

  bridge.stdout.on("data", (data) => {
    console.log(`  [bridge] ${data.toString().trim()}`);
  });
  bridge.stderr.on("data", (data) => {
    console.error(`  [bridge err] ${data.toString().trim()}`);
  });

  try {
    await waitForBridge(PORT);
    console.log("✓ Bridge ready\n");

    // Generate test VC
    console.log("📝 Generating test VC...");
    const vcData = await generateVC();
    const vc = vcData.vc;
    console.log(`✓ VC generated: ${vc.id}\n`);

    const csvPath = path.join(OUTDIR, "optimization_results.csv");
    fs.writeFileSync(csvPath, "concurrency,avg_latency_ms,p95_latency_ms,p99_latency_ms,min_latency_ms,max_latency_ms,throughput_rps,failures,duration_sec\n");

    // Test each concurrency level
    for (const concurrency of CONCURRENCY_LEVELS) {
      console.log(`⚡ Testing concurrency level: ${concurrency}`);
      
      const levelCsvPath = path.join(OUTDIR, `level_${concurrency}.csv`);
      fs.writeFileSync(levelCsvPath, "index,latency_ms,valid,bridge_ram_mb,system_ram_mb\n");
      
      const monitor = new ProcessMonitor(bridge.pid);
      const startTime = Date.now();

      const results = await runLoadTest({
        vc,
        total: REQUESTS_PER_LEVEL,
        concurrency,
        csvPath: levelCsvPath,
        monitor,
        baseUrl: `http://127.0.0.1:${PORT}`
      });

      const duration = (Date.now() - startTime) / 1000;

      // Calculate additional stats
      const allLatencies = fs.readFileSync(levelCsvPath, 'utf8')
        .split('\n')
        .slice(1)
        .filter(line => line.trim())
        .map(line => parseFloat(line.split(',')[1]));
      
      const minLatency = Math.min(...allLatencies);
      const maxLatency = Math.max(...allLatencies);
      const failures = allLatencies.filter(l => isNaN(l) || l === 0).length;
      const throughput = REQUESTS_PER_LEVEL / (duration / 1000);

      console.log(`   ✓ Avg latency: ${results.avgLatency.toFixed(2)}ms`);
      console.log(`   ✓ p95 latency: ${results.p95.toFixed(2)}ms`);
      console.log(`   ✓ p99 latency: ${results.p99.toFixed(2)}ms`);
      console.log(`   ✓ Min/Max: ${minLatency.toFixed(2)}/${maxLatency.toFixed(2)}ms`);
      console.log(`   ✓ Throughput: ${throughput.toFixed(2)} req/s`);
      console.log(`   ✓ Failures: ${failures}`);
      console.log("");

      fs.appendFileSync(
        csvPath,
        `${concurrency},${results.avgLatency.toFixed(2)},${results.p95.toFixed(2)},${results.p99.toFixed(2)},${minLatency.toFixed(2)},${maxLatency.toFixed(2)},${throughput.toFixed(2)},${failures},${duration.toFixed(2)}\n`
      );
    }

    // Save summary
    const summary = {
      timestamp: new Date().toISOString(),
      description: "Redis MGET Batch Optimization Test",
      backend: "Redis with optimized MGET batching",
      concurrency_levels: CONCURRENCY_LEVELS,
      requests_per_level: REQUESTS_PER_LEVEL,
      results_file: csvPath,
      optimization: "Changed N individual GETs to single MGET per query"
    };

    fs.writeFileSync(
      path.join(OUTDIR, "summary.json"),
      JSON.stringify(summary, null, 2)
    );

    console.log("✅ Test complete!");
    console.log(`📊 Results saved to: ${OUTDIR}`);
  } finally {
    console.log("\n🛑 Cleaning up...");
    bridge.kill();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
