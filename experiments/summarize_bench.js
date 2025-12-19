// experiments/summarize_bench.js
/**
 * Summarize CSV produced by bench_verify.js
 * Usage:
 *     node experiments/summarize_bench.js bench_verify_results.csv
 */

const fs = require("fs");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node summarize_bench.js <csvfile>");
  process.exit(1);
}

const rows = fs
  .readFileSync(file, "utf8")
  .split("\n")
  .slice(1)
  .filter((l) => l.trim().length);

const latencies = rows.map((l) => parseFloat(l.split(",")[3]));

function percentile(arr, p) {
  const idx = Math.floor((p / 100) * arr.length);
  return arr[idx] || arr[arr.length - 1];
}

latencies.sort((a, b) => a - b);

const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
const median = percentile(latencies, 50);
const p95 = percentile(latencies, 95);
const p99 = percentile(latencies, 99);

console.log("\n=== Verification Benchmark Summary ===");
console.log("Samples:", latencies.length);
console.log("Mean:   ", mean.toFixed(3), "ms");
console.log("Median: ", median.toFixed(3), "ms");
console.log("p95:    ", p95.toFixed(3), "ms");
console.log("p99:    ", p99.toFixed(3), "ms");
console.log("======================================\n");
