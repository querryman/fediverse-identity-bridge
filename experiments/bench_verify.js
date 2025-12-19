// experiments/bench_verify.js
/**
 * Benchmark verification latency of the Identity Bridge.
 * Usage:
 *    node experiments/bench_verify.js 200
 */

const fs = require("fs");
const fetch = require("node-fetch");

const ITERATIONS = parseInt(process.argv[2] || "100");
const BRIDGE = "http://localhost:4000/verify";

const CSV = "bench_verify_results.csv";
fs.writeFileSync(CSV, "idx,ok,status,ms\n");

(async () => {
  console.log(`Running ${ITERATIONS} verification iterations...\n`);

  // Load a valid VC from your registry (first one found)
  const registry = JSON.parse(
    fs.readFileSync("./registry/credentials.json", "utf8")
  );

  const firstId = Object.keys(registry)[0];
  if (!firstId) {
    console.error("No VCs found in registry/credentials.json");
    process.exit(1);
  }

  const vc = registry[firstId];
  console.log("Using VC:", vc.id, "\n");

  for (let i = 0; i < ITERATIONS; i++) {
    const start = Date.now();

    const res = await fetch(BRIDGE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vc }),
    }).catch(() => null);

    const ms = Date.now() - start;

    const ok = res ? (await res.json()).valid : false;
    const status = res ? res.status : 0;

    fs.appendFileSync(CSV, `${i},${ok},${status},${ms}\n`);

    if (i % 20 === 0) console.log(`Completed ${i}/${ITERATIONS}`);
  }

  console.log(`\nBenchmark complete. Results saved to: ${CSV}`);
})();
